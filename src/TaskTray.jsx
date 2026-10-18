import { useState } from 'react';
import { api } from './api';
import Icon from './Icon';

// Floating "Activity" panel: every download, install and creation with its progress.
export default function TaskTray({ tasks, running }) {
  const [open, setOpen] = useState(false);
  if (!tasks.length) return null;
  const active = tasks.find((t) => t.status === 'running');

  return (
    <div className={`tray ${open ? 'open' : ''}`}>
      {open && (
        <div className="tray-panel">
          <div className="tray-head">
            <strong>Activity</strong>
            <button className="link-btn" onClick={() => api.tasks.clear()}>
              Clear finished
            </button>
          </div>
          <div className="tray-list">
            {tasks.map((t) => (
              <TaskRow key={t.id} t={t} />
            ))}
          </div>
        </div>
      )}
      <button className="tray-button" onClick={() => setOpen(!open)} aria-expanded={open}>
        {running > 0 ? <span className="spinner" /> : <Icon name="check" size={16} />}
        <span className="truncate">{running > 0 ? `${active.label} · ${Math.round(active.progress * 100)}%` : 'All done'}</span>
        {running > 1 && <span className="badge">+{running - 1}</span>}
      </button>
    </div>
  );
}

export function TaskRow({ t, compact }) {
  return (
    <div className={`task ${t.status}`}>
      <div className="task-top">
        <span className="task-label truncate">{t.label}</span>
        {t.status === 'running' ? (
          <button className="icon-btn ghost small" title="Stop" aria-label="Stop" onClick={() => api.tasks.cancel(t.id)}>
            <Icon name="close" size={14} />
          </button>
        ) : (
          <span className="task-state">{t.status === 'done' ? 'Done' : t.status === 'canceled' ? 'Stopped' : 'Failed'}</span>
        )}
      </div>
      {t.status === 'running' && (
        <div className="bar">
          <div className="bar-fill" style={{ width: `${Math.max(2, Math.round(t.progress * 100))}%` }} />
        </div>
      )}
      {!compact && t.detail && <div className={`task-detail ${t.status === 'error' ? 'err' : ''}`}>{t.detail}</div>}
    </div>
  );
}
