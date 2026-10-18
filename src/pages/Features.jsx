import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import Icon from '../Icon';

const EXAMPLES = [
  'A to-do list with due dates and a done checkbox',
  'A rupee ↔ pound currency converter with a rate I can edit',
  'A daily expense tracker with a monthly total',
  'A flashcard quiz maker: I paste notes and it asks me questions',
  'A Pomodoro focus timer with a short break timer'
];

// Runs an add-on page in a locked frame and answers its dilreet.* requests.
export function FeatureFrame({ host, toast, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    const onMsg = async (e) => {
      if (!ref.current || e.source !== ref.current.contentWindow) return;
      const d = e.data || {};
      if (!d.dilreet) return;
      let reply;
      try {
        const value = await api.features.bridge(host, d.op, d.args);
        reply = { dilreetReply: true, id: d.id, value };
        if (d.op === 'notify' && toast) toast(String(d.args[0]));
      } catch (err) {
        reply = { dilreetReply: true, id: d.id, error: err.message };
      }
      e.source.postMessage(reply, '*');
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [host]);

  return <iframe ref={ref} className={`feature-frame ${className}`} title="Feature" src={`dilreet-feature://${host}/`} sandbox="allow-scripts allow-forms allow-modals allow-downloads" />;
}

export function FeatureView({ feature, toast, onEdit }) {
  if (!feature) return <div className="page">This feature was removed.</div>;
  return (
    <div className="page feature-page">
      <div className="page-head">
        <h1 className="display small">
          <span className="emoji">{feature.icon}</span> {feature.name}
        </h1>
        <button className="btn ghost small" onClick={onEdit}>
          <Icon name="wand" size={16} /> Change this feature
        </button>
      </div>
      <FeatureFrame host={feature.id} toast={toast} className="full" />
    </div>
  );
}

export default function Features({ tasks, features, draftTaskId, editId, onChanged, onOpen, toast }) {
  const [request, setRequest] = useState('');
  const [baseId, setBaseId] = useState(editId || null);
  const [taskId, setTaskId] = useState(draftTaskId || null);
  const [draft, setDraft] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [versionsFor, setVersionsFor] = useState(null);

  const task = tasks.find((t) => t.id === taskId);
  const base = features.find((f) => f.id === baseId);

  // Load the draft once the coding model has finished.
  useEffect(() => {
    if (task && task.status === 'done' && task.result && (!draft || draft.id !== task.result.draftId)) {
      api.features.getDraft(task.result.draftId).then((d) => d && setDraft(d));
    }
  }, [task && task.status]);

  async function build() {
    const text = base ? request.trim() : request.trim();
    if (!text) return;
    setDraft(null);
    setTaskId(await api.features.draft(base ? { baseId: base.id, feedback: text } : { request: text }));
  }

  async function revise() {
    if (!feedback.trim() || !draft) return;
    const id = await api.features.draft({ previousDraftId: draft.id, feedback: feedback.trim(), baseId: draft.baseId || undefined });
    setFeedback('');
    setDraft(null);
    setTaskId(id);
  }

  async function install() {
    const m = await api.features.install(draft.id);
    toast(`${m.name} is installed. Find it in the sidebar.`);
    setDraft(null);
    setTaskId(null);
    setRequest('');
    setBaseId(null);
    await onChanged();
    onOpen(m.id);
  }

  const building = task && task.status === 'running';
  const failed = task && (task.status === 'error' || task.status === 'canceled');

  return (
    <div className="page features">
      <div className="page-head">
        <h1 className="display small">{base ? `Change “${base.name}”` : 'Add a feature to Dilreet'}</h1>
      </div>

      {!draft && (
        <div className="create-card">
          <label className="step-label" htmlFor="feat">
            {base ? 'What should change?' : 'What should Dilreet be able to do?'}
          </label>
          <textarea
            id="feat"
            className="field prompt-box"
            rows={3}
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            placeholder={base ? 'e.g. Add a dark green theme and sort items by date' : 'Describe the feature in a sentence or two.'}
            disabled={building}
          />
          {!base && !request && (
            <div className="chips">
              {EXAMPLES.map((x) => (
                <button key={x} className="chip quiet" onClick={() => setRequest(x)}>
                  {x}
                </button>
              ))}
            </div>
          )}
          <div className="row gap">
            <button className="btn primary big" onClick={build} disabled={!request.trim() || building}>
              <Icon name="sparkle" /> {base ? 'Make the change' : 'Build it'}
            </button>
            {base && (
              <button className="link-btn" onClick={() => setBaseId(null)}>
                Build something new instead
              </button>
            )}
          </div>
          {building && (
            <div className="job">
              <div className="bar">
                <div className="bar-fill indeterminate" />
              </div>
              <div className="row gap">
                <span className="muted small">{task.detail}</span>
                <button className="link-btn push" onClick={() => api.tasks.cancel(task.id)}>
                  Stop
                </button>
              </div>
            </div>
          )}
          {failed && <div className="error-box">{task.detail}</div>}
          <p className="muted small">
            Dilreet's coding model writes each feature as a small, separate add-on. It can't touch your files or the internet, and every version is kept so you can undo a change. Simple ideas work best on smaller PCs.
          </p>
        </div>
      )}

      {draft && (
        <div className="draft">
          <div className="draft-head">
            <div>
              <h2 className="section-title">
                <span className="emoji">{draft.icon}</span> {draft.name}
              </h2>
              <p className="muted">{draft.description}</p>
            </div>
            <div className="row gap">
              <button className="btn primary" onClick={install}>
                <Icon name="check" /> {draft.baseId ? 'Save the change' : 'Install feature'}
              </button>
              <button
                className="btn ghost"
                onClick={() => {
                  setDraft(null);
                  setTaskId(null);
                }}
              >
                Discard
              </button>
            </div>
          </div>
          {draft.problems && draft.problems.length > 0 && <div className="notice">The coding model left some problems it couldn't fix: {draft.problems.join(' ')} Try asking for a change below.</div>}
          <div className="preview-label muted small">Live preview — try it out</div>
          <FeatureFrame host={`draft-${draft.id}`} toast={toast} />
          <div className="revise">
            <input className="field" value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Not quite right? Describe what to change…" onKeyDown={(e) => e.key === 'Enter' && revise()} />
            <button className="btn ghost" onClick={revise} disabled={!feedback.trim()}>
              <Icon name="wand" size={16} /> Change it
            </button>
          </div>
        </div>
      )}

      <section className="model-section">
        <div className="section-head">
          <h2 className="section-title">Installed features</h2>
        </div>
        {features.length === 0 ? (
          <p className="muted">None yet. Features you build appear here and in the sidebar.</p>
        ) : (
          <div className="model-list">
            {features.map((f) => (
              <div key={f.id} className="model-row">
                <div className="model-info">
                  <div className="model-name">
                    <span className="emoji">{f.icon}</span> {f.name} <span className="tag">version {f.current}</span>
                  </div>
                  <div className="muted small">{f.description}</div>
                  {versionsFor === f.id && (
                    <div className="versions">
                      {[...f.versions].reverse().map((v) => (
                        <div key={v.v} className="version">
                          <span>
                            Version {v.v} · {new Date(v.created).toLocaleDateString()} {v.note ? `· ${v.note}` : ''}
                          </span>
                          {v.v === f.current ? (
                            <span className="tag strong">Current</span>
                          ) : (
                            <button
                              className="link-btn"
                              onClick={async () => {
                                await api.features.rollback(f.id, v.v);
                                toast(`${f.name} is back to version ${v.v}.`);
                                onChanged();
                              }}
                            >
                              Go back to this
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="model-actions">
                  <button className="btn ghost small" onClick={() => onOpen(f.id)}>
                    Open
                  </button>
                  <button
                    className="btn ghost small"
                    onClick={() => {
                      setBaseId(f.id);
                      setDraft(null);
                      setTaskId(null);
                      setRequest('');
                    }}
                  >
                    Change
                  </button>
                  <button className="icon-btn ghost" title="Versions" aria-label="Versions" onClick={() => setVersionsFor(versionsFor === f.id ? null : f.id)}>
                    <Icon name="undo" size={16} />
                  </button>
                  <label className="switch" title={f.enabled ? 'Shown in sidebar' : 'Hidden'}>
                    <input
                      type="checkbox"
                      checked={f.enabled}
                      onChange={async (e) => {
                        await api.features.setEnabled(f.id, e.target.checked);
                        onChanged();
                      }}
                    />
                    <span />
                  </label>
                  <button
                    className="icon-btn ghost"
                    title="Delete feature"
                    aria-label={`Delete ${f.name}`}
                    onClick={async () => {
                      if (!window.confirm(`Delete ${f.name} and all its versions?`)) return;
                      await api.features.remove(f.id);
                      onChanged();
                    }}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
