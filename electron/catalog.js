// The list of open-source models Dilreet knows how to install, with the hardware each one needs.
// Chat models come from the Ollama library (any other Ollama tag can also be typed in by hand).
// Picture and video models run on stable-diffusion.cpp.

const TIERS = ['cpu', 'low', 'mid', 'high', 'power'];
const tierAtLeast = (tier, min) => TIERS.indexOf(tier) >= TIERS.indexOf(min);

const HF = 'https://huggingface.co';

const chatModels = [
  { id: 'llama3.2:3b', name: 'Llama 3.2 3B', sizeGB: 2.0, minTier: 'cpu', good: 'Fast everyday chat', tools: true },
  { id: 'qwen3:4b', name: 'Qwen 3 4B', sizeGB: 2.5, minTier: 'cpu', good: 'Best all-rounder for small PCs', tools: true },
  { id: 'gemma3:4b', name: 'Gemma 3 4B', sizeGB: 3.3, minTier: 'low', good: 'Friendly writing, many languages' },
  { id: 'phi4-mini', name: 'Phi-4 Mini', sizeGB: 2.5, minTier: 'cpu', good: 'Reasoning and maths', tools: true },
  { id: 'qwen3:8b', name: 'Qwen 3 8B', sizeGB: 5.2, minTier: 'mid', good: 'Smarter answers, needs 6 GB+ GPU', tools: true },
  { id: 'deepseek-r1:8b', name: 'DeepSeek R1 8B', sizeGB: 5.2, minTier: 'mid', good: 'Step-by-step thinking' },
  { id: 'gemma3:12b', name: 'Gemma 3 12B', sizeGB: 8.1, minTier: 'high', good: 'High-quality writing' },
  { id: 'qwen3:14b', name: 'Qwen 3 14B', sizeGB: 9.3, minTier: 'power', good: 'Top quality on strong PCs', tools: true }
];

const coderModels = [
  { id: 'qwen2.5-coder:3b', name: 'Qwen 2.5 Coder 3B', sizeGB: 1.9, minTier: 'cpu', good: 'Builds simple add-on features' },
  { id: 'qwen2.5-coder:7b', name: 'Qwen 2.5 Coder 7B', sizeGB: 4.7, minTier: 'mid', good: 'Builds bigger add-on features' },
  { id: 'qwen2.5-coder:14b', name: 'Qwen 2.5 Coder 14B', sizeGB: 9.0, minTier: 'power', good: 'Most reliable feature builder' }
];

const imageModels = [
  {
    id: 'sd15',
    name: 'Stable Diffusion 1.5',
    minTier: 'cpu',
    good: 'Light and reliable, 512×512 pictures',
    family: 'sd',
    files: [{ role: 'model', url: `${HF}/stable-diffusion-v1-5/stable-diffusion-v1-5/resolve/main/v1-5-pruned-emaonly.safetensors`, file: 'v1-5-pruned-emaonly.safetensors', sizeGB: 4.27 }],
    defaults: { steps: 22, cfg: 7, sampler: 'euler_a', base: 512 },
    negative: 'blurry, low quality, deformed, extra fingers, bad anatomy, watermark, text'
  },
  {
    id: 'sdxl-turbo',
    name: 'SDXL Turbo',
    minTier: 'mid',
    good: 'Very fast, sharper pictures',
    family: 'sdxl',
    files: [
      { role: 'model', url: `${HF}/stabilityai/sdxl-turbo/resolve/main/sd_xl_turbo_1.0_fp16.safetensors`, file: 'sd_xl_turbo_1.0_fp16.safetensors', sizeGB: 6.9 },
      { role: 'vae', url: `${HF}/madebyollin/sdxl-vae-fp16-fix/resolve/main/sdxl_vae.safetensors`, file: 'sdxl_vae.safetensors', sizeGB: 0.33 }
    ],
    defaults: { steps: 4, cfg: 1, sampler: 'euler_a', base: 512 },
    negative: ''
  },
  {
    id: 'sdxl',
    name: 'Stable Diffusion XL',
    minTier: 'high',
    good: 'Best detail, 1024×1024 pictures',
    family: 'sdxl',
    files: [
      { role: 'model', url: `${HF}/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors`, file: 'sd_xl_base_1.0.safetensors', sizeGB: 6.94 },
      { role: 'vae', url: `${HF}/madebyollin/sdxl-vae-fp16-fix/resolve/main/sdxl_vae.safetensors`, file: 'sdxl_vae.safetensors', sizeGB: 0.33 }
    ],
    defaults: { steps: 25, cfg: 6.5, sampler: 'dpm++2m', base: 1024 },
    negative: 'blurry, low quality, deformed, watermark, text'
  }
];

const WAN_NEGATIVE = 'blurry, static, low quality, worst quality, jpeg artifacts, deformed, ugly, extra fingers, bad hands, bad face, messy background, subtitles, text';

const videoModels = [
  {
    id: 'wan21-1.3b',
    name: 'Wan 2.1 (1.3B)',
    minTier: 'low',
    experimentalBelow: 'high',
    good: 'Smallest open video model, short clips',
    family: 'wan',
    files: [
      { role: 'diffusion', url: `${HF}/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/diffusion_models/wan2.1_t2v_1.3B_fp16.safetensors`, file: 'wan2.1_t2v_1.3B_fp16.safetensors', sizeGB: 2.84 },
      { role: 'vae', url: `${HF}/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors`, file: 'wan_2.1_vae.safetensors', sizeGB: 0.25 },
      { role: 't5xxl', url: `${HF}/city96/umt5-xxl-encoder-gguf/resolve/main/umt5-xxl-encoder-Q3_K_S.gguf`, file: 'umt5-xxl-encoder-Q3_K_S.gguf', sizeGB: 2.86 }
    ],
    defaults: { steps: 20, cfg: 6, flowShift: 3, fps: 16 },
    negative: WAN_NEGATIVE
  },
  {
    id: 'wan22-5b',
    name: 'Wan 2.2 (5B)',
    minTier: 'power',
    good: 'Better motion and detail, 720p-class',
    family: 'wan',
    files: [
      { role: 'diffusion', url: `${HF}/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors`, file: 'wan2.2_ti2v_5B_fp16.safetensors', sizeGB: 10.0 },
      { role: 'vae', url: `${HF}/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/vae/wan2.2_vae.safetensors`, file: 'wan2.2_vae.safetensors', sizeGB: 1.4 },
      { role: 't5xxl', url: `${HF}/city96/umt5-xxl-encoder-gguf/resolve/main/umt5-xxl-encoder-Q4_K_M.gguf`, file: 'umt5-xxl-encoder-Q4_K_M.gguf', sizeGB: 3.66 }
    ],
    defaults: { steps: 20, cfg: 6, flowShift: 3, fps: 24 },
    negative: WAN_NEGATIVE
  }
];

// Picture/video sizes per tier. Width and height stay multiples of 64 (16 for video).
const imageSizes = {
  512: { square: [512, 512], portrait: [448, 640], landscape: [640, 448] },
  1024: { square: [1024, 1024], portrait: [832, 1216], landscape: [1216, 832] }
};

function videoPlan(tier) {
  // frames must be 4n+1 for Wan models
  if (tier === 'power') return { short: 33, long: 81, W: 832, H: 480 };
  if (tier === 'high') return { short: 33, long: 49, W: 832, H: 480 };
  if (tier === 'mid') return { short: 17, long: 33, W: 480, H: 272 };
  return { short: 9, long: 17, W: 416, H: 240 };
}

function pickBest(list, tier) {
  const fitting = list.filter((m) => tierAtLeast(tier, m.minTier));
  return fitting[fitting.length - 1] || null;
}

function recommend(hw) {
  const tier = hw.tier;
  // On small PCs prefer the strong 4B all-rounder over the largest model that technically fits.
  const chat = tier === 'cpu' ? chatModels[0] : tier === 'low' ? chatModels.find((m) => m.id === 'qwen3:4b') : pickBest(chatModels, tier);
  const coder = pickBest(coderModels, tier);
  const image = tier === 'power' || tier === 'high' ? imageModels.find((m) => m.id === 'sdxl') : pickBest(imageModels, tier);
  const video = tier === 'cpu' ? null : pickBest(videoModels, tier);
  return {
    chat,
    coder,
    image,
    video,
    videoExperimental: !!video && !!video.experimentalBelow && !tierAtLeast(tier, video.experimentalBelow),
    videoPlan: videoPlan(tier)
  };
}

function annotate(list, tier) {
  return list.map((m) => ({ ...m, fits: tierAtLeast(tier, m.minTier) }));
}

function getCatalog(hw) {
  const tier = hw ? hw.tier : 'low';
  return {
    chat: annotate(chatModels, tier),
    coder: annotate(coderModels, tier),
    image: annotate(imageModels, tier),
    video: annotate(videoModels, tier),
    recommended: hw ? recommend(hw) : null
  };
}

function findMedia(kind, id) {
  return (kind === 'video' ? videoModels : imageModels).find((m) => m.id === id) || null;
}

module.exports = { getCatalog, recommend, findMedia, imageSizes, videoPlan, tierAtLeast };
