// Detects CPU, RAM, GPU/VRAM and free disk, then sorts the PC into a capability tier.
const os = require('os');
const fs = require('fs');
const { execFile } = require('child_process');
const { dirs } = require('./store');

function run(cmd, args, timeout = 15000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      resolve(err ? '' : String(stdout || ''));
    });
  });
}

async function detectNvidia() {
  const out = await run('nvidia-smi', [
    '--query-gpu=name,memory.total,driver_version',
    '--format=csv,noheader,nounits'
  ]);
  return out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, mem, driver] = line.split(',').map((s) => s.trim());
      return { vendor: 'nvidia', name, vramGB: Math.round((Number(mem) / 1024) * 10) / 10, driver };
    })
    .filter((g) => g.name && !Number.isNaN(g.vramGB));
}

async function detectAllGpus() {
  if (process.platform !== 'win32') return [];
  const out = await run('powershell.exe', [
    '-NoProfile',
    '-Command',
    'Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM,DriverVersion | ConvertTo-Json -Compress'
  ]);
  try {
    let list = JSON.parse(out);
    if (!Array.isArray(list)) list = [list];
    return list
      .filter((g) => g && g.Name)
      .map((g) => {
        const n = g.Name.toLowerCase();
        const vendor = n.includes('nvidia') ? 'nvidia' : n.includes('amd') || n.includes('radeon') ? 'amd' : n.includes('intel') ? 'intel' : 'other';
        // AdapterRAM is a 32-bit field, so it caps at 4 GB; nvidia-smi gives the true number for NVIDIA.
        const vramGB = g.AdapterRAM ? Math.round((g.AdapterRAM / 1024 ** 3) * 10) / 10 : 0;
        return { vendor, name: g.Name, vramGB, driver: g.DriverVersion || '' };
      });
  } catch {
    return [];
  }
}

function freeDiskGB(p) {
  try {
    const s = fs.statfsSync(p);
    return Math.round(((s.bavail * s.bsize) / 1024 ** 3) * 10) / 10;
  } catch {
    return null;
  }
}

// Tier decides which models Dilreet recommends and which features it unlocks.
function computeTier(ramGB, gpu) {
  const nvidiaVram = gpu && gpu.vendor === 'nvidia' ? gpu.vramGB : 0;
  let tier;
  if (nvidiaVram >= 12) tier = 'power';
  else if (nvidiaVram >= 8) tier = 'high';
  else if (nvidiaVram >= 6) tier = 'mid';
  else if (nvidiaVram >= 3.5) tier = 'low';
  else if (gpu && (gpu.vendor === 'amd' || gpu.vendor === 'intel') && gpu.vramGB >= 4) tier = 'low';
  else tier = 'cpu';

  // Little system RAM holds everything back, because models also live in RAM while loading.
  const order = ['cpu', 'low', 'mid', 'high', 'power'];
  if (ramGB < 12 && order.indexOf(tier) > order.indexOf('low')) tier = 'low';
  if (ramGB < 6) tier = 'cpu';

  const labels = {
    power: 'Power PC',
    high: 'Strong PC',
    mid: 'Good PC',
    low: 'Starter PC',
    cpu: 'Basic PC (no strong GPU)'
  };

  const can = {
    chat: 'great',
    images: tier === 'cpu' ? 'slow' : 'good',
    video: tier === 'power' || tier === 'high' ? 'good' : tier === 'mid' ? 'slow' : tier === 'low' ? 'experimental' : 'no'
  };

  const tips = [];
  if (ramGB < 16) tips.push(`Adding RAM (you have ${Math.round(ramGB)} GB) to 16 GB would make bigger models and video much more reliable.`);
  if (nvidiaVram && nvidiaVram < 8) tips.push(`Your GPU has ${nvidiaVram} GB of video memory. Video models work best with 8 GB or more.`);
  if (!nvidiaVram) tips.push('An NVIDIA graphics card gives the biggest speed-up for pictures and video.');

  return { tier, label: labels[tier], can, tips };
}

async function detectHardware() {
  const cpus = os.cpus();
  const ramGB = Math.round((os.totalmem() / 1024 ** 3) * 10) / 10;
  const nvidia = await detectNvidia();
  const all = await detectAllGpus();

  // Merge: trust nvidia-smi for NVIDIA cards, keep the rest from Windows.
  const gpus = [...nvidia, ...all.filter((g) => g.vendor !== 'nvidia' || nvidia.length === 0)];
  const best = [...gpus].sort((a, b) => {
    const score = (g) => (g.vendor === 'nvidia' ? 1000 : 0) + g.vramGB;
    return score(b) - score(a);
  })[0] || null;

  let storageRoot;
  try {
    storageRoot = dirs().root;
  } catch {
    storageRoot = os.homedir();
  }

  const info = {
    os: `${os.type()} ${os.release()}`,
    cpu: { model: cpus[0] ? cpus[0].model.trim() : 'Unknown CPU', threads: cpus.length },
    ramGB,
    gpus,
    gpu: best,
    diskFreeGB: freeDiskGB(storageRoot),
    storageRoot
  };
  return { ...info, ...computeTier(ramGB, best) };
}

module.exports = { detectHardware, computeTier };
