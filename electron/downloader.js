// Resumable downloads with progress, plus helpers for GitHub releases and zip extraction.
const fs = require('fs');
const path = require('path');
const { net } = require('electron');
const { execFile } = require('child_process');
const { updateTask } = require('./tasks');

function fmtBytes(n) {
  if (!n && n !== 0) return '?';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i >= 2 ? 1 : 0)} ${u[i]}`;
}

function fmtEta(sec) {
  if (!isFinite(sec) || sec <= 0) return '';
  if (sec < 60) return `${Math.round(sec)}s left`;
  if (sec < 3600) return `${Math.round(sec / 60)} min left`;
  return `${(sec / 3600).toFixed(1)} h left`;
}

/**
 * Download url → dest. Resumes from dest + '.part' if a previous attempt stopped.
 * Reports progress into the given task. Skips work if dest already exists.
 */
async function download(url, dest, task, { label, weightStart = 0, weightSpan = 1 } = {}) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return dest;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const part = dest + '.part';
  let have = fs.existsSync(part) ? fs.statSync(part).size : 0;

  const headers = { 'User-Agent': 'Dilreet/1.0' };
  if (have > 0) headers.Range = `bytes=${have}-`;

  const res = await net.fetch(url, { headers, signal: task && task.controller.signal });
  if (res.status === 416) {
    // Server says our partial file is already complete.
    fs.renameSync(part, dest);
    return dest;
  }
  if (!res.ok && res.status !== 206) {
    throw new Error(`Download failed (${res.status}) for ${path.basename(dest)}. ${res.status === 401 || res.status === 403 ? 'This file may need a Hugging Face login or licence acceptance.' : ''}`);
  }
  if (res.status === 200 && have > 0) have = 0; // server ignored Range → start over

  const len = Number(res.headers.get('content-length') || 0);
  const total = len ? len + have : 0;
  const out = fs.createWriteStream(part, { flags: have > 0 ? 'a' : 'w' });

  let done = have;
  let lastT = Date.now();
  let lastDone = done;
  let speed = 0;
  const reader = res.body.getReader();

  try {
    for (;;) {
      const { value, done: finished } = await reader.read();
      if (finished) break;
      if (!out.write(Buffer.from(value))) await new Promise((r) => out.once('drain', r));
      done += value.length;
      const now = Date.now();
      if (task && now - lastT > 500) {
        speed = (done - lastDone) / ((now - lastT) / 1000);
        lastT = now;
        lastDone = done;
        const frac = total ? done / total : 0;
        updateTask(task.id, {
          progress: weightStart + weightSpan * frac,
          detail: `${label || path.basename(dest)} · ${fmtBytes(done)}${total ? ' of ' + fmtBytes(total) : ''} · ${fmtBytes(speed)}/s ${total ? '· ' + fmtEta((total - done) / (speed || 1)) : ''}`
        });
      }
    }
  } finally {
    await new Promise((r) => out.end(r));
  }

  if (total && done < total) throw new Error(`Download of ${path.basename(dest)} stopped early. Run it again to resume.`);
  fs.renameSync(part, dest);
  return dest;
}

async function getJson(url) {
  const res = await net.fetch(url, { headers: { 'User-Agent': 'Dilreet/1.0', Accept: 'application/vnd.github+json' } });
  if (!res.ok) throw new Error(`Could not reach ${new URL(url).host} (${res.status})`);
  return res.json();
}

/**
 * Finds the newest GitHub release that has assets matching every regex in `patterns`.
 * Returns [{name, url, size}] in the same order as patterns.
 */
async function findReleaseAssets(repo, patterns) {
  const releases = await getJson(`https://api.github.com/repos/${repo}/releases?per_page=15`);
  for (const rel of releases) {
    if (rel.draft) continue;
    const found = patterns.map((re) => rel.assets.find((a) => re.test(a.name)));
    if (found.every(Boolean)) {
      return { tag: rel.tag_name, assets: found.map((a) => ({ name: a.name, url: a.browser_download_url, size: a.size })) };
    }
  }
  throw new Error(`No suitable Windows download found in ${repo} releases.`);
}

function execP(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout);
    });
  });
}

// Windows 10+ ships tar.exe (bsdtar), which unpacks .zip files quickly. PowerShell is the fallback.
async function extractZip(zipFile, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  try {
    await execP('tar', ['-xf', zipFile, '-C', destDir]);
  } catch {
    await execP('powershell.exe', [
      '-NoProfile',
      '-Command',
      `Expand-Archive -LiteralPath '${zipFile.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`
    ]);
  }
}

// Finds a file by name anywhere under dir (zips often contain a sub-folder).
function findFile(dir, name) {
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === name.toLowerCase()) return p;
    if (entry.isDirectory()) {
      const hit = findFile(p, name);
      if (hit) return hit;
    }
  }
  return null;
}

module.exports = { download, getJson, findReleaseAssets, extractZip, findFile, fmtBytes, execP };
