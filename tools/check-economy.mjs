// Headless checks for the 5v5 buy menu's economy and ultimate orbs: the shop's layout and numbers (credits,
// next-round minimum, loss bonus, team credits), weapon requests (asking, a bot filling it, buying one for a
// teammate, picking it up), orbs giving a point, and requests between two people online.
//   node tools/check-economy.mjs [--offline] [--shots <dir>]   (needs playwright, like check-abilities.mjs)
// --shots saves a screenshot of the buy menu and of an orb. Exits with code 1 if any check fails.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const args = process.argv.slice(2);
const OFFLINE = args.includes('--offline');
const SHOTS = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;

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
if (SHOTS) await mkdir(SHOTS, { recursive: true });

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

const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 } });
await ctx.addInitScript(() => { try { localStorage.setItem('tapfire-settings-v1', JSON.stringify({ shadows: false, renderScale: 0.5 })); } catch { /* storage blocked */ } });
async function open() {
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(String(e.stack || e).slice(0, 400)));
  await p.goto(url, { timeout: 90000 });
  await p.waitForFunction(() => window.__game, null, { timeout: 90000 });
  return p;
}

// ---- offline 5v5 on Divide ----
const page = await open();
await page.evaluate(() => { Object.assign(window.__game.settings, { mode: 'rounds', map: 'divide', side: 'atk' }); document.getElementById('play').click(); });
await page.click('#select .sel-card[data-id="vex"]');
await page.click('#sel-lock');
await page.waitForFunction(() => window.__game.game.mode && window.__game.game.state === 'playing', null, { timeout: 20000 });
await page.evaluate(() => { window.__game.frozen = true; }); // the checks below tick the match themselves

await check('The shop lays out four gun columns, shields, abilities and the team, with gun art from the models', () => page.evaluate(() => {
  const g = window.__game.game, m = g.mode, p = g.player;
  const rhud = window.__game.rhud;
  rhud.toggleShop(true);
  const cols = document.querySelectorAll('#shop-grid .scol').length;
  const guns = document.querySelectorAll('#shop-grid .scard.gun').length;
  const imgs = [...document.querySelectorAll('#shop-grid .scard.gun img')].filter(i => i.src.startsWith('data:image/png')).length;
  const gear = document.querySelectorAll('#shop-gear .scard').length;
  const mates = document.querySelectorAll('#shop-team .tmate').length;
  const total = g.combatants.filter(c => c.team === p.team).reduce((a, c) => a + c.credits, 0);
  const shownTotal = document.querySelector('#shop-team h3 span').textContent.replace(/\D/g, '');
  return { pass: cols === 4 && guns >= 17 && imgs === guns && gear === 7 && mates === 5 && +shownTotal === total, cols, guns, imgs, gear, mates, total, shownTotal, round: m.round };
}));

await check('Credits, next-round minimum and the loss bonus ladder follow the loss streak', () => page.evaluate(() => {
  const g = window.__game.game, m = g.mode, p = g.player, rhud = window.__game.rhud;
  m.round = 3; m.lossStreak[p.team] = 1; p.credits = 1234;
  rhud.shopKey = ''; rhud.renderShop();
  const min = document.getElementById('shop-min').textContent.replace(/\D/g, '');
  const cr = document.getElementById('shop-credits').textContent.replace(/\D/g, '');
  const on = document.querySelectorAll('#shop-loss i.on').length, next = [...document.querySelectorAll('#shop-loss i')].findIndex(i => i.classList.contains('next'));
  m.lossStreak[p.team] = 3;
  const capped = m.minNextRound(p);
  return { pass: +cr === 1234 && +min === 1234 + 2400 && on === 1 && next === 1 && capped === 1234 + 2900, cr, min, on, next, capped };
}));

await check('Clicking a gun you can\'t afford requests it; a bot teammate buys it and it drops at your feet', () => page.evaluate(() => {
  const g = window.__game.game, m = g.mode, p = g.player, rhud = window.__game.rhud;
  m.phase = 'buy'; m.phaseEnd = g.time + 30; m.requests = new Map();
  p.inv.primary = null; p.equip('secondary', g.time, true); p.credits = 500;
  const mates = g.bots.filter(b => b.team === p.team);
  for (const b of mates) { b.credits = 0; m.requests.delete(b); }
  const rich = mates[0]; rich.credits = 6000; rich.give('phantom');
  rhud.shopKey = ''; rhud.renderShop();
  const el = document.querySelector('#shop-grid .scard[data-item*="vandal"]');
  const asItem = JSON.parse(el.dataset.item).type;
  const err = rhud.shopClick(el, 0);
  const req = m.requests.get(p)?.id;
  const shown = !!document.querySelector('#shop-team .tmate.me .treq');
  let gift = null;
  const off = g.on('gifted', (e) => { gift = e; });
  for (let i = 0; i < 128 * 3; i++) g.tick(); // a bot fills it, then the walk-over pickup
  off?.();
  return { pass: asItem === 'request' && !err && req === 'vandal' && shown && gift?.from === rich && gift.to === p && rich.credits === 6000 - 2900 && p.inv.primary?.def.id === 'vandal' && !m.requests.has(p), asItem, err, req, shown, gift: gift && [gift.from.name, gift.to === p, gift.id], richCr: rich.credits, primary: p.inv.primary?.def.id };
}));

await check('You can buy a teammate\'s request from the team panel; nobody else grabs it first', () => page.evaluate(() => {
  const g = window.__game.game, m = g.mode, p = g.player, rhud = window.__game.rhud;
  m.phase = 'buy'; m.phaseEnd = g.time + 30; m.requests = new Map();
  const mates = g.bots.filter(b => b.team === p.team);
  for (const b of mates) b.credits = 0;
  const [asker, other] = mates;
  for (const c of [asker, other]) { c.inv.primary = null; c.equip('secondary', g.time, true); }
  other.pos = [...asker.pos]; // standing right on top of the drop
  m.request(asker, 'operator');
  p.credits = 5000;
  rhud.shopKey = ''; rhud.renderShop();
  const btn = document.querySelector('#shop-team .scard.treq:not(.mine)');
  const err = rhud.shopClick(btn, 0);
  for (let i = 0; i < 128; i++) { asker.input.fwd = asker.input.side = 0; other.pos = [...asker.pos]; g.tick(); }
  return { pass: !!btn && !err && p.credits === 300 && asker.inv.primary?.def.id === 'operator' && !other.inv.primary, btn: !!btn, err, cr: p.credits, asker: asker.inv.primary?.def.id, other: other.inv.primary?.def.id || null };
}));

await check('A bot that can\'t afford a rifle on a full-buy round asks for one, and teammates fill it', () => page.evaluate(() => {
  const g = window.__game.game, m = g.mode;
  let asked = 0, filled = 0;
  for (let n = 0; n < 12; n++) {
    m.round = 4; m.requests = new Map(); m.boughtThisRound = new Map();
    const team = g.bots.filter(b => b.team === 1);
    team.forEach((b, i) => { b.inv.primary = null; b.equip('secondary', g.time, true); b.armor = 0; b.credits = i === 0 ? 2000 : 9000; });
    m.buyCall = [m.teamBuyCall(0), m.teamBuyCall(1)];
    m.phase = 'buy'; m.phaseEnd = g.time + 30;
    for (const b of team) m.botBuy(b);
    const poor = team[0];
    if (m.requests.has(poor)) asked++;
    m.botGifts(true);
    if (g.drops.some(d => d.for === poor)) filled++;
    g.drops = [];
  }
  return { pass: asked >= 6 && filled === asked, asked, filled, call: m.buyCall[1] };
}));

await check('Holding F on an ultimate orb for 3 s gives one ultimate point and hides the orb', () => page.evaluate(() => {
  const g = window.__game.game, m = g.mode, p = g.player;
  m.resetOrbs();
  const o = m.orbs[0];
  m.phase = 'live'; m.phaseEnd = g.time + 100;
  m.setBarriers(false);
  p.pos = [o.pos[0], o.pos[1], o.pos[2]]; p.prevPos = [...p.pos]; p.vel = [0, 0, 0];
  p.kit.ultPoints = 0;
  // Everyone else hides and stands still so the round can't end and nobody shares the orb.
  const hide = () => { for (const b of g.bots) { b.st.hiddenUntil = g.time + 5; b.hp = 9999; b.input.fwd = b.input.side = 0; b.input.use = false; if (b.brain) b.brain.mode = 'static'; } };
  const before = p.kit.ultPoints;
  let mid = 0;
  for (let i = 0; i < 128 * 3.3; i++) { hide(); p.input.use = true; g.tick(); if (i === 192) mid = o.prog; }
  p.input.use = false;
  return { pass: o.taken && p.kit.ultPoints === before + 1 && mid > 1 && mid < 2, taken: o.taken, ult: p.kit.ultPoints, mid, orbs: m.orbs.length };
}));

if (SHOTS) {
  await page.evaluate(() => {
    const g = window.__game.game, m = g.mode, p = g.player, rhud = window.__game.rhud;
    m.phase = 'buy'; m.phaseEnd = g.time + 23; m.round = 5; m.lossStreak[p.team] = 2; p.credits = 3350; p.inv.primary = null; p.equip('secondary', g.time, true);
    m.requests = new Map();
    const mate = g.bots.find(b => b.team === p.team); mate.credits = 1500; m.request(mate, 'vandal');
    rhud.toggleShop(true);
    const el = document.querySelector('#shop-grid .scard[data-item*="phantom"]'); rhud.hovered = el; rhud.hover(el.dataset.item, true);
    window.__game.frozen = false;
    document.getElementById('pause').hidden = true; // headless: the pointer isn't locked
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(SHOTS, 'shop.png') });
  await page.evaluate(() => {
    const g = window.__game.game, m = g.mode, p = g.player, rhud = window.__game.rhud;
    rhud.toggleShop(false);
    window.__game.frozen = true; // hold the capture still for the picture
    m.phase = 'live'; m.setBarriers(false);
    m.resetOrbs();
    const o = m.orbs[1];
    // Stand a few steps away on an open side, facing it.
    const eye = 1.5, sees = ([dx, dz]) => g.world.lineOfSight([o.pos[0] + dx, o.pos[1] + eye, o.pos[2] + dz], [o.pos[0], o.pos[1] + 1, o.pos[2]]);
    const [dx, dz] = [[2.6, 0], [-2.6, 0], [0, 2.6], [0, -2.6], [1.8, 1.8], [-1.8, -1.8]].find(sees) || [2.6, 0];
    p.pos = [o.pos[0] + dx, o.pos[1], o.pos[2] + dz]; p.prevPos = [...p.pos]; p.prevEyeY = p.pos[1] + p.eyeOff; p.yaw = Math.atan2(dx, dz); p.pitch = -0.2;
    o.prog = 1.6; o.by = p;
    document.getElementById('pause').hidden = true;
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => { window.__game.frozen = true; });
  await page.screenshot({ path: join(SHOTS, 'orb.png') });
}
await page.close();

// ---- online: a host and two people; Dee is on the host's team ----
if (!OFFLINE) {
  const form = (o) => {
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
    set('net-transport', 'local'); set('net-join-transport', 'local'); set('net-room', 'ECON'); set('net-code', 'ECON'); set('net-mode', 'rounds'); set('net-name', o.name);
    Object.assign(window.__game.settings, { map: 'divide' });
  };
  const H = await open(), C = await open(), D = await open();
  await H.evaluate(form, { name: 'Host' }); await C.evaluate(form, { name: 'Cee' }); await D.evaluate(form, { name: 'Dee' });
  await H.evaluate(() => window.__game.hostOnline());
  await C.evaluate(() => window.__game.joinOnline());
  await C.waitForFunction(() => window.__game.net.role === 'lobby', null, { timeout: 10000 });
  await D.evaluate(() => window.__game.joinOnline());
  await D.waitForFunction(() => window.__game.net.role === 'lobby', null, { timeout: 10000 });
  await H.evaluate(() => window.__game.net.lobbyLock('zephyr'));
  await C.evaluate(() => window.__game.net.lobbyLock('cinder'));
  await D.evaluate(() => window.__game.net.lobbyLock('umbra'));
  await H.evaluate(() => window.__game.net.lobbyStart());
  await D.waitForFunction(() => window.__game.net.role === 'client' && window.__game.game.mode?.round >= 1, null, { timeout: 30000 });
  await C.waitForFunction(() => window.__game.net.role === 'client' && window.__game.game.mode?.round >= 1, null, { timeout: 30000 });
  await H.waitForTimeout(1500);

  await check('Online: a joiner\'s request reaches the host and teammates, and the host buying it puts the gun in their hands', async () => {
    // A long buy phase and enough credits for the host; nobody else on the team can pay for it.
    await H.evaluate(() => {
      const g = window.__game.game, m = g.mode;
      m.phaseEnd = g.time + 60;
      g.player.credits = 5000;
      for (const b of g.bots) if (b.team === g.player.team) b.credits = 0;
    });
    const sameTeam = await H.evaluate(() => { const g = window.__game.game; const d = g.combatants.find(c => c.name === 'Dee'); return d && d.team === g.player.team; });
    await D.evaluate(() => { const m = window.__game.game.mode; const me = window.__game.game.player; me.inv.primary = null; me.equip('secondary', window.__game.game.time, true); m.buy(window.__game.game.player, { type: 'request', id: 'phantom' }); });
    await H.waitForTimeout(800);
    const onHost = await H.evaluate(() => { const g = window.__game.game, m = g.mode; const d = g.combatants.find(c => c.name === 'Dee'); return m.requests.get(d)?.id || null; });
        const deeSees = await D.evaluate(() => window.__game.game.mode.requests.get(window.__game.game.player)?.id || null);
    // The host opens the shop and clicks Dee's request.
    const hostClick = await H.evaluate(() => {
      const rhud = window.__game.rhud; rhud.toggleShop(true);
      const btn = [...document.querySelectorAll('#shop-team .scard.treq')].find(b => !b.classList.contains('mine'));
      const err = btn ? rhud.shopClick(btn, 0) : 'no button';
      rhud.toggleShop(false);
      return { err, cr: window.__game.game.player.credits };
    });
    await D.waitForFunction(() => window.__game.game.player.inv.primary?.def.id === 'phantom', null, { timeout: 6000 }).catch(() => {});
    const deeGun = await D.evaluate(() => window.__game.game.player.inv.primary?.def.id || null);
    await H.waitForTimeout(600);
    const left = await H.evaluate(() => window.__game.game.drops.filter(d => d.gun.def.id === 'phantom').length);
    return { pass: sameTeam && onHost === 'phantom' && deeSees === 'phantom' && !hostClick.err && hostClick.cr === 2100 && deeGun === 'phantom' && left === 0, sameTeam, onHost, deeSees, hostClick, deeGun, left };
  });

  await check('Online: joiners see the loss streak and teammates\' credits in their shop', async () => {
    await H.evaluate(() => { const g = window.__game.game; g.mode.lossStreak = [2, 0]; });
    await H.waitForTimeout(600);
    const r = await D.evaluate(() => {
      const g = window.__game.game, m = g.mode, p = g.player, rhud = window.__game.rhud;
      rhud.toggleShop(true);
      const on = document.querySelectorAll('#shop-loss i.on').length;
      const credits = [...document.querySelectorAll('#shop-team .tcr')].map(e => +e.textContent.replace(/\D/g, ''));
      const mates = g.combatants.filter(c => c.team === p.team).length;
      rhud.toggleShop(false);
      return { on, credits, mates, ls: m.lossStreak, team: p.team };
    });
    const hostTeamOfDee = await H.evaluate(() => window.__game.game.combatants.find(c => c.name === 'Dee').team);
    const expectOn = hostTeamOfDee === 0 ? 2 : 0;
    return { pass: r.on === expectOn && r.mates === 5 && r.credits.length === 5 && r.credits.includes(2100), ...r, expectOn };
  });
  for (const p of [H, C, D]) await p.close();
}

if (errors.length) { failed++; console.log('Page errors:', errors.slice(0, 5)); }
await browser.close();
server.close();
console.log(failed ? `${failed} failed` : 'All checks passed');
process.exit(failed ? 1 : 0);
