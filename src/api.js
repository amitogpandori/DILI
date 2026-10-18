// Access to the desktop side of Dilreet. Inside the app this is window.dilreet (see electron/preload.js).
// In a plain browser (design preview) a small mock keeps the interface usable.

const noop = () => () => {};

function mock() {
  const settings = { userName: 'Amitoj', setupDone: !String(globalThis.location && location.hash).includes('setup'), chatModel: 'qwen3:4b', coderModel: 'qwen2.5-coder:3b', imageModel: 'sd15', videoModel: '', showThinking: false, agentTools: true, storageRoot: 'C:\\Users\\you\\Dilreet' };
  const hw = {
    cpu: { model: 'AMD Ryzen 5 5600H with Radeon Graphics', threads: 12 },
    ramGB: 7.4,
    gpu: { vendor: 'nvidia', name: 'NVIDIA GeForce GTX 1650', vramGB: 4 },
    gpus: [{ vendor: 'nvidia', name: 'NVIDIA GeForce GTX 1650', vramGB: 4 }, { vendor: 'amd', name: 'AMD Radeon(TM) Graphics', vramGB: 0.5 }],
    diskFreeGB: 198,
    tier: 'low',
    label: 'Starter PC',
    can: { chat: 'great', images: 'good', video: 'experimental' },
    tips: ['Adding RAM (you have 7 GB) to 16 GB would make bigger models and video much more reliable.', 'Your GPU has 4 GB of video memory. Video models work best with 8 GB or more.']
  };
  const docs = {};
  const chatListeners = new Set();
  const m = (id, name, sizeGB, minTier, good, fits = true) => ({ id, name, sizeGB, minTier, good, fits });
  const cat = {
    chat: [m('llama3.2:3b', 'Llama 3.2 3B', 2, 'cpu', 'Fast everyday chat'), m('qwen3:4b', 'Qwen 3 4B', 2.5, 'cpu', 'Best all-rounder for small PCs'), m('qwen3:8b', 'Qwen 3 8B', 5.2, 'mid', 'Smarter answers, needs 6 GB+ GPU', false)],
    coder: [m('qwen2.5-coder:3b', 'Qwen 2.5 Coder 3B', 1.9, 'cpu', 'Builds simple add-on features')],
    image: [{ ...m('sd15', 'Stable Diffusion 1.5', 0, 'cpu', 'Light and reliable, 512×512 pictures'), files: [{ sizeGB: 4.27 }] }, { ...m('sdxl-turbo', 'SDXL Turbo', 0, 'mid', 'Very fast, sharper pictures', false), files: [{ sizeGB: 6.9 }, { sizeGB: 0.33 }] }],
    video: [{ ...m('wan21-1.3b', 'Wan 2.1 (1.3B)', 0, 'low', 'Smallest open video model, short clips'), files: [{ sizeGB: 2.84 }, { sizeGB: 0.25 }, { sizeGB: 2.86 }] }]
  };
  cat.recommended = { chat: cat.chat[1], coder: cat.coder[0], image: cat.image[0], video: cat.video[0], videoExperimental: true, videoPlan: { short: 9, long: 17, W: 416, H: 240 } };
  const p = (v) => Promise.resolve(v);
  return {
    mock: true,
    appInfo: () => p({ version: '1.0.0', platform: 'browser' }),
    hardware: () => p(hw),
    settings: { get: () => p(settings), set: (x) => p(Object.assign(settings, x)), pickFolder: () => p(null) },
    doc: { get: (n, f) => p(docs[n] ?? f), set: (n, v) => p((docs[n] = v)) },
    catalog: () => p(cat),
    engines: { status: () => p({ ollamaInstalled: true, ollamaRunning: true, sdInstalled: true, ffmpegInstalled: false }), install: () => p(true) },
    setup: { run: () => p(true), onFinished: noop },
    models: { installed: () => p({ chat: [{ id: 'qwen3:4b', sizeGB: 2.5 }, { id: 'qwen2.5-coder:3b', sizeGB: 1.9 }], media: { sd15: true } }), pull: () => p(true), deleteChat: () => p(true), installMedia: () => p(true), removeMedia: () => p(true) },
    chat: {
      send: ({ reqId }) => {
        const text = 'This is the **design preview**. In the installed app, your local model answers here.\n\n- Chat runs on your PC\n- Nothing leaves your computer';
        let i = 0;
        const t = setInterval(() => {
          const chunk = text.slice(i, i + 6);
          i += 6;
          chatListeners.forEach((cb) => cb(chunk ? { reqId, type: 'token', text: chunk } : { reqId, type: 'done' }));
          if (!chunk) clearInterval(t);
        }, 30);
        return p(true);
      },
      stop: () => p(true),
      title: () => p('Preview chat'),
      onEvent: (cb) => {
        chatListeners.add(cb);
        return () => chatListeners.delete(cb);
      }
    },
    ai: { improvePrompt: (x) => p(`${x}, golden hour light, rich colours, detailed`) },
    studio: { image: () => p('t1'), video: () => p('t2'), gallery: () => p([]), remove: () => p(true), reveal: () => p(true), styles: () => p(['none', 'photo', 'cinematic', 'anime', '3d', 'painting', 'logo', 'watercolor']) },
    features: { draft: () => p('t3'), getDraft: () => p(null), install: () => p(null), list: () => p([]), setEnabled: () => p(null), rollback: () => p(null), remove: () => p(true), source: () => p(''), bridge: () => p(null) },
    tasks: { list: () => p([]), cancel: () => p(true), clear: () => p(true), onUpdate: noop },
    openStorage: () => p(true),
    updates: { check: () => p({ status: 'dev', message: 'Updates work in the installed app.' }), install: () => p(true), onReady: noop },
    onToast: noop
  };
}

export const api = typeof window !== 'undefined' && window.dilreet ? window.dilreet : mock();

export const mediaUrl = (file) => (file ? `dilreet-media://file/${encodeURIComponent(file)}` : '');

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
