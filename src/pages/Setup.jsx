import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import Icon, { Mark } from '../Icon';
import { TaskRow } from '../TaskTray';

const CAN_TEXT = {
  great: 'Runs well',
  good: 'Runs well',
  slow: 'Works, but slowly',
  experimental: 'Experimental — slow, may run out of memory',
  no: 'Not on this PC'
};

export default function Setup({ hw, settings, tasks, onRescan, onSettings, onDone }) {
  const [step, setStep] = useState(settings.userName ? 'scan' : 'hello');
  const [name, setName] = useState(settings.userName || '');
  const [catalog, setCatalog] = useState(null);
  const [picks, setPicks] = useState({});
  const [startedAt, setStartedAt] = useState(null);
  const [finished, setFinished] = useState(null);

  useEffect(() => {
    api.catalog().then(setCatalog);
    return api.setup.onFinished((r) => setFinished(r));
  }, [hw]);

  const rec = catalog && catalog.recommended;

  // Default selection: everything that runs well; video only when it is not experimental.
  useEffect(() => {
    if (!rec) return;
    setPicks({ chat: !!rec.chat, coder: !!rec.coder, image: !!rec.image, video: !!rec.video && !rec.videoExperimental });
  }, [rec]);

  const items = useMemo(() => {
    if (!rec) return [];
    const list = [
      { key: 'chat', title: 'Chat', model: rec.chat, sizeGB: rec.chat && rec.chat.sizeGB + 1.2, note: 'Talk to Dilreet like any AI assistant. Includes the chat engine.' },
      { key: 'coder', title: 'Feature builder', model: rec.coder, sizeGB: rec.coder && rec.coder.sizeGB, note: 'Lets Dilreet write new features for itself when you ask.' },
      { key: 'image', title: 'Pictures', model: rec.image, sizeGB: rec.image && rec.image.files.reduce((s, f) => s + f.sizeGB, 0) + 0.6, note: 'Turn a sentence into a picture. Includes the picture engine.' },
      { key: 'video', title: 'Videos', model: rec.video, sizeGB: rec.video && rec.video.files.reduce((s, f) => s + f.sizeGB, 0) + 0.2, note: rec.videoExperimental ? 'Short, small clips. On this PC video is experimental: slow, and it may run out of memory.' : 'Short clips from a sentence. Includes the video tools.', warn: rec.videoExperimental }
    ];
    return list.filter((i) => i.model);
  }, [rec]);

  const totalGB = items.filter((i) => picks[i.key]).reduce((s, i) => s + (i.sizeGB || 0), 0);
  const diskOk = hw.diskFreeGB == null || hw.diskFreeGB > totalGB + 5;

  function plan() {
    const p = [];
    if (picks.chat || picks.coder) p.push({ kind: 'ollama' });
    if (picks.chat) p.push({ kind: 'chat', id: rec.chat.id, makeDefault: true });
    if (picks.coder) p.push({ kind: 'coder', id: rec.coder.id, makeDefault: true });
    if (picks.image || picks.video) p.push({ kind: 'sd' });
    if (picks.image) p.push({ kind: 'image', id: rec.image.id, makeDefault: true });
    if (picks.video) p.push({ kind: 'ffmpeg' }, { kind: 'video', id: rec.video.id, makeDefault: true });
    return p;
  }

  async function install() {
    setStartedAt(Date.now());
    setFinished(null);
    await api.setup.run(plan());
    setStep('install');
  }

  const setupTasks = startedAt ? tasks.filter((t) => t.kind === 'install' && t.created >= startedAt - 1000) : [];

  return (
    <div className="setup">
      <div className="setup-card">
        <div className="setup-mark">
          <Mark size={40} />
        </div>

        {step === 'hello' && (
          <form
            className="setup-body"
            onSubmit={async (e) => {
              e.preventDefault();
              await onSettings({ userName: name.trim() });
              setStep('scan');
            }}
          >
            <h1 className="display">Sat Sri Akal. I'm Dilreet.</h1>
            <p className="lead">I run AI on your own computer — chat, pictures and videos — with nothing sent to the internet. First, what should I call you?</p>
            <input className="field big" autoFocus placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn primary big" type="submit" disabled={!name.trim()}>
              Continue
            </button>
          </form>
        )}

        {step === 'scan' && (
          <div className="setup-body">
            <h1 className="display">Here's what your PC can do{settings.userName ? `, ${settings.userName}` : ''}</h1>
            <p className="lead">I checked your hardware so I only install AI models that run well on it.</p>

            <div className="spec-grid">
              <Spec label="Processor" value={hw.cpu.model} sub={`${hw.cpu.threads} threads`} />
              <Spec label="Memory (RAM)" value={`${Math.round(hw.ramGB)} GB`} />
              <Spec label="Graphics card" value={hw.gpu ? hw.gpu.name : 'Not detected'} sub={hw.gpu && hw.gpu.vramGB ? `${hw.gpu.vramGB} GB video memory` : ''} />
              <Spec label="Free space" value={hw.diskFreeGB != null ? `${Math.round(hw.diskFreeGB)} GB` : 'Unknown'} />
            </div>

            <div className="verdict">
              <div className="verdict-tier">{hw.label}</div>
              <ul className="can-list">
                <li className={`can ${hw.can.chat}`}><span>Chat</span><em>{CAN_TEXT[hw.can.chat]}</em></li>
                <li className={`can ${hw.can.images}`}><span>Pictures</span><em>{CAN_TEXT[hw.can.images]}</em></li>
                <li className={`can ${hw.can.video}`}><span>Videos</span><em>{CAN_TEXT[hw.can.video]}</em></li>
              </ul>
              {hw.tips.length > 0 && (
                <div className="tips">
                  {hw.tips.map((t) => (
                    <p key={t}>{t}</p>
                  ))}
                </div>
              )}
            </div>

            <div className="row gap">
              <button className="btn primary big" onClick={() => setStep('plan')} disabled={!catalog}>
                See what I'll install
              </button>
              <button className="btn ghost" onClick={onRescan}>
                Scan again
              </button>
            </div>
          </div>
        )}

        {step === 'plan' && rec && (
          <div className="setup-body">
            <h1 className="display">Pick what to set up</h1>
            <p className="lead">Everything downloads once and then works offline. You can add or remove models later.</p>

            <div className="pick-list">
              {items.map((i) => (
                <label key={i.key} className={`pick ${picks[i.key] ? 'on' : ''} ${i.warn ? 'warn' : ''}`}>
                  <input type="checkbox" checked={!!picks[i.key]} onChange={(e) => setPicks({ ...picks, [i.key]: e.target.checked })} />
                  <div className="pick-main">
                    <div className="pick-title">
                      {i.title} <span className="pick-model">{i.model.name}</span>
                    </div>
                    <div className="pick-note">{i.note}</div>
                  </div>
                  <div className="pick-size">{i.sizeGB ? `${i.sizeGB.toFixed(1)} GB` : ''}</div>
                </label>
              ))}
            </div>

            <div className="plan-total">
              <span>Total download: about {totalGB.toFixed(1)} GB</span>
              {!diskOk && <span className="err">Not enough free space on this drive. Change the storage folder in Settings first.</span>}
            </div>

            <div className="row gap">
              <button className="btn primary big" onClick={install} disabled={!totalGB || !diskOk}>
                <Icon name="download" /> Install everything
              </button>
              <button className="btn ghost" onClick={() => setStep('scan')}>
                Back
              </button>
              <button className="link-btn push" onClick={onDone}>
                Skip for now
              </button>
            </div>
          </div>
        )}

        {step === 'install' && (
          <div className="setup-body">
            <h1 className="display">{finished ? (finished.failed.length ? 'Almost there' : "You're all set") : 'Setting things up'}</h1>
            <p className="lead">
              {finished
                ? finished.failed.length
                  ? 'Some parts did not install. You can retry them from the AI models page.'
                  : 'Everything is installed and ready to use offline.'
                : 'This can take a while on the first run. You can start chatting as soon as the chat parts finish — the rest keeps downloading in the background.'}
            </p>
            <div className="install-list">
              {setupTasks.length === 0 && <div className="muted">Starting…</div>}
              {[...setupTasks].reverse().map((t) => (
                <TaskRow key={t.id} t={t} />
              ))}
            </div>
            {finished && finished.failed.length > 0 && (
              <div className="error-box">
                {finished.failed.map((f) => (
                  <p key={f}>{f}</p>
                ))}
              </div>
            )}
            <div className="row gap">
              <button className="btn primary big" onClick={onDone}>
                {finished ? 'Start using Dilreet' : 'Continue in the background'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Spec({ label, value, sub }) {
  return (
    <div className="spec">
      <div className="spec-label">{label}</div>
      <div className="spec-value">{value}</div>
      {sub && <div className="spec-sub">{sub}</div>}
    </div>
  );
}
