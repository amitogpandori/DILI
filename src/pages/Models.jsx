import { useEffect, useState } from 'react';
import { api } from '../api';
import Icon from '../Icon';

const sizeOf = (m) => (m.sizeGB != null && m.sizeGB > 0 ? m.sizeGB : (m.files || []).reduce((s, f) => s + f.sizeGB, 0));

export default function Models({ settings, hw, tasks, onSettings, onRescan, toast }) {
  const [cat, setCat] = useState(null);
  const [installed, setInstalled] = useState({ chat: [], media: {} });
  const [engines, setEngines] = useState(null);
  const [custom, setCustom] = useState('');

  const load = async () => {
    const [c, i, e] = await Promise.all([api.catalog(), api.models.installed(), api.engines.status()]);
    setCat(c);
    setInstalled(i);
    setEngines(e);
  };

  const doneKey = tasks.filter((t) => t.kind === 'install' && t.status !== 'running').map((t) => t.id).join();
  useEffect(() => {
    load();
  }, [doneKey, hw]);

  if (!cat) return <div className="page" />;

  const running = (label) => tasks.find((t) => t.kind === 'install' && t.status === 'running' && t.label.includes(label));
  const chatInstalled = (id) => installed.chat.some((m) => m.id === id || m.id === `${id}:latest`);

  function chatRow(m, kind) {
    const isOn = chatInstalled(m.id);
    const key = kind === 'coder' ? 'coderModel' : 'chatModel';
    const job = running(m.id);
    return (
      <ModelRow
        key={m.id}
        m={m}
        size={sizeOf(m)}
        installed={isOn}
        job={job}
        isDefault={settings[key] === m.id}
        onInstall={() => {
          if (!engines.ollamaInstalled) api.engines.install('ollama').then(() => api.models.pull(m.id, kind));
          else api.models.pull(m.id, kind);
        }}
        onUse={() => onSettings({ [key]: m.id })}
        onRemove={async () => {
          await api.models.deleteChat(m.id);
          if (settings[key] === m.id) onSettings({ [key]: '' });
          load();
        }}
      />
    );
  }

  function mediaRow(m, kind) {
    const key = kind === 'image' ? 'imageModel' : 'videoModel';
    const job = running(m.name);
    return (
      <ModelRow
        key={m.id}
        m={m}
        size={sizeOf(m)}
        installed={!!installed.media[m.id]}
        job={job}
        isDefault={settings[key] === m.id}
        experimental={kind === 'video' && m.fits && hw.can.video !== 'good'}
        onInstall={() => {
          if (!engines.sdInstalled) api.engines.install('sd');
          if (kind === 'video' && !engines.ffmpegInstalled) api.engines.install('ffmpeg');
          api.models.installMedia(kind, m.id);
        }}
        onUse={() => onSettings({ [key]: m.id })}
        onRemove={async () => {
          await api.models.removeMedia(kind, m.id);
          if (settings[key] === m.id) onSettings({ [key]: '' });
          load();
        }}
      />
    );
  }

  return (
    <div className="page models">
      <div className="page-head">
        <h1 className="display small">AI models</h1>
        <button className="btn ghost small" onClick={onRescan}>
          <Icon name="chip" size={16} /> Re-check my PC
        </button>
      </div>

      <div className="pc-strip">
        <div>
          <strong>{hw.label}</strong>
          <span className="muted">
            {' '}
            · {hw.gpu ? `${hw.gpu.name}${hw.gpu.vramGB ? ` (${hw.gpu.vramGB} GB)` : ''}` : 'No graphics card found'} · {Math.round(hw.ramGB)} GB RAM
            {hw.diskFreeGB != null ? ` · ${Math.round(hw.diskFreeGB)} GB free` : ''}
          </span>
        </div>
        <p className="muted small">Models marked "Fits your PC" are the ones I recommend. Bigger ones may still work, just slowly.</p>
      </div>

      <Section title="Chat" note="The brain you talk to.">
        {cat.chat.map((m) => chatRow(m, 'chat'))}
        <form
          className="custom-model"
          onSubmit={(e) => {
            e.preventDefault();
            if (!custom.trim()) return;
            api.models.pull(custom.trim(), 'chat');
            toast(`Downloading ${custom.trim()}…`);
            setCustom('');
          }}
        >
          <input className="field" placeholder="Any other model from ollama.com/library, e.g. gemma3:1b" value={custom} onChange={(e) => setCustom(e.target.value)} />
          <button className="btn ghost" type="submit" disabled={!custom.trim()}>
            Download
          </button>
        </form>
        {installed.chat
          .filter((m) => ![...cat.chat, ...cat.coder].some((c) => chatInstalled(c.id) && (m.id === c.id || m.id === `${c.id}:latest`)))
          .map((m) => chatRow({ id: m.id, name: m.id, sizeGB: m.sizeGB, fits: true, good: 'Added by you' }, 'chat'))}
      </Section>

      <Section title="Feature builder" note="A coding model Dilreet uses to write new features for itself.">
        {cat.coder.map((m) => chatRow(m, 'coder'))}
      </Section>

      <Section title="Pictures" note="Turns your description into a picture.">
        {cat.image.map((m) => mediaRow(m, 'image'))}
      </Section>

      <Section title="Videos" note="Turns your description into a short clip. Needs a strong graphics card to be quick.">
        {cat.video.map((m) => mediaRow(m, 'video'))}
      </Section>

      {engines && (
        <Section title="Engines" note="The programs that run the models. Installed automatically when needed.">
          <EngineRow name="Chat engine (Ollama)" ok={engines.ollamaInstalled} job={running('chat engine')} onInstall={() => api.engines.install('ollama')} />
          <EngineRow name="Picture and video engine (stable-diffusion.cpp)" ok={engines.sdInstalled} job={running('picture engine')} onInstall={() => api.engines.install('sd')} />
          <EngineRow name="Video tools (FFmpeg)" ok={engines.ffmpegInstalled} job={running('video tools')} onInstall={() => api.engines.install('ffmpeg')} />
        </Section>
      )}
    </div>
  );
}

function Section({ title, note, children }) {
  return (
    <section className="model-section">
      <div className="section-head">
        <h2 className="section-title">{title}</h2>
        <span className="muted small">{note}</span>
      </div>
      <div className="model-list">{children}</div>
    </section>
  );
}

function ModelRow({ m, size, installed, job, isDefault, experimental, onInstall, onUse, onRemove }) {
  return (
    <div className={`model-row ${installed ? 'installed' : ''}`}>
      <div className="model-info">
        <div className="model-name">
          {m.name}
          {isDefault && <span className="tag strong">In use</span>}
          {!installed && m.fits && !experimental && <span className="tag ok">Fits your PC</span>}
          {experimental && <span className="tag warn">Experimental on your PC</span>}
          {!m.fits && <span className="tag">Needs a stronger PC</span>}
        </div>
        <div className="muted small">
          {m.good}
          {size ? ` · ${size.toFixed(1)} GB` : ''}
        </div>
        {job && (
          <div className="row-progress">
            <div className="bar">
              <div className="bar-fill" style={{ width: `${Math.max(2, Math.round(job.progress * 100))}%` }} />
            </div>
            <span className="muted small truncate">{job.detail}</span>
          </div>
        )}
      </div>
      <div className="model-actions">
        {job ? (
          <button className="btn ghost small" onClick={() => api.tasks.cancel(job.id)}>
            Pause
          </button>
        ) : installed ? (
          <>
            {!isDefault && (
              <button className="btn ghost small" onClick={onUse}>
                Use this
              </button>
            )}
            <button className="icon-btn ghost" title="Remove from PC" aria-label={`Remove ${m.name}`} onClick={onRemove}>
              <Icon name="trash" size={16} />
            </button>
          </>
        ) : (
          <button className="btn small" onClick={onInstall}>
            <Icon name="download" size={16} /> Download
          </button>
        )}
      </div>
    </div>
  );
}

function EngineRow({ name, ok, job, onInstall }) {
  return (
    <div className="model-row">
      <div className="model-info">
        <div className="model-name">
          {name} {ok ? <span className="tag ok">Installed</span> : <span className="tag">Not installed</span>}
        </div>
        {job && <span className="muted small">{job.detail}</span>}
      </div>
      <div className="model-actions">
        {!ok && !job && (
          <button className="btn small" onClick={onInstall}>
            Install
          </button>
        )}
      </div>
    </div>
  );
}
