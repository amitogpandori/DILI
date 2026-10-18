import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Strict Content-Security-Policy for the packaged app only (the dev server needs inline scripts).
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: dilreet-media:",
  "media-src 'self' blob: dilreet-media:",
  "frame-src dilreet-feature:",
  "connect-src 'self'",
  "font-src 'self' data:"
].join('; ');

const cspPlugin = {
  name: 'dilreet-csp',
  apply: 'build',
  transformIndexHtml(html) {
    return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}">`);
  }
};

export default defineConfig({
  base: './',
  plugins: [react(), cspPlugin],
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true }
});
