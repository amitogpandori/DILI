// Tiny, safe Markdown → HTML renderer for chat replies.
// Everything is HTML-escaped first, so model output can never inject markup.

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(s) {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}

function table(lines) {
  const row = (l) => l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  const head = row(lines[0]);
  const body = lines.slice(2).map(row);
  return `<div class="md-table"><table><thead><tr>${head.map((h) => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${body
    .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table></div>`;
}

export function renderMarkdown(src) {
  const lines = esc(src || '').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    const fence = line.match(/^```\s*([\w+-]*)/);
    if (fence) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<div class="md-code"><div class="md-code-bar"><span>${fence[1] || 'code'}</span><button type="button" data-copy>Copy</button></div><pre><code>${buf.join('\n')}</code></pre></div>`);
      continue;
    }

    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const buf = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) buf.push(lines[i++].trim());
      out.push(table(buf));
      continue;
    }

    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) {
      const lvl = Math.min(h[1].length + 1, 5);
      out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`);
      i++;
      continue;
    }

    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, ''));
        i++;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((it) => `<li>${inline(it)}</li>`).join('')}</${tag}>`);
      continue;
    }

    if (/^&gt;\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^&gt;\s?/.test(lines[i])) buf.push(lines[i++].replace(/^&gt;\s?/, ''));
      out.push(`<blockquote>${inline(buf.join(' '))}</blockquote>`);
      continue;
    }

    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(```|#{1,4}\s|\s*([-*+]|\d+[.)])\s+|&gt;)/.test(lines[i])) para.push(lines[i++]);
    if (!para.length) para.push(lines[i++]);
    out.push(`<p>${inline(para.join('<br>'))}</p>`);
  }
  return out.join('');
}
