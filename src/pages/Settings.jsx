import { useEffect, useState } from 'react';
import { api } from '../api';
import Icon from '../Icon';

export default function Settings({ settings, hw, onSettings, onRunSetup, toast }) {
  const [name, setName] = useState(settings.userName || '');
  const [info, setInfo] = useState(null);
  const [update, setUpdate] = useState(null);

  useEffect(() => {
    api.appInfo().then(setInfo);
  }, []);

  return (
    <div className="page settings">
      <div className="page-head">
        <h1 className="display small">Settings</h1>
      </div>

      <div className="settings-list">
        <Row title="Your name" note="Dilreet uses it to greet you.">
          <form
            className="row gap"
            onSubmit={async (e) => {
              e.preventDefault();
              await onSettings({ userName: name.trim() });
              toast('Saved');
            }}
          >
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn ghost" type="submit">
              Save
            </button>
          </form>
        </Row>

        <Row title="Let Dilreet take actions in chat" note="When on, the chat model can start pictures, videos and new features by itself when you ask.">
          <Toggle checked={settings.agentTools !== false} onChange={(v) => onSettings({ agentTools: v })} />
        </Row>

        <Row title="Show reasoning" note="Some models (like Qwen 3) can think before answering. Better answers, but slower on small PCs.">
          <Toggle checked={!!settings.showThinking} onChange={(v) => onSettings({ showThinking: v })} />
        </Row>

        <Row title="Storage folder" note="Where models, engines and your creations are saved. Changing it does not move existing files.">
          <div className="row gap wrap">
            <code className="path">{settings.storageRoot}</code>
            <button className="btn ghost small" onClick={() => api.openStorage()}>
              <Icon name="folder" size={16} /> Open
            </button>
            <button
              className="btn ghost small"
              onClick={async () => {
                const p = await api.settings.pickFolder();
                if (p) {
                  await onSettings({ storageRoot: p });
                  toast('Storage folder changed. Restart Dilreet to use it everywhere.');
                }
              }}
            >
              Change
            </button>
          </div>
        </Row>

        <Row title="This PC" note={`${hw.cpu.model} · ${Math.round(hw.ramGB)} GB RAM · ${hw.gpu ? hw.gpu.name : 'no graphics card found'}`}>
          <button className="btn ghost small" onClick={onRunSetup}>
            Run setup again
          </button>
        </Row>

        <Row title="Dilreet updates" note={`Version ${info ? info.version : '…'}. New versions you publish on GitHub install automatically.`}>
          <div className="row gap">
            <button
              className="btn ghost small"
              onClick={async () => {
                setUpdate({ message: 'Checking…' });
                setUpdate(await api.updates.check());
              }}
            >
              <Icon name="refresh" size={16} /> Check for updates
            </button>
            {update && <span className="muted small">{update.message}</span>}
          </div>
        </Row>
      </div>
    </div>
  );
}

function Row({ title, note, children }) {
  return (
    <div className="setting">
      <div className="setting-text">
        <div className="setting-title">{title}</div>
        <div className="muted small">{note}</div>
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </label>
  );
}
