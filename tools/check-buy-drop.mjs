// Headless checks for buying over a gun: one carried over from an earlier round drops at your feet, one
// bought this round is sold back instead.
//   node tools/check-buy-drop.mjs     (needs playwright, like check-abilities.mjs)
// Exits with code 1 if any check fails.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };

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
const url = `http://localhost:${server.address().port}/index.html`;

const browser = await chromium.launch();
let failed = 0;
const errors = [];
const report = (name, r) => {
  const ok = r && r.pass;
  if (!ok) failed++;
  const { pass, ...rest } = r || {};
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(rest)}`);
};
const check = async (name, fn) => { try { report(name, await fn()); } catch (e) { report(name, { error: String(e).slice(0, 300) }); } };

const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
await page.addInitScript(() => { try { localStorage.setItem('tapfire-settings-v1', JSON.stringify({ shadows: false, renderScale: 0.5 })); } catch { /* storage blocked */ } });
page.on('pageerror', e => errors.push(String(e)));
await page.goto(url, { timeout: 90000 });
await page.waitForFunction(() => window.__game, null, { timeout: 90000 });
await page.evaluate(() => { Object.assign(window.__game.settings, { mode: 'rounds', map: 'divide', side: 'def' }); document.getElementById('play').click(); });
await page.click('#select .sel-card[data-id="vex"]');
await page.click('#sel-lock');
await page.waitForFunction(() => window.__game.game.mode && window.__game.game.state === 'playing', null, { timeout: 20000 });
await page.evaluate(() => { window.__game.frozen = true; }); // the checks below tick the match themselves

await check('Buying over a carried-over rifle drops it; buying over this round\'s rifle sells it back', () => page.evaluate(() => {
  const g = window.__game.game, m = g.mode, p = g.player;
  m.phase = 'buy'; m.phaseEnd = g.time + 30;
  m.boughtThisRound = new Map();
  p.inv.primary = null;
  p.give('vandal'); // carried over from last round
  p.credits = 9000;
  const drops0 = g.drops.length;
  const e1 = m.buy(p, { type: 'weapon', id: 'phantom' });
  const dropped = g.drops.slice(drops0).map(d => d.gun.def.id);
  const cr1 = p.credits;
  const e2 = m.buy(p, { type: 'weapon', id: 'operator' }); // over the phantom bought this round: refunded
  const dropped2 = g.drops.length - drops0;
  return { pass: !e1 && !e2 && dropped.join() === 'vandal' && cr1 === 9000 - 2900 && p.credits === 9000 - 4700 && dropped2 === 1 && p.inv.primary.def.id === 'operator', e1, e2, dropped, cr1, cr: p.credits, dropped2, now: p.inv.primary?.def.id };
}));

await check('Buying a sidearm drops the Classic', () => page.evaluate(() => {
  const g = window.__game.game, m = g.mode, p = g.player;
  m.boughtThisRound = new Map();
  p.inv.secondary = null; p.give('classic');
  const n = g.drops.length;
  const err = m.buy(p, { type: 'weapon', id: 'sheriff' });
  return { pass: !err && g.drops.length === n + 1 && g.drops.at(-1).gun.def.id === 'classic' && p.inv.secondary.def.id === 'sheriff', err };
}));

await check('Bots buying over a carried gun drop it too', () => page.evaluate(() => {
  const g = window.__game.game, m = g.mode, b = g.bots[0];
  m.boughtThisRound = new Map();
  b.inv.secondary = null; b.give('ghost'); b.credits = 2000;
  const n = g.drops.length;
  const err = m.buy(b, { type: 'weapon', id: 'sheriff' });
  return { pass: !err && g.drops.length === n + 1 && g.drops.at(-1).by === b && g.drops.at(-1).gun.def.id === 'ghost', err };
}));

if (errors.length) { failed++; console.log('Page errors:', errors.slice(0, 5)); }
await browser.close();
server.close();
console.log(failed ? `${failed} failed` : 'All checks passed');
process.exit(failed ? 1 : 0);
