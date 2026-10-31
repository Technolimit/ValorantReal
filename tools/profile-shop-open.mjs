// Times opening the buy menu in a live offline match: the first open (which also draws the gun icons) and later
// ones, in 5v5 and deathmatch, with the style and layout the open causes.
//   node tools/profile-shop-open.mjs [rounds|dm]   (needs playwright, like check-abilities.mjs)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const MODE = process.argv[2] === 'dm' ? 'dm' : 'rounds';

let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  console.error('Playwright is missing: npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  try { const body = await readFile(join(ROOT, path || 'index.html')); res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, r));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 } });
await ctx.addInitScript((mode) => { try { localStorage.setItem('tapfire-settings-v1', JSON.stringify({ shadows: false, renderScale: 0.5, mode })); } catch { /* storage blocked */ } }, MODE);
const page = await ctx.newPage();
page.on('pageerror', e => console.error(String(e.stack || e).slice(0, 400)));
await page.goto(`http://localhost:${server.address().port}/index.html`, { timeout: 90000 });
await page.waitForFunction(() => window.__game, null, { timeout: 90000 });
if (MODE === 'dm') await page.evaluate(() => window.__game.startMatch());
else await page.evaluate(() => { Object.assign(window.__game.settings, { mode: 'rounds', map: 'divide', side: 'atk' }); document.getElementById('play').click(); });
if (MODE === 'rounds') { await page.click('#select .sel-card[data-id="vex"]'); await page.click('#sel-lock'); }
await page.waitForFunction(() => window.__game.game.state === 'playing', null, { timeout: 20000 });
await new Promise(r => setTimeout(r, 1500)); // let the match settle (idle work, first frames)
// How many gun icons the background had drawn by the time B is pressed.
const ready = await page.evaluate(async () => Object.keys((await import('./js/gunicons.js')).gunIcons([])).length);
const out = await page.evaluate(async () => {
  const h = window.__game, shop = document.getElementById('shop');
  h.frozen = true;
  const raf = () => new Promise(r => requestAnimationFrame(() => r()));
  const res = [];
  for (let i = 0; i < 4; i++) {
    await raf();
    const t0 = performance.now();
    h.toggleBuy(true);
    const t1 = performance.now();
    void shop.offsetHeight; // style + layout
    const t2 = performance.now();
    h.rhud.update(1 / 60); h.rhud.updateHover(h.hud.cursor);
    const t3 = performance.now();
    res.push({ open: i + 1, icons: Object.keys(h.rhud.icons || {}).length, toggleMs: +(t1 - t0).toFixed(1), layoutMs: +(t2 - t1).toFixed(1), firstUpdateMs: +(t3 - t2).toFixed(1), totalMs: +(t3 - t0).toFixed(1) });
    await raf(); await raf();
    h.toggleBuy(false);
    await raf();
  }
  return res;
});
console.log(MODE, 'icons ready before the first open:', ready);
for (const o of out) console.log(JSON.stringify(o));
await browser.close();
server.close();
