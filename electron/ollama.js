// Talks to the local Ollama server: list/pull/delete models and stream chat replies.
const { net } = require('electron');
const { OLLAMA_URL, startOllama } = require('./engines');
const { updateTask } = require('./tasks');
const { fmtBytes } = require('./downloader');

const capsCache = new Map();

async function api(pathname, body, signal) {
  const res = await net.fetch(`${OLLAMA_URL}${pathname}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal
  });
  return res;
}

async function ensureServer() {
  const ok = await startOllama();
  if (!ok) throw new Error('The chat engine is not installed or could not start. Open Setup to install it.');
}

// Reads a newline-delimited JSON stream, calling onObj for each object.
async function readNdjson(res, onObj) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) onObj(JSON.parse(line));
    }
  }
  if (buf.trim()) onObj(JSON.parse(buf.trim()));
}

async function errorText(res) {
  try {
    const j = await res.json();
    return j.error || res.statusText;
  } catch {
    return res.statusText;
  }
}

async function listModels() {
  try {
    await ensureServer();
    const res = await api('/api/tags');
    const j = await res.json();
    return (j.models || []).map((m) => ({ id: m.name, sizeGB: Math.round((m.size / 1024 ** 3) * 10) / 10, modified: m.modified_at }));
  } catch {
    return [];
  }
}

async function capabilities(model) {
  if (capsCache.has(model)) return capsCache.get(model);
  try {
    const res = await api('/api/show', { model, name: model });
    const j = await res.json();
    const caps = j.capabilities || [];
    capsCache.set(model, caps);
    return caps;
  } catch {
    return [];
  }
}

async function pullModel(model, task, { weightStart = 0, weightSpan = 1 } = {}) {
  await ensureServer();
  const res = await api('/api/pull', { model, name: model, stream: true }, task.controller.signal);
  if (!res.ok) throw new Error(await errorText(res));
  let lastErr = null;
  await readNdjson(res, (o) => {
    if (o.error) lastErr = o.error;
    const frac = o.total ? (o.completed || 0) / o.total : 0;
    updateTask(task.id, {
      progress: weightStart + weightSpan * frac,
      detail: `${model} · ${o.status || ''}${o.total ? ` · ${fmtBytes(o.completed || 0)} of ${fmtBytes(o.total)}` : ''}`
    });
  });
  if (lastErr) throw new Error(lastErr);
  capsCache.delete(model);
}

async function deleteModel(model) {
  await ensureServer();
  const res = await net.fetch(`${OLLAMA_URL}/api/delete`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, name: model })
  });
  if (!res.ok) throw new Error(await errorText(res));
  return true;
}

/**
 * Streams one assistant turn. Calls onEvent({type:'token'|'thinking', text}) while streaming.
 * Returns { content, thinking, toolCalls }.
 * Retries automatically without tools / thinking if the model does not support them.
 */
async function chatOnce({ model, messages, tools, think, options, signal }, onEvent) {
  await ensureServer();
  const caps = await capabilities(model);
  const body = { model, messages, stream: true, options: { num_ctx: 4096, ...(options || {}) } };
  if (tools && tools.length && (caps.length === 0 || caps.includes('tools'))) body.tools = tools;
  if (caps.includes('thinking')) body.think = !!think;

  let res = await api('/api/chat', body, signal);
  if (!res.ok) {
    const msg = await errorText(res);
    if (/tool|think/i.test(msg)) {
      delete body.tools;
      delete body.think;
      res = await api('/api/chat', body, signal);
      if (!res.ok) throw new Error(await errorText(res));
    } else {
      throw new Error(msg);
    }
  }

  let content = '';
  let thinking = '';
  const toolCalls = [];
  await readNdjson(res, (o) => {
    if (o.error) throw new Error(o.error);
    const m = o.message || {};
    if (m.thinking) {
      thinking += m.thinking;
      onEvent && onEvent({ type: 'thinking', text: m.thinking });
    }
    if (m.content) {
      content += m.content;
      onEvent && onEvent({ type: 'token', text: m.content });
    }
    if (Array.isArray(m.tool_calls)) toolCalls.push(...m.tool_calls);
  });
  return { content, thinking, toolCalls };
}

// Simple non-streaming completion used by add-on features and the prompt improver.
async function complete(model, prompt, { system, options, signal } = {}) {
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });
  const { content } = await chatOnce({ model, messages, think: false, options, signal });
  return content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

module.exports = { listModels, pullModel, deleteModel, chatOnce, complete, capabilities, ensureServer };
