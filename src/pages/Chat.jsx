import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, mediaUrl, uid } from '../api';
import { renderMarkdown } from '../markdown';
import Icon, { Mark } from '../Icon';

function greeting(name) {
  const h = new Date().getHours();
  const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return name ? `${part}, ${name}` : part;
}

const STARTERS = [
  { label: 'Explain something', text: 'Explain how mutual funds work in simple words, with an example in rupees.' },
  { label: 'Make a picture', text: '/image a cosy tea stall on a rainy evening in Punjab, warm lights' },
  { label: 'Write for me', text: 'Write a short, polite WhatsApp message to my landlord asking to fix the boiler.' },
  { label: 'Add a feature', text: '/feature a to-do list with due dates and a "done" checkbox' }
];

export default function Chat({ conversation, settings, hw, tasks, onSave, onOpenFeatures, onOpenModels }) {
  const [conv, setConv] = useState(() => conversation || { id: uid(), title: '', created: Date.now(), messages: [] });
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(null); // current request id
  const [models, setModels] = useState([]);
  const [model, setModel] = useState(settings.chatModel || '');
  const scroller = useRef(null);
  const stickToBottom = useRef(true);
  const convRef = useRef(conv);
  convRef.current = conv;

  useEffect(() => {
    api.models.installed().then((r) => setModels(r.chat || []));
  }, []);

  // Stream events for the reply currently being written.
  useEffect(() => {
    return api.chat.onEvent((ev) => {
      if (ev.reqId !== busy) return;
      setConv((c) => {
        const msgs = [...c.messages];
        const last = { ...msgs[msgs.length - 1] };
        if (ev.type === 'token') last.content = (last.content || '') + ev.text;
        if (ev.type === 'thinking') last.thinking = (last.thinking || '') + ev.text;
        if (ev.type === 'tool') last.tools = [...(last.tools || []), ev.name];
        if (ev.type === 'attachment') last.attachments = [...(last.attachments || []), ev.attachment];
        if (ev.type === 'error') last.error = ev.error;
        if (ev.type === 'done' || ev.type === 'error') last.streaming = false;
        msgs[msgs.length - 1] = last;
        return { ...c, messages: msgs, updated: Date.now() };
      });
      if (ev.type === 'done' || ev.type === 'error') setBusy(null);
    });
  }, [busy]);

  // When a picture/video/feature job finishes, keep its result inside the message so it survives restarts.
  useEffect(() => {
    let changed = false;
    const msgs = conv.messages.map((m) => {
      if (!m.attachments) return m;
      const atts = m.attachments.map((a) => {
        if (a.result || a.failed) return a;
        const t = tasks.find((x) => x.id === a.taskId);
        if (!t || t.status === 'running') return a;
        changed = true;
        return t.status === 'done' ? { ...a, result: t.result } : { ...a, failed: t.detail || 'Stopped' };
      });
      return { ...m, attachments: atts };
    });
    if (changed) {
      const next = { ...conv, messages: msgs };
      setConv(next);
      onSave(next);
    }
  }, [tasks]);

  // Save when a reply finishes or the title arrives.
  useEffect(() => {
    if (!busy) persist(conv);
  }, [busy, conv.title]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [conv]);

  function persist(c = convRef.current) {
    if (c.messages.length) onSave(c);
  }

  async function send(textArg) {
    const text = (textArg ?? input).trim();
    if (!text || busy) return;
    setInput('');
    stickToBottom.current = true;

    // Slash commands run an action directly, without waiting for the chat model.
    const cmd = text.match(/^\/(image|picture|video|feature)\s+([\s\S]+)/i);
    if (cmd) {
      const kind = cmd[1].toLowerCase();
      const body = cmd[2].trim();
      let att;
      let reply;
      if (kind === 'feature') {
        const taskId = await api.features.draft({ request: body });
        att = { type: 'feature', taskId, request: body };
        reply = "I'm writing that feature now. When it's ready you can preview it before installing.";
      } else if (kind === 'video') {
        if (!settings.videoModel) return addLocal(text, 'No video model is installed yet. Open **AI models** to add one.');
        const taskId = await api.studio.video({ prompt: body });
        att = { type: 'job', kind: 'video', taskId, prompt: body };
        reply = 'Filming your video. This takes a few minutes on most PCs.';
      } else {
        if (!settings.imageModel) return addLocal(text, 'No picture model is installed yet. Open **AI models** to add one.');
        const taskId = await api.studio.image({ prompt: body });
        att = { type: 'job', kind: 'image', taskId, prompt: body };
        reply = 'Painting your picture now.';
      }
      return addLocal(text, reply, [att]);
    }

    if (!model) {
      return addLocal(text, 'No chat model is installed yet. Open **AI models** and download one — Qwen 3 4B is a good start.');
    }

    const reqId = uid();
    const userMsg = { id: uid(), role: 'user', content: text };
    const botMsg = { id: uid(), role: 'assistant', content: '', streaming: true, model };
    const next = { ...conv, messages: [...conv.messages, userMsg, botMsg], updated: Date.now() };
    setConv(next);
    setBusy(reqId);

    const history = next.messages.slice(0, -1).filter((m) => m.content).map((m) => ({ role: m.role, content: m.content }));
    await api.chat.send({ reqId, history, model });

    if (!conv.title) {
      api.chat.title(text).then((title) => setConv((c) => ({ ...c, title: title || text.slice(0, 40) })));
    }
  }

  function addLocal(userText, botText, attachments) {
    const next = {
      ...conv,
      title: conv.title || userText.replace(/^\/\w+\s*/, '').slice(0, 40),
      messages: [...conv.messages, { id: uid(), role: 'user', content: userText }, { id: uid(), role: 'assistant', content: botText, attachments, local: true }],
      updated: Date.now()
    };
    setConv(next);
    onSave(next);
  }

  function onScroll() {
    const el = scroller.current;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  const empty = conv.messages.length === 0;

  return (
    <div className={`chat ${empty ? 'is-empty' : ''}`}>
      {!empty && (
        <header className="chat-head">
          <span className="truncate">{conv.title || 'New chat'}</span>
        </header>
      )}

      <div className="chat-scroll" ref={scroller} onScroll={onScroll}>
        {empty ? (
          <div className="welcome">
            <Mark size={36} />
            <h1 className="display">{greeting(settings.userName)}</h1>
          </div>
        ) : (
          <div className="thread">
            {conv.messages.map((m) => (
              <Message key={m.id} m={m} tasks={tasks} onOpenFeatures={onOpenFeatures} />
            ))}
          </div>
        )}
      </div>

      <div className="composer-wrap">
        <Composer
          value={input}
          onChange={setInput}
          onSend={() => send()}
          onStop={() => busy && api.chat.stop(busy)}
          busy={!!busy}
          model={model}
          models={models}
          onModel={setModel}
          onOpenModels={onOpenModels}
        />
        {empty && (
          <div className="starters">
            {STARTERS.map((s) => (
              <button key={s.label} className="chip" onClick={() => send(s.text)}>
                {s.label}
              </button>
            ))}
          </div>
        )}
        {!empty && <div className="composer-note">Dilreet runs on your PC and can make mistakes. Type /image, /video or /feature for quick actions.</div>}
      </div>
    </div>
  );
}

function Composer({ value, onChange, onSend, onStop, busy, model, models, onModel, onOpenModels }) {
  const ta = useRef(null);
  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 240) + 'px';
  }, [value]);

  return (
    <div className="composer">
      <textarea
        ref={ta}
        rows={1}
        autoFocus
        placeholder="How can I help you today?"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
      />
      <div className="composer-bar">
        <select
          className="model-select"
          value={model}
          onChange={(e) => (e.target.value === '__manage' ? onOpenModels() : onModel(e.target.value))}
          aria-label="Chat model"
        >
          {!model && <option value="">No model installed</option>}
          {model && !models.some((m) => m.id === model) && <option value={model}>{model}</option>}
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id}
            </option>
          ))}
          <option value="__manage">Manage models…</option>
        </select>
        {busy ? (
          <button className="send stop" onClick={onStop} aria-label="Stop">
            <Icon name="stop" size={16} />
          </button>
        ) : (
          <button className="send" onClick={onSend} disabled={!value.trim()} aria-label="Send">
            <Icon name="send" size={18} strokeWidth={2.2} />
          </button>
        )}
      </div>
    </div>
  );
}

function Message({ m, tasks, onOpenFeatures }) {
  const [showThinking, setShowThinking] = useState(false);
  const body = useRef(null);

  // Copy buttons on code blocks.
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    const h = (e) => {
      const btn = e.target.closest('[data-copy]');
      if (!btn) return;
      const code = btn.closest('.md-code').querySelector('code').innerText;
      navigator.clipboard.writeText(code);
      btn.textContent = 'Copied';
      setTimeout(() => (btn.textContent = 'Copy'), 1500);
    };
    el.addEventListener('click', h);
    return () => el.removeEventListener('click', h);
  }, []);

  if (m.role === 'user') {
    return (
      <div className="msg user">
        <div className="bubble">{m.content}</div>
      </div>
    );
  }

  const visible = (m.content || '').replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trim();
  return (
    <div className="msg bot">
      <div className="bot-mark">
        <Mark size={22} />
      </div>
      <div className="bot-body" ref={body}>
        {m.thinking && (
          <button className="thinking-toggle" onClick={() => setShowThinking(!showThinking)}>
            {m.streaming && !visible ? 'Thinking…' : showThinking ? 'Hide reasoning' : 'Show reasoning'}
          </button>
        )}
        {showThinking && m.thinking && <div className="thinking">{m.thinking}</div>}
        {m.tools && m.tools.length > 0 && <div className="tool-note">Used: {m.tools.map((t) => t.replace(/_/g, ' ')).join(', ')}</div>}
        {visible ? <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(visible) }} /> : m.streaming && !m.thinking && <div className="typing"><span /><span /><span /></div>}
        {(m.attachments || []).map((a, i) => (
          <Attachment key={i} a={a} tasks={tasks} onOpenFeatures={onOpenFeatures} />
        ))}
        {m.error && <div className="error-box">{m.error}</div>}
      </div>
    </div>
  );
}

function Attachment({ a, tasks, onOpenFeatures }) {
  const t = tasks.find((x) => x.id === a.taskId);
  const result = a.result || (t && t.status === 'done' ? t.result : null);
  const failed = a.failed || (t && (t.status === 'error' || t.status === 'canceled') ? t.detail : null);

  if (a.type === 'feature') {
    return (
      <div className="att-card">
        <div className="att-title">
          <Icon name="puzzle" /> New feature: {a.request}
        </div>
        {result ? (
          <div className="row gap">
            <span>
              {result.icon} <strong>{result.name}</strong> is ready to preview.
            </span>
            <button className="btn primary small" onClick={() => onOpenFeatures(a.taskId)}>
              Preview and install
            </button>
          </div>
        ) : failed ? (
          <div className="error-box">{failed}</div>
        ) : (
          <Progress t={t} fallback="Writing the feature…" />
        )}
      </div>
    );
  }

  return (
    <div className="att-media">
      {result ? (
        result.map((r) =>
          r.type === 'video' ? (
            <video key={r.id} src={mediaUrl(r.file)} poster={mediaUrl(r.poster)} controls loop playsInline />
          ) : (
            <img key={r.id} src={mediaUrl(r.file)} alt={r.prompt} />
          )
        )
      ) : failed ? (
        <div className="error-box">{failed}</div>
      ) : (
        <div className="att-pending">
          <Progress t={t} fallback={a.kind === 'video' ? 'Waiting to film…' : 'Waiting to paint…'} />
        </div>
      )}
    </div>
  );
}

function Progress({ t, fallback }) {
  return (
    <div className="progress-inline">
      <div className="bar">
        <div className="bar-fill" style={{ width: `${Math.max(3, Math.round(((t && t.progress) || 0) * 100))}%` }} />
      </div>
      <div className="muted small">{(t && t.detail) || fallback}</div>
    </div>
  );
}
