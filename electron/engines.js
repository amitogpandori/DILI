// Installs and runs the local AI engines:
//   • Ollama                — chat and coding models
//   • stable-diffusion.cpp  — picture and video models
//   • FFmpeg                — turns raw video frames into playable MP4 files
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { net } = require('electron');
const { dirs } = require('./store');
const { download, findReleaseAssets, extractZip, findFile } = require('./downloader');
const { updateTask } = require('./tasks');

const OLLAMA_URL = 'http://127.0.0.1:11434';
let ollamaProc = null;
let sdHelpText = null;

// ---------- Ollama ----------

async function ollamaRunning() {
  try {
    const res = await net.fetch(`${OLLAMA_URL}/api/version`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

// An Ollama the user installed themselves (the normal Windows installer, or anything on PATH).
function systemOllamaExe() {
  const candidates = [];
  if (process.env.LOCALAPPDATA) candidates.push(path.join(process.env.LOCALAPPDATA, 'Programs', 'Ollama', 'ollama.exe'));
  if (process.env.ProgramFiles) candidates.push(path.join(process.env.ProgramFiles, 'Ollama', 'ollama.exe'));
  for (const dir of String(process.env.PATH || '').split(path.delimiter)) {
    if (dir) candidates.push(path.join(dir, 'ollama.exe'));
  }
  return candidates.find((p) => {
    try {
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  }) || null;
}

// Prefer the user's own Ollama; fall back to the copy Dilreet downloaded.
function ollamaExe() {
  return systemOllamaExe() || findFile(dirs().ollama, 'ollama.exe');
}

async function installOllama(task, hw) {
  const d = dirs();
  if (ollamaExe() || (await ollamaRunning())) {
    updateTask(task.id, { detail: 'Using the Ollama already on this PC.' });
    return;
  }
  updateTask(task.id, { detail: 'Finding the latest Ollama release…' });
  const wantAmd = hw && hw.gpu && hw.gpu.vendor === 'amd';
  const patterns = [/^ollama-windows-amd64\.zip$/];
  if (wantAmd) patterns.push(/^ollama-windows-amd64-rocm\.zip$/);
  const { assets } = await findReleaseAssets('ollama/ollama', patterns);
  const span = 0.9 / assets.length;
  for (let i = 0; i < assets.length; i++) {
    const zip = path.join(d.downloads, assets[i].name);
    await download(assets[i].url, zip, task, { label: 'Chat engine (Ollama)', weightStart: i * span, weightSpan: span });
    updateTask(task.id, { detail: 'Unpacking the chat engine…' });
    await extractZip(zip, d.ollama);
    fs.rmSync(zip, { force: true });
  }
  if (!ollamaExe()) throw new Error('Ollama was downloaded but ollama.exe was not found inside it.');
}

async function startOllama() {
  if (await ollamaRunning()) return true;
  const exe = ollamaExe();
  if (!exe) return false;
  ollamaProc = spawn(exe, ['serve'], {
    cwd: path.dirname(exe),
    windowsHide: true,
    // Ollama's own model folder is kept (no OLLAMA_MODELS override), so models you already downloaded show up.
    env: { ...process.env, OLLAMA_HOST: '127.0.0.1:11434', OLLAMA_KEEP_ALIVE: process.env.OLLAMA_KEEP_ALIVE || '10m' },
    stdio: 'ignore'
  });
  ollamaProc.on('exit', () => (ollamaProc = null));
  for (let i = 0; i < 40; i++) {
    if (await ollamaRunning()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function stopOllama() {
  if (ollamaProc) {
    try {
      ollamaProc.kill();
    } catch {}
    ollamaProc = null;
  }
}

// ---------- stable-diffusion.cpp ----------

function sdExe() {
  return findFile(dirs().sd, 'sd-cli.exe') || findFile(dirs().sd, 'sd.exe');
}

async function installSd(task, hw) {
  const d = dirs();
  if (sdExe()) return;
  updateTask(task.id, { detail: 'Finding the latest picture engine build…' });
  const vendor = hw && hw.gpu ? hw.gpu.vendor : 'other';
  let patterns;
  if (vendor === 'nvidia') patterns = [/bin-win-cuda12-x64\.zip$/i, /^cudart-sd-bin-win-cu12-x64\.zip$/i];
  else if (vendor === 'amd' || vendor === 'intel') patterns = [/bin-win-vulkan-x64\.zip$/i];
  else patterns = [/bin-win-avx2-x64\.zip$/i];

  let rel;
  try {
    rel = await findReleaseAssets('leejet/stable-diffusion.cpp', patterns);
  } catch (e) {
    if (vendor !== 'nvidia') throw e;
    // Fall back to the Vulkan build, which also runs on NVIDIA.
    rel = await findReleaseAssets('leejet/stable-diffusion.cpp', [/bin-win-vulkan-x64\.zip$/i]);
  }
  const span = 0.9 / rel.assets.length;
  for (let i = 0; i < rel.assets.length; i++) {
    const a = rel.assets[i];
    const zip = path.join(d.downloads, a.name);
    await download(a.url, zip, task, { label: 'Picture engine', weightStart: i * span, weightSpan: span });
    updateTask(task.id, { detail: 'Unpacking the picture engine…' });
    await extractZip(zip, d.sd);
    fs.rmSync(zip, { force: true });
  }
  // CUDA runtime DLLs must sit next to sd-cli.exe.
  const exe = sdExe();
  if (!exe) throw new Error('The picture engine was downloaded but sd-cli.exe was not found inside it.');
  const exeDir = path.dirname(exe);
  for (const dll of collectDlls(d.sd)) {
    const target = path.join(exeDir, path.basename(dll));
    if (!fs.existsSync(target)) fs.copyFileSync(dll, target);
  }
  sdHelpText = null;
}

function collectDlls(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collectDlls(p, out);
    else if (/\.dll$/i.test(e.name)) out.push(p);
  }
  return out;
}

// Reads `sd-cli --help` once so Dilreet only passes flags this build understands.
function sdHelp() {
  if (sdHelpText !== null) return Promise.resolve(sdHelpText);
  const exe = sdExe();
  if (!exe) return Promise.resolve('');
  return new Promise((resolve) => {
    execFile(exe, ['--help'], { windowsHide: true, timeout: 20000, cwd: path.dirname(exe) }, (err, stdout, stderr) => {
      sdHelpText = `${stdout || ''}\n${stderr || ''}`;
      resolve(sdHelpText);
    });
  });
}

// ---------- FFmpeg ----------

function ffmpegExe() {
  return findFile(dirs().ffmpeg, 'ffmpeg.exe');
}

async function installFfmpeg(task) {
  if (ffmpegExe()) return;
  const d = dirs();
  const zip = path.join(d.downloads, 'ffmpeg-win64.zip');
  await download('https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip', zip, task, {
    label: 'Video tools (FFmpeg)'
  });
  updateTask(task.id, { detail: 'Unpacking video tools…' });
  await extractZip(zip, d.ffmpeg);
  fs.rmSync(zip, { force: true });
  if (!ffmpegExe()) throw new Error('FFmpeg was downloaded but ffmpeg.exe was not found inside it.');
}

async function engineStatus() {
  return {
    ollamaInstalled: !!ollamaExe() || (await ollamaRunning()),
    ollamaRunning: await ollamaRunning(),
    ollamaSystem: !!systemOllamaExe(),
    sdInstalled: !!sdExe(),
    ffmpegInstalled: !!ffmpegExe()
  };
}

module.exports = {
  OLLAMA_URL,
  ollamaRunning,
  installOllama,
  startOllama,
  stopOllama,
  sdExe,
  installSd,
  sdHelp,
  ffmpegExe,
  installFfmpeg,
  engineStatus
};
