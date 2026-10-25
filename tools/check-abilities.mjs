// Headless checks for how abilities interact (flashes, smokes, death, detain, suppression, ult orbs, online).
//   npm i -D playwright && npx playwright install chromium   (once)
//   node tools/check-abilities.mjs            all checks
//   node tools/check-abilities.mjs --offline  skip the two-tab online checks
// Serves this folder on a local port, drives the real game through window.__game with the loop frozen,
// and ticks the simulation by hand. Exits with code 1 if any check fails.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const offline = process.argv.includes('--offline');

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

// Runs in the page: start a frozen match and give back helpers.
const PAGE_HELPERS = `
window.__start = async (o) => {
  const h = window.__game; h.frozen = true;
  Object.assign(h.settings, { mode: 'dm', botCount: 1, agent: 'cinder', map: 'arena', botMode: 'static', difficulty: 'normal', side: 'atk' }, o);
  await h.startMatch({}); h.frozen = true;
  return h.game;
};
window.__tick = (g, s) => { for (let i = 0; i < Math.round(s * 128); i++) g.tick(); };
// Put c on open ground, facing -z, with 'len' metres of clear sight ahead.
window.__place = (g, c, len = 8, skip = 0) => {
  const b = g.map.boxes.filter(x => !x.floor);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const q of b) { x0 = Math.min(x0, q.min[0]); x1 = Math.max(x1, q.max[0]); z0 = Math.min(z0, q.min[2]); z1 = Math.max(z1, q.max[2]); }
  let n = 0;
  for (let x = x0 + 2; x < x1 - 2; x += 1.5) for (let z = z0 + 2; z < z1 - 2; z += 1.5) {
    const f = g.floorAt(x, z), f2 = g.floorAt(x, z - len);
    if (!f || !f2 || Math.abs(f[1] - f2[1]) > 0.05 || !g.canStand(c, f)) continue;
    const e = [x, f[1] + 1.6, z];
    if (!g.world.lineOfSight(e, [x, e[1], z - len]) || !g.world.lineOfSight([x, f[1] + 0.3, z], [x, f[1] + 0.3, z - len])) continue;
    if (g.combatants.some(o => o !== c && o.alive && Math.hypot(o.pos[0] - x, o.pos[2] - z) < 25)) continue;
    if (n++ < skip) continue;
    c.pos = [...f]; c.prevPos = [...f]; c.vel = [0, 0, 0]; c.yaw = 0; c.pitch = 0;
    return true;
  }
  return false;
};
// A point d metres in front of c's eyes.
// A solid block that only exists for the check (not drawn).
window.__box = (g, min, max) => { const b = { min, max, pen: false, mat: 'wall', temp: true }; g.world.boxes.push(b); return b; };
// Aim c's crosshair at point t.
window.__aim = (c, t) => { const e = c.eye(), dx = t[0] - e[0], dy = t[1] - e[1], dz = t[2] - e[2]; c.yaw = Math.atan2(-dx, -dz); c.pitch = Math.atan2(dy, Math.hypot(dx, dz)); };
// Steps 0.4 m high and 0.6 m deep, 3 m wide, climbing away from c (who faces -z), starting at metres ahead.
window.__stairs = (g, c, at = 3, n = 4) => { const [x, y, z] = c.pos; for (let i = 0; i < n; i++) __box(g, [x - 1.5, y, z - at - 0.6 * (i + 1)], [x + 1.5, y + 0.4 * (i + 1), z - at - 0.6 * i]); return { top: (i) => [x, y + 0.4 * (i + 1), z - at - 0.6 * i - 0.3] }; };
window.__remote = () => window.__game.game.combatants.find(x => x.remote);
window.__ahead = (c, d) => { const e = c.eye(); return [e[0] - Math.sin(c.yaw) * d, e[1], e[2] - Math.cos(c.yaw) * d]; };
`;

const checks = [
  ['Bots on the thrower\'s team look away from its flash; enemies and humans are still blinded', async () => {
    const g = await __start({ mode: 'rounds', map: 'divide' });
    __tick(g, 31);
    const p = g.player, ally = g.bots.find(b => !g.isEnemy(p, b)), foe = g.bots.find(b => g.isEnemy(p, b));
    const out = {};
    for (const [name, c] of [['allyBot', ally], ['enemyBot', foe], ['human', p]]) {
      if (!__place(g, c, 8)) return { error: 'no open ground for ' + name };
      c.st.blindUntil = 0;
      g.flash(ally, __ahead(c, 3), 2);
      out[name] = c.st.blindUntil > g.time;
      c.pos = [999, -50, 999];
    }
    return { pass: !out.allyBot && out.enemyBot && out.human, ...out };
  }],
  ['A smoke between you and a flash stops the blind', async () => {
    const g = await __start({});
    const b = g.bots[0], p = g.player;
    if (!__place(g, b, 10)) return { error: 'no open ground' };
    const pop = __ahead(b, 8);
    g.flash(p, pop, 2);
    const open = b.st.blindUntil > g.time;
    b.st.blindUntil = 0;
    g.addSmoke(p, __ahead(b, 4), g.time - 1, { radius: 2.5, life: 20 });
    g.flash(p, pop, 2);
    const smoked = b.st.blindUntil > g.time;
    return { pass: open && !smoked, blindedInOpen: open, blindedThroughSmoke: smoked };
  }],
  ['Utility in the air still lands after its thrower dies; self effects do not', async () => {
    const g = await __start({ agent: 'cinder' });
    const p = g.player, k = p.kit;
    p.pitch = -0.3;
    k.agent.abilities.e.use(k); // Ember: fire pool when it lands
    g.kill(p, g.bots[0], { part: 'body', def: { id: 'x', name: 'x' } });
    __tick(g, 1.5);
    const landed = g.zones.length > 0;
    const g2 = await __start({ agent: 'zephyr' });
    const z = g2.player;
    z.kit.agent.abilities.q.use(z.kit); // Lift: wind-up, then launch
    g2.kill(z, g2.bots[0], { part: 'body', def: { id: 'x', name: 'x' } });
    __tick(g2, 0.5);
    return { pass: landed && z.vel[1] <= 0, emberLanded: landed, deadZephyrLaunched: z.vel[1] > 0 };
  }],
  ['Detained players cannot shoot or use abilities', async () => {
    const g = await __start({ agent: 'cinder' });
    const p = g.player;
    __tick(g, 1);
    p.st.disarmUntil = g.time + 5;
    const shots = p.stats.shots, charges = p.kit.charges.c;
    for (let i = 0; i < 64; i++) { p.input.fire = p.input.firePressed = true; if (i === 10) p.input.abC = true; g.tick(); }
    p.input.fire = false;
    return { pass: p.stats.shots === shots && p.kit.charges.c === charges, shots: p.stats.shots - shots, abilityUsed: p.kit.charges.c !== charges };
  }],
  ['Nearsight closes in a human player\'s view', async () => {
    const g = await __start({});
    const p = g.player, r = window.__game.renderer;
    const before = r.scene.fog?.far ?? Infinity;
    p.st.nearUntil = g.time + 2;
    r.updateNearsight(p);
    const during = r.scene.fog?.far ?? Infinity;
    p.st.nearUntil = 0;
    r.updateNearsight(p);
    const after = r.scene.fog?.far ?? Infinity;
    return { pass: during <= 7 && after === before, farBefore: before, farDuring: during, farAfter: after };
  }],
  ['Phased-out players shrug off statuses', async () => {
    const g = await __start({});
    const p = g.player, b = g.bots[0];
    if (!__place(g, b, 10)) return { error: 'no open ground' };
    b.st.hiddenUntil = b.st.intangibleUntil = g.time + 5;
    g.pulse(p, b.eye(), 5, 'stun', 3);
    g.pulse(p, b.eye(), 5, 'reveal', 3);
    g.flash(p, __ahead(b, 3), 2);
    const hit = { stunned: b.st.stunUntil > g.time, revealed: b.st.revealUntil > g.time, blinded: b.st.blindUntil > g.time };
    return { pass: !hit.stunned && !hit.revealed && !hit.blinded, ...hit };
  }],
  ['The spike kills through a Focus shield', async () => {
    const g = await __start({ mode: 'rounds', map: 'divide', agent: 'vanta' });
    __tick(g, 31);
    const p = g.player, m = g.mode;
    p.kit.shield = true;
    m.spike = { state: 'planted', pos: [...p.pos], site: 'A', plantedAt: g.time };
    m.detonate();
    return { pass: !p.alive, alive: p.alive };
  }],
  ['Rekindle and Overload give back the shields you had, not free heavy shields', async () => {
    const out = {};
    for (const agent of ['cinder', 'override']) {
      const g = await __start({ mode: 'rounds', map: 'divide', agent, botMode: 'static' });
      __tick(g, 31);
      const p = g.player;
      p.armor = 0;
      p.kit.ultPoints = 99; p.kit.agent.abilities.x.use(p.kit);
      const foe = g.combatants.find(c => g.isEnemy(p, c));
      g.damage(p, foe, 500, { part: 'body', def: { id: 'vandal', name: 'Vandal' }, dist: 5, point: p.eye() });
      __tick(g, 3.5);
      out[agent] = { alive: p.alive, armor: p.armor };
    }
    return { pass: Object.values(out).every(o => o.alive && o.armor === 0), ...out };
  }],
  ['Ultimate points reset at halftime', async () => {
    const g = await __start({ mode: 'rounds', map: 'divide', botMode: 'static' });
    const m = g.mode;
    m.round = 12;
    for (const c of g.combatants) c.kit.ultPoints = 5;
    m.startRound();
    const left = g.combatants.filter(c => c.kit.ultPoints > 0).length;
    return { pass: m.round === 13 && left === 0, playersStillHoldingPoints: left };
  }],
  ['Rift lands on the step you aim at and teleports you there', async () => {
    const g = await __start({ agent: 'umbra', map: 'arena' });
    const o = g.player, k = o.kit;
    if (!__place(g, o, 14)) return { error: 'no open ground' };
    const base = o.pos[1], st = __stairs(g, o, 3, 4), t = st.top(2); // third step, 1.2 m up
    __aim(o, t);
    k.charges.c = 2; o.input.abC = true; __tick(g, 0.4);
    const pv = k.previewPos && [...k.previewPos];
    o.input.firePressed = true; __tick(g, 1);
    const up = o.pos[1] - base;
    return { pass: !!pv && Math.abs(pv[1] - t[1]) < 0.05 && Math.abs(up - 1.2) < 0.05, previewHeight: pv && +(pv[1] - base).toFixed(2), landedHeight: +up.toFixed(2) };
  }],
  ['Rift aimed at a ledge lip above your eyes lands on top of it', async () => {
    const g = await __start({ agent: 'umbra', map: 'arena' });
    const o = g.player, k = o.kit;
    if (!__place(g, o, 14)) return { error: 'no open ground' };
    const [x, y, z] = o.pos, h = 2.4;
    __box(g, [x - 2, y, z - 9], [x + 2, y + h, z - 6]); // a 2.4 m block 6 m ahead
    __aim(o, [x, y + h - 0.3, z - 6]); // just under its lip
    k.charges.c = 2; o.input.abC = true; __tick(g, 0.4);
    o.input.firePressed = true; __tick(g, 1);
    return { pass: Math.abs(o.pos[1] - (y + h)) < 0.05, landedHeight: +(o.pos[1] - y).toFixed(2) };
  }],
  ['Grenades thrown onto a box land on top of it', async () => {
    const g = await __start({ agent: 'cinder', map: 'arena' });
    const o = g.player, k = o.kit;
    if (!__place(g, o, 14)) return { error: 'no open ground' };
    const [x, y, z] = o.pos;
    __box(g, [x - 1, y, z - 8], [x + 1, y + 1, z - 6]); // 1 m crate
    __aim(o, [x, y + 1, z - 6.2]); // its top, near the front edge
    k.agent.abilities.e.use(k); __tick(g, 2);
    const fire = g.zones.find(zz => zz.def?.id === 'ember');
    return { pass: !!fire && Math.abs(fire.pos[1] - (y + 1)) < 0.05, fireHeight: fire && +(fire.pos[1] - y).toFixed(2) };
  }],
  ['Boomer climbs stairs instead of bouncing off them', async () => {
    const g = await __start({ agent: 'blitz', map: 'arena' });
    const o = g.player, k = o.kit;
    if (!__place(g, o, 14)) return { error: 'no open ground' };
    const base = o.pos[1];
    __stairs(g, o, 2, 4);
    o.pitch = -0.2;
    k.agent.abilities.c.use(k);
    let top = 0;
    for (let i = 0; i < 20; i++) { __tick(g, 0.125); const bot = g.devices.find(d => d.kind === 'boombot'); if (bot) top = Math.max(top, bot.pos[1] - base); }
    return { pass: top > 1.5, highestPoint: +top.toFixed(2) };
  }],
  ['Shade smoke forms exactly where its preview showed, also after pushing it out', async () => {
    const g = await __start({ agent: 'umbra', map: 'arena' });
    const o = g.player, k = o.kit;
    if (!__place(g, o, 14)) return { error: 'no open ground' };
    o.pitch = -0.05;
    k.charges.e = 2; o.input.abE = true; __tick(g, 0.4);
    for (let i = 0; i < 40; i++) { o.input.alt = true; g.tick(); } // hold right click: farther
    o.input.alt = false; g.tick();
    const pv = [...k.previewPos];
    o.input.firePressed = true; __tick(g, 1);
    const s = g.smokes[g.smokes.length - 1];
    const off = s ? Math.hypot(s.pos[0] - pv[0], s.pos[1] - pv[1], s.pos[2] - pv[2]) : null;
    return { pass: off !== null && off < 1e-6, offset: off };
  }],
  ['Zero Point suppresses: no abilities for 8 s, guns still work', async () => {
    const g = await __start({ agent: 'override' });
    const o = g.player, b = g.bots[0];
    __tick(g, 1);
    if (!__place(g, o, 12)) return { error: 'no open ground' };
    b.pos = __ahead(o, 6); b.pos[1] = o.pos[1]; b.prevPos = [...b.pos];
    o.kit.agent.abilities.e.use(o.kit); // the knife lands near b and pulses
    __tick(g, 3);
    const botSuppressed = b.st.suppressUntil > g.time;
    // Now the other way round: the human is suppressed.
    o.st.suppressUntil = g.time + 8;
    o.kit.charges.c = 1;
    const shots = o.stats.shots;
    o.input.abC = true; g.tick();
    for (let i = 0; i < 40; i++) { o.input.fire = o.input.firePressed = true; g.tick(); }
    o.input.fire = false;
    const blocked = o.kit.charges.c === 1 && !o.kit.armed, fired = o.stats.shots > shots;
    __tick(g, 8);
    o.input.abC = true; g.tick();
    const after = !!o.kit.armed || o.kit.charges.c === 0;
    return { pass: botSuppressed && blocked && fired && after, botSuppressed, abilityBlocked: blocked, gunFired: fired, worksAfter: after };
  }],
  ['Ultimate orbs: both 5v5 maps have two reachable orbs; holding F for 3 s gives a point; they come back next round', async () => {
    const out = {};
    for (const map of ['divide', 'foundry']) {
      const g = await __start({ mode: 'rounds', map });
      const m = g.map, orbs = g.mode.orbs || [];
      const len = (from, to) => { const p = m.findPath(m.nearestWalkable(...m.cellOf(from[0], from[2])), m.nearestWalkable(...m.cellOf(to[0], to[2]))); return p ? p.length : null; };
      const reach = orbs.map(o => ({ onFloor: Math.abs((g.floorAt(o.pos[0], o.pos[2], o.pos[1] + 0.5)?.[1] ?? -99) - o.pos[1]) < 0.05, atk: len([m.teamSpawns.atk[0].x, 0, m.teamSpawns.atk[0].z], o.pos), def: len([m.teamSpawns.def[0].x, 0, m.teamSpawns.def[0].z], o.pos) }));
      out[map] = { orbs: orbs.length, reach };
    }
    const g = await __start({ mode: 'rounds', map: 'divide' });
    __tick(g, 31); // buy phase over
    const p = g.player, orb = g.mode.orbs[0];
    p.kit.ultPoints = 0; p.hp = 1e6; // a stray shot shouldn't add a death point
    p.pos = [...orb.pos]; p.prevPos = [...orb.pos]; p.vel = [0, 0, 0];
    for (let i = 0; i < 128 * 2; i++) { p.input.use = true; g.tick(); }
    const early = p.kit.ultPoints;
    for (let i = 0; i < 128 * 1.2; i++) { p.input.use = true; g.tick(); }
    p.input.use = false;
    const got = p.kit.ultPoints, taken = orb.taken;
    g.mode.endRound('atk', 'eliminated'); __tick(g, 8);
    const back = g.mode.orbs.every(o => !o.taken);
    const maps = Object.values(out).every(r => r.orbs === 2 && r.reach.every(x => x.onFloor && x.atk && x.def));
    return { pass: maps && early === 0 && got === 1 && taken && back, ...out, pointsAt2s: early, pointsAt3s: got, orbTaken: taken, backNextRound: back };
  }],
  ['Enemy utility can be shot down; a Lagoon dome stops bullets until it breaks', async () => {
    const g = await __start({});
    const p = g.player, b = g.bots[0];
    if (!__place(g, p, 12)) return { error: 'no open ground' };
    const dir = (t) => { __aim(p, t); return [-Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch)]; };
    const f = __ahead(p, 6); f[1] = p.pos[1];
    const tur = g.addDevice({ kind: 'turret', owner: b, pos: f, yaw: 0, aimYaw: 0, life: 40, next: g.time + 99 });
    let shots = 0;
    while (!tur.removed && shots < 20) { g.fireBullets(p, p.gun, [dir([f[0], f[1] + 0.5, f[2]])]); shots++; }
    // A dome between p and b: b takes nothing until the dome has soaked up 500.
    b.pos = __ahead(p, 9); b.pos[1] = p.pos[1]; b.prevPos = [...b.pos]; b.hp = 100; b.armor = 0;
    const dome = g.addSmoke(b, __ahead(p, 5), g.time, { radius: 2.2, life: 12, kind: 'cove' });
    const hpBefore = b.hp;
    let n = 0;
    while (dome.hp > 0 && n < 100) { g.fireBullets(p, p.gun, [dir(b.eye())]); n++; if (b.hp < hpBefore) break; }
    const blockedHp = b.hp;
    g.tick();
    g.fireBullets(p, p.gun, [dir(b.eye())]);
    return { pass: tur.removed && shots > 1 && blockedHp === hpBefore && dome.hp <= 0 && b.hp < hpBefore, turretShots: shots, botHpWhileDomeUp: blockedHp, shotsToBreakDome: n, botHpAfter: b.hp };
  }],
  ['Seize deafens and decays; deafened bots ignore sounds; Paranoia deafens', async () => {
    const g = await __start({ agent: 'nyx', botMode: 'fight' });
    const p = g.player, b = g.bots[0];
    __tick(g, 1);
    if (!__place(g, p, 10)) return { error: 'no open ground' };
    b.pos = __ahead(p, 5); b.pos[1] = p.pos[1]; b.prevPos = [...b.pos]; b.hp = 100;
    for (const c of g.pulse(p, [b.pos[0], b.pos[1] + 1, b.pos[2]], 6, 'hold+deaf', 4.5, 0)) g.decay(c, 75);
    const deaf = b.st.deafUntil > g.time, decayed = b.hp === 25;
    const before = b.brain.alertUntil ?? 0;
    b.brain.lastSeen = -100;
    b.brain.hear({ pos: p.pos }, g.time);
    const heard = (b.brain.alertUntil ?? 0) !== before;
    b.st.deafUntil = 0;
    g.lineEffect(p, p.eye(), __ahead(p, 20), 1.8, 'near+deaf', 2);
    return { pass: deaf && decayed && !heard && b.st.deafUntil > g.time && b.st.nearUntil > g.time, seizeDeafens: deaf, seizeDecays: decayed, deafBotHeard: heard };
  }],
  ['Tripwire goes at the height you aim at and only trips bodies it crosses', async () => {
    const g = await __start({ agent: 'lattice' });
    const p = g.player, b = g.bots[0];
    if (!__place(g, p, 8)) return { error: 'no open ground' };
    const y = p.pos[1];
    __box(g, [p.pos[0] - 3, y, p.pos[2] - 3.2], [p.pos[0] + 3, y + 4, p.pos[2] - 3]); // a wall ahead
    __box(g, [p.pos[0] - 3.2, y, p.pos[2] - 9], [p.pos[0] - 3, y + 4, p.pos[2] + 1]); // and one to the left
    __box(g, [p.pos[0] + 3, y, p.pos[2] - 9], [p.pos[0] + 3.2, y + 4, p.pos[2] + 1]); // and right
    __aim(p, [p.pos[0] + 3, y + 2.4, p.pos[2] - 1]);
    p.kit.agent.abilities.c.use(p.kit);
    const high = g.devices.find(d => d.kind === 'wire');
    const highY = high ? high.pos[1] - y : null;
    // Walk the bot under the high wire: nothing happens.
    b.pos = [p.pos[0], y, p.pos[2] - 1]; b.prevPos = [...b.pos];
    __tick(g, 0.1);
    const trippedHigh = b.st.stunUntil > g.time;
    high.removed = true; g.tick();
    __aim(p, [p.pos[0] + 3, y + 1.0, p.pos[2] - 1]);
    p.kit.agent.abilities.c.use(p.kit);
    __tick(g, 0.1);
    const trippedLow = b.st.stunUntil > g.time;
    return { pass: highY !== null && Math.abs(highY - 2.4) < 0.2 && !trippedHigh && trippedLow, wireHeight: highY, trippedByHighWire: trippedHigh, trippedByWaistWire: trippedLow };
  }],
  ['Ravenous speeds up reload; Rally buffs teammates too', async () => {
    const g = await __start({ mode: 'rounds', map: 'divide', agent: 'vex' });
    __tick(g, 31);
    const p = g.player, gun = p.gun;
    gun.mag = 1; gun.startReload(p, g.time); const normal = gun.reloadDur; gun.reloading = false;
    p.kit.empressUntil = g.time + 30; g.tick();
    gun.mag = 1; gun.startReload(p, g.time); const fast = gun.reloadDur; gun.reloading = false;
    const ally = g.bots.find(x => !g.isEnemy(p, x));
    const zone = g.addZone({ kind: 'stim', owner: p, pos: [...ally.pos], r: 6, life: 12 }, g.time);
    __tick(g, 0.1);
    return { pass: fast < normal * 0.9 && ally.st.stimUntil > g.time, reloadNormal: normal, reloadRavenous: fast, allyStimmed: ally.st.stimUntil > g.time };
  }],
  ['Buy phase: any ability can be held; set-up utility (camera, Sentry, Anchor) can be placed', async () => {
    const press = (g, c, key, aim) => { c.input['ab' + key] = true; g.tick(); __tick(g, 0.35); if (aim) aim(); c.input.firePressed = true; g.tick(); __tick(g, 0.2); };
    const out = {};
    for (const [agent, key, kind] of [['lattice', 'E', 'cam'], ['bastion', 'E', 'turret'], ['regent', 'E', 'anchor']]) {
      const g = await __start({ mode: 'rounds', map: 'divide', agent });
      __tick(g, 2);
      const p = g.player; p.kit.charges[key.toLowerCase()] = 1; p.pitch = -0.3;
      press(g, p, key);
      out[agent] = g.mode.phase === 'buy' && g.devices.some(d => d.kind === kind && d.owner === p);
    }
    const g = await __start({ mode: 'rounds', map: 'divide', agent: 'cinder' });
    __tick(g, 2);
    const p = g.player; p.kit.charges.q = 1; p.input.abQ = true; g.tick(); __tick(g, 0.35);
    const held = p.kit.armed?.k === 'q';
    p.input.firePressed = true; g.tick(); __tick(g, 0.2);
    const stillHeld = p.kit.armed?.k === 'q' && p.kit.charges.q === 1;
    return { pass: Object.values(out).every(Boolean) && held && stillHeld, placed: out, flareHeldInBuy: held, flareNotThrownInBuy: stillHeld };
  }],
  ['Nightwalk: untouchable while the shade forms, arrives after 4 s; shooting the shade cancels it', async () => {
    const g = await __start({ agent: 'umbra' });
    const p = g.player, b = g.bots[0], k = p.kit;
    if (!__place(g, p, 12)) return { error: 'no open ground' };
    const start = [...p.pos], dest = __ahead(p, 8); dest[1] = p.pos[1];
    k.ultPoints = k.ultCost; k.chooseShadow(dest);
    g.damage(p, b, 50, { part: 'body', def: { id: 'vandal', name: 'Vandal' }, dist: 5, point: p.eye() });
    const hpDuring = p.hp;
    __tick(g, 3.5);
    const notYet = Math.hypot(p.pos[0] - dest[0], p.pos[2] - dest[2]) > 1;
    __tick(g, 0.7);
    const arrived = Math.hypot(p.pos[0] - dest[0], p.pos[2] - dest[2]) < 1 && !k.shadow;
    // Again, but an enemy shoots the shade.
    p.pos = [...start]; p.prevPos = [...start];
    k.chooseShadow(dest); g.tick();
    b.pos = __ahead(p, 14); b.pos[1] = p.pos[1]; b.prevPos = [...b.pos];
    __aim(b, [dest[0], dest[1] + 1, dest[2]]);
    g.fireBullets(b, b.gun, [[-Math.sin(b.yaw) * Math.cos(b.pitch), Math.sin(b.pitch), -Math.cos(b.yaw) * Math.cos(b.pitch)]]);
    __tick(g, 4.5);
    const stayed = Math.hypot(p.pos[0] - start[0], p.pos[2] - start[2]) < 0.5 && !k.shadow && !(p.st.intangibleUntil > g.time);
    return { pass: hpDuring === 100 && notYet && arrived && stayed, hpWhileChannelling: hpDuring, notThereAt3_5s: notYet, arrivedAt4_2s: arrived, shotShadeCancels: stayed };
  }],
  ['Riftwalk right click leaves the rift where you stand; Mindread needs an enemy body', async () => {
    const g = await __start({ agent: 'mirage' });
    const p = g.player;
    if (!__place(g, p, 10)) return { error: 'no open ground' };
    p.kit.agent.abilities.e.use(p.kit, 'right');
    const gt = p.kit.gate, at = [...gt.pos];
    __tick(g, 1);
    const still = Math.hypot(gt.pos[0] - at[0], gt.pos[2] - at[2]) < 1e-6;
    const g2 = await __start({ agent: 'lattice' });
    const q = g2.player, b = g2.bots[0], k = q.kit;
    if (!__place(g2, q, 10)) return { error: 'no open ground' };
    const without = k.agent.abilities.x.use(k) !== false;
    b.pos = __ahead(q, 5); b.pos[1] = q.pos[1]; b.prevPos = [...b.pos];
    g2.kill(b, q, { part: 'body', def: { id: 'x', name: 'x' } }); b.respawnAt = Infinity;
    __aim(q, [b.deathPos[0], b.deathPos[1] + 0.4, b.deathPos[2]]);
    const withBody = k.agent.abilities.x.use(k) !== false;
    return { pass: still && !without && withBody, riftStaysPut: still, mindreadWithoutBody: without, mindreadOnBody: withBody };
  }],
  ['Shade goes through walls by default (R makes it stop at the wall); its view shows teammates, not enemies', async () => {
    const g = await __start({ mode: 'rounds', map: 'divide', agent: 'umbra' });
    const p = g.player, k = p.kit, r = window.__game.renderer;
    if (!__place(g, p, 14)) return { error: 'no open ground' };
    const y = p.pos[1];
    __box(g, [p.pos[0] - 4, y, p.pos[2] - 6.3], [p.pos[0] + 4, y + 6, p.pos[2] - 6]); // a wall 6 m ahead
    p.pitch = 0; k.dist = 12; k.distFor = 'e';
    const through = k.agent.abilities.e.preview(k);
    k.stopAtWalls = true;
    const stopped = k.agent.abilities.e.preview(k);
    k.stopAtWalls = false;
    const beyond = p.pos[2] - through[2], before = p.pos[2] - stopped[2];
    r.setShadowSight(true);
    const sil = [...r.silhouettes.entries()].filter(([, m]) => m.visible).map(([c]) => c);
    const allies = sil.length > 0 && sil.every(c => !g.isEnemy(p, c)) && sil.includes(p);
    const worldHidden = !r.worldGroup.visible;
    r.setShadowSight(false);
    const restored = r.worldGroup.visible && [...r.silhouettes.values()].every(m => !m.visible);
    return { pass: beyond > 11 && before < 6 && allies && worldHidden && restored, smokeDistThroughWall: +beyond.toFixed(2), smokeDistStopAtWall: +before.toFixed(2), silhouettesAreSelfAndAllies: allies, silhouettes: sil.length, worldHidden, restoredAfter: restored };
  }],
  ['Veil orb is drawn while it flies, with a trail and (for its thrower) the size of the smoke; all of it goes when it bursts', async () => {
    const g = await __start({ agent: 'zephyr' });
    const p = g.player, k = p.kit, r = window.__game.renderer;
    if (!__place(g, p, 14)) return { error: 'no open ground' };
    p.pitch = 0; p.input.abCHeld = true;
    k.agent.abilities.c.use(k);
    const d = g.devices.find(x => x.kind === 'cloud');
    const fx = () => (r.fx2 || []).filter(f => f.obj.parent === r.scene && (f.obj.userData.cloud || f.obj.isLine));
    const start = [...d.pos];
    for (let i = 0; i < 6; i++) { __tick(g, 0.1); r.updateFx2(); }
    const grp = r.fx2.find(f => f.obj.userData.cloud)?.obj;
    const moved = Math.hypot(d.pos[0] - start[0], d.pos[2] - start[2]);
    const follows = !!grp && Math.hypot(grp.position.x - d.pos[0], grp.position.z - d.pos[2]) < 0.2;
    const sizeShown = !!grp?.userData.cloud.size.visible;
    const trailShown = !!grp?.userData.cloud.trail.visible && grp.userData.cloud.pts.length > 3;
    p.input.abCHeld = false;
    for (let i = 0; i < 4; i++) { __tick(g, 0.1); r.updateFx2(); }
    const burst = d.removed && g.smokes.length > 0, gone = fx().length === 0;
    return { pass: moved > 3 && follows && sizeShown && trailShown && burst && gone, moved: +moved.toFixed(2), meshFollowsOrb: follows, burstSizeShownWhileHeld: sizeShown, trailShown, burst, meshAndTrailRemoved: gone };
  }],
  ['Watcher camera shows your own body; its tracking dart builds no new shaders mid-fight', async () => {
    const g = await __start({ agent: 'lattice' });
    const p = g.player, k = p.kit, r = window.__game.renderer, bot = g.bots[0];
    if (!__place(g, p, 14)) return { error: 'no open ground' };
    bot.pos = [p.pos[0], p.pos[1], p.pos[2] - 10]; bot.prevPos = [...bot.pos];
    __tick(g, 1);
    const frame = () => { g.tick(); r.render(1, 1 / 60, { dx: 0, dy: 0 }); };
    frame();
    const hiddenFirstPerson = !r.characters.get(p).group.visible;
    p.pitch = -0.3; k.agent.abilities.e.use(k); k.agent.abilities.e.reuse(k);
    const aim = (t) => { const c = k.cam.pos, dx = t[0] - c[0], dy = t[1] - c[1], dz = t[2] - c[2]; p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.atan2(dy, Math.hypot(dx, dz)); };
    aim([p.pos[0], p.pos[1] + 1, p.pos[2]]); frame();
    const shownInCamera = r.characters.get(p).group.visible;
    aim([bot.pos[0], bot.pos[1] + 1.2, bot.pos[2]]); frame();
    const programs = r.renderer.info.programs.length;
    p.input.fire = p.input.firePressed = true; frame(); p.input.fire = false;
    for (let i = 0; i < 30; i++) frame();
    const newShaders = r.renderer.info.programs.length - programs;
    return { pass: hiddenFirstPerson && shownInCamera && !!k.cam.dart && newShaders === 0, hiddenFirstPerson, shownInCamera, dartHit: !!k.cam.dart, newShaders };
  }],
  ['Leaving a camera, piloted gadget, Shade view or Nightwalk puts your aim back where it was; the ability itself still goes where you looked', async () => {
    const out = {};
    // Look away while the view is elsewhere, then check the facing once it comes back.
    const run = async (name, agent, enter, leave) => {
      const g = await __start({ agent });
      const p = g.player, k = p.kit;
      if (!__place(g, p, 14)) { out[name] = 'no open ground'; return; }
      __tick(g, 0.5);
      p.yaw = 0; p.pitch = -0.1;
      enter(g, p, k); g.tick();
      const away = k.aimBefore ? 1 : 0;
      for (let i = 0; i < 40; i++) { p.yaw += 0.03; p.pitch -= 0.005; g.tick(); } // the mouse turns the remote view
      leave(g, p, k);
      const back = Math.abs(p.yaw) < 1e-9 && Math.abs(p.pitch + 0.1) < 1e-9;
      out[name] = away && back ? 'ok' : { away, yaw: +p.yaw.toFixed(3), pitch: +p.pitch.toFixed(3) };
      return g;
    };
    await run('watcherCamera', 'lattice', (g, p, k) => { p.pitch = -0.3; k.agent.abilities.e.use(k); p.pitch = -0.1; k.agent.abilities.e.reuse(k); },
      (g, p, k) => { k.agent.abilities.e.reuse(k); g.tick(); });
    await run('owlDrone', 'hawke', (g, p, k) => k.agent.abilities.c.use(k), (g) => __tick(g, 8));
    await run('tiger', 'fawn', (g, p, k) => k.agent.abilities.q.use(k), (g) => __tick(g, 7));
    await run('scoutDrone', 'ballast', (g, p, k) => k.agent.abilities.c.use(k), (g) => __tick(g, 7));
    await run('nightwalk', 'umbra', (g, p, k) => { k.ultPoints = k.ultCost; const d = __ahead(p, 6); d[1] = p.pos[1]; k.chooseShadow(d); }, (g) => __tick(g, 4.5));
    let smokeYaw = null;
    await run('shadeView', 'umbra', (g, p, k) => { p.input.abE = true; },
      (g, p, k) => { p.input.firePressed = true; g.tick(); __tick(g, 3); const s = g.smokes[g.smokes.length - 1]; smokeYaw = s ? Math.atan2(-(s.pos[0] - p.pos[0]), -(s.pos[2] - p.pos[2])) : null; });
    out.shadeSmokeWhereYouLooked = smokeYaw !== null && Math.abs(smokeYaw - 0.03 * 40) < 0.15;
    return { pass: Object.values(out).every(v => v === 'ok' || v === true), ...out };
  }],
  ['Placed utility can be picked back up with F, with Valorant\'s refund timing and buy-phase-only rules', async () => {
    const out = {};
    // Put your own device on the floor in front of you, look at it, press F.
    const setup = (g, p, kind, dist = 1.6, extra = {}) => {
      const pos = __ahead(p, dist); pos[1] = p.pos[1];
      const d = g.addDevice({ kind, owner: p, pos, life: 999, armAt: g.time + 99, ...extra });
      const e = p.eye(); p.pitch = Math.atan2(pos[1] + 0.2 - e[1], Math.hypot(pos[0] - e[0], pos[2] - e[2]));
      return d;
    };
    const pressF = (g, p) => { p.input.use = true; g.tick(); p.input.use = false; g.tick(); };
    const dm = async (agent) => { const g = await __start({ agent }); const p = g.player; __place(g, p, 20); p.yaw = 0; __tick(g, 0.2); return [g, p]; };
    { // Trapwire: straight back; and the pick-up is recorded for online peers
      const [g, p] = await dm('lattice');
      let recorded = null; g.on('kitAct', ({ act }) => { if (act[0] === 'pickUp') recorded = act; });
      p.kit.charges.c = 1; const d = setup(g, p, 'wire', 1.6, { b: [0, 0, 0] });
      pressF(g, p);
      out.trapwire = d.removed && p.kit.charges.c === 2 && !!recorded;
    }
    { // Turret: back after 20 s; too far away does nothing
      const [g, p] = await dm('bastion');
      p.kit.charges.e = 0; const far = setup(g, p, 'turret', 6);
      pressF(g, p); const farKept = !far.removed;
      far.removed = true; const d = setup(g, p, 'turret');
      pressF(g, p); const gone = d.removed, at0 = p.kit.charges.e;
      __tick(g, 19.5); const at19 = p.kit.charges.e; __tick(g, 1);
      out.turret = farKept && gone && at0 === 0 && at19 === 0 && p.kit.charges.e === 1;
    }
    { // Trademark: 30 s; an Alarmbot already chasing can't be picked up
      const [g, p] = await dm('regent');
      p.kit.charges.c = 0; setup(g, p, 'trademark'); pressF(g, p);
      __tick(g, 29.5); const at29 = p.kit.charges.c; __tick(g, 1);
      const [g2, p2] = await dm('bastion');
      const a = setup(g2, p2, 'alarm'); a.target = g2.bots[0]; a.chaseUntil = g2.time + 99; pressF(g2, p2);
      out.trademarkAndChasingAlarm = at29 === 0 && p.kit.charges.c === 1 && !a.removed;
    }
    { // Spycam: leaves the camera view too
      const [g, p] = await dm('lattice');
      p.kit.charges.e = 0; const d = setup(g, p, 'cam'); p.kit.cam = d;
      pressF(g, p);
      out.spycam = d.removed && !p.kit.cam && !p.kit.view;
    }
    { // Cyber Cage: not mid-round, but in the buy phase (straight back, as everything is in the buy phase)
      const [g, p] = await dm('lattice');
      p.kit.charges.q = 0; const d = setup(g, p, 'cage'); pressF(g, p);
      const g2 = await __start({ mode: 'rounds', map: 'divide', agent: 'lattice' });
      __tick(g2, 1);
      const p2 = g2.player; p2.kit.charges.q = 0; p2.kit.charges.e = 0;
      const c2 = setup(g2, p2, 'cage'); pressF(g2, p2);
      const t2 = setup(g2, p2, 'cam'); pressF(g2, p2);
      out.cageBuyPhaseOnly = !d.removed && g2.mode.phase === 'buy' && c2.removed && p2.kit.charges.q === 1 && t2.removed && p2.kit.charges.e === 1;
    }
    { // Astra's star: recalled from across the map, back after 25 s
      const [g, p] = await dm('stella');
      p.kit.starsLeft = 0; setup(g, p, 'star', 15); pressF(g, p);
      __tick(g, 24.5); const at24 = p.kit.starsLeft; __tick(g, 1);
      out.star = at24 === 0 && p.kit.starsLeft === 1;
    }
    return { pass: Object.values(out).every(Boolean), ...out };
  }],
  ['Bot 5v5 (6 min): no errors, bots don\'t stay stuck on walls, bot flashes hit enemies more than their own side', async () => {
    const g = await __start({ mode: 'rounds', map: 'divide', botMode: 'fight' });
    const s = { flashes: 0, self: 0, ally: 0, enemy: 0, errors: 0, rounds: 0 };
    const flash = g.flash.bind(g);
    g.flash = (owner, pos, dur) => {
      const before = new Map(g.combatants.map(c => [c, c.st.blindUntil]));
      flash(owner, pos, dur);
      s.flashes++;
      for (const c of g.combatants) if (c.st.blindUntil > before.get(c) + 0.3) { if (c === owner) s.self++; else if (g.isEnemy(owner, c)) s.enemy++; else s.ally++; }
    };
    g.on('roundEnd', () => s.rounds++);
    g.on('live', () => { if (g.player.alive) g.kill(g.player, g.player, { part: 'body', def: { id: 'x', name: 'x' } }); });
    // Stuck bots: pushing to move but not getting anywhere (sampled every 0.5 s).
    const last = new Map(), run = new Map();
    s.stuckSec = 0; s.longestStuck = 0;
    for (let i = 0; i < 128 * 60 * 6 && g.state === 'playing'; i++) {
      try { g.tick(); } catch (e) { s.errors++; s.error = String(e.stack).slice(0, 300); }
      if (i % 64 || g.mode.phase === 'buy' || g.mode.phase === 'end') continue;
      for (const c of g.bots) {
        const was = last.get(c); last.set(c, [...c.pos]);
        const pushing = c.alive && (c.input.fwd || c.input.side) && !(c.st.channelUntil > g.time) && !(c.st.stunUntil > g.time) && !(c.st.slowUntil > g.time);
        if (pushing && was && Math.hypot(was[0] - c.pos[0], was[2] - c.pos[2]) < 0.05) { s.stuckSec += 0.5; run.set(c, (run.get(c) || 0) + 0.5); s.longestStuck = Math.max(s.longestStuck, run.get(c)); }
        else run.set(c, 0);
      }
    }
    return { pass: s.errors === 0 && s.rounds > 0 && s.self === 0 && s.enemy >= s.ally && s.longestStuck <= 4 && s.stuckSec < 40, ...s };
  }],
];

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
let failed = 0;
const report = (name, r) => {
  const ok = r && r.pass;
  if (!ok) failed++;
  const { pass, ...rest } = r || {};
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(rest)}`);
};

const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(url);
await page.waitForFunction(() => window.__game);
await page.addScriptTag({ content: PAGE_HELPERS });
for (const [name, fn] of checks) {
  try { report(name, await page.evaluate(fn)); } catch (e) { report(name, { error: String(e).slice(0, 300) }); }
}

if (!offline) {
  // Two tabs of one browser play online over BroadcastChannel: a host (Cinder) and a client (Thistle).
  const ctx = await browser.newContext();
  const H = await ctx.newPage(), C = await ctx.newPage();
  for (const p of [H, C]) { p.on('pageerror', e => errors.push(String(e))); await p.goto(url); await p.waitForFunction(() => window.__game); await p.addScriptTag({ content: PAGE_HELPERS }); }
  const form = (agent) => {
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
    set('net-transport', 'local'); set('net-room', 'CHECKS'); set('net-mode', 'dm'); set('net-agent', agent); set('net-name', agent);
    Object.assign(window.__game.settings, { botCount: 1, botMode: 'static', map: 'arena', agent });
  };
  await H.evaluate(form, 'cinder'); await C.evaluate(form, 'thistle');
  await H.evaluate(() => window.__game.hostOnline({ lobby: false }));
  await C.evaluate(() => window.__game.joinOnline({ agent: 'thistle' }));
  // The local transport can miss the first handshake on a slow machine, so join once more before giving up.
  const joined = () => C.waitForFunction(() => window.__game.net?.role === 'client', null, { timeout: 15000 }).then(() => true, () => false);
  if (!await joined()) { await C.evaluate(() => window.__game.joinOnline({ agent: 'thistle' })); if (!await joined()) throw new Error('client never joined the host'); }
  await H.waitForTimeout(2000);
  // Kill the client's Thistle on the host, then cast Ruse from the grave.
  const killedAt = await H.evaluate(() => { const g = window.__game.game, c = __remote(); g.damage(c, g.player, 999, { part: 'head', def: { id: 'vandal', name: 'Vandal' }, dist: 3, point: c.eye() }); c.respawnAt = Infinity; return g.time; }); // no deathmatch respawn: only Not Dead Yet can bring her back
  await C.waitForTimeout(300);
  await C.evaluate(() => { const p = window.__game.game.player; p.kit.charges.e = 2; p.input.abE = true; });
  await C.waitForTimeout(100);
  await C.evaluate(() => { const g = window.__game.game, k = g.player.kit, d = g.player.deathPos || g.player.pos; if (k.mapPick) { k.mapClick([d[0] + 3, d[1], d[2]]); k.mapConfirm(); } });
  await H.waitForFunction((t) => window.__game.game.smokes.some(s => s.born > t), killedAt, { timeout: 8000 }).catch(() => {}); // the smokes form 0.7 s after the call
  const smokes = await H.evaluate((t) => window.__game.game.smokes.filter(s => s.born > t).length, killedAt);
  report('Online: a dead Thistle\'s Ruse smoke reaches the host', { pass: smokes > 0, freshHostSmokes: smokes });
  // Not Dead Yet: both sides should agree she is alive.
  await H.evaluate(() => { __remote().kit.ultPoints = 8; });
  await C.waitForTimeout(150);
  await C.evaluate(() => { window.__game.game.player.input.abX = true; });
  await C.waitForTimeout(500);
  const client = await C.evaluate(() => window.__game.game.player.alive);
  const host = await H.evaluate(() => __remote().alive);
  report('Online: Not Dead Yet revives her on both screens', { pass: client && host, clientSeesAlive: client, hostSeesAlive: host });
  // Shooting the host's Sentry from the client breaks it on both screens.
  const spot = await C.evaluate(() => { const p = window.__game.game.player; const f = __ahead(p, 5); f[1] = p.pos[1]; return f; });
  await H.evaluate((f) => { const g = window.__game.game; window.__t = g.addDevice({ kind: 'turret', owner: g.player, pos: f, yaw: 0, aimYaw: 0, life: 60, next: g.time + 99 }); }, spot);
  await C.evaluate((f) => {
    const g = window.__game.game, p = g.player;
    window.__t = g.addDevice({ kind: 'turret', owner: __remote(), pos: f, yaw: 0, aimYaw: 0, life: 60, next: g.time + 99 });
    __aim(p, [f[0], f[1] + 0.5, f[2]]);
    const d = [-Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch)];
    for (let i = 0; i < 12; i++) g.fireBullets(p, p.gun, [d]);
  }, spot);
  await H.waitForFunction(() => window.__t.removed, null, { timeout: 5000 }).catch(() => {});
  await C.waitForFunction(() => window.__t.removed, null, { timeout: 5000 }).catch(() => {});
  const hostGone = await H.evaluate(() => !!window.__t.removed), clientGone = await C.evaluate(() => !!window.__t.removed);
  report('Online: a client shooting the host\'s Sentry breaks it for both', { pass: hostGone && clientGone, hostSentryGone: hostGone, clientSentryGone: clientGone });
}

if (errors.length) { failed++; console.log('Page errors:', errors.slice(0, 5)); }
await browser.close();
server.close();
console.log(failed ? `${failed} failed` : 'All checks passed');
process.exit(failed ? 1 : 0);
