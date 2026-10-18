// Self-extension: Dilreet writes new add-on features with the local coding model.
// Each feature is one self-contained HTML page that runs in a locked-down frame.
// Every change is saved as a new version, so any feature can be rolled back.
const fs = require('fs');
const path = require('path');
const { dirs, getSettings } = require('./store');
const { complete } = require('./ollama');

const SYSTEM = `You are the feature builder inside Dilreet, a desktop AI app.
You write ONE complete, self-contained HTML file that adds a feature the user asks for.

Rules:
- Output ONLY the HTML file inside a single \`\`\`html code block. No explanations.
- The very first line inside the block must be:
  <!-- name: SHORT NAME | icon: ONE EMOJI | description: ONE SHORT SENTENCE -->
- Put all CSS in one <style> tag and all JavaScript in one <script> tag. No external files, no CDNs, no frameworks.
- Make it simple, friendly and good-looking: system-ui font, rounded corners, generous spacing, works in light and dark (use prefers-color-scheme).
- These helpers are available on the global window.dilreet object (all return Promises):
    dilreet.ask(prompt)            -> string   ask Dilreet's local AI model a question
    dilreet.store.get(key)         -> any      read saved data for this feature
    dilreet.store.set(key, value)  -> true     save data for this feature (JSON values)
    dilreet.notify(text)           -> true     show a small message in Dilreet
- localStorage, cookies and window.parent are NOT available. Use dilreet.store to save data.
- Handle errors with try/catch and show friendly messages. Show a loading state while waiting for dilreet.ask.
- Keep the code short, clean and working. Do not leave TODOs.`;

function featuresRoot() {
  return dirs().features;
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'feature';
}

function extractHtml(text) {
  const block = text.match(/```html\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/);
  let html = (block ? block[1] : text).trim();
  if (!/<(html|body|div|script|style)/i.test(html)) throw new Error('The coding model did not return a usable page. Try describing the feature more simply, then try again.');
  return html;
}

function parseHeader(html, fallbackDesc) {
  const m = html.match(/<!--\s*name:\s*([^|]+)\|\s*icon:\s*([^|]+)\|\s*description:\s*([\s\S]*?)-->/i);
  if (m) return { name: m[1].trim().slice(0, 40), icon: m[2].trim().slice(0, 4), description: m[3].trim().slice(0, 160) };
  const t = html.match(/<title>([^<]+)<\/title>/i);
  return { name: (t ? t[1] : fallbackDesc).trim().slice(0, 40), icon: '🧩', description: fallbackDesc.slice(0, 160) };
}

// Catches the most common small-model mistakes before the user ever sees them.
function lint(html) {
  const problems = [];
  if (/<script[^>]+src=/i.test(html)) problems.push('It loads an external script file.');
  if (/localStorage|sessionStorage|document\.cookie/.test(html)) problems.push('It uses localStorage/cookies instead of dilreet.store.');
  if (/window\.parent|top\.location/.test(html)) problems.push('It tries to reach the main app window.');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  for (const code of scripts) {
    try {
      // Syntax check only; nothing is executed here.
      new Function(code); // eslint-disable-line no-new-func
    } catch (e) {
      problems.push(`JavaScript error: ${e.message}`);
    }
  }
  return problems;
}

function coderModel() {
  const s = getSettings();
  const model = s.coderModel || s.chatModel;
  if (!model) throw new Error('No coding model is installed yet. Install one from the Models page (Qwen 2.5 Coder is recommended).');
  return model;
}

/**
 * Draft a new feature or a change to an existing one. Returns a draft the user can preview.
 * Automatically asks the model to repair its own syntax mistakes up to two times.
 */
async function draft({ request, baseId, feedback, previousHtml }, signal) {
  const model = coderModel();
  let prompt;
  if (baseId || previousHtml) {
    const current = previousHtml || readCurrent(baseId).html;
    prompt = `Here is the current feature:\n\`\`\`html\n${current}\n\`\`\`\n\nChange it like this: ${feedback || request}\n\nReturn the full updated HTML file.`;
  } else {
    prompt = `Build this feature: ${request}`;
  }

  let html = '';
  let problems = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    const out = await complete(model, prompt, { system: SYSTEM, options: { temperature: 0.2, num_ctx: 8192 }, signal });
    html = extractHtml(out);
    problems = lint(html);
    if (!problems.length) break;
    prompt = `This HTML file has problems:\n- ${problems.join('\n- ')}\n\nFix them and return the full corrected file.\n\`\`\`html\n${html}\n\`\`\``;
  }
  const header = parseHeader(html, request || feedback || 'New feature');
  return { html, ...header, problems, request: request || feedback, baseId: baseId || null };
}

function readManifest(id) {
  try {
    return JSON.parse(fs.readFileSync(path.join(featuresRoot(), id, 'manifest.json'), 'utf8'));
  } catch {
    return null;
  }
}

function writeManifest(id, m) {
  fs.writeFileSync(path.join(featuresRoot(), id, 'manifest.json'), JSON.stringify(m, null, 2));
}

function readCurrent(id) {
  const m = readManifest(id);
  if (!m) throw new Error('Feature not found');
  const html = fs.readFileSync(path.join(featuresRoot(), id, `v${m.current}.html`), 'utf8');
  return { manifest: m, html };
}

function install(d) {
  let id = d.baseId;
  let m;
  if (id && (m = readManifest(id))) {
    const v = m.versions.length + 1;
    fs.writeFileSync(path.join(featuresRoot(), id, `v${v}.html`), d.html);
    m.versions.push({ v, created: Date.now(), note: d.request || '' });
    Object.assign(m, { current: v, name: d.name || m.name, icon: d.icon || m.icon, description: d.description || m.description });
  } else {
    id = slug(d.name);
    let n = 2;
    while (fs.existsSync(path.join(featuresRoot(), id))) id = `${slug(d.name)}-${n++}`;
    fs.mkdirSync(path.join(featuresRoot(), id), { recursive: true });
    fs.writeFileSync(path.join(featuresRoot(), id, 'v1.html'), d.html);
    m = { id, name: d.name, icon: d.icon, description: d.description, enabled: true, current: 1, created: Date.now(), versions: [{ v: 1, created: Date.now(), note: d.request || '' }] };
  }
  writeManifest(id, m);
  return m;
}

function list() {
  if (!fs.existsSync(featuresRoot())) return [];
  return fs
    .readdirSync(featuresRoot(), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => readManifest(e.name))
    .filter(Boolean)
    .sort((a, b) => a.created - b.created);
}

function setEnabled(id, enabled) {
  const m = readManifest(id);
  if (!m) return null;
  m.enabled = !!enabled;
  writeManifest(id, m);
  return m;
}

function rollback(id, v) {
  const m = readManifest(id);
  if (!m || !m.versions.some((x) => x.v === v)) throw new Error('That version does not exist');
  m.current = v;
  writeManifest(id, m);
  return m;
}

function remove(id) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error('Bad feature id');
  fs.rmSync(path.join(featuresRoot(), id), { recursive: true, force: true });
  return true;
}

// Per-feature saved data (the dilreet.store helper inside add-ons).
function storeFile(id) {
  return path.join(featuresRoot(), id, 'data.json');
}
function storeGet(id, key) {
  try {
    return JSON.parse(fs.readFileSync(storeFile(id), 'utf8'))[key];
  } catch {
    return undefined;
  }
}
function storeSet(id, key, value) {
  let data = {};
  try {
    data = JSON.parse(fs.readFileSync(storeFile(id), 'utf8'));
  } catch {}
  data[key] = value;
  fs.writeFileSync(storeFile(id), JSON.stringify(data));
  return true;
}

// The bridge script injected into every add-on page. It only talks to Dilreet via postMessage.
const BRIDGE = `<script>
(function(){
  var pending = {}, n = 0;
  function call(op, args){
    return new Promise(function(resolve, reject){
      var id = 'c' + (++n);
      pending[id] = { resolve: resolve, reject: reject };
      parent.postMessage({ dilreet: true, id: id, op: op, args: args }, '*');
    });
  }
  window.addEventListener('message', function(e){
    var d = e.data || {};
    if (!d.dilreetReply || !pending[d.id]) return;
    var p = pending[d.id]; delete pending[d.id];
    d.error ? p.reject(new Error(d.error)) : p.resolve(d.value);
  });
  window.dilreet = {
    ask: function(prompt){ return call('ask', [String(prompt)]); },
    notify: function(text){ return call('notify', [String(text)]); },
    store: {
      get: function(key){ return call('get', [String(key)]); },
      set: function(key, value){ return call('set', [String(key), value]); }
    }
  };
})();
</script>`;

function pageFor(html) {
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => `${m}\n${BRIDGE}`);
  return `<!doctype html><html><head><meta charset="utf-8">${BRIDGE}</head><body>${html}</body></html>`;
}

module.exports = { extractHtml, lint, parseHeader, draft, install, list, setEnabled, rollback, remove, readCurrent, readManifest, storeGet, storeSet, pageFor };
