// Background task manager: every download, install and generation is a task the UI can watch or cancel.
const { BrowserWindow } = require('electron');

const tasks = new Map();
let seq = 0;
let flushTimer = null;

function broadcast() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    const list = listTasks();
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send('tasks:update', list);
    }
  }, 200);
}

function publicTask(t) {
  const { controller, ...rest } = t;
  return rest;
}

function listTasks() {
  return [...tasks.values()].map(publicTask).sort((a, b) => b.created - a.created).slice(0, 40);
}

function createTask(kind, label, meta = {}) {
  const id = `t${Date.now().toString(36)}${(++seq).toString(36)}`;
  const t = {
    id,
    kind,
    label,
    status: 'running',
    progress: 0,
    detail: '',
    created: Date.now(),
    meta,
    controller: new AbortController()
  };
  tasks.set(id, t);
  broadcast();
  return t;
}

function updateTask(id, patch) {
  const t = tasks.get(id);
  if (!t) return;
  Object.assign(t, patch);
  broadcast();
}

function finishTask(id, result) {
  updateTask(id, { status: 'done', progress: 1, result, finished: Date.now() });
}

function failTask(id, error) {
  const t = tasks.get(id);
  if (!t) return;
  const canceled = t.controller.signal.aborted;
  updateTask(id, {
    status: canceled ? 'canceled' : 'error',
    detail: canceled ? 'Stopped' : String((error && error.message) || error),
    finished: Date.now()
  });
}

function cancelTask(id) {
  const t = tasks.get(id);
  if (t && t.status === 'running') t.controller.abort();
  return true;
}

function clearFinished() {
  for (const [id, t] of tasks) if (t.status !== 'running') tasks.delete(id);
  broadcast();
}

// Runs fn(task) as a tracked task and returns its result (or throws).
async function runTask(kind, label, fn, meta) {
  const t = createTask(kind, label, meta);
  try {
    const result = await fn(t);
    finishTask(t.id, result);
    return result;
  } catch (e) {
    failTask(t.id, e);
    throw e;
  }
}

module.exports = { createTask, updateTask, finishTask, failTask, cancelTask, listTasks, clearFinished, runTask };
