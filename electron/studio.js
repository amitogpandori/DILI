// Picture and video creation with stable-diffusion.cpp, plus the gallery of everything created.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { dirs, getDoc, setDoc } = require('./store');
const { findMedia, imageSizes } = require('./catalog');
const { download } = require('./downloader');
const { sdExe, sdHelp, ffmpegExe } = require('./engines');
const { updateTask } = require('./tasks');

const STYLES = {
  none: { add: '', neg: '' },
  photo: { add: 'professional photograph, natural lighting, sharp focus, highly detailed', neg: 'cartoon, painting, illustration' },
  cinematic: { add: 'cinematic film still, dramatic lighting, shallow depth of field, rich colors', neg: '' },
  anime: { add: 'anime style illustration, clean line art, vibrant colors', neg: 'photo, realistic' },
  '3d': { add: '3d render, octane render, soft studio lighting, detailed', neg: 'photo, sketch' },
  painting: { add: 'oil painting, visible brush strokes, artistic, masterpiece', neg: 'photo' },
  logo: { add: 'flat vector logo, minimal, clean shapes, centered, white background', neg: 'photo, realistic, busy background, text errors' },
  watercolor: { add: 'soft watercolor painting, gentle colors, paper texture', neg: 'photo' }
};

function mediaDir(kind, id) {
  return path.join(kind === 'video' ? dirs().videoModels : dirs().imageModels, id);
}

function mediaInstalled(kind, id) {
  const m = findMedia(kind, id);
  if (!m) return false;
  return m.files.every((f) => fs.existsSync(path.join(mediaDir(kind, id), f.file)));
}

async function installMedia(kind, id, task) {
  const m = findMedia(kind, id);
  if (!m) throw new Error(`Unknown ${kind} model: ${id}`);
  const total = m.files.reduce((s, f) => s + f.sizeGB, 0);
  let start = 0;
  for (const f of m.files) {
    const span = f.sizeGB / total;
    await download(f.url, path.join(mediaDir(kind, id), f.file), task, {
      label: `${m.name} (${f.role})`,
      weightStart: start,
      weightSpan: span
    });
    start += span;
  }
  return true;
}

function removeMedia(kind, id) {
  fs.rmSync(mediaDir(kind, id), { recursive: true, force: true });
  return true;
}

function filePath(kind, id, role) {
  const m = findMedia(kind, id);
  const f = m.files.find((x) => x.role === role);
  return f ? path.join(mediaDir(kind, id), f.file) : null;
}

function hasFlag(help, flag) {
  return help.includes(flag);
}

// Runs sd-cli, translating its "step/total" progress output into task progress.
function runSd(args, task, { label, progressWeight = 0.95 } = {}) {
  const exe = sdExe();
  if (!exe) throw new Error('The picture engine is not installed yet. Open Setup or Models to install it.');
  return new Promise((resolve, reject) => {
    const proc = spawn(exe, args, { cwd: path.dirname(exe), windowsHide: true });
    let log = '';
    const onData = (chunk) => {
      const s = chunk.toString();
      log = (log + s).slice(-20000);
      const matches = [...s.matchAll(/(\d+)\/(\d+)\s*-\s*([\d.]+)\s*(s\/it|it\/s)/g)];
      if (matches.length) {
        const [, cur, tot, rate, unit] = matches[matches.length - 1];
        const secPerIt = unit === 's/it' ? Number(rate) : 1 / Number(rate);
        const left = (Number(tot) - Number(cur)) * secPerIt;
        updateTask(task.id, {
          progress: (Number(cur) / Number(tot)) * progressWeight,
          detail: `${label} · step ${cur} of ${tot}${left > 1 ? ` · about ${left < 90 ? Math.round(left) + 's' : Math.round(left / 60) + ' min'} left` : ''}`
        });
      } else if (/loading|load/i.test(s) && task) {
        updateTask(task.id, { detail: `${label} · loading the model…` });
      } else if (/decod/i.test(s)) {
        updateTask(task.id, { detail: `${label} · finishing up…` });
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    const abort = () => {
      try {
        proc.kill();
      } catch {}
    };
    task.controller.signal.addEventListener('abort', abort);
    proc.on('error', reject);
    proc.on('close', (code) => {
      task.controller.signal.removeEventListener('abort', abort);
      if (task.controller.signal.aborted) return reject(new Error('Stopped'));
      if (code === 0) resolve(log);
      else reject(new Error(explainSdError(log, code)));
    });
  });
}

function explainSdError(log, code) {
  if (/out of memory|cudaMalloc|failed to allocate|ErrorOutOfDeviceMemory/i.test(log)) {
    return 'Your graphics card ran out of memory. Try a smaller size, the "Fast" quality, or close other apps (games, browsers) and try again.';
  }
  const lastLines = log.trim().split(/\r?\n/).slice(-4).join(' ');
  return `The engine stopped (code ${code}). ${lastLines}`;
}

function newId(prefix) {
  return `${prefix}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}-${Math.random().toString(36).slice(2, 6)}`;
}

function addToGallery(item) {
  const list = getDoc('gallery', []);
  list.unshift(item);
  setDoc('gallery', list.slice(0, 2000));
  return item;
}

function gallery() {
  return getDoc('gallery', []).filter((g) => fs.existsSync(g.file));
}

function deleteCreation(id) {
  const list = getDoc('gallery', []);
  const item = list.find((g) => g.id === id);
  if (item) {
    fs.rmSync(item.file, { force: true });
    if (item.poster) fs.rmSync(item.poster, { force: true });
  }
  setDoc('gallery', list.filter((g) => g.id !== id));
  return true;
}

function buildPrompt(prompt, style) {
  const s = STYLES[style] || STYLES.none;
  return { positive: [prompt.trim(), s.add].filter(Boolean).join(', '), styleNeg: s.neg };
}

async function generateImage(opts, task) {
  const { model, prompt, style = 'none', shape = 'square', quality = 'balanced', negative = '', seed = -1, count = 1 } = opts;
  const m = findMedia('image', model);
  if (!m) throw new Error('Choose a picture model first (Models page).');
  if (!mediaInstalled('image', model)) throw new Error(`${m.name} is not downloaded yet. Install it from the Models page.`);
  const help = await sdHelp();

  const sizes = imageSizes[m.defaults.base] || imageSizes[512];
  const [W, H] = sizes[shape] || sizes.square;
  const stepsMul = quality === 'fast' ? 0.6 : quality === 'best' ? 1.5 : 1;
  const steps = opts.steps || Math.max(1, Math.round(m.defaults.steps * stepsMul));
  const { positive, styleNeg } = buildPrompt(prompt, style);
  const neg = [negative, styleNeg, m.negative].filter(Boolean).join(', ');
  const results = [];

  for (let i = 0; i < count; i++) {
    const id = newId('img');
    const out = path.join(dirs().creations, `${id}.png`);
    const s = seed === -1 || seed === undefined ? Math.floor(Math.random() * 2 ** 31) : Number(seed) + i;
    const args = ['-m', filePath('image', model, 'model'), '-p', positive, '-W', String(W), '-H', String(H), '--steps', String(steps), '--cfg-scale', String(opts.cfg || m.defaults.cfg), '--sampling-method', m.defaults.sampler, '-s', String(s), '-o', out];
    if (neg) args.push('-n', neg);
    const vae = filePath('image', model, 'vae');
    if (vae) args.push('--vae', vae);
    if (opts.lowMemory && hasFlag(help, '--vae-tiling')) args.push('--vae-tiling');
    if (opts.lowMemory && m.family === 'sdxl' && hasFlag(help, '--clip-on-cpu')) args.push('--clip-on-cpu');

    const label = count > 1 ? `Picture ${i + 1} of ${count}` : 'Painting your picture';
    await runSd(args, task, { label });
    if (!fs.existsSync(out)) throw new Error('The engine finished but no picture was saved.');
    results.push(addToGallery({ id, type: 'image', file: out, prompt, style, model, width: W, height: H, seed: s, steps, created: Date.now() }));
  }
  return results;
}

function snapshot(dir) {
  return new Set(fs.readdirSync(dir));
}

function runFfmpeg(args) {
  const exe = ffmpegExe();
  return new Promise((resolve, reject) => {
    const p = spawn(exe, ['-y', '-loglevel', 'error', ...args], { windowsHide: true });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`Video conversion failed: ${err.slice(-400)}`))));
  });
}

async function generateVideo(opts, task, hwPlan) {
  const { model, prompt, style = 'none', length = 'short', negative = '', seed = -1, lowMemory = true } = opts;
  const m = findMedia('video', model);
  if (!m) throw new Error('Choose a video model first (Models page).');
  if (!mediaInstalled('video', model)) throw new Error(`${m.name} is not downloaded yet. Install it from the Models page.`);
  if (!ffmpegExe()) throw new Error('Video tools (FFmpeg) are not installed yet. Install them from the Models page.');
  const help = await sdHelp();
  if (!/vid_gen/.test(help)) throw new Error('This picture engine build has no video support. Reinstall the engine from the Models page to get the latest one.');

  const plan = hwPlan || { short: 17, long: 33, W: 416, H: 240 };
  const frames = length === 'long' ? plan.long : plan.short;
  const work = path.join(dirs().creations, `.work-${Date.now()}`);
  fs.mkdirSync(work, { recursive: true });
  const before = snapshot(work);

  const { positive } = buildPrompt(prompt, style);
  const s = seed === -1 || seed === undefined ? Math.floor(Math.random() * 2 ** 31) : Number(seed);
  const args = [
    '-M', 'vid_gen',
    '--diffusion-model', filePath('video', model, 'diffusion'),
    '--vae', filePath('video', model, 'vae'),
    '--t5xxl', filePath('video', model, 't5xxl'),
    '-p', positive,
    '-n', [negative, m.negative].filter(Boolean).join(', '),
    '--cfg-scale', String(m.defaults.cfg),
    '--sampling-method', 'euler',
    '--steps', String(opts.steps || m.defaults.steps),
    '-W', String(plan.W), '-H', String(plan.H),
    '--video-frames', String(frames),
    '-s', String(s),
    '-o', path.join(work, 'clip.avi')
  ];
  if (hasFlag(help, '--flow-shift')) args.push('--flow-shift', String(m.defaults.flowShift));
  if (hasFlag(help, '--diffusion-fa')) args.push('--diffusion-fa');
  if (lowMemory) {
    for (const f of ['--offload-to-cpu', '--vae-tiling', '--clip-on-cpu']) if (hasFlag(help, f)) args.push(f);
  }

  await runSd(args, task, { label: 'Filming your video', progressWeight: 0.9 });

  updateTask(task.id, { progress: 0.93, detail: 'Making the video playable…' });
  const id = newId('vid');
  const outMp4 = path.join(dirs().creations, `${id}.mp4`);
  const poster = path.join(dirs().creations, `${id}.jpg`);
  const created = [...fs.readdirSync(work)].filter((f) => !before.has(f));
  const videoFile = created.find((f) => /\.(avi|mp4|webm|mkv|mov)$/i.test(f));
  const frameFiles = created.filter((f) => /\.png$/i.test(f)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const fps = String(m.defaults.fps);
  const enc = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2'];
  if (videoFile) {
    await runFfmpeg(['-i', path.join(work, videoFile), ...enc, outMp4]);
  } else if (frameFiles.length) {
    const list = path.join(work, 'frames.txt');
    fs.writeFileSync(list, frameFiles.map((f) => `file '${path.join(work, f).replace(/\\/g, '/').replace(/'/g, "'\\''")}'\nduration ${1 / Number(fps)}`).join('\n'));
    await runFfmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-r', fps, ...enc, outMp4]);
  } else {
    throw new Error('The engine finished but no video frames were saved.');
  }
  try {
    await runFfmpeg(['-i', outMp4, '-frames:v', '1', poster]);
  } catch {}
  fs.rmSync(work, { recursive: true, force: true });

  return [addToGallery({ id, type: 'video', file: outMp4, poster: fs.existsSync(poster) ? poster : null, prompt, style, model, width: plan.W, height: plan.H, frames, seed: s, created: Date.now() })];
}

module.exports = { STYLES, installMedia, removeMedia, mediaInstalled, generateImage, generateVideo, gallery, deleteCreation };
