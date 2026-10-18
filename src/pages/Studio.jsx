import { useEffect, useMemo, useState } from 'react';
import { api, mediaUrl } from '../api';
import Icon from '../Icon';

const STYLE_LABELS = {
  none: 'No style',
  photo: 'Real photo',
  cinematic: 'Cinematic',
  anime: 'Anime',
  '3d': '3D render',
  painting: 'Oil painting',
  watercolor: 'Watercolour',
  logo: 'Logo'
};

const IDEAS = {
  image: ['A golden retriever wearing sunglasses on a beach', 'A futuristic Amritsar skyline at night', 'A bowl of sarson da saag and makki di roti, food photo', 'A cute robot reading a book in a library'],
  video: ['Waves gently rolling onto a sandy beach at sunset', 'A paper boat floating down a rainy street', 'Clouds moving over green wheat fields', 'A candle flame flickering in a dark room']
};

export default function Studio({ settings, hw, tasks, onOpenModels, toast }) {
  const [mode, setMode] = useState('image');
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState('none');
  const [shape, setShape] = useState('square');
  const [quality, setQuality] = useState('balanced');
  const [length, setLength] = useState('short');
  const [count, setCount] = useState(1);
  const [advanced, setAdvanced] = useState(false);
  const [negative, setNegative] = useState('');
  const [seed, setSeed] = useState('');
  const [improving, setImproving] = useState(false);
  const [gallery, setGallery] = useState([]);
  const [viewer, setViewer] = useState(null);
  const [jobIds, setJobIds] = useState([]);

  const refresh = () => api.studio.gallery().then(setGallery);
  useEffect(() => {
    refresh();
  }, []);

  // Reload the gallery whenever one of our jobs finishes.
  const finishedKey = tasks.filter((t) => (t.kind === 'image' || t.kind === 'video') && t.status !== 'running').map((t) => t.id).join();
  useEffect(() => {
    refresh();
  }, [finishedKey]);

  const myJobs = tasks.filter((t) => jobIds.includes(t.id) && t.status === 'running');
  const lastFailed = tasks.find((t) => jobIds.includes(t.id) && t.status === 'error');
  const modelReady = mode === 'image' ? settings.imageModel : settings.videoModel;
  const videoRisky = mode === 'video' && hw.can.video !== 'good';

  async function generate() {
    if (!prompt.trim()) return;
    const opts = { prompt: prompt.trim(), style, negative, seed: seed === '' ? -1 : Number(seed) };
    const id = mode === 'image' ? await api.studio.image({ ...opts, shape, quality, count }) : await api.studio.video({ ...opts, length });
    setJobIds((j) => [...j, id]);
  }

  async function improve() {
    if (!prompt.trim()) return;
    setImproving(true);
    try {
      setPrompt(await api.ai.improvePrompt(prompt, mode));
    } catch (e) {
      toast(e.message);
    } finally {
      setImproving(false);
    }
  }

  const shown = useMemo(() => gallery.filter((g) => g.type === mode), [gallery, mode]);

  return (
    <div className="page studio">
      <div className="page-head">
        <h1 className="display small">Create</h1>
        <div className="segmented" role="tablist">
          <button role="tab" aria-selected={mode === 'image'} className={mode === 'image' ? 'on' : ''} onClick={() => setMode('image')}>
            <Icon name="image" /> Picture
          </button>
          <button role="tab" aria-selected={mode === 'video'} className={mode === 'video' ? 'on' : ''} onClick={() => setMode('video')}>
            <Icon name="video" /> Video
          </button>
        </div>
      </div>

      {!modelReady ? (
        <div className="empty-card">
          <h2>{mode === 'image' ? 'No picture model yet' : 'No video model yet'}</h2>
          <p>{mode === 'image' ? 'Download a picture model once, then create as many pictures as you like, offline.' : 'Download a video model once, then create short clips offline.'}</p>
          <button className="btn primary" onClick={onOpenModels}>
            <Icon name="download" /> Choose a model
          </button>
        </div>
      ) : (
        <div className="create-card">
          <label className="step-label" htmlFor="prompt">
            Describe what you want to see
          </label>
          <textarea
            id="prompt"
            className="field prompt-box"
            rows={3}
            placeholder={mode === 'image' ? 'e.g. A peacock in a mustard field at sunrise' : 'e.g. A hot-air balloon slowly rising over mountains'}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) generate();
            }}
          />
          <div className="row gap wrap">
            <button className="btn ghost small" onClick={improve} disabled={!prompt.trim() || improving}>
              <Icon name="wand" size={16} /> {improving ? 'Improving…' : 'Improve my description'}
            </button>
            {!prompt &&
              IDEAS[mode].map((idea) => (
                <button key={idea} className="chip quiet" onClick={() => setPrompt(idea)}>
                  {idea}
                </button>
              ))}
          </div>

          <div className="step-label">Style</div>
          <div className="chips">
            {Object.entries(STYLE_LABELS).map(([k, v]) => (
              <button key={k} className={`chip ${style === k ? 'on' : ''}`} onClick={() => setStyle(k)}>
                {v}
              </button>
            ))}
          </div>

          {mode === 'image' ? (
            <div className="option-row">
              <Choice label="Shape" value={shape} onChange={setShape} options={[['square', 'Square'], ['portrait', 'Tall'], ['landscape', 'Wide']]} />
              <Choice label="Quality" value={quality} onChange={setQuality} options={[['fast', 'Fast'], ['balanced', 'Balanced'], ['best', 'Best']]} />
              <Choice label="How many" value={count} onChange={setCount} options={[[1, '1'], [2, '2'], [4, '4']]} />
            </div>
          ) : (
            <div className="option-row">
              <Choice label="Length" value={length} onChange={setLength} options={[['short', 'Shorter'], ['long', 'Longer']]} />
            </div>
          )}

          <button className="link-btn" onClick={() => setAdvanced(!advanced)}>
            {advanced ? 'Hide extra settings' : 'Extra settings'}
          </button>
          {advanced && (
            <div className="advanced">
              <label>
                <span>Things to avoid</span>
                <input className="field" value={negative} onChange={(e) => setNegative(e.target.value)} placeholder="e.g. text, blurry, extra people" />
              </label>
              <label>
                <span>Seed (same number = same result)</span>
                <input className="field" value={seed} onChange={(e) => setSeed(e.target.value.replace(/[^0-9]/g, ''))} placeholder="Random" />
              </label>
            </div>
          )}

          {videoRisky && (
            <div className="notice">
              Video on this PC is {hw.can.video === 'experimental' ? 'experimental' : 'slow'}: a short clip can take 10–30 minutes, and it may run out of memory. Close games and browsers before you start.
            </div>
          )}

          <div className="row gap">
            <button className="btn primary big" onClick={generate} disabled={!prompt.trim()}>
              <Icon name="sparkle" /> {mode === 'image' ? (count > 1 ? `Create ${count} pictures` : 'Create picture') : 'Create video'}
            </button>
            <span className="muted small">Ctrl + Enter also works</span>
          </div>

          {myJobs.map((t) => (
            <div key={t.id} className="job">
              <div className="bar">
                <div className="bar-fill" style={{ width: `${Math.max(3, Math.round(t.progress * 100))}%` }} />
              </div>
              <div className="row gap">
                <span className="muted small truncate">{t.detail}</span>
                <button className="link-btn push" onClick={() => api.tasks.cancel(t.id)}>
                  Stop
                </button>
              </div>
            </div>
          ))}
          {lastFailed && !myJobs.length && <div className="error-box">{lastFailed.detail}</div>}
        </div>
      )}

      <section className="gallery-section">
        <h2 className="section-title">{mode === 'image' ? 'Your pictures' : 'Your videos'}</h2>
        {shown.length === 0 ? (
          <p className="muted">Nothing here yet. What you create is saved on your PC and appears here.</p>
        ) : (
          <div className="gallery">
            {shown.map((g) => (
              <button key={g.id} className="tile" onClick={() => setViewer(g)} title={g.prompt}>
                {g.type === 'video' ? <video src={mediaUrl(g.file)} poster={mediaUrl(g.poster)} muted loop onMouseEnter={(e) => e.target.play()} onMouseLeave={(e) => e.target.pause()} /> : <img src={mediaUrl(g.file)} alt={g.prompt} loading="lazy" />}
              </button>
            ))}
          </div>
        )}
      </section>

      {viewer && (
        <div className="viewer" onClick={() => setViewer(null)}>
          <div className="viewer-inner" onClick={(e) => e.stopPropagation()}>
            {viewer.type === 'video' ? <video src={mediaUrl(viewer.file)} controls autoPlay loop /> : <img src={mediaUrl(viewer.file)} alt={viewer.prompt} />}
            <div className="viewer-side">
              <p className="viewer-prompt">{viewer.prompt}</p>
              <p className="muted small">
                {STYLE_LABELS[viewer.style] || 'No style'} · {viewer.width}×{viewer.height} · seed {viewer.seed}
              </p>
              <div className="row gap wrap">
                <button className="btn ghost small" onClick={() => api.studio.reveal(viewer.file)}>
                  <Icon name="folder" size={16} /> Show in folder
                </button>
                <button
                  className="btn ghost small"
                  onClick={() => {
                    setPrompt(viewer.prompt);
                    setStyle(viewer.style || 'none');
                    setSeed(String(viewer.seed));
                    setViewer(null);
                  }}
                >
                  <Icon name="refresh" size={16} /> Use these settings
                </button>
                <button
                  className="btn ghost small danger"
                  onClick={async () => {
                    await api.studio.remove(viewer.id);
                    setViewer(null);
                    refresh();
                  }}
                >
                  <Icon name="trash" size={16} /> Delete
                </button>
              </div>
            </div>
            <button className="icon-btn viewer-close" aria-label="Close" onClick={() => setViewer(null)}>
              <Icon name="close" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Choice({ label, value, onChange, options }) {
  return (
    <div className="choice">
      <div className="step-label">{label}</div>
      <div className="segmented small">
        {options.map(([v, l]) => (
          <button key={v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}
