// Small JSON persistence layer + folder layout for everything Dilreet downloads or creates.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { app } = require('electron');

const CONFIG_FILE = () => path.join(app.getPath('userData'), 'settings.json');

const DEFAULT_SETTINGS = {
  userName: '',
  setupDone: false,
  storageRoot: path.join(os.homedir(), 'Dilreet'),
  chatModel: '',
  coderModel: '',
  imageModel: '',
  videoModel: '',
  showThinking: false,
  agentTools: true,
  theme: 'system'
};

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

// Write atomically so a crash never leaves a half-written file.
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

let settingsCache = null;

function getSettings() {
  if (!settingsCache) settingsCache = { ...DEFAULT_SETTINGS, ...readJson(CONFIG_FILE(), {}) };
  return settingsCache;
}

function setSettings(patch) {
  settingsCache = { ...getSettings(), ...patch };
  writeJson(CONFIG_FILE(), settingsCache);
  return settingsCache;
}

function dirs() {
  const root = getSettings().storageRoot;
  const d = {
    root,
    engines: path.join(root, 'engines'),
    ollama: path.join(root, 'engines', 'ollama'),
    sd: path.join(root, 'engines', 'stable-diffusion'),
    ffmpeg: path.join(root, 'engines', 'ffmpeg'),
    ollamaModels: path.join(root, 'models', 'chat'),
    imageModels: path.join(root, 'models', 'image'),
    videoModels: path.join(root, 'models', 'video'),
    downloads: path.join(root, 'downloads'),
    creations: path.join(root, 'creations'),
    features: path.join(root, 'features'),
    data: path.join(root, 'data')
  };
  for (const p of Object.values(d)) fs.mkdirSync(p, { recursive: true });
  return d;
}

// Generic key/value documents (conversations, gallery metadata, feature data).
function getDoc(name, fallback) {
  return readJson(path.join(dirs().data, `${name}.json`), fallback);
}

function setDoc(name, value) {
  writeJson(path.join(dirs().data, `${name}.json`), value);
  return true;
}

module.exports = { getSettings, setSettings, dirs, getDoc, setDoc, readJson, writeJson };
