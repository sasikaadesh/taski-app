// Quick visual check: launch Electron with Vite dev server, screenshot the default state.
import { _electron as electron } from 'playwright-core';
import { existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const ROOT      = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHOT_DIR  = resolve(ROOT, 'scripts', 'shots');
const ELECTRON  = resolve(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');

mkdirSync(SHOT_DIR, { recursive: true });

// Start vite dev server
console.log('Starting Vite dev server…');
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--port', '5173'], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: false,
});

let viteReady = false;
vite.stdout.on('data', d => {
  const s = d.toString();
  if (s.includes('localhost')) { viteReady = true; }
  process.stdout.write('[vite] ' + s);
});
vite.stderr.on('data', d => process.stderr.write('[vite] ' + d));

// Wait for Vite to be ready
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('Vite timeout')), 30_000);
  const check = setInterval(() => {
    if (viteReady) { clearInterval(check); clearTimeout(t); res(); }
  }, 200);
});
console.log('Vite ready. Launching Electron…');
await new Promise(r => setTimeout(r, 1000));

const app = await electron.launch({
  executablePath: ELECTRON,
  args: [ROOT],
  timeout: 30_000,
});

// Wait for the window to fully render (startup overlay + app load)
await new Promise(r => setTimeout(r, 10_000));

let page = app.windows().find(w => !w.url().startsWith('devtools://'));
if (!page) page = await app.firstWindow();

console.log('Windows:', app.windows().map(w => w.url()));

// Screenshot 1: default state (all panels collapsed)
const s1 = resolve(SHOT_DIR, '01-default.png');
await page.screenshot({ path: s1 });
console.log('screenshot:', s1);

// Screenshot 2: click the first + button (calendar expand)
const calClicked = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')];
  const plus = btns.find(b => b.textContent.trim() === '+' && b.getAttribute('aria-label')?.includes('Expand'));
  if (plus) { plus.click(); return plus.getAttribute('aria-label'); }
  // fallback: any + button
  const any = btns.find(b => b.textContent.trim() === '+');
  if (any) { any.click(); return 'clicked-generic-plus'; }
  return null;
});
console.log('Calendar expand:', calClicked);
await new Promise(r => setTimeout(r, 700));
const s2 = resolve(SHOT_DIR, '02-calendar-expanded.png');
await page.screenshot({ path: s2 });
console.log('screenshot:', s2);

// Screenshot 3: focus chat input (should expand chat)
await page.evaluate(() => {
  const inp = document.querySelector('input[placeholder]');
  if (inp) inp.focus();
});
await new Promise(r => setTimeout(r, 700));
const s3 = resolve(SHOT_DIR, '03-chat-expanded.png');
await page.screenshot({ path: s3 });
console.log('screenshot:', s3);

await app.close();
vite.kill();
console.log('Done. Check scripts/shots/');
process.exit(0);
