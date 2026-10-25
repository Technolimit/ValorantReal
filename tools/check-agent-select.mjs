// Headless checks for the agent select: the pick rules, offline 5v5, and an online room over BroadcastChannel
// with people picking first, bots after them, and a player joining mid-match on the deathmatch-style screen.
//   node tools/check-agent-select.mjs     (needs playwright, like check-abilities.mjs)
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

const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 } });
// Four tabs run matches at once on a software renderer: keep drawing cheap so none of them stalls.
await ctx.addInitScript(() => { try { localStorage.setItem('tapfire-settings-v1', JSON.stringify({ shadows: false, renderScale: 0.5 })); } catch { /* storage blocked */ } });
async function open() {
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(String(e)));
  await p.goto(url, { timeout: 90000 });
  await p.waitForFunction(() => window.__game, null, { timeout: 90000 }); // slow while other tabs run matches
  return p;
}
// Agents of each team on this page's match, and whether any team repeats one.
const teams = (p) => p.evaluate(() => {
  const g = window.__game.game, t = [[], []];
  for (const c of g.combatants) t[c.team ?? 0].push(c.kit?.id);
  return { t, dup: t.some(a => new Set(a).size !== a.length) };
});

// ---- the pick rules, in the page ----
const P = await open();
await check('Deathmatch pick: an agent can only be locked once, and bots fill in with unused agents', () => P.evaluate(async () => {
  const { Lobby } = await import('./js/agentselect.js');
  const L = new Lobby({ mode: 'dm', map: 'arena', botCount: 6 });
  L.add('a', 'A', true); L.add('b', 'B');
  const first = L.lock('a', 'zephyr'), second = L.lock('b', 'zephyr');
  L.hover('b', 'cinder');
  L.start(0);
  let t = 0; while (!L.step(t) && t < 200) t += 0.1;
  const all = L.players.map(p => p.a);
  return { pass: first && !second && L.get('b').a === 'cinder' && L.players.length === 8 && new Set(all).size === 8, first, second, b: L.get('b').a, all };
}));
await check('5v5 pick: teams are split, both teams can have the same agent, bots fill each team to five', () => P.evaluate(async () => {
  const { Lobby } = await import('./js/agentselect.js');
  const L = new Lobby({ mode: 'rounds', map: 'divide' });
  const a = L.add('a', 'A', true), b = L.add('b', 'B'), c = L.add('c', 'C');
  const ok = [L.lock('a', 'zephyr'), L.lock('b', 'zephyr'), L.lock('c', 'zephyr')];
  L.start(0);
  let t = 0; while (!L.step(t) && t < 200) t += 0.1; // c never locked: time runs out and they get a free agent
  const team = (n) => L.players.filter(p => p.t === n).map(p => p.a);
  const t0 = team(0), t1 = team(1);
  return { pass: a.t === 0 && b.t === 1 && c.t === 0 && ok.join() === 'true,true,false' && t0.length === 5 && t1.length === 5 && new Set(t0).size === 5 && new Set(t1).size === 5, teams: [a.t, b.t, c.t], ok, t0, t1 };
}));

// ---- offline 5v5 ----
await check('Offline 5v5: you lock in, then the bots pick one by one, then the match starts', async () => {
  await P.evaluate(() => { Object.assign(window.__game.settings, { mode: 'rounds', map: 'divide' }); document.getElementById('play').click(); });
  const shown = await P.evaluate(() => !document.getElementById('select').hidden);
  await P.click('#select .sel-card[data-id="vex"]');
  await P.click('#sel-lock');
  await P.waitForTimeout(1500);
  const midway = await P.evaluate(() => [...document.querySelectorAll('#sel-team .sel-slot')].map(s => s.querySelector('small').textContent));
  await P.waitForFunction(() => window.__game.game.mode && window.__game.game.state === 'playing', null, { timeout: 15000 });
  const r = await teams(P);
  const mine = await P.evaluate(() => window.__game.game.player.kit.id);
  return { pass: shown && mine === 'vex' && !r.dup && r.t[0].length === 5 && r.t[1].length === 5, shown, mine, midway, teams: r.t };
});
await P.close();

// ---- online: host + two people on the pick screen, then one more mid-match ----
const form = (o) => {
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
  set('net-transport', 'local'); set('net-room', 'PICKS'); set('net-mode', o.mode); set('net-name', o.name);
  Object.assign(window.__game.settings, { botCount: 3, botMode: 'static', map: 'divide' });
};
const H = await open(), C = await open(), D = await open(), E = await open(); // E joins mid-match (loaded now: tabs load slowly once matches run)
await H.evaluate(form, { mode: 'rounds', name: 'Host' });
await C.evaluate(form, { mode: 'rounds', name: 'Cee' });
await D.evaluate(form, { mode: 'rounds', name: 'Dee' });
await H.evaluate(() => window.__game.hostOnline());
await C.evaluate(() => window.__game.joinOnline());
await C.waitForFunction(() => window.__game.net.role === 'lobby', null, { timeout: 10000 });
await D.evaluate(() => window.__game.joinOnline());
await D.waitForFunction(() => window.__game.net.role === 'lobby', null, { timeout: 10000 });
await check('Online: people who join the room land on the pick screen, split across the teams', async () => {
  await H.waitForTimeout(600);
  const s = await H.evaluate(() => window.__game.net.lobby.state());
  const team = (name) => s.players.find(p => p.name === name)?.t;
  const screens = await Promise.all([H, C, D].map(p => p.evaluate(() => !document.getElementById('select').hidden)));
  return { pass: s.phase === 'wait' && team('Host') === 0 && team('Cee') === 1 && team('Dee') === 0 && screens.every(Boolean), phase: s.phase, teams: [team('Host'), team('Cee'), team('Dee')], screens };
});
await check('Online: a teammate\'s locked agent is greyed out, the other team\'s is not', async () => {
  await H.click('#select .sel-card[data-id="zephyr"]'); await H.click('#sel-lock');
  await H.waitForTimeout(700);
  const dTaken = await D.evaluate(() => document.querySelector('#select .sel-card[data-id="zephyr"]').disabled);
  const cTaken = await C.evaluate(() => document.querySelector('#select .sel-card[data-id="zephyr"]').disabled);
  await C.click('#select .sel-card[data-id="zephyr"]'); await C.click('#sel-lock');
  await D.click('#select .sel-card[data-id="lumen"]');
  await H.waitForTimeout(700);
  const s = await H.evaluate(() => window.__game.net.lobby.state());
  const c = s.players.find(p => p.name === 'Cee'), d = s.players.find(p => p.name === 'Dee');
  // Dee's hover shows to the host (same team) but Cee's screen only gets a count for the other team.
  const hostSeesHover = await H.evaluate(() => !!document.querySelector('#sel-team [data-agent="lumen"]'));
  const ceeSeesHover = await C.evaluate(() => !!document.querySelector('#sel-team [data-agent="lumen"]'));
  return { pass: dTaken && !cTaken && c.locked && c.a === 'zephyr' && d.hover === 'lumen' && hostSeesHover && !ceeSeesHover, dTaken, cTaken, cee: c.a, hostSeesHover, ceeSeesHover };
});
await check('Online: when the host starts and everyone is in, bots pick and the match starts with those agents', async () => {
  await H.click('#sel-start');
  await D.click('#sel-lock'); // locks the hovered Lumen
  await C.waitForFunction(() => window.__game.net.role === 'client', null, { timeout: 20000 });
  await D.waitForFunction(() => window.__game.net.role === 'client', null, { timeout: 20000 });
  await H.waitForTimeout(1500);
  const r = await teams(H);
  const kits = await Promise.all([H, C, D].map(p => p.evaluate(() => window.__game.game.player.kit?.id)));
  const onHost = await H.evaluate(() => window.__game.game.combatants.filter(c => c.remote).map(c => [c.name, c.kit.id, c.team]));
  return { pass: kits.join() === 'zephyr,zephyr,lumen' && !r.dup && r.t[0].length === 5 && r.t[1].length === 5 && onHost.length === 2, kits, teams: r.t, onHost };
});

await E.evaluate(form, { mode: 'rounds', name: 'Eff' });
await check('Online: joining mid-match opens the deathmatch-style picker with the team\'s taken agents locked', async () => {
  await E.evaluate(() => window.__game.joinOnline());
  await E.waitForFunction(() => window.__game.net.role === 'picking' && !document.getElementById('agents').hidden, null, { timeout: 10000 });
  const zephyr = await E.evaluate(() => document.querySelector('#agent-grid .agent-card[data-id="zephyr"]').disabled);
  // Eff goes on the team with fewer people (Cee's), where a bot is playing some agent: pick that one.
  const botAgent = await H.evaluate(() => window.__game.game.bots.find(b => b.team === 1).kit.id);
  const free = await E.evaluate((a) => !document.querySelector(`#agent-grid .agent-card[data-id="${a}"]`).disabled, botAgent);
  await E.click(`#agent-grid .agent-card[data-id="${botAgent}"]`);
  await E.click('#agent-lock');
  await E.waitForFunction(() => window.__game.net.role === 'client', null, { timeout: 30000 });
  await H.waitForTimeout(800);
  const r = await teams(H);
  const kit = await E.evaluate(() => window.__game.game.player.kit.id);
  return { pass: zephyr && free && kit === botAgent && !r.dup, zephyrLocked: zephyr, botAgent, kit, teams: r.t };
});

if (errors.length) { failed++; console.log('Page errors:', errors.slice(0, 5)); }
await browser.close();
server.close();
console.log(failed ? `${failed} failed` : 'All checks passed');
process.exit(failed ? 1 : 0);
