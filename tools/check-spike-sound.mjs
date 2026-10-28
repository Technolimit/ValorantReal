// Headless checks for the plant and defuse sounds: a bot planting and a bot defusing play the start, progress,
// halfway and finished cues from where it happens, your own plant plays up close, letting go plays the cancel
// blip, and online a client hears a bot's plant on the host the same way.
//   node tools/check-spike-sound.mjs [--offline]     (needs playwright, like check-spike.mjs)
// Exits with code 1 if any check fails.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const OFFLINE = process.argv.includes('--offline');

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

const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 } });
await ctx.addInitScript(() => { try { localStorage.setItem('tapfire-settings-v1', JSON.stringify({ shadows: false, renderScale: 0.5 })); } catch { /* storage blocked */ } });
async function open() {
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(String(e.stack || e).slice(0, 400)));
  await p.goto(url, { timeout: 90000 });
  await p.waitForFunction(() => window.__game, null, { timeout: 90000 });
  return p;
}

// Records every plant / defuse cue as { kind, pos, frac } (pos null = played up close).
const record = () => {
  const h = window.__game;
  h.sound.init();
  window.__cues = [];
  const orig = h.sound.spikeCue.bind(h.sound);
  h.sound.spikeCue = (kind, pos, frac) => { window.__cues.push({ kind, pos: pos && [...pos], frac }); return orig(kind, pos, frac); };
};
// Set up a scripted round on the given page: everyone holds still (no thinking), nobody can die, the buy phase
// is over, and returns a standing spot on site A.
const stage = () => {
  const g = window.__game.game, m = g.mode;
  for (const c of g.combatants) { c.hp = 9999; if (c.brain) c.brain.think = () => {}; c.input.fwd = c.input.side = 0; c.input.use = false; }
  m.phase = 'live'; m.liveAt = g.time; m.phaseEnd = g.time + 100; m.setBarriers(false);
  const name = Object.keys(g.map.sites)[0], [cx, cz] = m.plantCells(name)[0], c = g.map.cellCenter(cx, cz);
  window.__site = [c.x, g.map.heights[cz][cx], c.z];
};
const summary = (cues) => {
  const kinds = cues.map(c => c.kind), count = (k) => kinds.filter(x => x === k).length;
  const fr = cues.filter(c => c.kind.endsWith('Tick')).map(c => c.frac);
  return { kinds: [...new Set(kinds)], plantTicks: count('plantTick'), defuseTicks: count('defuseTick'), rising: fr.every((f, i) => !i || f >= fr[i - 1]), placed: cues.every(c => c.pos) };
};

// ---- offline 5v5 on Divide: the loop is frozen and the checks tick the match, with a frame between batches ----
const page = await open();
await page.evaluate(() => { Object.assign(window.__game.settings, { mode: 'rounds', map: 'divide', side: 'atk' }); document.getElementById('play').click(); });
await page.click('#select .sel-card[data-id="vex"]');
await page.click('#sel-lock');
await page.waitForFunction(() => window.__game.game.mode && window.__game.game.state === 'playing', null, { timeout: 20000 });
await page.evaluate(() => { window.__game.frozen = true; });
await page.evaluate(record);
await page.evaluate(stage);

// Tick `secs` of game time while `hold` (a combatant name, or 'you') holds Use, then let one frame render.
const run = async (secs, hold) => {
  for (let t = 0; t < secs; t += 0.1) {
    await page.evaluate(({ hold }) => {
      const g = window.__game.game;
      const who = hold === 'you' ? g.player : g.combatants.find(c => c.name === hold);
      const end = g.time + 0.1;
      while (g.time < end) { if (who) { who.input.use = true; who.grounded = true; } g.tick(); }
      if (who) who.input.use = false;
    }, { hold });
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r())));
  }
};
const setup = (who) => page.evaluate((who) => {
  const g = window.__game.game, m = g.mode, sp = m.spike;
  window.__cues.length = 0;
  const c = who === 'you' ? g.player : g.combatants.find(x => x.isBot && m.side(x) === 'atk');
  c.pos = [...window.__site];
  sp.state = 'carried'; sp.carrier = c; sp.pos = null; sp.plantProg = 0;
  return c === g.player ? 'you' : c.name;
}, who);

await check('A bot planting: start, rising keypad ticks and the clamp, all from where it stands', async () => {
  const bot = await setup('bot');
  await run(4.5, bot);
  const r = await page.evaluate(() => ({ cues: window.__cues, state: window.__game.game.mode.spike.state }));
  const s = summary(r.cues);
  return { pass: r.state === 'planted' && r.cues[0]?.kind === 'plantStart' && r.cues.at(-1)?.kind === 'plantDone' && s.plantTicks >= 8 && s.rising && s.placed, bot, state: r.state, ...s };
});

await check('A bot defusing: start, ticks, the halfway chirp and the power-down, from the spike', async () => {
  const bot = await page.evaluate(() => {
    const g = window.__game.game, m = g.mode, sp = m.spike;
    window.__cues.length = 0;
    const c = g.combatants.find(x => x.isBot && m.side(x) === 'def');
    c.pos = [sp.pos[0] + 0.5, sp.pos[1], sp.pos[2]];
    return c.name;
  });
  await run(7.5, bot);
  const r = await page.evaluate(() => ({ cues: window.__cues, state: window.__game.game.mode.spike.state, spike: window.__game.game.mode.spike.pos }));
  const s = summary(r.cues);
  const atSpike = r.cues.filter(c => c.kind !== 'cancel').every(c => c.pos && Math.hypot(c.pos[0] - r.spike[0], c.pos[2] - r.spike[2]) < 0.01);
  return { pass: r.state === 'defused' && r.cues[0]?.kind === 'defuseStart' && s.kinds.includes('defuseHalf') && r.cues.at(-1)?.kind === 'defuseDone' && s.defuseTicks >= 15 && s.rising && atSpike, bot, state: r.state, atSpike, ...s };
});

await check('Your own plant plays up close; letting go early plays the cancel blip', async () => {
  await page.evaluate(() => window.__game.game.mode.startRound());
  await page.evaluate(stage);
  await setup('you');
  await run(1.5, 'you');
  await run(0.3, null);
  const r = await page.evaluate(() => ({ cues: window.__cues, prog: window.__game.game.mode.spike.plantProg }));
  const kinds = r.cues.map(c => c.kind);
  return { pass: kinds[0] === 'plantStart' && kinds.at(-1) === 'cancel' && kinds.includes('plantTick') && r.cues.every(c => c.pos === null) && r.prog === 0, kinds };
});
await page.close();

// ---- online: a client hears a bot planting on the host ----
if (!OFFLINE) {
  const form = (o) => {
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
    set('net-transport', 'local'); set('net-join-transport', 'local'); set('net-room', 'SPIKE'); set('net-code', 'SPIKE'); set('net-mode', 'rounds'); set('net-name', o.name);
    Object.assign(window.__game.settings, { map: 'divide' });
  };
  const H = await open(), C = await open();
  await H.evaluate(form, { name: 'Host' }); await C.evaluate(form, { name: 'Cee' });
  await H.evaluate(() => window.__game.hostOnline());
  await C.evaluate(() => window.__game.joinOnline());
  await C.waitForFunction(() => window.__game.net.role === 'lobby', null, { timeout: 10000 });
  await H.evaluate(() => window.__game.net.lobbyLock('zephyr'));
  await C.evaluate(() => window.__game.net.lobbyLock('cinder'));
  await H.evaluate(() => window.__game.net.lobbyStart());
  await C.waitForFunction(() => window.__game.net.role === 'client' && window.__game.game.mode?.round >= 1, null, { timeout: 30000 });
  await H.waitForTimeout(1000);

  await check('Online: a client hears a host bot plant and defuse, placed at the spike', async () => {
    await C.evaluate(record);
    await H.evaluate(stage);
    await H.waitForTimeout(300);
    const bot = await H.evaluate(() => {
      const g = window.__game.game, m = g.mode, sp = m.spike;
      const c = g.combatants.find(x => x.isBot && m.side(x) === 'atk');
      c.pos = [...window.__site];
      sp.state = 'carried'; sp.carrier = c; sp.pos = null; sp.plantProg = 0;
      window.__holder = setInterval(() => { c.input.use = true; c.grounded = true; c.pos = [...window.__site]; }, 5);
      return c.name;
    });
    await H.waitForFunction(() => window.__game.game.mode.spike.state === 'planted', null, { timeout: 20000 });
    await H.evaluate(() => {
      clearInterval(window.__holder);
      const g = window.__game.game, m = g.mode, sp = m.spike;
      for (const c of g.combatants) c.input.use = false;
      const d = g.combatants.find(x => x.isBot && m.side(x) === 'def');
      window.__holder = setInterval(() => { d.input.use = true; d.pos = [sp.pos[0] + 0.5, sp.pos[1], sp.pos[2]]; }, 5);
    });
    await H.waitForFunction(() => window.__game.game.mode.spike.state === 'defused', null, { timeout: 30000 });
    await H.evaluate(() => clearInterval(window.__holder));
    await C.waitForTimeout(800);
    const cues = await C.evaluate(() => window.__cues);
    const s = summary(cues), kinds = cues.map(c => c.kind);
    const order = ['plantStart', 'plantDone', 'defuseStart', 'defuseHalf', 'defuseDone'].map(k => kinds.indexOf(k));
    return { pass: order.every((i, n) => i >= 0 && (!n || i > order[n - 1])) && s.plantTicks >= 8 && s.defuseTicks >= 15 && s.placed, bot, order, ...s };
  });
}

if (errors.length) { failed++; console.log('Page errors:', errors.slice(0, 5)); }
await browser.close();
server.close();
console.log(failed ? `${failed} failed` : 'All checks passed');
process.exit(failed ? 1 : 0);
