// The only bridge between the interface and the rest of the PC. Exposes a fixed list of actions.
const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);
const listen = (channel) => (cb) => {
  const fn = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, fn);
  return () => ipcRenderer.removeListener(channel, fn);
};

contextBridge.exposeInMainWorld('dilreet', {
  appInfo: invoke('app:info'),
  hardware: invoke('hw:get'),
  settings: { get: invoke('settings:get'), set: invoke('settings:set'), pickFolder: invoke('settings:pickFolder') },
  doc: { get: invoke('doc:get'), set: invoke('doc:set') },
  catalog: invoke('catalog:get'),
  engines: { status: invoke('engines:status'), install: invoke('engines:install') },
  setup: { run: invoke('setup:run'), onFinished: listen('setup:finished') },
  models: {
    installed: invoke('models:installed'),
    pull: invoke('models:pull'),
    deleteChat: invoke('models:deleteChat'),
    installMedia: invoke('models:installMedia'),
    removeMedia: invoke('models:removeMedia')
  },
  chat: { send: invoke('chat:send'), stop: invoke('chat:stop'), title: invoke('chat:title'), onEvent: listen('chat:event') },
  ai: { improvePrompt: invoke('ai:improvePrompt') },
  studio: {
    image: invoke('studio:image'),
    video: invoke('studio:video'),
    gallery: invoke('studio:gallery'),
    remove: invoke('studio:delete'),
    reveal: invoke('studio:reveal'),
    styles: invoke('studio:styles')
  },
  features: {
    draft: invoke('features:draft'),
    getDraft: invoke('features:getDraft'),
    install: invoke('features:install'),
    list: invoke('features:list'),
    setEnabled: invoke('features:setEnabled'),
    rollback: invoke('features:rollback'),
    remove: invoke('features:remove'),
    source: invoke('features:source'),
    bridge: invoke('features:bridge')
  },
  tasks: { list: invoke('tasks:list'), cancel: invoke('tasks:cancel'), clear: invoke('tasks:clear'), onUpdate: listen('tasks:update') },
  openStorage: invoke('shell:openStorage'),
  updates: { check: invoke('updates:check'), install: invoke('updates:install'), onReady: listen('update:ready') },
  onToast: listen('app:toast')
});
