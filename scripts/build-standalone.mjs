import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url);
let html = await readFile(new URL('index.html', dist), 'utf8');
const cssPath = html.match(/href="(\.\/assets\/[^"]+\.css)"/)?.[1];
const jsPath = html.match(/src="(\.\/assets\/[^"]+\.js)"/)?.[1];

if (!cssPath || !jsPath) throw new Error('Built CSS or JavaScript asset was not found.');

const css = await readFile(join(dist.pathname, cssPath), 'utf8');
const js = await readFile(join(dist.pathname, jsPath), 'utf8');
const encodedJs = Buffer.from(js).toString('base64');

html = html
  .replace(/<link rel="stylesheet"[^>]+>/, `<style>${css}</style>`)
  .replace(/<script type="module"[^>]+><\/script>/, '')
  .replace('</body>', `<script>window.__PATHCODE_STANDALONE__=true;eval(new TextDecoder().decode(Uint8Array.from(atob('${encodedJs}'), char => char.charCodeAt(0))))</script></body>`)
  .replace(/\s*<link rel="manifest"[^>]+>/, '')
  .replace(/\s*<link rel="apple-touch-icon"[^>]+>/, '');

await writeFile(new URL('pathcode-3d.html', dist), html);
