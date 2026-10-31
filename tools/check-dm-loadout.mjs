// Headless checks for the deathmatch loadout screen: it opens as the shop with every gun free, a click equips
// the gun now and for every respawn, and the 5v5 parts (credits, team) stay out of it.
//   node tools/check-dm-loadout.mjs     (needs playwright, like check-abilities.mjs)
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
await page.addInitScript(() => { try { localStorage.setItem('tapfire-settings-v1', JSON.stringify({ shadows: false, renderScale: 0.5, mode: 'dm' })); } catch { /* storage blocked */ } });
page.on('pageerror', e => errors.push(String(e)));
await page.goto(url, { timeout: 90000 });
await page.waitForFunction(() => window.__game, null, { timeout: 90000 });
await page.evaluate(() => window.__game.startMatch());
await page.waitForFunction(() => window.__game.game.state === 'playing' && !window.__game.game.mode, null, { timeout: 20000 });
await page.evaluate(() => { window.__game.frozen = true; document.getElementById('pause').hidden = true; }); // no pointer lock headless: the pause menu would sit on top

await check('B opens the shop as a free loadout screen with no economy or team', () => page.evaluate(() => {
  const h = window.__game;
  h.toggleBuy(true);
  const shop = document.getElementById('shop'), cards = [...shop.querySelectorAll('.scard.gun')];
  const free = cards.every(c => c.querySelector('.pr').textContent === 'FREE');
  const econ = getComputedStyle(shop.querySelector('.shop-econ')).display;
  const equipped = cards.filter(c => c.classList.contains('owned')).map(c => JSON.parse(c.dataset.item).id).sort();
  const want = [h.settings.loadout.primary, h.settings.loadout.secondary].sort();
  return { pass: !shop.hidden && cards.length === 19 && free && econ === 'none' && JSON.stringify(equipped) === JSON.stringify(want) && document.getElementById('shop-h').textContent === 'Loadout',
    open: !shop.hidden, guns: cards.length, free, econ, equipped };
}));

await check('Clicking a gun equips it now, keeps it for respawns and saves it', () => page.evaluate(() => {
  const h = window.__game, p = h.game.player;
  const el = document.querySelector('#shop .scard[data-item*="operator"]'), r = el.getBoundingClientRect();
  h.hud.cursor = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  h.clickBuy(0);
  const side = document.querySelector('.scard[data-item*="sheriff"]').getBoundingClientRect();
  h.hud.cursor = { x: side.x + side.width / 2, y: side.y + side.height / 2 };
  h.clickBuy(0);
  const marked = [...document.querySelectorAll('#shop .scard.owned.gun')].map(c => JSON.parse(c.dataset.item).id).sort();
  const panel = document.getElementById('shop-team').textContent;
  return { pass: p.inv.primary?.def.id === 'operator' && p.inv.secondary?.def.id === 'sheriff' && p.loadout.primary === 'operator' && h.settings.loadout.secondary === 'sheriff'
    && marked.join() === 'operator,sheriff' && /Operator/.test(panel) && /Sheriff/.test(panel),
    primary: p.inv.primary?.def.id, secondary: p.inv.secondary?.def.id, loadout: p.loadout, marked };
}));

await check('Close (B) shuts it', () => page.evaluate(() => {
  const h = window.__game;
  const c = document.getElementById('shop-close').getBoundingClientRect();
  h.hud.cursor = { x: c.x + 5, y: c.y + 5 };
  h.clickBuy(0);
  return { pass: document.getElementById('shop').hidden && !h.hud.buyOpen, hidden: document.getElementById('shop').hidden };
}));

console.log(errors.length ? `Page errors:\n${errors.join('\n')}` : 'No page errors');
console.log(failed ? `${failed} check(s) failed` : 'All checks passed');
await browser.close();
server.close();
process.exit(failed || errors.length ? 1 : 0);
