// Dilreet — Electron main process: window, secure protocols and every action the interface can ask for.
const { app, BrowserWindow, ipcMain, protocol, net, shell, dialog, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const store = require('./store');
const { detectHardware } = require('./hardware');
const catalog = require('./catalog');
const engines = require('./engines');
const ollama = require('./ollama');
const studio = require('./studio');
const features = require('./features');
const agent = require('./agent');
const tasks = require('./tasks');

const isDev = !!process.env.DILREET_DEV;
let win = null;
let hwCache = null;

// Custom schemes: one for local pictures/videos, one for add-on feature pages.
protocol.registerSchemesAsPrivileged([
  { scheme: 'dilreet-media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  { scheme: 'dilreet-feature', privileges: { standard: true, secure: true } }
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

async function hardware(refresh = false) {
  if (!hwCache || refresh) hwCache = await detectHardware();
  return hwCache;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    title: 'Dilreet',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1a181f' : '#f4f3f7',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  if (isDev) win.loadURL('http://localhost:5173');
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  // Links open in the normal browser, never inside Dilreet.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('http://localhost:5173') && !url.startsWith('file://')) {
      e.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function insideStorage(p) {
  const root = path.resolve(store.getSettings().storageRoot);
  const full = path.resolve(p);
  return full === root || full.startsWith(root + path.sep);
}

function registerProtocols() {
  protocol.handle('dilreet-media', (req) => {
    const u = new URL(req.url);
    const file = decodeURIComponent(u.pathname.replace(/^\//, ''));
    if (!insideStorage(file) || !fs.existsSync(file)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString(), { bypassCustomProtocolHandlers: true, headers: req.headers });
  });

  protocol.handle('dilreet-feature', (req) => {
    const host = new URL(req.url).hostname;
    let html;
    try {
      if (host.startsWith('draft-')) {
        const d = drafts.get(host.slice(6));
        if (!d) throw new Error('missing');
        html = d.html;
      } else {
        html = features.readCurrent(host).html;
      }
    } catch {
      return new Response('Feature not found', { status: 404 });
    }
    return new Response(features.pageFor(html), {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // Add-ons get no network access and cannot load outside code.
        'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:"
      }
    });
  });
}

// ---------- GPU job queue: one picture/video at a time ----------
let gpuChain = Promise.resolve();
function queueGpu(kind, label, fn) {
  const t = tasks.createTask(kind, label);
  tasks.updateTask(t.id, { detail: 'Waiting for the graphics card…' });
  gpuChain = gpuChain
    .catch(() => {})
    .then(async () => {
      if (t.controller.signal.aborted) return tasks.failTask(t.id, new Error('Stopped'));
      tasks.updateTask(t.id, { detail: 'Starting…' });
      try {
        // Free the GPU from the chat model first so pictures get all of its memory.
        await unloadChatModels();
        const result = await fn(t);
        tasks.finishTask(t.id, result);
      } catch (e) {
        tasks.failTask(t.id, e);
      }
    });
  return t.id;
}

async function unloadChatModels() {
  try {
    const res = await net.fetch(`${engines.OLLAMA_URL}/api/ps`, { signal: AbortSignal.timeout(2000) });
    const j = await res.json();
    for (const m of j.models || []) {
      await net.fetch(`${engines.OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: m.name, keep_alive: 0 })
      });
    }
  } catch {}
}

function startImage(opts) {
  const s = store.getSettings();
  const model = opts.model || s.imageModel;
  return queueGpu('image', `Picture: ${String(opts.prompt).slice(0, 50)}`, async (t) => {
    const hw = await hardware();
    return studio.generateImage({ ...opts, model, lowMemory: hw.tier === 'low' || hw.tier === 'cpu' }, t);
  });
}

function startVideo(opts) {
  const s = store.getSettings();
  const model = opts.model || s.videoModel;
  return queueGpu('video', `Video: ${String(opts.prompt).slice(0, 50)}`, async (t) => {
    const hw = await hardware();
    return studio.generateVideo({ ...opts, model, lowMemory: !['high', 'power'].includes(hw.tier) }, t, catalog.videoPlan(hw.tier));
  });
}

// ---------- Feature drafts (kept in memory until installed) ----------
const drafts = new Map();
const draftStores = new Map();

function startFeatureDraft(params) {
  const label = params.baseId ? 'Updating a feature' : `Building: ${String(params.request || '').slice(0, 50)}`;
  const t = tasks.createTask('feature', label);
  tasks.updateTask(t.id, { detail: 'The coding model is writing the feature… (this can take a few minutes)' });
  (async () => {
    try {
      let previousHtml = null;
      if (params.previousDraftId && drafts.has(params.previousDraftId)) previousHtml = drafts.get(params.previousDraftId).html;
      const d = await features.draft({ ...params, previousHtml }, t.controller.signal);
      const id = Math.random().toString(36).slice(2, 10);
      drafts.set(id, { ...d, id });
      tasks.finishTask(t.id, { draftId: id, name: d.name, icon: d.icon, description: d.description, problems: d.problems, baseId: d.baseId });
    } catch (e) {
      tasks.failTask(t.id, e);
    }
  })();
  return t.id;
}

// ---------- Setup: install everything in order ----------
async function runSetupItem(item, hw) {
  const s = store.getSettings();
  switch (item.kind) {
    case 'ollama':
      return tasks.runTask('install', 'Installing chat engine', async (t) => {
        await engines.installOllama(t, hw);
        tasks.updateTask(t.id, { detail: 'Starting the chat engine…' });
        if (!(await engines.startOllama())) throw new Error('The chat engine was installed but did not start.');
      });
    case 'chat':
    case 'coder':
      return tasks.runTask('install', `Downloading ${item.id}`, async (t) => {
        await ollama.pullModel(item.id, t);
        if (item.kind === 'chat' && (!s.chatModel || item.makeDefault)) store.setSettings({ chatModel: item.id });
        if (item.kind === 'coder' && (!s.coderModel || item.makeDefault)) store.setSettings({ coderModel: item.id });
      });
    case 'sd':
      return tasks.runTask('install', 'Installing picture engine', (t) => engines.installSd(t, hw));
    case 'ffmpeg':
      return tasks.runTask('install', 'Installing video tools', (t) => engines.installFfmpeg(t));
    case 'image':
    case 'video':
      return tasks.runTask('install', `Downloading ${catalog.findMedia(item.kind, item.id).name}`, async (t) => {
        await studio.installMedia(item.kind, item.id, t);
        const key = item.kind === 'image' ? 'imageModel' : 'videoModel';
        if (!store.getSettings()[key] || item.makeDefault) store.setSettings({ [key]: item.id });
      });
    default:
      throw new Error(`Unknown setup step ${item.kind}`);
  }
}

let setupRunning = false;
async function runSetup(plan) {
  if (setupRunning) return;
  setupRunning = true;
  const hw = await hardware();
  const failed = [];
  try {
    for (const item of plan) {
      try {
        await runSetupItem(item, hw);
      } catch (e) {
        failed.push(`${item.kind}${item.id ? ' ' + item.id : ''}: ${e.message}`);
        // Without the chat engine, model downloads cannot work, so stop there.
        if (item.kind === 'ollama') break;
      }
    }
  } finally {
    setupRunning = false;
    store.setSettings({ setupDone: true });
    send('setup:finished', { failed });
  }
}

// ---------- Chat ----------
const chatControllers = new Map();

async function runToolForChat(name, args) {
  const s = store.getSettings();
  if (name === 'create_image') {
    if (!s.imageModel) return { text: 'No picture model is installed. Tell the user to install one on the Models page.' };
    const taskId = startImage({ prompt: args.prompt || '', style: args.style || 'none', shape: args.shape || 'square' });
    return { text: 'The picture is being created now and will appear in the chat when ready.', attachment: { type: 'job', kind: 'image', taskId, prompt: args.prompt } };
  }
  if (name === 'create_video') {
    if (!s.videoModel) return { text: 'No video model is installed. Tell the user to install one on the Models page.' };
    const taskId = startVideo({ prompt: args.prompt || '' });
    return { text: 'The video is being created now. Videos take a while; it will appear in the chat when ready.', attachment: { type: 'job', kind: 'video', taskId, prompt: args.prompt } };
  }
  if (name === 'add_feature') {
    const taskId = startFeatureDraft({ request: args.request || '' });
    return { text: 'The feature is being written by the coding model. The user can preview it and choose to install it when it is ready.', attachment: { type: 'feature', taskId, request: args.request } };
  }
  if (name === 'pc_info') {
    const hw = await hardware();
    return { text: JSON.stringify({ cpu: hw.cpu, ramGB: hw.ramGB, gpu: hw.gpu, tier: hw.label, canRun: hw.can, tips: hw.tips }) };
  }
  return { text: `Unknown tool ${name}` };
}

// ---------- IPC ----------
function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => fn(...args));
}

function registerIpc() {
  handle('app:info', async () => ({ version: app.getVersion(), isDev, platform: process.platform }));
  handle('hw:get', (refresh) => hardware(!!refresh));
  handle('settings:get', () => store.getSettings());
  handle('settings:set', (patch) => {
    const allowed = ['userName', 'setupDone', 'chatModel', 'coderModel', 'imageModel', 'videoModel', 'showThinking', 'agentTools', 'theme', 'storageRoot'];
    const clean = Object.fromEntries(Object.entries(patch || {}).filter(([k]) => allowed.includes(k)));
    return store.setSettings(clean);
  });
  handle('settings:pickFolder', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
  handle('doc:get', (name, fallback) => {
    if (!/^[a-z0-9_-]+$/i.test(name)) throw new Error('bad name');
    return store.getDoc(name, fallback);
  });
  handle('doc:set', (name, value) => {
    if (!/^[a-z0-9_-]+$/i.test(name)) throw new Error('bad name');
    return store.setDoc(name, value);
  });

  handle('catalog:get', async () => catalog.getCatalog(await hardware()));
  handle('engines:status', () => engines.engineStatus());
  // Resolves when the engine is installed (true) or failed (false); progress shows in Activity.
  handle('engines:install', async (name) => {
    const hw = await hardware();
    try {
      await runSetupItem({ kind: name }, hw);
      return true;
    } catch {
      return false;
    }
  });
  handle('setup:run', (plan) => {
    runSetup(plan);
    return true;
  });

  handle('models:installed', async () => {
    const chat = await ollama.listModels();
    const cat = catalog.getCatalog(await hardware());
    const media = {};
    for (const m of [...cat.image, ...cat.video]) media[m.id] = studio.mediaInstalled(cat.image.includes(m) ? 'image' : 'video', m.id);
    return { chat, media };
  });
  handle('models:pull', (id, kind) => {
    runSetupItem({ kind: kind === 'coder' ? 'coder' : 'chat', id }, null).catch(() => {});
    return true;
  });
  handle('models:deleteChat', (id) => ollama.deleteModel(id));
  handle('models:installMedia', (kind, id) => {
    runSetupItem({ kind, id }, null).catch(() => {});
    return true;
  });
  handle('models:removeMedia', (kind, id) => studio.removeMedia(kind, id));

  handle('chat:send', ({ reqId, history, model }) => {
    const controller = new AbortController();
    chatControllers.set(reqId, controller);
    (async () => {
      try {
        const hw = await hardware();
        const use = model || store.getSettings().chatModel;
        if (!use) throw new Error('No chat model is installed yet. Open Models to download one.');
        await agent.respond({ history, model: use, hw, signal: controller.signal }, (ev) => send('chat:event', { reqId, ...ev }), runToolForChat);
        send('chat:event', { reqId, type: 'done' });
      } catch (e) {
        send('chat:event', { reqId, type: controller.signal.aborted ? 'done' : 'error', error: e.message });
      } finally {
        chatControllers.delete(reqId);
      }
    })();
    return true;
  });
  handle('chat:stop', (reqId) => {
    const c = chatControllers.get(reqId);
    if (c) c.abort();
    return true;
  });
  handle('chat:title', async (text) => {
    const model = store.getSettings().chatModel;
    if (!model) return null;
    try {
      const t = await ollama.complete(model, `Write a 3-5 word title for a chat that starts with this message. Reply with the title only, no quotes.\n\n${String(text).slice(0, 500)}`, { options: { num_predict: 20 } });
      return t.replace(/["'*#]/g, '').split('\n')[0].slice(0, 60);
    } catch {
      return null;
    }
  });
  handle('ai:improvePrompt', async (prompt, kind) => {
    const model = store.getSettings().chatModel;
    if (!model) throw new Error('Install a chat model first.');
    return ollama.complete(
      model,
      `Rewrite this idea as one rich, vivid English prompt for an AI ${kind === 'video' ? 'video' : 'image'} generator. Describe the subject, setting, lighting, colours and ${kind === 'video' ? 'the camera movement and motion' : 'composition'}. Max 60 words. Reply with the prompt only.\n\nIdea: ${prompt}`,
      { options: { temperature: 0.7 } }
    );
  });

  handle('studio:image', (opts) => startImage(opts));
  handle('studio:video', (opts) => startVideo(opts));
  handle('studio:gallery', () => studio.gallery());
  handle('studio:delete', (id) => studio.deleteCreation(id));
  handle('studio:reveal', (file) => {
    if (insideStorage(file)) shell.showItemInFolder(file);
    return true;
  });
  handle('studio:styles', () => Object.keys(studio.STYLES));

  handle('features:draft', (params) => startFeatureDraft(params));
  handle('features:getDraft', (id) => {
    const d = drafts.get(id);
    return d ? { id: d.id, name: d.name, icon: d.icon, description: d.description, problems: d.problems, baseId: d.baseId, html: d.html } : null;
  });
  handle('features:install', (draftId) => {
    const d = drafts.get(draftId);
    if (!d) throw new Error('This draft has expired. Please build it again.');
    const m = features.install(d);
    drafts.delete(draftId);
    return m;
  });
  handle('features:list', () => features.list());
  handle('features:setEnabled', (id, on) => features.setEnabled(id, on));
  handle('features:rollback', (id, v) => features.rollback(id, v));
  handle('features:remove', (id) => features.remove(id));
  handle('features:source', (id) => features.readCurrent(id).html);
  handle('features:bridge', async (featureId, op, args) => {
    args = Array.isArray(args) ? args : [];
    if (op === 'ask') {
      const model = store.getSettings().chatModel;
      if (!model) throw new Error('No chat model installed');
      return ollama.complete(model, String(args[0] || '').slice(0, 8000));
    }
    if (op === 'notify') {
      send('app:toast', { text: String(args[0] || '').slice(0, 200) });
      return true;
    }
    const isDraft = String(featureId).startsWith('draft-');
    if (op === 'get') {
      if (isDraft) return (draftStores.get(featureId) || {})[args[0]];
      return features.storeGet(featureId, args[0]);
    }
    if (op === 'set') {
      const value = JSON.parse(JSON.stringify(args[1] === undefined ? null : args[1]));
      if (isDraft) {
        const st = draftStores.get(featureId) || {};
        st[args[0]] = value;
        draftStores.set(featureId, st);
        return true;
      }
      return features.storeSet(featureId, args[0], value);
    }
    throw new Error('Unknown action');
  });

  handle('tasks:list', () => tasks.listTasks());
  handle('tasks:cancel', (id) => tasks.cancelTask(id));
  handle('tasks:clear', () => tasks.clearFinished());

  handle('shell:openStorage', () => shell.openPath(store.dirs().root));

  handle('updates:check', async () => {
    if (!app.isPackaged) return { status: 'dev', message: 'Updates work in the installed app.' };
    try {
      const { autoUpdater } = require('electron-updater');
      const r = await autoUpdater.checkForUpdates();
      const latest = r && r.updateInfo ? r.updateInfo.version : app.getVersion();
      return latest === app.getVersion() ? { status: 'latest', message: `You have the latest version (${latest}).` } : { status: 'downloading', message: `Version ${latest} is downloading…` };
    } catch (e) {
      return { status: 'error', message: `Could not check for updates: ${e.message}` };
    }
  });
  handle('updates:install', () => {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.quitAndInstall();
    return true;
  });
}

function setupAutoUpdater() {
  if (!app.isPackaged) return;
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.on('update-downloaded', (info) => send('update:ready', { version: info.version }));
    autoUpdater.on('error', () => {});
    setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 15000);
  } catch {}
}

app.whenReady().then(async () => {
  registerProtocols();
  registerIpc();
  createWindow();
  setupAutoUpdater();
  // Wake the chat engine in the background so the first message is quick.
  engines.startOllama().catch(() => {});
  hardware().catch(() => {});
});

app.on('window-all-closed', () => {
  engines.stopOllama();
  app.quit();
});

app.on('before-quit', () => engines.stopOllama());
