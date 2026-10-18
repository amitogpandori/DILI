import { useEffect, useMemo, useRef, useState } from 'react';
import { api, uid } from './api';
import Icon, { Mark } from './Icon';
import Setup from './pages/Setup';
import Chat from './pages/Chat';
import Studio from './pages/Studio';
import Models from './pages/Models';
import Features, { FeatureView } from './pages/Features';
import Settings from './pages/Settings';
import TaskTray from './TaskTray';

export default function App() {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState(null);
  const [hw, setHw] = useState(null);
  const [page, setPage] = useState({ name: 'chat' });
  const [convs, setConvs] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [featureList, setFeatureList] = useState([]);
  const [toast, setToast] = useState(null);
  const [updateReady, setUpdateReady] = useState(null);
  const [navOpen, setNavOpen] = useState(false);
  const [chatKey, setChatKey] = useState('new');
  const saveTimer = useRef(null);

  useEffect(() => {
    (async () => {
      const [s, h, c, f, t] = await Promise.all([api.settings.get(), api.hardware(), api.doc.get('conversations', []), api.features.list(), api.tasks.list()]);
      setSettings(s);
      setHw(h);
      setConvs(c || []);
      setFeatureList(f || []);
      setTasks(t || []);
      setReady(true);
    })();
    const offs = [
      api.tasks.onUpdate((t) => setTasks(t)),
      api.onToast((t) => showToast(t.text)),
      api.updates.onReady((u) => setUpdateReady(u.version))
    ];
    return () => offs.forEach((off) => off && off());
  }, []);

  function showToast(text) {
    setToast({ text, id: uid() });
    setTimeout(() => setToast((cur) => (cur && cur.text === text ? null : cur)), 4000);
  }

  async function updateSettings(patch) {
    const s = await api.settings.set(patch);
    setSettings({ ...s });
    return s;
  }

  // Conversations are saved shortly after every change.
  function saveConvs(next) {
    setConvs(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => api.doc.set('conversations', next), 400);
  }

  function upsertConv(conv) {
    setConvs((prev) => {
      const next = [conv, ...prev.filter((c) => c.id !== conv.id)];
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => api.doc.set('conversations', next), 400);
      return next;
    });
  }

  function deleteConv(id) {
    saveConvs(convs.filter((c) => c.id !== id));
    if (activeConv === id) {
      setActiveConv(null);
      setChatKey(uid());
    }
  }

  async function refreshFeatures() {
    setFeatureList(await api.features.list());
  }

  function go(name, extra = {}) {
    setPage({ name, ...extra });
    setNavOpen(false);
  }

  const conversation = useMemo(() => convs.find((c) => c.id === activeConv) || null, [convs, activeConv]);
  const running = tasks.filter((t) => t.status === 'running').length;

  if (!ready) {
    return (
      <div className="boot">
        <Mark size={44} />
      </div>
    );
  }

  if (!settings.setupDone || page.name === 'setup') {
    return (
      <Setup
        hw={hw}
        settings={settings}
        tasks={tasks}
        onRescan={async () => setHw(await api.hardware(true))}
        onSettings={updateSettings}
        onDone={async () => {
          await updateSettings({ setupDone: true });
          go('chat');
        }}
      />
    );
  }

  return (
    <div className={`shell ${navOpen ? 'nav-open' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <Mark />
          <span className="brand-name">Dilreet</span>
        </div>

        <button
          className="new-chat"
          onClick={() => {
            setActiveConv(null);
            setChatKey(uid());
            go('chat');
          }}
        >
          <Icon name="plus" /> New chat
        </button>

        <nav className="nav">
          <NavItem icon="chat" label="Chats" active={page.name === 'chat'} onClick={() => go('chat')} />
          <NavItem icon="studio" label="Create pictures & videos" active={page.name === 'studio'} onClick={() => go('studio')} />
          <NavItem icon="models" label="AI models" active={page.name === 'models'} onClick={() => go('models')} />
          <NavItem icon="puzzle" label="Add a feature" active={page.name === 'features'} onClick={() => go('features')} />
        </nav>

        {featureList.filter((f) => f.enabled).length > 0 && (
          <div className="side-group">
            <div className="side-title">Your features</div>
            {featureList
              .filter((f) => f.enabled)
              .map((f) => (
                <button key={f.id} className={`side-link ${page.name === 'feature' && page.id === f.id ? 'active' : ''}`} onClick={() => go('feature', { id: f.id })}>
                  <span className="emoji">{f.icon}</span>
                  <span className="truncate">{f.name}</span>
                </button>
              ))}
          </div>
        )}

        <div className="side-group grow">
          <div className="side-title">Recent</div>
          {convs.length === 0 && <div className="side-empty">Your chats will show up here.</div>}
          {convs.slice(0, 60).map((c) => (
            <div key={c.id} className={`side-conv ${page.name === 'chat' && activeConv === c.id ? 'active' : ''}`}>
              <button
                className="side-link"
                onClick={() => {
                  setActiveConv(c.id);
                  setChatKey(c.id);
                  go('chat');
                }}
              >
                <span className="truncate">{c.title || 'New chat'}</span>
              </button>
              <button className="icon-btn ghost small" title="Delete chat" aria-label="Delete chat" onClick={() => deleteConv(c.id)}>
                <Icon name="trash" size={15} />
              </button>
            </div>
          ))}
        </div>

        <div className="side-foot">
          {updateReady && (
            <button className="update-pill" onClick={() => api.updates.install()}>
              <Icon name="refresh" size={15} /> Restart to update to {updateReady}
            </button>
          )}
          <button className={`side-link ${page.name === 'settings' ? 'active' : ''}`} onClick={() => go('settings')}>
            <span className="avatar">{(settings.userName || 'You').slice(0, 1).toUpperCase()}</span>
            <span className="truncate">{settings.userName || 'You'}</span>
            <Icon name="settings" size={16} className="push" />
          </button>
        </div>
      </aside>

      <main className="main">
        <button className="icon-btn ghost nav-toggle" aria-label="Open menu" onClick={() => setNavOpen(!navOpen)}>
          <Icon name="menu" />
        </button>

        {page.name === 'chat' && (
          <Chat
            key={chatKey}
            conversation={conversation}
            settings={settings}
            hw={hw}
            tasks={tasks}
            onSave={(conv) => {
              upsertConv(conv);
              setActiveConv(conv.id);
            }}
            onOpenFeatures={(draftTaskId) => go('features', { draftTaskId })}
            onOpenModels={() => go('models')}
          />
        )}
        {page.name === 'studio' && <Studio settings={settings} hw={hw} tasks={tasks} onOpenModels={() => go('models')} toast={showToast} />}
        {page.name === 'models' && <Models settings={settings} hw={hw} tasks={tasks} onSettings={updateSettings} onRescan={async () => setHw(await api.hardware(true))} toast={showToast} />}
        {page.name === 'features' && <Features tasks={tasks} features={featureList} draftTaskId={page.draftTaskId} editId={page.editId} onChanged={refreshFeatures} onOpen={(id) => go('feature', { id })} toast={showToast} />}
        {page.name === 'feature' && <FeatureView key={page.id} feature={featureList.find((f) => f.id === page.id)} toast={showToast} onEdit={() => go('features', { editId: page.id })} />}
        {page.name === 'settings' && <Settings settings={settings} hw={hw} onSettings={updateSettings} onRunSetup={() => go('setup')} toast={showToast} />}
      </main>

      <TaskTray tasks={tasks} running={running} />

      {toast && (
        <div className="toast" role="status" key={toast.id}>
          {toast.text}
        </div>
      )}
    </div>
  );
}

function NavItem({ icon, label, active, onClick }) {
  return (
    <button className={`side-link nav-item ${active ? 'active' : ''}`} onClick={onClick}>
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  );
}
