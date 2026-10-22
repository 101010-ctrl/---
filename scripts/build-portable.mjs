import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { build as viteBuild } from 'vite';

const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
const outputPath = new URL('outputs/pathcode-3d.html', root);
const distStandalonePath = new URL('dist/pathcode-3d.html', root);

await viteBuild({
  root: root.pathname,
  base: './',
  logLevel: 'silent'
});

let html = await readFile(new URL('index.html', dist), 'utf8');
const cssPath = html.match(/href="(\.\/assets\/[^"]+\.css)"/)?.[1];
const jsPath = html.match(/src="(\.\/assets\/[^"]+\.js)"/)?.[1];

if (!cssPath || !jsPath) throw new Error('Built CSS or JavaScript asset was not found.');

const [css, js, blockly] = await Promise.all([
  readFile(join(dist.pathname, cssPath), 'utf8'),
  readFile(join(dist.pathname, jsPath), 'utf8'),
  readFile(new URL('vendor/blockly.min.js', root), 'utf8')
]);

const encodedJs = Buffer.from(js).toString('base64');

html = html
  .replace(/<link rel="stylesheet"[^>]+>/, `<style>${css}</style>`)
  .replace(/\s*<script src="\.\/vendor\/blockly\.min\.js"><\/script>/, '')
  .replace(/<script type="module"[^>]+><\/script>/, '')
  .replace('</head>', `    <script>${blockly}</script>\n  </head>`)
  .replace('</body>', `<script>eval(new TextDecoder().decode(Uint8Array.from(atob('${encodedJs}'), char => char.charCodeAt(0))))</script></body>`)
  .replace(/\s*<link rel="manifest"[^>]+>/, '')
  .replace(/\s*<link rel="icon"[^>]+>/, '')
  .replace(/\s*<link rel="apple-touch-icon"[^>]+>/, '');

await mkdir(new URL('outputs/', root), { recursive: true });
await writeFile(outputPath, html);
await writeFile(distStandalonePath, html);

try {
  await copyFile(new URL('public/app-icon.svg', root), new URL('dist/app-icon.svg', root));
} catch {}
