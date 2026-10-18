// Minimal line icons (24px grid, stroke-based) so Dilreet needs no icon library.
const PATHS = {
  plus: 'M12 5v14M5 12h14',
  chat: 'M4 5h16v11H9l-5 4z',
  studio: 'M4 6h16v12H4zM8 6v12M4 10h4M4 14h4M16 6v12',
  image: 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9h.01',
  video: 'M4 6h11v12H4zM15 10l5-3v10l-5-3',
  models: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5',
  puzzle: 'M10 4h4v3a2 2 0 104 0V4h2v6h-3a2 2 0 100 4h3v6h-6v-3a2 2 0 10-4 0v3H4v-6h3a2 2 0 100-4H4V4z',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19 12l2-1-2-4-2 1-2-1.5V4h-4.5L10 6.5 8 8 6 7l-2 4 2 1v2l-2 1 2 4 2-1 2 1.5V20h4.5l.5-2.5 2-1.5 2 1 2-4-2-1z',
  send: 'M12 19V5M5 12l7-7 7 7',
  stop: 'M7 7h10v10H7z',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12l5 5 9-10',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  folder: 'M3 6h6l2 2h10v11H3z',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  chip: 'M7 7h10v10H7zM9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
  pause: 'M8 5v14M16 5v14',
  menu: 'M4 7h16M4 12h16M4 17h16',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  wand: 'M4 20L16 8M14 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM19 11l.6 1.4L21 13l-1.4.6L19 15l-.6-1.4L17 13l1.4-.6z',
  refresh: 'M20 11a8 8 0 10-2.3 5.7M20 5v6h-6',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6'
};

export default function Icon({ name, size = 18, className = '', strokeWidth = 1.7 }) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name] || ''} />
    </svg>
  );
}

// Dilreet's mark: a heart ("dil") built from phulkari-style stitched diamonds.
export function Mark({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="mark">
      <path d="M16 28L4.5 16.5a6.5 6.5 0 019.2-9.2L16 9.6l2.3-2.3a6.5 6.5 0 019.2 9.2z" fill="var(--brand)" />
      <path d="M16 12l3 3-3 3-3-3zM10.5 12.5l2 2-2 2-2-2zM21.5 12.5l2 2-2 2-2-2zM16 19.5l2 2-2 2-2-2z" fill="var(--brand-2)" />
    </svg>
  );
}
