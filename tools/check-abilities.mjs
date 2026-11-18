// Headless checks for how abilities interact (flashes, smokes, death, detain, suppression, ult orbs, online).
//   npm i -D playwright && npx playwright install chromium   (once)
//   node tools/check-abilities.mjs            all checks
//   node tools/check-abilities.mjs --offline  skip the two-tab online checks
//   node tools/check-abilities.mjs --only Bots   only the checks whose name contains 'Bots' (implies --offline)
// Serves this folder on a local port, drives the real game through window.__game with the loop frozen,
// and ticks the simulation by hand. Exits with code 1 if any check fails.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const offline = process.argv.includes('--offline') || !!only;

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
// Tick through the rest of the buy phase (30 s, or 45 s in the first round of a half).
window.__live = (g) => __tick(g, Math.max(0, g.mode.phaseEnd - g.time) + 1);
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
    __live(g);
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
    k.agent.abilities.q.use(k); // Ember: fire pool when it lands
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
  ['Dying takes down what Valorant takes down: Venom\'s gas after 2 s, sentinel gadgets at once; smokes and fire stay', async () => {
    const kill = (g, c) => g.kill(c, g.bots[0], { part: 'body', def: { id: 'x', name: 'x' } });
    const v = await __start({ agent: 'venom' }), p = v.player, k = p.kit;
    k.agent.abilities.q.use(k); k.agent.abilities.e.use(k); k.agent.abilities.c.use(k); k.agent.abilities.x.use(k);
    __tick(v, 1.5);
    const gas = () => v.smokes.filter(s => s.owner === p && s.kind === 'gas').length;
    const before = gas(), acid = () => v.zones.some(z => z.acid);
    kill(v, p);
    __tick(v, 1);
    const lingering = gas();
    __tick(v, 1.5);
    const after = { gas: gas(), emitter: v.devices.some(d => d.kind === 'emitter' && !d.removed), acid: acid(), canToggle: !!k.agent.abilities.q.reuse(k) };
    const b = await __start({ agent: 'bastion' }), q = b.player, bk = q.kit;
    __place(b, q, 12);
    q.pitch = -0.5; // the Hive lands a few metres ahead
    for (const key of ['q', 'e', 'c']) bk.agent.abilities[key].use(bk);
    q.pitch = 0;
    b.addSmoke(q, __ahead(q, 4), b.time); // someone else's kind of smoke: it stays
    __tick(b, 1.5);
    const had = b.devices.filter(d => d.owner === q && !d.removed).map(d => d.kind).sort().join();
    bk.agent.abilities.c.use(bk, 'right'); // one more Hive, lobbed: still in the air when she dies
    kill(b, q);
    __tick(b, 2);
    const left = b.devices.filter(d => d.owner === q && !d.removed).map(d => d.kind).join(), smokeStays = b.smokes.some(s => s.owner === q);
    return { pass: before > 0 && lingering === before && after.gas === 0 && !after.emitter && !after.canToggle && left === '' && had.includes('turret') && had.includes('swarm') && smokeStays, before, lingering, ...after, had, left, smokeStays };
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
    return { pass: during <= 9 && after === before, farBefore: before, farDuring: during, farAfter: after };
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
    __live(g);
    const p = g.player, m = g.mode;
    p.kit.shield = true;
    m.spike = { state: 'planted', pos: [...p.pos], site: 'A', plantedAt: g.time };
    m.detonate();
    return { pass: !p.alive, alive: p.alive };
  }],
  ['Placed signatures: no cooldown while placed; back 25 s after a pick-up, 45 s after being destroyed; Bastion recalls by holding E; Lattice picks up from range', async () => {
    const out = {};
    { const g = await __start({ agent: 'bastion', map: 'arena' }), p = g.player, k = p.kit;
      __place(g, p, 12); p.pitch = -0.3; __tick(g, 0.2);
      k.charges.e = 1; k.spend('e'); // placed through the normal path: no cooldown may start
      const t = g.devices.find(d => d.kind === 'turret' && d.owner === p);
      __tick(g, 50); out.noCooldownWhilePlaced = k.charges.e === 0;
      g.breakUtil(t); __tick(g, 44.5); const at44 = k.charges.e; __tick(g, 1);
      out.destroyed45 = at44 === 0 && k.charges.e === 1;
      k.agent.abilities.e.use(k); k.charges.e = 0; __tick(g, 0.3);
      const t2 = g.devices.find(d => d.kind === 'turret' && d.owner === p && !d.removed);
      p.pos[2] += 30; p.prevPos = [...p.pos]; // far away
      p.input.abEHeld = true; __tick(g, 0.7); p.input.abEHeld = false;
      out.recalledFromAfar = !!t2 && t2.removed && k.charges.e === 0;
      __tick(g, 25.2); out.recallBack25 = k.charges.e === 1; }
    { const g = await __start({ agent: 'lattice', map: 'arena' }), p = g.player, k = p.kit;
      __place(g, p, 16); __tick(g, 0.2);
      const pos = __ahead(p, 12); pos[1] = p.pos[1];
      const d = g.addDevice({ kind: 'cam', owner: p, pos, life: 999 }); k.cam = d; k.charges.e = 0;
      __aim(p, [pos[0], pos[1] + 0.2, pos[2]]);
      out.camInViewFromAfar = k.pickupInView() === d;
      const w = __box(g, [pos[0] - 2, pos[1], pos[2] + 3], [pos[0] + 2, pos[1] + 3, pos[2] + 3.5]);
      out.notThroughWall = k.pickupInView() === null;
      g.world.boxes = g.world.boxes.filter(q => q !== w); }
    return { pass: Object.values(out).every(Boolean), ...out };
  }],
  ['Issue #81 agents: slide, Phase Out, turned Frost Wall, Seize, prowler, Duel area, Scout Drone, Overload down, Lightspeed pause', async () => {
    const out = {};
    { // Volt: jumping mid-slide does nothing
      const g = await __start({ agent: 'volt', map: 'arena' }), p = g.player, k = p.kit;
      __place(g, p, 20); __tick(g, 0.3);
      k.highGear = { slideAt: 0 }; k.slideAt = 0; p.input.fwd = 1; __tick(g, 0.6);
      p.input.altPressed = true; g.tick(); p.input.altPressed = false;
      const y0 = p.pos[1]; p.input.jump = true; __tick(g, 0.3); p.input.jump = false; p.input.fwd = 0;
      out.slideStaysDown = !!p.dash?.slide && Math.abs(p.pos[1] - y0) < 0.05; }
    { // Mirage: a Double during Phase Out
      const g = await __start({ agent: 'mirage', map: 'arena' }), p = g.player, k = p.kit;
      __place(g, p, 12); __tick(g, 0.3);
      k.ultPoints = 99; k.agent.abilities.x.use(k); __tick(g, 0.5);
      k.charges.c = 1; p.input.abC = true; g.tick(); p.input.abC = false; __tick(g, 1); p.input.firePressed = true; g.tick(); p.input.firePressed = false; __tick(g, 0.2);
      out.doubleInDrift = !!k.drift && g.devices.some(d => d.kind === 'decoy' && d.owner === p); }
    { // Solace: a wall turned 45 degrees blocks sight along its line, and its owner can shoot it down
      const g = await __start({ agent: 'solace', map: 'arena' }), p = g.player;
      __place(g, p, 16); __tick(g, 0.3);
      const at = __ahead(p, 8); at[1] = p.pos[1];
      const w = g.addTurnedWall(p, at, p.yaw + Math.PI / 4, 40, { half: 5.2, h: 2.6, th: 0.6, style: 'ice', lift: true, segments: 4, hp: 400, fortify: 200 });
      const blocks = !g.world.lineOfSight(p.eye(), [at[0] + Math.sin(p.yaw) * -3, p.eye()[1], at[2] + Math.cos(p.yaw) * -3]);
      const hp0 = w.hp; __aim(p, [w.pos[0], w.pos[1] + 1.3, w.pos[2]]);
      const { WEAPONS } = await import('/js/weapons.js'); const gun = new (p.inv.secondary.constructor)(WEAPONS.vandal);
      g.fireBullets(p, gun, [[-Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch)]]);
      out.turnedWall = !!w.rot && w.boxes.length > 1 && blocks && w.hp < hp0; }
    { // Nyx: Seize holds without revealing; a prowler on the hunt hops onto a box, and its clock stops
      const g = await __start({ agent: 'nyx', map: 'arena', botCount: 1 }), p = g.player, b = g.bots[0];
      __place(g, p, 16); __tick(g, 0.3);
      b.pos = __ahead(p, 4); b.pos[1] = p.pos[1]; b.prevPos = [...b.pos];
      let tether = false; g.on('tether', () => { tether = true; });
      g.pulse(p, [b.pos[0], b.pos[1] + 1, b.pos[2]], 6.58, 'hold+deaf', 4.5, 0xb07a9a);
      out.seizeNoReveal = !(b.st.revealUntil > g.time);
      b.pos = __ahead(p, 10); b.pos[1] = p.pos[1] + 1.2; b.prevPos = [...b.pos];
      __box(g, [b.pos[0] - 1.5, p.pos[1], b.pos[2] - 1.5], [b.pos[0] + 1.5, p.pos[1] + 1.2, b.pos[2] + 1.5]);
      g.markTrail(b, p, 12);
      const d = g.addDevice({ kind: 'prowler', owner: p, pos: __ahead(p, 1).map((v, i) => i === 1 ? p.pos[1] : v), dir: [0, 0, -1], life: 2.5 });
      __tick(g, 2.8);
      out.prowlerClimbedAndLasted = !d.removed ? d.pos[1] > p.pos[1] + 1 : b.st.nearUntil > g.time; }
    { // Vanta: the Duel takes the closest enemy in the area
      const g = await __start({ agent: 'vanta', map: 'arena', botCount: 2, botMode: 'static' }), p = g.player, [b1, b2] = g.bots;
      __place(g, p, 30); __tick(g, 0.3);
      b1.pos = __ahead(p, 20); b1.pos[1] = p.pos[1]; b1.prevPos = [...b1.pos];
      b2.pos = __ahead(p, 9); b2.pos[1] = p.pos[1]; b2.pos[0] += 4; b2.prevPos = [...b2.pos];
      p.kit.ultPoints = 99; p.kit.agent.abilities.x.use(p.kit); __tick(g, 0.9);
      out.duelClosest = g.contract?.b === b2; }
    { // Ballast: the drone stands still without input, runs with W, jumps with Space
      const g = await __start({ agent: 'ballast', map: 'arena' }), p = g.player, k = p.kit;
      __place(g, p, 20); __tick(g, 0.3);
      k.agent.abilities.c.use(k); __tick(g, 1); const d = k.pilot, still = [...d.pos];
      __tick(g, 1); const stood = Math.hypot(d.pos[0] - still[0], d.pos[2] - still[2]) < 0.05;
      for (let i = 0; i < 64; i++) { p.input.fwd = 1; g.tick(); } p.input.fwd = 0; // the keys are read every frame (the pilot code clears them)
      const ran = Math.hypot(d.pos[0] - still[0], d.pos[2] - still[2]) > 2;
      const y0 = d.pos[1]; p.input.jumpHeld = true; __tick(g, 0.15); p.input.jumpHeld = false; const jumped = d.pos[1] > y0 + 0.3;
      out.drone = stood && ran && jumped; }
    { // Override: downed health doesn't drain
      const g = await __start({ agent: 'override', map: 'arena' }), p = g.player, k = p.kit, b = g.bots[0];
      __place(g, p, 12); __tick(g, 0.3);
      k.nullUntil = g.time + 10; k.nullSaved = false;
      g.damage(p, b, 500, { part: 'body', def: { id: 'vandal', name: 'Vandal' }, dist: 5, point: p.eye() });
      const hp0 = p.hp; __tick(g, 3);
      out.downedHpHolds = !!k.downed && hp0 === 850 && p.hp === 850; }
    { // Lumen: the second dash waits 0.3 s and goes the way you move then
      const g = await __start({ agent: 'lumen', map: 'arena' }), p = g.player, k = p.kit;
      __place(g, p, 20); __tick(g, 0.3);
      p.input.fwd = 1; k.agent.abilities.q.use(k, 'left'); __tick(g, 0.55);
      const paused = !p.dash; p.input.fwd = 0; p.input.side = 1; __tick(g, 0.25); p.input.side = 0;
      const turned = !!p.dash && Math.abs(p.dash.dir[0] * Math.cos(p.yaw) - p.dash.dir[1] * Math.sin(p.yaw)) > 0.9;
      out.lightspeedPause = paused && turned; }
    return { pass: Object.values(out).every(Boolean), ...out };
  }],
  ['Custom game: lobby size and bots set the teams; cheats give money, abilities, ultimate, ammo and no damage', async () => {
    const cheats = { money: true, abilities: true, ult: true, ammo: true, invincible: true };
    const g = await __start({ mode: 'custom', custom: { base: 'rounds', players: 6, bots: 4, botMode: 'static', cheats }, map: 'divide' });
    __live(g);
    const p = g.player, k = p.kit, m = g.mode;
    const mates = g.combatants.filter(c => c !== p && !g.isEnemy(p, c)).length, foes = g.combatants.filter(c => g.isEnemy(p, c)).length;
    p.credits = 0; k.charges.c = 0; k.ultPoints = 0; p.inv.secondary.mag = 1;
    g.tick();
    const cheatsOn = p.credits === 9000 && k.charges.c >= 1 && k.ultPoints === k.ultCost && p.inv.secondary.mag === p.inv.secondary.def.mag;
    const foe = g.combatants.find(c => g.isEnemy(p, c));
    g.damage(p, foe, 500, { part: 'head', def: { id: 'vandal', name: 'Vandal' }, dist: 5, point: p.eye() });
    const g2 = await __start({ mode: 'custom', custom: { base: 'dm', players: 5, bots: 4, botMode: 'fight', cheats: { money: false, abilities: false, ult: false, ammo: false, invincible: false } }, map: 'arena' });
    const dmBots = g2.bots.length;
    return { pass: !!m && mates === 1 && foes === 3 && cheatsOn && p.alive && p.hp === 100 && dmBots === 4, mates, foes, cheatsOn, alive: p.alive, dmBots };
  }],
  ['Collaterals: a headshot or a killing shot carries on to the enemy behind; a body shot that does not kill stops', async () => {
    const g = await __start({ agent: 'cinder', map: 'arena', botCount: 2, botMode: 'static' });
    const p = g.player, [b1, b2] = g.bots;
    if (!__place(g, p, 20)) return { error: 'no open ground' };
    const { WEAPONS } = await import('/js/weapons.js');
    const Gun = p.inv.secondary.constructor, vandal = new Gun(WEAPONS.vandal);
    const shot = (aimY, hp1) => {
      for (const [b, z] of [[b1, 6], [b2, 12]]) { b.pos = [p.pos[0], p.pos[1], p.pos[2] - z]; b.prevPos = [...b.pos]; b.hp = 100; b.armor = 0; b.alive = true; b.yaw = 0; }
      b1.hp = hp1;
      const e = p.eye(), t = [b1.pos[0], b1.pos[1] + aimY, b1.pos[2]];
      const d = [t[0] - e[0], t[1] - e[1], t[2] - e[2]], l = Math.hypot(...d);
      g.fireBullets(p, vandal, [d.map(v => v / l)]);
      return { b1: b1.alive ? b1.hp : 'dead', b2: b2.hp };
    };
    const head = shot(b1.eye()[1] - b1.pos[1], 100), body = shot(1.0, 100), killBody = shot(1.0, 10);
    return { pass: head.b2 < 100 && body.b2 === 100 && killBody.b1 === 'dead' && killBody.b2 < 100, head, body, killBody };
  }],
  ['Wallbangs: wood costs less than metal of the same thickness, and an overlapping corner is paid once', async () => {
    const g = await __start({ agent: 'cinder', map: 'arena', botCount: 1, botMode: 'static' });
    const p = g.player, b = g.bots[0];
    if (!__place(g, p, 12)) return { error: 'no open ground' };
    b.pos = [p.pos[0], p.pos[1], p.pos[2] - 8]; b.prevPos = [...b.pos];
    const e = p.eye(), d = [0, 0, -1], z = p.pos[2] - 4;
    const wall = (mat, z0, z1) => { const q = { min: [p.pos[0] - 1, p.pos[1], z1], max: [p.pos[0] + 1, p.pos[1] + 3, z0], pen: true, mat, temp: true }; g.world.boxes.push(q); return q; };
    const clear = () => { g.world.boxes = g.world.boxes.filter(q => !q.temp); };
    const mult = () => { const r = g.trace(p, e, d, 2.2); return r.hits[0] ? +r.hits[0].mult.toFixed(3) : null; };
    clear(); wall('crate', z, z - 0.5); const wood = mult();
    clear(); wall('greymetal', z, z - 0.5); const metal = mult();
    clear(); wall('plaster', z, z - 0.5); const one = mult();
    clear(); wall('plaster', z, z - 0.5); wall('plaster', z - 0.2, z - 0.5); const overlap = mult(); // the second box sits inside the first
    clear();
    return { pass: wood > one && one > metal && overlap === one, wood, plaster: one, metal, overlap };
  }],
  ['Snipers: the Marshal and Operator drop out of the scope after a shot; the Outlaw once both barrels are fired', async () => {
    const g = await __start({ agent: 'cinder', map: 'arena', botCount: 1, botMode: 'static' });
    const p = g.player, out = {};
    const { WEAPONS } = await import('/js/weapons.js');
    for (const id of ['marshal', 'operator', 'outlaw']) {
      const gun = p.give(id); gun.mag = gun.def.mag; p.equip('primary', g.time, true); __tick(g, 2);
      const scoped = () => gun.zoomLevel > 0 || gun.adsWant;
      p.input.altPressed = true; g.tick(); p.input.altPressed = false; __tick(g, 0.5);
      const before = scoped();
      p.input.fire = p.input.firePressed = true; g.tick(); p.input.fire = p.input.firePressed = false;
      const afterOne = scoped();
      __tick(g, 1);
      p.input.fire = p.input.firePressed = true; g.tick(); p.input.fire = p.input.firePressed = false;
      out[id] = { before, afterOne, afterTwo: scoped() };
    }
    const pass = out.marshal.before && !out.marshal.afterOne && out.operator.before && !out.operator.afterOne && out.outlaw.before && out.outlaw.afterOne && !out.outlaw.afterTwo;
    return { pass, ...out };
  }],
  ['Ultimates can be put away and taken out again: Finale, Talon Strike, Coup de Grace', async () => {
    const out = {};
    for (const [agent, field] of [['blitz', 'launcher'], ['hawke', 'beams'], ['regent', 'gun']]) {
      const g = await __start({ agent, map: 'arena', botCount: 1, botMode: 'static' });
      const p = g.player, k = p.kit;
      k.ultPoints = 99; k.agent.abilities.x.use(k); __tick(g, 1.5);
      const x = () => { p.input.abX = true; g.tick(); p.input.abX = false; __tick(g, 0.2); };
      const out1 = field === 'gun' ? p.slot === 'ability' : !k[field].away;
      x(); const away = field === 'gun' ? p.slot !== 'ability' && !!(p.inv.ability || k.gunStash.tourdeforce) : k[field].away && !k.busy();
      p.input.fire = p.input.firePressed = true; g.tick(); p.input.fire = p.input.firePressed = false; // shoots the gun, not the ult
      const kept = field === 'gun' ? (p.inv.ability?.mag ?? k.gunStash.tourdeforce?.mag) === 5 : !!k[field] && (field !== 'beams' || k.beams.left === 3);
      x(); const back = field === 'gun' ? p.slot === 'ability' : !k[field].away;
      out[agent] = { out1, away, kept, back };
    }
    return { pass: Object.values(out).every(o => o.out1 && o.away && o.kept && o.back), ...out };
  }],
  ['Crouching: spread x0.85 (Classic x0.9) and, standing still, 15% less sideways recoil', async () => {
    const g = await __start({ agent: 'cinder', map: 'arena', botCount: 1, botMode: 'static' });
    const p = g.player;
    if (!__place(g, p, 8)) return { error: 'no open ground' };
    const { WEAPONS } = await import('/js/weapons.js');
    const vandal = new (p.inv.secondary.constructor)(WEAPONS.vandal), classic = p.inv.secondary;
    const measure = (crouch) => {
      p.input.crouch = crouch; __tick(g, 0.4);
      vandal.heat = 0;
      const sp = { vandal: vandal.spread(p), classic: classic.spread(p) };
      const rnd = Math.random; Math.random = () => 0.3;
      vandal.heat = 8; vandal.mag = 25; vandal.offY = 0; vandal.shoot(p, g.time);
      Math.random = rnd;
      return { ...sp, side: vandal.lastKick.side, crouched: p.crouched };
    };
    const up = measure(false), down = measure(true);
    p.input.crouch = false;
    const r = (a, b) => +(b / a).toFixed(3);
    const out = { crouched: down.crouched && !up.crouched, vandal: r(up.vandal, down.vandal), classic: r(up.classic, down.classic), side: r(up.side, down.side) };
    return { pass: out.crouched && out.vandal === 0.85 && out.classic === 0.9 && out.side === 0.85, ...out };
  }],
  ['Duel: 21 m apart, healed to 150, Push Wall covers (two for Vanta, one for the enemy), no abilities, no shots in the face-off', async () => {
    const g = await __start({ agent: 'vanta', map: 'arena', botCount: 1, botMode: 'static' });
    const p = g.player, b = g.bots[0];
    if (!__place(g, p, 12)) return { error: 'no open ground' };
    b.pos = [p.pos[0], p.pos[1], p.pos[2] - 8]; b.prevPos = [...b.pos];
    p.hp = 30; p.armor = 0; b.hp = 10; b.st.slowUntil = g.time + 30;
    p.kit.focusUntil = 0; p.kit.shield = false;
    p.kit.ultPoints = 99; p.kit.agent.abilities.x.use(p.kit);
    const focus = p.kit.shield && p.kit.focusUntil > g.time;
    for (let i = 0; i < 128 * 3 && !g.contract; i++) g.tick();
    const k = g.contract;
    if (!k) return { error: 'nobody was pulled in' };
    const gap = Math.hypot(p.pos[0] - b.pos[0], p.pos[2] - b.pos[2]);
    const size = k.covers.map(w => [w.box.max[0] - w.box.min[0], w.box.max[1] - w.box.min[1], w.box.max[2] - w.box.min[2]].map(v => +v.toFixed(2)).join('x'));
    const mine = k.covers.filter(w => Math.abs((w.box.min[2] + w.box.max[2]) / 2 - p.pos[2]) < 4).length;
    const healed = p.hp === 100 && p.armor === 50 && b.hp === 100 && b.armor === 50 && !(b.st.slowUntil > g.time);
    const ammo = p.gun.mag; p.input.fire = p.input.firePressed = true; __tick(g, 0.5); p.input.fire = p.input.firePressed = false;
    const shotInFaceoff = p.gun.mag !== ammo;
    p.kit.charges.q = 1; p.input.abQ = true; g.tick(); p.input.abQ = false;
    const ability = !!p.kit.armed;
    const pass = focus && Math.abs(gap - 21) < 0.2 && healed && size.every(x => x === '5.24x3x0.4') && mine === 2 && k.covers.length === 3 && !shotInFaceoff && !ability;
    return { pass, focus, gap: +gap.toFixed(2), healed, size, mine, shotInFaceoff, ability };
  }],
  ['Duel: the covers come down 2.5 s into the fight; if time runs out both die', async () => {
    const g = await __start({ agent: 'vanta', map: 'arena', botCount: 1, botMode: 'static' });
    const p = g.player, b = g.bots[0];
    g.startContract(p, b);
    const k = g.contract, boxes = k.covers.map(w => w.box);
    p.st.channelUntil = b.st.channelUntil = g.time + 30; // nobody shoots
    __tick(g, 1.5 + 2.4); const upBefore = boxes.every(q => g.world.boxes.includes(q));
    __tick(g, 0.2); const downAfter = boxes.every(q => !g.world.boxes.includes(q));
    __tick(g, 13 - 2.6 - 0.1); const aliveBefore = p.alive && b.alive;
    __tick(g, 0.3);
    const arenaGone = !g.contract && !g.world.boxes.some(q => q.arena);
    return { pass: upBefore && downAfter && aliveBefore && !p.alive && !b.alive && arenaGone, upBefore, downAfter, aliveBefore, pAlive: p.alive, bAlive: b.alive, arenaGone };
  }],
  ['Duel: the winner goes back 2 s after the kill; the loser\'s body, gun and the spike land where they were pulled from', async () => {
    const g = await __start({ mode: 'rounds', map: 'divide', agent: 'vanta', side: 'def', botMode: 'static' });
    __live(g);
    const p = g.player, m = g.mode, foe = g.combatants.find(c => g.isEnemy(p, c) && c.alive);
    if (!__place(g, p, 12)) return { error: 'no open ground' };
    foe.pos = [p.pos[0], p.pos[1], p.pos[2] - 8]; foe.prevPos = [...foe.pos];
    m.spike = { state: 'carried', carrier: foe, pos: null, plantProg: 0, defuseProg: 0, defuser: null, plantedAt: 0, site: null };
    const backA = [...p.pos], backB = [...foe.pos];
    g.startContract(p, foe);
    __tick(g, 1.6);
    g.damage(foe, p, 500, { part: 'head', def: { id: 'vandal', name: 'Vandal' }, dist: 20, point: foe.eye() });
    __tick(g, 1.9);
    const stillIn = !!g.contract && g.inArena(p.pos);
    __tick(g, 0.2);
    const d = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
    const out = { stillIn, back: +d(p.pos, backA).toFixed(2), body: +d(foe.deathPos, backB).toFixed(2), gun: foe.deathDrop ? +d(foe.deathDrop.pos, backB).toFixed(2) : null, spike: m.spike.pos ? +d(m.spike.pos, backB).toFixed(2) : null, spikeState: m.spike.state };
    return { pass: stillIn && out.back < 1.5 && out.body < 0.1 && out.gun != null && out.gun < 1 && out.spike != null && out.spike < 1, ...out };
  }],
  ['Duel: a new round takes the arena down', async () => {
    const g = await __start({ mode: 'rounds', map: 'divide', agent: 'vanta', botMode: 'static' });
    __live(g);
    const p = g.player, foe = g.combatants.find(c => g.isEnemy(p, c));
    g.startContract(p, foe);
    g.mode.startRound();
    return { pass: !g.contract && !g.world.boxes.some(q => q.arena), contract: !!g.contract, boxesLeft: g.world.boxes.filter(q => q.arena).length };
  }],
  ['Rekindle and Overload give back the shields you had, not free heavy shields', async () => {
    const out = {};
    for (const agent of ['cinder', 'override']) {
      const g = await __start({ mode: 'rounds', map: 'divide', agent, botMode: 'static' });
      __live(g);
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
    k.charges.c = 2; o.input.abC = true; __tick(g, 0.7); // 0.5 s to take it out
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
    k.charges.c = 2; o.input.abC = true; __tick(g, 0.7);
    o.input.firePressed = true; __tick(g, 1);
    return { pass: Math.abs(o.pos[1] - (y + h)) < 0.05, landedHeight: +(o.pos[1] - y).toFixed(2) };
  }],
  ['Grenades thrown onto a box land on top of it', async () => {
    const g = await __start({ agent: 'cinder', map: 'arena' });
    const o = g.player, k = o.kit;
    if (!__place(g, o, 14)) return { error: 'no open ground' };
    const [x, y, z] = o.pos;
    __box(g, [x - 1, y, z - 8], [x + 1, y + 1, z - 6]); // 1 m crate
    __aim(o, [x, y + 1.5, z - 7]); o.pitch = 0.21; // a lob that comes down on its top
    k.agent.abilities.q.use(k, 'right'); __tick(g, 2);
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
    k.charges.e = 2; o.input.abE = true; __tick(g, 1.1); // 1 s to take it out
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
    o.pitch = -0.3; o.kit.agent.abilities.e.use(o.kit); // thrown at the floor a few metres short of b: it sticks there and pulses
    o.pitch = 0;
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
    __live(g);
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
    b.pos = __ahead(p, 9); b.pos[1] = p.pos[1]; b.prevPos = [...b.pos]; b.hp = 9999; b.armor = 0; // tanky until after the slide
    const dome = g.addSmoke(b, __ahead(p, 5), g.time, { radius: 2.2, life: 12, kind: 'cove' });
    __tick(g, 0.9); // its shell forms 0.8 s after the cast
    b.pos = __ahead(p, 9); b.pos[1] = p.pos[1]; b.prevPos = [...b.pos]; b.hp = 9999; b.armor = 0;
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
    // Stand the bot under the high wire while it arms (1.5 s): nothing happens.
    const spot = [p.pos[0], y, p.pos[2] - 1];
    const stand = (sec) => { for (let i = 0; i < sec * 128; i++) { b.pos = [...spot]; b.prevPos = [...spot]; g.tick(); } };
    const caught = () => g.devices.some(d => d.kind === 'wire' && d.victim === b);
    stand(1.7);
    const trippedHigh = caught();
    high.removed = true; g.tick();
    __aim(p, [p.pos[0] + 3, y + 1.0, p.pos[2] - 1]);
    p.kit.agent.abilities.c.use(p.kit);
    stand(1);
    const early = caught(); // still arming
    stand(0.7);
    const trippedLow = caught();
    b.st.revealUntil = 0;
    stand(0.8); // the zap comes 0.7 s after the catch
    const zapped = b.st.slowUntil > g.time && b.st.revealUntil > g.time;
    return { pass: highY !== null && Math.abs(highY - 2.4) < 0.2 && !trippedHigh && !early && trippedLow && zapped, wireHeight: highY, trippedByHighWire: trippedHigh, trippedWhileArming: early, trippedByWaistWire: trippedLow, zapped };
  }],
  ['Ravenous speeds up reload; Rally buffs teammates too', async () => {
    const g = await __start({ mode: 'rounds', map: 'divide', agent: 'vex' });
    __live(g);
    const p = g.player, gun = p.gun;
    gun.mag = 1; gun.startReload(p, g.time); const normal = gun.reloadDur; gun.reloading = false;
    p.kit.empressUntil = g.time + 30; g.tick();
    gun.mag = 1; gun.startReload(p, g.time); const fast = gun.reloadDur; gun.reloading = false;
    const ally = g.bots.find(x => !g.isEnemy(p, x));
    const zone = g.addZone({ kind: 'stim', owner: p, pos: [...ally.pos], r: 6, life: 12 }, g.time);
    __tick(g, 0.1);
    return { pass: Math.abs(fast - normal / 1.1) < 0.01 && ally.st.stimUntil > g.time, reloadNormal: normal, reloadRavenous: fast, allyStimmed: ally.st.stimUntil > g.time };
  }],
  ['5v5 recharges follow Valorant: Dark Cover on its 40 s timer (only what you held), Tailwind after two kills, Sky Smoke never', async () => {
    const setup = async (agent) => {
      const g = await __start({ mode: 'rounds', map: 'divide', agent });
      __live(g);
      for (const b of g.bots) { b.brain.mode = 'static'; b.hp = 1e6; }
      g.player.hp = 1e6;
      return g;
    };
    let g = await setup('umbra'), k = g.player.kit;
    k.charges.e = 1; g.tick(); // the free smoke only
    k.charges.e = 0; k.ready.e = g.time + 40; // just cast it
    __tick(g, 39); const omenAt39 = k.charges.e;
    __tick(g, 2); const omenAt41 = k.charges.e;
    __tick(g, 42); const omenAt83 = k.charges.e; // no free second smoke
    g = await setup('zephyr'); k = g.player.kit;
    k.charges.e = 0; k.ready.e = g.time + 12;
    __tick(g, 20); const jettTimer = k.charges.e;
    const foes = g.bots.filter(b => g.isEnemy(g.player, b));
    g.kill(foes[0], g.player, { def: g.player.gun.def, part: 'body' }); const jettOneKill = k.charges.e;
    g.kill(foes[1], g.player, { def: g.player.gun.def, part: 'body' }); const jettTwoKills = k.charges.e;
    g = await setup('granite'); k = g.player.kit;
    k.charges.e = 0; k.ready.e = g.time + 35;
    __tick(g, 40); const brim = k.charges.e;
    const pass = omenAt39 === 0 && omenAt41 === 1 && omenAt83 === 1 && jettTimer === 0 && jettOneKill === 0 && jettTwoKills === 1 && brim === 0;
    return { pass, omenAt39, omenAt41, omenAt83, jettTimer, jettOneKill, jettTwoKills, brim };
  }],
  ['Reloads: firing doesn\'t cut a magazine reload short (it does a round-by-round one); an empty magazine reloads itself', async () => {
    const g = await __start({});
    const p = g.player;
    const gun = p.give('vandal'); p.equip('primary', g.time, true); __tick(g, 1.2);
    gun.mag = 10; gun.startReload(p, g.time);
    p.input.firePressed = true; g.tick(); p.input.firePressed = false;
    const stillReloading = gun.reloading, shotsMid = 25 - gun.mag;
    __tick(g, 2.6); const full = gun.mag;
    gun.mag = 0; __tick(g, 0.1); const auto = gun.reloading;
    const m = p.give('marshal'); p.equip('primary', g.time, true); __tick(g, 1.5);
    m.mag = 2; m.startReload(p, g.time); __tick(g, 0.8);
    const loaded = m.mag; p.input.firePressed = true; g.tick(); p.input.firePressed = false;
    const marshalCut = !m.reloading;
    return { pass: stillReloading && full === 25 && auto && loaded === 3 && marshalCut, stillReloading, shotsMid, full, autoReload: auto, marshalLoaded: loaded, marshalCut };
  }],
  ['Vex: Glare goes 10 m straight ahead through a wall, where its preview showed; Feast and Vanish take the nearest soul orb at any distance on the key press', async () => {
    const g = await __start({ agent: 'vex' });
    const p = g.player, k = p.kit;
    if (!__place(g, p, 14)) return { error: 'no open ground' };
    __box(g, [p.pos[0] - 3, p.pos[1], p.pos[2] - 5], [p.pos[0] + 3, p.pos[1] + 4, p.pos[2] - 4.5]); // a wall 5 m ahead
    k.charges.c = 2; p.input.abC = true; g.tick(); __tick(g, 0.9); // 0.77 s to take it out
    const shown = k.previewPos && [...k.previewPos];
    p.input.firePressed = true; g.tick(); __tick(g, 1.2);
    const eye = g.devices.find(d => d.kind === 'leer' && d.owner === p);
    const placed = eye && shown && Math.hypot(eye.pos[0] - shown[0], eye.pos[1] - shown[1], eye.pos[2] - shown[2]) < 0.01;
    const beyondWall = eye && eye.pos[2] < p.pos[2] - 5;
    const e = p.eye();
    // Both orbs far out of range and behind the wall: distance and sight don't matter, nearest goes first.
    k.orbs = [{ pos: [e[0], e[1], e[2] - 60], until: g.time + 3, life: 3 }, { pos: [e[0], e[1], e[2] - 30], until: g.time + 3, life: 3 }];
    p.hp = 50; k.charges.q = 1; p.input.abQ = true; g.tick();
    const fed = k.orbs.length === 1 && k.orbs[0].pos[2] === e[2] - 60, healing = g.time < k.healOverUntil;
    __tick(g, 0.5);
    const walk = p.maxSpeed(g.time);
    k.charges.e = 1; p.input.abE = true; g.tick(); __tick(g, 0.4);
    const vanished = k.orbs.length === 0 && p.st.intangibleUntil > g.time;
    // Vanish: much faster, steered by WASD in any direction (here straight sideways), and the gun can't fire.
    const x0 = p.pos[0], mag = p.gun.mag;
    p.input.side = 1; p.input.fwd = 0;
    for (let i = 0; i < 64; i++) { p.input.fire = p.input.firePressed = true; g.tick(); }
    p.input.fire = p.input.firePressed = false; p.input.side = 0;
    const fast = p.maxSpeed(g.time) > walk * 1.6, strafed = p.pos[0] - x0 > 2, noGun = p.gun.mag === mag;
    __tick(g, 2);
    const over = !(p.st.intangibleUntil > g.time) && Math.abs(p.maxSpeed(g.time) - walk) < 0.01;
    return { pass: !!placed && beyondWall && fed && healing && vanished && fast && strafed && noGun && over, placed: !!placed, beyondWall, nearestAnyDistance: fed, healing, vanished, fast, strafed, noGun, over };
  }],
  ['Bots step out of an enemy molly, draw the sidearm when caught reloading up close, and save together when that buys rifles next round', async () => {
    let g = await __start({ botMode: 'fight' });
    let b = g.bots[0], p = g.player;
    if (!__place(g, b, 10)) return { error: 'no open ground' };
    b.hp = p.hp = 1e6; p.pos = [0, -50, 0]; p.prevPos = [...p.pos]; // nobody to fight
    const z = g.addZone({ kind: 'fire', owner: p, pos: [...b.pos], r: 4.5, life: 7, dps: 60, heal: 0, def: { id: 'test', name: 'Test', cat: 'Ability', dmg: [[50, 0, 0, 0]] } }, g.time);
    __tick(g, 2);
    const leftMolly = Math.hypot(b.pos[0] - z.pos[0], b.pos[2] - z.pos[2]) > z.r;
    g = await __start({ botMode: 'fight' });
    b = g.bots[0]; p = g.player;
    b.hp = p.hp = 1e6;
    b.kit.charges = { c: 0, q: 0, e: 0 }; b.kit.ultPoints = 0; b.kit.ready = { c: 0, q: 0, e: 0 }; // no abilities: just the guns
    p.pos = [0, -50, 0]; p.prevPos = [...p.pos];
    b.equip('primary', g.time, true); __tick(g, 1.2);
    if (!__place(g, b, 10)) return { error: 'no open ground' }; // placed after the draw, so it faces the target
    const at = __ahead(b, 8); p.pos = [at[0], b.pos[1], at[2]]; p.prevPos = [...p.pos]; p.vel = [0, 0, 0];
    b.gun.mag = 0; // empties it: the reload starts on its own
    __tick(g, 1);
    const drewSidearm = b.slot === 'secondary';
    g = await __start({ mode: 'rounds', map: 'divide' });
    const m = g.mode; m.round = 3; m.lossStreak = [0, 1];
    for (const c of g.combatants) { c.credits = c.team === 1 ? 2000 : 4200; c.inv.primary = null; }
    const calls = [m.teamBuyCall(0), m.teamBuyCall(1)];
    m.buyCall = calls;
    const saver = g.bots.find(c => c.team === 1);
    m.boughtThisRound = new Map(); m.phase = 'buy';
    m.botBuy(saver);
    const saved = !saver.inv.primary && saver.credits >= 1500;
    return { pass: leftMolly && drewSidearm && calls[0] === 'full' && calls[1] === 'eco' && saved, leftMolly, drewSidearm, calls, saverCredits: saver.credits };
  }],
  ['Kicker can be blown the moment it is thrown (mid-air satchel jump), and hits harder once armed', async () => {
    const g = await __start({ agent: 'blitz' });
    const p = g.player, k = p.kit, b = g.bots[0];
    if (!__place(g, p, 14)) return { error: 'no open ground' };
    p.pitch = 0.2; k.charges.q = 2;
    p.input.abQ = true; g.tick(); __tick(g, 0.1);
    const sat = g.devices.find(d => d.kind === 'satchel' && d.owner === p && !d.removed);
    const inAir = !!sat && sat.physics && !sat.rest;
    p.input.abQ = true; g.tick();
    const blown = !!sat?.removed, launched = p.vel[1] > 5, chargesLeft = k.charges.q;
    // Armed: thrown at a bot's feet, blown after 1.6 s, it deals the full 50 up close.
    __tick(g, 3);
    if (!__place(g, p, 14)) return { error: 'no open ground' }; // the jump left us anywhere: back on open ground
    b.hp = 100; b.armor = 0; b.pos = __ahead(p, 6); b.pos[1] = p.pos[1]; b.prevPos = [...b.pos]; b.vel = [0, 0, 0];
    __aim(p, [b.pos[0], b.pos[1] + 0.1, b.pos[2]]);
    p.input.abQ = true; g.tick(); __tick(g, 1.6);
    p.input.abQ = true; g.tick();
    const armedDamage = 100 - b.hp;
    return { pass: inAir && blown && launched && chargesLeft === 1 && armedDamage >= 40, inAir, blown, launched, chargesLeft, armedDamage };
  }],
  ['Buy phase: set-up utility (camera, Sentry, Anchor) can be placed and comes back in 3 s; other abilities can\'t even be taken out', async () => {
    const press = (g, c, key, aim) => { c.input['ab' + key] = true; g.tick(); __tick(g, 1.2); if (aim) aim(); c.input.firePressed = true; g.tick(); __tick(g, 0.2); };
    const out = {};
    for (const [agent, key, kind] of [['lattice', 'E', 'cam'], ['bastion', 'E', 'turret'], ['regent', 'E', 'anchor']]) {
      const g = await __start({ mode: 'rounds', map: 'divide', agent });
      __tick(g, 2);
      const p = g.player; p.kit.charges[key.toLowerCase()] = 1; p.pitch = -0.3;
      press(g, p, key);
      const placed = g.mode.phase === 'buy' && g.devices.some(d => d.kind === kind && d.owner === p);
      __tick(g, 3.2);
      out[agent] = placed && p.kit.charges[key.toLowerCase()] === 1;
    }
    const g = await __start({ mode: 'rounds', map: 'divide', agent: 'cinder' });
    __tick(g, 2);
    const p = g.player; p.kit.charges.e = 1; p.input.abE = true; g.tick(); __tick(g, 1); // Sunflare (Curveball) is the signature now
    const held = !!p.kit.armed;
    p.input.firePressed = true; g.tick(); __tick(g, 0.2);
    return { pass: Object.values(out).every(Boolean) && !held && p.kit.charges.e === 1, placedAndBack: out, flareTakenOut: held, flareCharges: p.kit.charges.e };
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
    p.input.abCHeld = false; // let go: it falls, and bursts on the ground or after its 2 s
    for (let i = 0; i < 20; i++) { __tick(g, 0.1); r.updateFx2(); }
    const burst = !!d.removed && g.smokes.length > 0, gone = fx().length === 0;
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
      (g, p, k) => { __tick(g, 0.8); p.input.firePressed = true; g.tick(); __tick(g, 3); const s = g.smokes[g.smokes.length - 1]; smokeYaw = s ? Math.atan2(-(s.pos[0] - p.pos[0]), -(s.pos[2] - p.pos[2])) : null; });
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
    { // Turret: back 25 s after it's picked up; too far away does nothing
      const [g, p] = await dm('bastion');
      p.kit.charges.e = 0; const far = setup(g, p, 'turret', 6);
      pressF(g, p); const farKept = !far.removed;
      far.removed = true; const d = setup(g, p, 'turret');
      pressF(g, p); const gone = d.removed, at0 = p.kit.charges.e;
      __tick(g, 24.5); const at24 = p.kit.charges.e; __tick(g, 1);
      out.turret = farKept && gone && at0 === 0 && at24 === 0 && p.kit.charges.e === 1;
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
    { // Cyber Cage: mid-round F sets it off (issue #81) instead of picking it up; in the buy phase F picks it up
      const [g, p] = await dm('lattice');
      p.kit.charges.q = 0; const d = setup(g, p, 'cage'); pressF(g, p);
      const wentOff = d.removed && p.kit.charges.q === 0 && g.smokes.some(s => s.kind === 'cage');
      const g2 = await __start({ mode: 'rounds', map: 'divide', agent: 'lattice' });
      __tick(g2, 1);
      const p2 = g2.player; p2.kit.charges.q = 0; p2.kit.charges.e = 0;
      const c2 = setup(g2, p2, 'cage'); pressF(g2, p2);
      const t2 = setup(g2, p2, 'cam'); pressF(g2, p2);
      out.cageBuyPhaseOnly = wentOff && g2.mode.phase === 'buy' && c2.removed && p2.kit.charges.q === 1 && t2.removed && p2.kit.charges.e === 1;
    }
    { // Astra's star: recalled from across the map, back after 25 s
      const [g, p] = await dm('stella');
      p.kit.starsLeft = 0; setup(g, p, 'star', 15); pressF(g, p);
      __tick(g, 24.5); const at24 = p.kit.starsLeft; __tick(g, 1);
      out.star = at24 === 0 && p.kit.starsLeft === 1;
    }
    return { pass: Object.values(out).every(Boolean), ...out };
  }],
  ['Overload starts a sprint with full energy and a fresh slide, fires while running and sliding, and kills refill it', async () => {
    const g = await __start({ agent: 'volt' });
    const p = g.player, k = p.kit, b = g.bots[0];
    if (!__place(g, p, 16)) return { error: 'no open ground' };
    __tick(g, 0.5);
    k.energy = 30; k.slideAt = g.time + 6; // tired, slide on cooldown
    k.ultPoints = k.ultCost; k.agent.abilities.x.use(k);
    const sprinting = !!k.highGear && k.energy === 100 && k.slideAt === 0;
    // Run and fire at a bot ahead.
    b.pos = __ahead(p, 9); b.pos[1] = p.pos[1]; b.prevPos = [...b.pos]; b.hp = 9999; b.armor = 0; // tanky until after the slide
    p.input.fwd = 1; p.input.fire = true;
    __tick(g, 0.6);
    const speed = p.horizSpeed(), shots = p.stats.shots;
    // Slide mid-Overload: the sprint carries on and the beam keeps firing.
    p.input.altPressed = true; g.tick(); // right click slides
    const slid = !!p.dash, stillSprinting = !!k.highGear, shotsBefore = p.stats.shots;
    __tick(g, 0.3);
    const firedSliding = p.stats.shots > shotsBefore;
    b.hp = 20; p.input.fwd = 0; __tick(g, 0.4); // now the beam finishes them
    { const e = p.eye(), t = b.eye(); p.yaw = Math.atan2(-(t[0] - e[0]), -(t[2] - e[2])); p.pitch = Math.atan2(t[1] - 0.3 - e[1], Math.hypot(t[0] - e[0], t[2] - e[2])); }
    __tick(g, 1);
    const killed = !b.alive;
    const refilled = k.overdrive && k.overdrive.fuel > 86 && k.slideAt === 0; // ~77 by now without the kill, and the slide on cooldown
    p.input.fire = false; p.input.fwd = 0;
    __tick(g, 20.5);
    const over = !k.overdrive && !k.highGear && p.gun === p.inv[p.slot];
    return { pass: sprinting && speed > 8 && shots >= 3 && slid && stillSprinting && firedSliding && killed && refilled && over, sprinting, speed: +speed.toFixed(1), shots, slid, stillSprinting, firedSliding, killed, refilled, endsAfterMeter: over };
  }],
  ['Convergent Paths: holds aim and movement back while casting, bursts after 1 s into a 13.5 m wide beam (6 s Hinder), then +10% speed for 7 s', async () => {
    const g = await __start({ agent: 'lumen' });
    const p = g.player, k = p.kit, b = g.bots[0];
    if (!__place(g, p, 30)) return { error: 'no open ground' };
    __tick(g, 0.5);
    // A bot 30 m ahead and 6 m to the side: inside the new 13.5 m width, outside the old one.
    b.pos = __ahead(p, 30); b.pos[0] += 6; b.pos[1] = (g.floorAt(b.pos[0], b.pos[2], p.pos[1] + 1) || p.pos)[1]; b.prevPos = [...b.pos];
    // Held where it was put: depending on where the spawns fell, that spot can be off the floor.
    const spot = [...b.pos], hold = (sec) => { for (let i = 0; i < Math.round(sec * 128); i++) { g.tick(); b.pos = [...spot]; b.prevPos = [...spot]; b.vel = [0, 0, 0]; } };
    k.ultPoints = k.ultCost; k.agent.abilities.x.use(k);
    const locked = p.st.castLockUntil > g.time;
    hold(0.9); const early = b.st.hinderUntil > g.time;
    hold(0.7); const hindered = b.st.hinderUntil - g.time, haste = p.st.hasteUntil - g.time, amt = p.st.hasteAmt;
    return { pass: locked && !early && hindered > 5 && hindered <= 6 && haste > 6 && haste <= 7 && amt === 0.1, locked, early, hindered: +hindered.toFixed(2), haste: +haste.toFixed(2), amt, alive: b.alive };
  }],
  ['Rendezvous: Regent can\'t be hurt or shoot while teleporting to his anchor, and can be hurt again once he lands', async () => {
    const g = await __start({ agent: 'regent' });
    const p = g.player, k = p.kit, b = g.bots[0];
    if (!__place(g, p, 20)) return { error: 'no open ground' };
    __tick(g, 0.5);
    k.anchor = g.addDevice({ kind: 'anchor', owner: p, pos: __ahead(p, 10).map((v, i) => i === 1 ? p.pos[1] : v), life: 99999 });
    const hit = () => { const hp = p.hp + p.armor; g.damage(p, b, 30, { part: 'body', def: { id: 'vandal', name: 'Vandal' }, dist: 5, point: p.eye() }); return p.hp + p.armor < hp; };
    const from = [...p.pos];
    k.agent.abilities.e.reuse(k);
    __tick(g, 0.2); const hurtMid = hit(), noGun = p.st.channelUntil > g.time;
    __tick(g, 1.2); const moved = Math.hypot(p.pos[0] - from[0], p.pos[2] - from[2]) > 5, hurtAfter = hit(); // untouchable for 1.3 s
    return { pass: !hurtMid && noGun && moved && hurtAfter, hurtMid, noGun, moved, hurtAfter };
  }],
  ['Finale fires only the rocket (not your gun on the same click) and the gun takes its draw time to come back', async () => {
    const g = await __start({ agent: 'blitz' }), p = g.player, k = p.kit;
    __place(g, p, 20); p.give('vandal'); p.equip('primary', g.time, true); __tick(g, 1.3);
    k.ultPoints = 99; p.input.abX = true; g.tick(); __tick(g, 1.6);
    const shots = p.stats.shots;
    p.input.firePressed = true; p.input.fire = true; g.tick();
    const rocket = g.devices.some(d => d.model === 'rocket'), drawing = p.gun.equipEnd > g.time;
    for (let i = 0; i < 25; i++) { p.input.fire = true; g.tick(); }
    return { pass: rocket && drawing && p.stats.shots === shots, rocket, drawing, gunShotsWithin02s: p.stats.shots - shots };
  }],
  ['Toxic Wall decays anyone crossing it, between emitters too; Terror decays each enemy once', async () => {
    const cross = async (off) => {
      const g = await __start({ agent: 'venom' }), p = g.player, k = p.kit, b = g.bots[0];
      __place(g, p, 30); __tick(g, 0.5);
      k.agent.abilities.e.use(k); __tick(g, 0.3); k.agent.abilities.e.reuse(k); __tick(g, 1.3); // lay the emitters, then E raises the wall
      const y = p.pos[1], x0 = p.pos[0], z = p.pos[2] - (14 + off); // emitters every 2 m from 2 m: 14 is on one, 15 between two
      b.hp = 100; b.armor = 0;
      for (let i = 0; i <= 154; i++) { b.pos = [x0 - 3 + i * 6 / 154, y, z]; b.prevPos = [...b.pos]; b.vel = [0, 0, 0]; g.tick(); }
      return 100 - b.hp;
    };
    const onEmitter = await cross(0), between = await cross(1);
    const g = await __start({ agent: 'nyx' }), p = g.player, k = p.kit, b = g.bots[0];
    __place(g, p, 40); __tick(g, 0.5);
    b.pos = [p.pos[0], p.pos[1], p.pos[2] - 9]; b.hp = 100; b.armor = 0;
    k.ultPoints = 99; k.agent.abilities.x.use(k);
    for (let i = 0; i < 128 * 3; i++) { b.pos[2] -= 6.75 / 128; b.prevPos = [...b.pos]; g.tick(); } // walking along with the wave
    const terror = 100 - b.hp;
    return { pass: onEmitter >= 10 && between >= 10 && Math.abs(terror - 75) < 0.5, onEmitter: +onEmitter.toFixed(1), betweenEmitters: +between.toFixed(1), terrorDecay: +terror.toFixed(1) };
  }],
  ['Valorant controls: tablets and ultimates have a draw (ultimates then a click); the gun comes back after the unequip time', async () => {
    const until = (g, f, max = 5) => { for (let i = 0; i < max * 128; i++) { if (f()) return g.time; g.tick(); } return null; };
    const out = {};
    { const g = await __start({ agent: 'granite' }), p = g.player, k = p.kit; __place(g, p, 20); p.give('vandal'); p.equip('primary', g.time, true); __tick(g, 1.3);
      const t0 = g.time; p.input.abE = true; const tm = until(g, () => !!k.mapPick); k.mapClick(__ahead(p, 10)); k.mapConfirm(); const tc = g.time; g.tick();
      out.overcastMap = +(tm - t0).toFixed(2); out.gunBackAfterMap = +(p.gun.equipEnd - tc).toFixed(2); }
    { const g = await __start({ agent: 'quake' }), p = g.player, k = p.kit; __place(g, p, 20); __tick(g, 1.3); k.ultPoints = 99;
      p.input.abX = true; g.tick(); out.ultArmed = k.armed?.k === 'x'; __tick(g, 0.5); p.input.firePressed = true; g.tick(); out.earlyClickIgnored = k.ultPoints === 99;
      __tick(g, 0.7); p.input.firePressed = true; g.tick(); out.castOnClick = k.ultPoints === 0; }
    { const g = await __start({ agent: 'cinder' }), p = g.player, k = p.kit; __place(g, p, 20); p.give('vandal'); p.equip('primary', g.time, true); __tick(g, 1.3);
      p.input.abQ = true; g.tick(); __tick(g, 0.85); p.input.firePressed = true; g.tick(); out.emberGunBack = +(p.gun.equipEnd - g.time).toFixed(2); }
    return { pass: Math.abs(out.overcastMap - 0.8) < 0.03 && Math.abs(out.gunBackAfterMap - 0.7) < 0.03 && out.ultArmed && out.earlyClickIgnored && out.castOnClick && Math.abs(out.emberGunBack - 0.7) < 0.03, ...out };
  }],
  ['Status rules: slows weaken jumps, mollies stop at thick walls only and reach up onto boxes, Mindread is a snapshot, a smoke grows in', async () => {
    const out = {};
    { const g = await __start({}), p = g.player; __place(g, p, 12); __tick(g, 0.5);
      p.input.jump = true; g.tick(); const free = p.vel[1]; __tick(g, 1.5);
      p.st.slowUntil = g.time + 2; p.st.slowAmt = 0.5; p.st.slowJump = 0.7; p.input.jump = true; g.tick(); out.slowedJump = +(p.vel[1] / free).toFixed(2); }
    { const g = await __start({ agent: 'cinder' }), p = g.player, b = g.bots[0]; __place(g, p, 14); __tick(g, 0.5);
      const c = __ahead(p, 8); c[1] = p.pos[1];
      const wall = __box(g, [c[0] - 4, c[1], c[2] + 1.5], [c[0] + 4, c[1] + 3, c[2] + 2.3]); // a 0.8 m wall 1.5 m behind the fire, toward us
      b.pos = [c[0], c[1], c[2] + 3]; b.prevPos = [...b.pos]; b.hp = 100; b.armor = 0; // inside the radius, behind the wall
      g.addZone({ kind: 'fire', owner: p, pos: c, r: 4.5, life: 2, dps: 60, heal: 0, def: { id: 'x', name: 'x' } }, g.time);
      __tick(g, 1); out.burnedThroughWall = b.hp < 100; g.zones = [];
      wall.max[2] = wall.min[2] + 0.3; b.hp = 100; // now a thin 0.3 m panel: the fire gets through
      g.addZone({ kind: 'fire', owner: p, pos: c, r: 4.5, life: 2, dps: 60, heal: 0, def: { id: 'x', name: 'x' } }, g.time);
      __tick(g, 1); out.burnedThroughThin = b.hp < 100; g.zones = [];
      g.world.boxes = g.world.boxes.filter(q => q !== wall);
      __box(g, [c[0] - 1, c[1], c[2] - 3.5], [c[0] + 1, c[1] + 1.2, c[2] - 1.5]); // a 1.2 m crate inside the radius
      b.pos = [c[0], c[1] + 1.2, c[2] - 2.5]; b.prevPos = [...b.pos]; b.hp = 100;
      g.addZone({ kind: 'fire', owner: p, pos: c, r: 4.5, life: 2, dps: 60, heal: 0, def: { id: 'x', name: 'x' } }, g.time);
      __tick(g, 1); out.burnedOnCrate = b.hp < 100; }
    { const g = await __start({ agent: 'lattice' }), p = g.player, b = g.bots[0]; __place(g, p, 14); __tick(g, 0.5);
      let snap = null; g.on('snapshot', (e) => { if (e.who === b) snap = e; });
      g.snapshot(p, [b], 2); const at = [...b.pos]; b.pos[0] += 5; g.tick();
      out.snapshotStays = !!snap && snap.pos[0] === at[0] && !(b.st.revealUntil > g.time); }
    { const g = await __start({}), p = g.player; __place(g, p, 14); __tick(g, 0.5);
      const s = g.addSmoke(p, __ahead(p, 8), g.time, { radius: 4.1, life: 14.7 }); __tick(g, 0.3);
      const { smokeScale } = await import('/js/abilities.js'); out.smokeAt03s = +smokeScale(s, g.time).toFixed(2); }
    return { pass: Math.abs(out.slowedJump - 0.7) < 0.02 && !out.burnedThroughWall && out.burnedThroughThin && out.burnedOnCrate && out.snapshotStays && out.smokeAt03s > 0.3 && out.smokeAt03s < 0.5, ...out };
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
  if (only && !only.split('|').some(o => name.includes(o))) continue;
  try { report(name, await page.evaluate(fn)); } catch (e) { report(name, { error: String(e).slice(0, 300) }); }
}

if (!offline) {
  // Two tabs of one browser play online over BroadcastChannel: a host (Cinder) and a client (Thistle).
  const ctx = await browser.newContext();
  const H = await ctx.newPage(), C = await ctx.newPage();
  for (const p of [H, C]) { p.on('pageerror', e => errors.push(String(e))); await p.goto(url); await p.waitForFunction(() => window.__game); await p.addScriptTag({ content: PAGE_HELPERS }); }
  const form = (agent) => {
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
    set('net-transport', 'local'); set('net-join-transport', 'local'); set('net-room', 'CHECKS'); set('net-code', 'CHECKS'); set('net-mode', 'dm'); set('net-agent', agent); set('net-name', agent);
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
  // The client's Tripline goes away on both screens when the host kills the client.
  await H.evaluate((f) => { window.__w = window.__game.game.addDevice({ kind: 'wire', owner: __remote(), pos: f, b: [f[0] + 2, f[1], f[2]], life: 120 }); }, spot);
  await C.evaluate((f) => { const g = window.__game.game; window.__w = g.addDevice({ kind: 'wire', owner: g.player, pos: f, b: [f[0] + 2, f[1], f[2]], life: 120 }); }, spot);
  await H.evaluate(() => { const g = window.__game.game, c = __remote(); c.st.intangibleUntil = 0; c.kit.mustScoreUntil = 0; g.damage(c, g.player, 999, { part: 'head', def: { id: 'vandal', name: 'Vandal' }, dist: 3, point: c.eye() }); });
  await C.waitForFunction(() => window.__w.removed, null, { timeout: 5000 }).catch(() => {});
  const wireHost = await H.evaluate(() => !!window.__w.removed), wireClient = await C.evaluate(() => !!window.__w.removed);
  report('Online: a dead player\'s Tripline goes away for both', { pass: wireHost && wireClient, hostWireGone: wireHost, clientWireGone: wireClient });
}

if (errors.length) { failed++; console.log('Page errors:', errors.slice(0, 5)); }
await browser.close();
server.close();
console.log(failed ? `${failed} failed` : 'All checks passed');
process.exit(failed ? 1 : 0);
