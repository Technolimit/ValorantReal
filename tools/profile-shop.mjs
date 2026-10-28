// Measures the buy menu's cost in a live offline 5v5: frame times with the shop closed and open, and how long
// one rebuild of the shop takes and how often it happens.
//   node tools/profile-shop.mjs [seconds]   (needs playwright, like check-abilities.mjs)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const SECS = +process.argv[2] || 5;
// The page isn't pointer-locked here, so the game is paused: the loop below moves the clock itself, 60 Hz.

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
await ctx.addInitScript(() => { try { localStorage.setItem('tapfire-settings-v1', JSON.stringify({ shadows: false, renderScale: 0.5 })); } catch { /* storage blocked */ } });
const page = await ctx.newPage();
page.on('pageerror', e => console.error(String(e.stack || e).slice(0, 400)));
await page.goto(`http://localhost:${server.address().port}/index.html`, { timeout: 90000 });
await page.waitForFunction(() => window.__game, null, { timeout: 90000 });
await page.evaluate(() => { Object.assign(window.__game.settings, { mode: 'rounds', map: 'divide', side: 'atk' }); document.getElementById('play').click(); });
await page.click('#select .sel-card[data-id="vex"]');
await page.click('#sel-lock');
await page.waitForFunction(() => window.__game.game.mode && window.__game.game.state === 'playing', null, { timeout: 20000 });

// The page isn't pointer-locked, so the game is paused and headless WebGL is far too slow to time real frames.
// Instead this steps the clock at 60 Hz and times the shop's own per-frame work (rhud.update and the hover
// check), with the style and layout it causes, and lets one bot spend credits each second as bots do.
const out = await page.evaluate(async (secs) => {
  const { rhud, game } = window.__game, m = game.mode, p = game.player;
  window.__game.frozen = true;
  m.phaseEnd = game.time + secs + 5;
  const shop = document.getElementById('shop');
  const run = (open) => {
    rhud.toggleShop(open);
    let builds = 0;
    const orig = rhud.renderShop;
    rhud.renderShop = function () { const k = this.shopKey; orig.call(this); if (this.shopKey !== k) builds++; };
    const mate = game.combatants.find(c => c.team === p.team && c !== p);
    const ms = [];
    for (let f = 0; f < secs * 60; f++) {
      game.time += 1 / 60;
      if (f % 60 === 30) mate.credits -= 50;
      const t = performance.now();
      rhud.update(1 / 60);
      if (open) rhud.updateHover({ x: 300 + f % 400, y: 300 });
      void shop.offsetHeight;
      ms.push(performance.now() - t);
    }
    rhud.renderShop = orig;
    ms.sort((a, b) => a - b);
    const q = (x) => +ms[Math.floor(x * (ms.length - 1))].toFixed(2);
    return { shop: open ? 'open' : 'closed', frames: ms.length, totalMs: +ms.reduce((a, b) => a + b, 0).toFixed(1), p50: q(0.5), p95: q(0.95), max: q(1), rebuilds: builds };
  };
  run(true); // warm up (gun art, first layout)
  return [run(false), run(true)];
}, SECS);
for (const r of out) console.log(JSON.stringify(r));
await browser.close();
server.close();
