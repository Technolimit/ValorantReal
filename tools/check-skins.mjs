// Headless checks for skins: the preset list, the single Melee entry (one theme per melee type), the Orbital, Starspur,
// Oathblade and Apogee models with their inspects and reloads, and finishers (the final kill of the round in 5v5, played when the round ends, or the match-winning kill in deathmatch), and pullouts.
//   node tools/check-skins.mjs [shots-dir]     (needs playwright; with a dir, saves the skin menu and finishers)
// Exits with code 1 if any check fails.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const SHOTS = process.argv[2];

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
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.addInitScript(() => { try { localStorage.setItem('tapfire-settings-v1', JSON.stringify({ shadows: false, renderScale: 0.5 })); } catch { /* storage blocked */ } });
await page.goto(url);
await page.waitForFunction(() => window.__game);

await page.evaluate(async () => {
  const { WEAPONS } = await import('./js/weapons.js');
  window.__W = WEAPONS;
  window.__tick = (g, s) => { for (let i = 0; i < Math.round(s * 128); i++) g.tick(); };
  window.__start = async (o) => {
    const h = window.__game; h.frozen = true;
    Object.assign(h.settings, { mode: 'dm', botCount: 6, agent: 'cinder', map: 'arena', botMode: 'static', difficulty: 'normal', side: 'atk' }, o);
    await h.startMatch({}); h.frozen = true;
    return h.game;
  };
});

let failed = 0;
const check = async (name, fn) => {
  let r;
  try { r = await fn(); } catch (e) { r = { error: String(e).slice(0, 300) }; }
  if (!r?.pass) failed++;
  const { pass, ...rest } = r || {};
  console.log(`${r?.pass ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(rest)}`);
};
const shot = async (name, el = null) => { if (SHOTS) await (el ? page.locator(el) : page).screenshot({ path: join(SHOTS, name + '.png') }).catch(() => {}); };

await check('Gun skins: Standard, Ember Circuit, Glacier, plus model skins only on their guns', () => page.evaluate(async () => {
  const { SKIN_ORDER, skinFits } = await import('./js/skins.js');
  const on = (w) => SKIN_ORDER.filter(id => skinFits(id, w));
  const r = { list: SKIN_ORDER.join(), vandal: on('vandal').join(), sheriff: on('sheriff').join(), marshal: on('marshal').join(), judge: on('judge').join(), phantom: on('phantom').join(), stinger: on('stinger').join(), bulldog: on('bulldog').join(), spectre: on('spectre').join(), classic: on('classic').join(), guardian: on('guardian').join(), ghost: on('ghost').join() };
  return {
    pass: r.list === 'standard,ember,glacier,orbital,starspur,oathblade,apogee' && r.vandal === 'standard,ember,glacier,orbital,oathblade,apogee'
      && ['spectre', 'classic', 'guardian'].every(w => r[w] === 'standard,ember,glacier,apogee') && r.ghost === 'standard,ember,glacier'
      && ['phantom', 'stinger', 'bulldog'].every(w => r[w] === 'standard,ember,glacier,orbital')
      && r.sheriff === 'standard,ember,glacier,starspur,oathblade' && ['marshal', 'judge'].every(w => r[w] === 'standard,ember,glacier,starspur'),
    ...r,
  };
}));

await check('Every melee type has exactly one theme of its own, and no gun skin fits a melee', () => page.evaluate(async () => {
  const { SKINS, SKIN_ORDER, skinFits, skinFor, meleeSkin } = await import('./js/skins.js');
  const { MELEE_ORDER } = await import('./js/melee.js');
  const fits = MELEE_ORDER.map(m => [m, Object.keys(SKINS).filter(id => skinFits(id, m))]);
  const forced = skinFor({ skins: { katana: 'ember' } }, 'katana');
  return {
    pass: fits.every(([m, ids]) => ids.length === 1 && ids[0] === meleeSkin(m)) && forced === 'melee-katana' && !SKIN_ORDER.some(id => id.startsWith('melee-')),
    themes: Object.fromEntries(fits.map(([m]) => [m, SKINS[meleeSkin(m)].name])),
  };
}));

await check('Collection: every weapon drawn in its skin, plus one Melee card', async () => {
  const r = await page.evaluate(async () => {
    document.getElementById('menu-skins').click();
    const cards = [...document.querySelectorAll('#skin-weapons .coll-card')];
    return { cards: cards.length, pictures: cards.filter(c => c.querySelector('img').src.startsWith('data:image/png')).length, melee: cards.filter(c => c.dataset.id === 'melee').length, knives: cards.filter(c => ['knife', 'katana'].includes(c.dataset.id)).length };
  });
  await page.waitForTimeout(200);
  await shot('collection', '.panel.skins');
  return { pass: r.cards === 20 && r.pictures === 20 && r.melee === 1 && r.knives === 0, ...r };
});

// Open a weapon's screen from the collection, click a skin in the side list (by name), then a variant swatch.
await page.evaluate(() => {
  window.__open = (id) => { document.getElementById('skin-detail-back').click(); document.querySelector(`#skin-weapons .coll-card[data-id="${id}"]`).click(); };
  window.__pick = (name) => [...document.querySelectorAll('#skin-grid .skin-card')].find(c => c.querySelector('b').textContent === name).click();
  window.__variant = (i) => document.querySelectorAll('#skin-variants button')[i].click();
  window.__screen = () => ({ title: document.getElementById('skin-title').textContent, variant: document.getElementById('skin-variant-name').textContent, swatches: document.querySelectorAll('#skin-variants button').length, equip: document.getElementById('skin-equip').textContent, list: [...document.querySelectorAll('#skin-grid .skin-card b')].map(b => b.textContent) });
});

await check('Weapon screen: previewing a variant changes nothing until Equip', () => page.evaluate(() => {
  const h = window.__game;
  __open('vandal'); __pick('Orbital'); __variant(2);
  const before = { ...__screen(), worn: h.settings.skins.vandal || 'standard' };
  document.getElementById('skin-equip').click();
  const after = { ...__screen(), worn: h.settings.skins.vandal };
  return {
    pass: before.list.join() === 'Standard Issue,Ember Circuit,Glacier,Orbital,Oathblade,Apogee' && before.swatches === 4 && before.variant === 'Glacial' && before.worn === 'standard'
      && before.equip === 'Equip skin' && after.worn === 'orbital~2' && after.equip === 'Equipped',
    before, after,
  };
}));

await check('Melee screen: the melee types, each in its own theme; Equip swaps your melee', async () => {
  const r = await page.evaluate(() => {
    __open('melee'); __pick('Katana');
    const s = __screen();
    document.getElementById('skin-equip').click();
    return { ...s, equipped: window.__game.settings.melee, newHidden: document.getElementById('skin-new').hidden };
  });
  await page.waitForTimeout(300);
  await shot('menu-melee', '.panel.skins');
  return { pass: r.list.length === 10 && r.title === 'Damascus Katana' && r.swatches === 1 && r.equipped === 'katana' && r.newHidden, ...r };
});

if (SHOTS) {
  for (const [w, name, v] of [['sheriff', 'Starspur', 0], ['marshal', 'Starspur', 1], ['judge', 'Starspur', 3], ['vandal', 'Orbital', 0], ['vandal', 'Orbital', 1], ['stinger', 'Orbital', 0], ['phantom', 'Orbital', 2], ['bulldog', 'Orbital', 3], ['sheriff', 'Starspur', 2]]) {
    await page.evaluate(([w, name, v]) => { __open(w); __pick(name); __variant(v); }, [w, name, v]);
    await page.waitForTimeout(400);
    await shot(`menu-${name.toLowerCase()}-${w}-${v}`, '.panel.skins');
  }
  await page.evaluate(() => { __open('melee'); __pick('Bowie'); });
  await page.waitForTimeout(400);
  await shot('menu-starspur-bowie', '.panel.skins');
  for (const [w, v] of [['vandal', 0], ['vandal', 1], ['vandal', 2], ['vandal', 3], ['sheriff', 0], ['sheriff', 1]]) {
    await page.evaluate(([w, v]) => { __open(w); __pick('Oathblade'); __variant(v); }, [w, v]);
    await page.waitForTimeout(400);
    await shot(`menu-oathblade-${w}-${v}`, '.panel.skins');
  }
  await page.evaluate(() => { __open('melee'); __pick('Tanto'); });
  await page.waitForTimeout(400);
  await shot('menu-oathblade-tanto', '.panel.skins');
  for (const [w, v] of [['vandal', 0], ['vandal', 1], ['vandal', 2], ['vandal', 3], ['guardian', 0], ['spectre', 0], ['classic', 0]]) {
    await page.evaluate(([w, v]) => { __open(w); __pick('Apogee'); __variant(v); }, [w, v]);
    await page.waitForTimeout(400);
    await shot(`menu-apogee-${w}-${v}`, '.panel.skins');
  }
  await page.evaluate(() => { __open('melee'); __pick('Battle Axe'); });
  await page.waitForTimeout(400);
  await shot('menu-apogee-battleaxe', '.panel.skins');
  await page.evaluate(() => document.getElementById('skin-detail-back').click());
  await page.waitForTimeout(200);
  await shot('collection-after', '.panel.skins');
}
await page.evaluate(() => { document.getElementById('skin-detail-back').click(); document.getElementById('skins-back').click(); });

await check('Orbital models: a spire with an open top on every gun, the orb inspected and reloaded, sights over the spire', () => page.evaluate(async () => {
  const THREE = await import('./vendor/three.module.min.js');
  const { gunModel, poseMeleeParts } = await import('./js/models.js');
  const { MODEL_INSPECTS } = await import('./js/melee.js');
  const { reloadPose, RELOAD_STYLE } = await import('./js/reloadanim.js');
  const { Gun } = await import('./js/gun.js');
  const out = {};
  let ok = true;
  for (const w of ['vandal', 'stinger', 'phantom', 'bulldog']) {
    const m = gunModel(w, 'orbital'), d = m.userData.design, orb = m.userData.parts.orb;
    if (!orb) { ok = false; out[w] = { d }; continue; }
    m.updateMatrixWorld(true);
    // Nothing on the gun covers the spire's mouth: no mesh outside the orb has a point above the orb's top
    // within the mouth (the sights stand well clear of it).
    const ball = orb.children[0]; // the orb itself (the part also holds the hidden off-hand)
    const ob = new THREE.Box3().setFromObject(ball), oc = ob.getCenter(new THREE.Vector3()), v = new THREE.Vector3();
    let covered = false;
    m.traverse(o => {
      if (!o.isMesh || o.parent === orb || !o.visible) return;
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        if (Math.hypot(v.x - oc.x, v.z - oc.z) < 0.015 && v.y > ob.max.y + 0.002) covered = true;
      }
    });
    // The inspect floats the orb out and back; the reload pops it and seats a fresh one.
    const ins = MODEL_INSPECTS[d] || [];
    let rise = 0;
    for (const i of ins) for (let t = 0; t <= i.dur; t += 0.05) { const p = poseMeleeParts(m, i, t, null); if (p.pose.some(Number.isNaN)) ok = false; rise = Math.max(rise, p.parts.orb?.[1] || 0); }
    poseMeleeParts(m, null, 0, null);
    const rest = orb.position.y;
    const gun = new Gun(__W[w]);
    gun.reloading = true; gun.reloadStart = 0; gun.reloadDur = 2; gun.reloadEnd = 2;
    reloadPose(m, gun.def, gun, 0.4, null);
    const popped = orb.position.y - rest;
    reloadPose(m, gun.def, gun, 1.98, null);
    const seated = Math.abs(orb.position.y - rest) < 0.001 && orb.visible;
    out[w] = { d, covered, sightOver: +(m.userData.sightY - ob.max.y).toFixed(3), rise: +rise.toFixed(3), popped: +popped.toFixed(3), seated, style: RELOAD_STYLE[d] };
    if (d !== w + 'Orb' || covered || m.userData.sightY <= ob.max.y || ins.length !== 1 || rise < 0.03 || popped < 0.03 || !seated || RELOAD_STYLE[d] !== 'orb') ok = false;
  }
  const designs = Object.values(out).map(o => JSON.stringify(MODEL_INSPECTS[o.d]?.[0].parts));
  if (new Set(designs).size !== designs.length) ok = false; // each gun moves its orb its own way
  return { pass: ok, ...out };
}));

await check('Starspur models build with their moving parts, and their inspects and reloads run', () => page.evaluate(async () => {
  const { gunModel, poseMeleeParts } = await import('./js/models.js');
  const { MODEL_INSPECTS, MELEE } = await import('./js/melee.js');
  const { reloadPose } = await import('./js/reloadanim.js');
  const { Gun } = await import('./js/gun.js');
  const want = { sheriff: ['w', 'cyl', 'spur', 'shell'], marshal: ['bolt', 'rowel', 'mag', 'shell'], judge: ['mag', 'spur', 'shell', 'bolt'] };
  const out = {};
  let ok = true;
  for (const [w, parts] of Object.entries(want)) {
    const m = gunModel(w, 'starspur');
    const d = m.userData.design, have = Object.keys(m.userData.parts);
    const ins = MODEL_INSPECTS[d] || [];
    for (const i of ins) for (let t = 0; t <= i.dur; t += 0.1) { const p = poseMeleeParts(m, i, t, null); if (p.pose.some(Number.isNaN)) ok = false; }
    const gun = new Gun(__W[w]);
    gun.reloading = true; gun.reloadStart = 0; gun.reloadDur = gun.def.reload || 2; gun.reloadEnd = gun.reloadDur; gun.roundStart = 0;
    for (let t = 0; t < gun.reloadDur; t += 0.1) { const p = reloadPose(m, gun.def, gun, t, null); if (Object.values(p).some(Number.isNaN)) ok = false; }
    out[w] = { d, inspects: ins.map(i => i.moves?.join('/') || i.name).join('/') };
    if (!parts.every(p => have.includes(p)) || ins.length !== 1 || ins[0].moves?.length !== 2) ok = false;
  }
  const b = gunModel('bowie', 'melee-bowie');
  out.bowie = { rowel: !!b.userData.parts.rowel, inspects: MELEE.bowie.inspects[0].moves.join('/') };
  if (!b.userData.parts.rowel || MELEE.bowie.inspects.length !== 1 || MELEE.bowie.inspects[0].moves.length !== 3) ok = false;
  return { pass: ok, ...out };
}));

await check('Starspur Sheriff and Marshal pull out with a twirl', () => page.evaluate(async () => {
  const { gunModel, poseMeleeParts } = await import('./js/models.js');
  const { EQUIP_ANIMS } = await import('./js/melee.js');
  const out = {};
  for (const w of ['sheriff', 'marshal']) {
    const m = gunModel(w, 'starspur'), a = EQUIP_ANIMS[m.userData.design];
    let turn = 0;
    for (let t = 0; a && t <= a.dur; t += 0.02) turn = Math.min(turn, poseMeleeParts(m, a, t, null).parts.w[3]);
    out[w] = { design: m.userData.design, turns: +(-turn / (2 * Math.PI)).toFixed(2), wraps: !!m.userData.parts.w };
  }
  return { pass: out.sheriff.turns >= 2 && out.marshal.turns >= 1 && out.marshal.wraps, ...out };
}));

await check('Oathblade models build with their moving parts; inspects run; reloads darken and relight the edge', () => page.evaluate(async () => {
  const { gunModel, poseMeleeParts } = await import('./js/models.js');
  const { MODEL_INSPECTS, MELEE } = await import('./js/melee.js');
  const { reloadPose } = await import('./js/reloadanim.js');
  const { Gun } = await import('./js/gun.js');
  const want = { vandal: ['edge', 'mag', 'bolt', 'swipe'], sheriff: ['w', 'edge', 'cyl', 'swipe', 'shell'] };
  const out = {};
  let ok = true;
  for (const [w, parts] of Object.entries(want)) {
    const m = gunModel(w, 'oathblade');
    const d = m.userData.design, have = Object.keys(m.userData.parts);
    const ins = MODEL_INSPECTS[d] || [];
    for (const i of ins) for (let t = 0; t <= i.dur; t += 0.1) { const p = poseMeleeParts(m, i, t, null); if (p.pose.some(Number.isNaN)) ok = false; }
    const gun = new Gun(__W[w]);
    gun.reloading = true; gun.reloadStart = 0; gun.reloadDur = gun.def.reload || 2; gun.reloadEnd = gun.reloadDur; gun.roundStart = 0;
    const at = (share) => {
      const p = reloadPose(m, gun.def, gun, share * gun.reloadDur, null);
      if (Object.values(p).some(Number.isNaN)) ok = false;
      const hand = (part) => m.userData.hands.some(h => h.userData.part === part && h.visible);
      return { edge: +m.userData.parts.edge.scale.z.toFixed(2), swipe: hand('swipe') && m.userData.parts.swipe.visible, glow: +(p.glow ?? 1).toFixed(2) };
    };
    const r = { start: at(0.02), dark: at(0.4), swiping: at(w === 'vandal' ? 0.72 : 0.78), flash: at(w === 'vandal' ? 0.86 : 0.88), end: at(0.99) };
    out[w] = { d, inspects: ins.map(i => i.moves?.join('/') || i.name).join('/'), ...r };
    if (!parts.every(p => have.includes(p)) || ins.length !== 1 || ins[0].moves?.length !== 2 || r.start.edge < 0.9 || r.dark.edge > 0.05 || !r.swiping.swipe
      || r.swiping.edge <= 0.05 || r.swiping.edge >= 0.95 || r.start.swipe || r.flash.glow < 2 || r.end.edge < 0.99) ok = false;
  }
  const b = gunModel('tanto', 'melee-tanto');
  out.tanto = { edge: !!b.userData.parts.edge, cord: !!b.userData.parts.cord, inspects: MELEE.tanto.inspects[0].moves.join('/') };
  if (!b.userData.parts.edge || !b.userData.parts.cord || MELEE.tanto.inspects.length !== 1 || MELEE.tanto.inspects[0].moves.length !== 3) ok = false;
  return { pass: ok, ...out };
}));

await check('Oathblade pullouts: drawn like a blade, the edge lighting from the guard as it comes out', () => page.evaluate(async () => {
  const { gunModel, poseMeleeParts } = await import('./js/models.js');
  const { EQUIP_ANIMS } = await import('./js/melee.js');
  const out = {};
  for (const [w, skin] of [['vandal', 'oathblade'], ['sheriff', 'oathblade~1'], ['tanto', 'melee-tanto']]) {
    const m = gunModel(w, skin), a = EQUIP_ANIMS[m.userData.design];
    const pose = (t) => poseMeleeParts(m, a, t, null);
    const edge = (t) => { pose(t); return +m.userData.parts.edge.scale.z.toFixed(2); };
    let roll = 0, flip = 0, peak = 0;
    for (let t = 0; a && t <= a.dur; t += 0.02) { const p = pose(t); roll = Math.max(roll, p.parts.w?.[5] || 0); flip = Math.min(flip, p.parts.w?.[3] || 0); peak = Math.max(peak, +p.glow.toFixed(2)); }
    out[w] = { design: m.userData.design, edgeStart: a ? edge(0) : null, edgeEnd: a ? edge(a.dur) : null, roll: +(roll / Math.PI).toFixed(2), flip: +(-flip / Math.PI).toFixed(2), peak };
  }
  return {
    pass: Object.values(out).every(o => o.edgeStart < 0.05 && o.edgeEnd === 1 && o.peak > 2.9) && out.vandal.design === 'vandalOath'
      && out.sheriff.roll >= 2 && out.tanto.flip >= 1,
    ...out,
  };
}));

await check('Apogee models: a hinged cover over a cell; the inspect opens it and lifts the cell; the reload swaps the cell', () => page.evaluate(async () => {
  const { gunModel, poseMeleeParts } = await import('./js/models.js');
  const { MODEL_INSPECTS } = await import('./js/melee.js');
  const { reloadPose, RELOAD_STYLE } = await import('./js/reloadanim.js');
  const { Gun } = await import('./js/gun.js');
  const out = {};
  let ok = true;
  for (const w of ['vandal', 'guardian', 'spectre', 'classic']) {
    const m = gunModel(w, 'apogee'), d = m.userData.design, P = m.userData.parts;
    const ins = MODEL_INSPECTS[d] || [];
    let open = 0, lift = 0;
    for (const i of ins) for (let t = 0; t <= i.dur; t += 0.05) { const p = poseMeleeParts(m, i, t, null); if (p.pose.some(Number.isNaN)) ok = false; open = Math.max(open, p.parts.lid?.[5] || 0); lift = Math.max(lift, p.parts.cell?.[1] || 0); }
    poseMeleeParts(m, null, 0, null);
    const rest = P.cell.position.clone();
    const gun = new Gun(__W[w]);
    gun.reloading = true; gun.reloadStart = 0; gun.reloadDur = gun.def.reload || 2; gun.reloadEnd = gun.reloadDur;
    const at = (share) => {
      const p = reloadPose(m, gun.def, gun, share * gun.reloadDur, null);
      if (Object.values(p).some(Number.isNaN)) ok = false;
      return { lid: +P.lid.rotation.z.toFixed(2), cell: P.cell.visible ? +P.cell.position.distanceTo(rest).toFixed(3) : 'gone', hand: m.userData.hands.some(h => h.userData.part === 'cell' && h.visible), glow: +(p.glow ?? 1).toFixed(2) };
    };
    const r = { start: at(0.02), out: at(0.39), laying: at(0.5), flash: at(0.76), end: at(0.99) };
    out[w] = { d, moves: ins[0]?.moves?.join('/'), open: +open.toFixed(2), lift: +lift.toFixed(3), ...r };
    if (d !== w + 'Apo' || RELOAD_STYLE[d] !== 'cell' || !P.lid || !P.cell || ins.length !== 1 || ins[0].moves?.length !== 2 || open < 1.5 || lift < 0.02
      || r.start.lid > 0.2 || r.out.lid < 1.5 || r.out.cell !== 'gone' && r.out.cell < 0.05 || !r.laying.hand || r.laying.cell === 'gone' || r.laying.cell < 0.01
      || r.flash.glow < 2 || r.end.lid > 0.01 || r.end.cell !== 0 || r.end.hand) ok = false;
  }
  if (!gunModel('classic', 'apogee').userData.parts.w || !gunModel('spectre', 'apogee').userData.parts.w) ok = false;
  return { pass: ok, ...out };
}));

await check('Apogee pullouts: the cover snaps shut as the gun settles; the Battle Axe gilds its edge', () => page.evaluate(async () => {
  const { gunModel, poseMeleeParts } = await import('./js/models.js');
  const { EQUIP_ANIMS, MELEE } = await import('./js/melee.js');
  const out = {};
  for (const [w, skin] of [['vandal', 'apogee'], ['guardian', 'apogee~1'], ['spectre', 'apogee~2'], ['classic', 'apogee~3'], ['battleaxe', 'melee-battleaxe']]) {
    const m = gunModel(w, skin), a = EQUIP_ANIMS[m.userData.design];
    let peak = 0, roll = 0, flip = 0;
    for (let t = 0; a && t <= a.dur; t += 0.02) { const p = poseMeleeParts(m, a, t, null); peak = Math.max(peak, +p.glow.toFixed(2)); roll = Math.min(roll, p.parts.w?.[5] || 0); flip = Math.min(flip, p.parts.w?.[3] || 0); }
    const part = (t, name, i) => { const p = poseMeleeParts(m, a, t, null); return +(name === 'edge' ? p.parts.edge?.[6] : p.parts[name]?.[i] ?? 0).toFixed(2); };
    out[w] = { design: m.userData.design, peak, turns: +(-Math.min(roll, flip) / (2 * Math.PI)).toFixed(2),
      ...(w === 'battleaxe' ? { edgeStart: part(0, 'edge'), edgeEnd: part(a.dur, 'edge') } : { lidStart: part(0, 'lid', 5), lidEnd: part(a.dur, 'lid', 5) }) };
  }
  const guns = ['vandal', 'guardian', 'spectre', 'classic'];
  const b = MELEE.battleaxe.inspects;
  out.battleaxe.inspects = b[0].moves.join('/');
  return {
    pass: guns.every(w => out[w].lidStart > 1 && out[w].lidEnd === 0 && out[w].peak > 2.9 && out[w].design === w + 'Apo') && out.spectre.turns >= 0.99 && out.classic.turns >= 0.99
      && out.battleaxe.edgeStart < 0.05 && out.battleaxe.edgeEnd === 1 && out.battleaxe.turns >= 0.99 && b.length === 1 && b[0].moves.length === 3,
    ...out,
  };
}));

await check('The Hatchet hangs its head edge-down, the poll on top', () => page.evaluate(async () => {
  const THREE = await import('./vendor/three.module.min.js');
  const { gunModel } = await import('./js/models.js');
  const m = gunModel('axe', 'melee-axe'), glow = [], trim = [];
  m.updateMatrixWorld(true);
  m.traverse(o => {
    const b = o.isMesh && new THREE.Box3().setFromObject(o);
    if (b && b.max.z < -0.2) (o.material.userData.slot === 'glow' ? glow : o.material.userData.slot === 'trim' ? trim : []).push(b); // the head
  });
  const edge = Math.min(...glow.map(b => b.min.y)), poll = Math.max(...trim.map(b => b.max.y));
  return { pass: edge < -0.09 && poll > 0.04, edge: +edge.toFixed(3), poll: +poll.toFixed(3) };
}));

// Start a deathmatch that ends on your next kill, kill a bot with a weapon in a skin, and report the finisher that
// played (if any). `before` is a kill made first, mid-match, as [weapon, skins].
await page.evaluate(() => {
  window.__finish = async (weapon, skins, melee = 'knife', before = null) => {
    const h = window.__game, g = await __start({});
    h.settings.melee = melee;
    h.renderer.lastFinisher = null;
    if (before) { h.settings.skins = before[1]; g.kill(g.bots[1], g.player, { def: __W[before[0]], part: 'body' }); }
    const mid = h.renderer.lastFinisher?.kind || null;
    g.killLimit = g.player.stats.kills + 1;
    h.settings.skins = skins;
    g.kill(g.bots[0], g.player, { def: __W[weapon], part: 'body' });
    return { mid, end: h.renderer.lastFinisher?.kind || null, over: g.state === 'ended' };
  };
});

await check('Each weapon has one inspect that flows from move to move without stopping at rest', () => page.evaluate(async () => {
  const { MELEE, MODEL_INSPECTS, inspectPose } = await import('./js/melee.js');
  const out = {};
  let ok = true;
  for (const [id, set] of [...Object.entries(MELEE).map(([k, m]) => [k, m.inspects]), ...Object.entries(MODEL_INSPECTS)]) {
    const ins = set[0];
    // Where one move hands over to the next, the weapon is still out of its resting pose, and merging adds no
    // jumps: no frame moves further than the moves' own fastest flicks do.
    const fastest = (i, rest) => {
      let jump = 0, prev = null, still = 0;
      for (let t = 0; t <= i.dur; t += 1 / 60) {
        const p = inspectPose(i, t).pose;
        if (prev) jump = Math.max(jump, ...p.slice(0, 6).map((v, j) => Math.abs(v - prev[j])));
        if (rest && t > 0.6 && t < i.dur - 0.6 && p.every(v => Math.abs(v) < 0.01)) still++;
        prev = p;
      }
      return [jump, still];
    };
    const [jump, restMid] = fastest(ins, true), own = Math.max(0, ...(ins.from || [ins]).map(i => fastest(i)[0]));
    out[id] = { moves: ins.moves?.length || 1, dur: +ins.dur.toFixed(1), jump: +jump.toFixed(2), own: +own.toFixed(2), restMid };
    if (set.length !== 1 || jump > own + 0.05 || restMid > 3) ok = false;
  }
  return { pass: ok, ...out };
}));

await check('Deathmatch: only the match-winning kill plays a finisher, and only if that kill used the skin', async () => {
  const r = await page.evaluate(async () => ({
    orbital: await __finish('vandal', { vandal: 'orbital' }, 'knife', ['vandal', { vandal: 'orbital' }]),
    starspur: await __finish('sheriff', { sheriff: 'starspur~2' }),
    lastWithEmber: await __finish('vandal', { vandal: 'ember' }, 'knife', ['vandal', { vandal: 'orbital' }]),
    bowie: await __finish('knife', {}, 'bowie'),
    katana: await __finish('knife', {}, 'katana'),
    oathblade: await __finish('vandal', { vandal: 'oathblade~3' }, 'knife', ['sheriff', { sheriff: 'oathblade' }]),
    tanto: await __finish('knife', {}, 'tanto'),
    apogee: await __finish('classic', { classic: 'apogee~2' }, 'knife', ['vandal', { vandal: 'apogee' }]),
    battleaxe: await __finish('knife', {}, 'battleaxe'),
  }));
  return {
    pass: r.orbital.mid === null && r.orbital.end === 'collapse' && r.orbital.over && r.starspur.end === 'lastLight'
      && r.lastWithEmber.mid === null && r.lastWithEmber.end === null && r.bowie.end === 'lastLight' && r.katana.end === null
      && r.oathblade.mid === null && r.oathblade.end === 'lastStroke' && r.tanto.end === 'lastStroke'
      && r.apogee.mid === null && r.apogee.end === 'coronation' && r.battleaxe.end === 'coronation',
    ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, `${v.mid}/${v.end}`])),
  };
});

if (SHOTS) {
  for (const [kind, weapon, skins, times] of [['collapse', 'vandal', { vandal: 'orbital' }, [0.8, 1.8, 2.15, 2.5]], ['lastLight', 'sheriff', { sheriff: 'starspur' }, [0.8, 1.8, 2.15, 2.5]], ['lastStroke', 'vandal', { vandal: 'oathblade' }, [0.3, 0.5, 0.72, 0.9, 1.6]], ['coronation', 'vandal', { vandal: 'apogee' }, [0.5, 1.2, 1.7, 1.95, 2.3]]]) {
    await page.evaluate(async () => {
      const g = await __start({ map: 'arena' });
      // Face the middle of the map (a spawn can face a wall), stand the victim 3.5 m in front of you and look at it.
      const bot = g.bots[0], p = g.player;
      p.yaw = Math.atan2(p.pos[0], p.pos[2]); p.pitch = -0.12;
      bot.pos = [p.pos[0] - Math.sin(p.yaw) * 3.5, p.pos[1], p.pos[2] - Math.cos(p.yaw) * 3.5]; bot.prevPos = [...bot.pos];
    });
    await page.evaluate(([weapon, skins]) => {
      const h = window.__game, g = h.game;
      g.killLimit = g.player.stats.kills + 1; h.settings.skins = skins;
      g.kill(g.bots[0], g.player, { def: __W[weapon], part: 'body' });
    }, [weapon, skins]);
    // Step the game to each moment by hand (headless, the game sits paused) and let a frame draw.
    let done = 0;
    for (const t of times) {
      await page.evaluate((dt) => { __tick(window.__game.game, dt); document.getElementById('pause').hidden = true; document.getElementById('end').hidden = true; }, t - done); done = t;
      await page.waitForTimeout(150);
      await page.evaluate(() => { for (const id of ['pause', 'end']) document.getElementById(id).hidden = true; });
      await shot(`finisher-${kind}-${t}`);
    }
  }
}

await check('5v5: a finisher waits for the round to end (however it ends), and needs its final kill to be with the skin', () => page.evaluate(async () => {
  const h = window.__game, g = await __start({ mode: 'rounds', map: 'divide', botCount: 9 });
  h.settings.skins = { vandal: 'orbital' };
  __tick(g, Math.max(0, g.mode.phaseEnd - g.time) + 1); // through the buy phase
  const foes = g.combatants.filter(c => g.isEnemy(g.player, c));
  h.renderer.lastFinisher = null;
  for (const f of foes.slice(0, -1)) g.kill(f, g.player, { def: __W.vandal, part: 'body' });
  __tick(g, 0.5);
  const early = h.renderer.lastFinisher?.kind || null;
  g.kill(foes.at(-1), g.player, { def: __W.vandal, part: 'body' });
  __tick(g, 0.5);
  const last = h.renderer.lastFinisher?.kind || null;
  // Next round: Orbital kills all round, but the last one is with the Ghost.
  __tick(g, Math.max(0, g.mode.phaseEnd - g.time) + 1);
  __tick(g, Math.max(0, g.mode.phaseEnd - g.time) + 1);
  h.renderer.lastFinisher = null;
  const foes2 = g.combatants.filter(c => g.isEnemy(g.player, c) && c.alive);
  for (const f of foes2.slice(0, -1)) g.kill(f, g.player, { def: __W.vandal, part: 'body' });
  g.kill(foes2.at(-1), g.player, { def: __W.ghost, part: 'body' });
  __tick(g, 0.5);
  const ghost = h.renderer.lastFinisher?.kind || null;
  // Next round: two Orbital kills, then the round ends on time. The final kill still gets its finisher.
  __tick(g, Math.max(0, g.mode.phaseEnd - g.time) + 1);
  __tick(g, Math.max(0, g.mode.phaseEnd - g.time) + 1);
  h.renderer.lastFinisher = null;
  const foes3 = g.combatants.filter(c => g.isEnemy(g.player, c) && c.alive);
  for (const f of foes3.slice(0, 2)) g.kill(f, g.player, { def: __W.vandal, part: 'body' });
  __tick(g, 1);
  const beforeEnd = h.renderer.lastFinisher?.kind || null;
  g.mode.endRound(g.mode.side(g.player) === 'atk' ? 'def' : 'atk', 'time'); // (left to run, the bots would trade kills)
  const timeout = h.renderer.lastFinisher?.kind || null, reason = g.mode.lastResult?.reason;
  return { pass: early === null && last === 'collapse' && foes2.length === 5 && ghost === null && beforeEnd === null && timeout === 'collapse', early, last, ghost, beforeEnd, timeout, reason };
}));

await check('Finishers leave nothing behind once they end', async () => {
  const out = {};
  for (const [weapon, skins] of [['vandal', { vandal: 'orbital' }], ['sheriff', { sheriff: 'starspur' }], ['vandal', { vandal: 'oathblade~2' }], ['guardian', { guardian: 'apogee~1' }]]) {
    const r = await page.evaluate(async ([weapon, skins]) => {
      const h = window.__game, g = await __start({});
      __tick(g, 0.1); h.renderer.updateFx2();
      const before = h.renderer.fx2?.length || 0;
      window.__sceneBefore = h.renderer.scene.children.length;
      g.killLimit = g.player.stats.kills + 1; h.settings.skins = skins;
      g.kill(g.bots[0], g.player, { def: __W[weapon], part: 'body' });
      return { before, during: h.renderer.fx2.length };
    }, [weapon, skins]);
    await page.waitForTimeout(3400); // the body's vanish runs on the clock
    out[Object.values(skins)[0]] = { ...r, ...await page.evaluate(() => {
      const h = window.__game, g = h.game;
      // Step through the finisher frame by frame, as the game does, so effects started mid-finisher are counted.
      for (let i = 0; i < 4 * 30; i++) { __tick(g, 1 / 30); h.renderer.updateFx2(); }
      return { after: h.renderer.fx2.length - g.drops.length, body: h.renderer.characters.get(g.bots[0]).group.visible, light: h.renderer.finLight.intensity,
        // Nothing new left in the scene but the victim's dropped gun.
        left: h.renderer.scene.children.length - window.__sceneBefore - g.drops.length };
    }) };
  }
  return { pass: Object.values(out).every(o => o.during > o.before && o.after <= o.before && !o.body && o.light === 0 && o.left <= 0), ...out };
});

await check('Every melee type swings its own way and leaves a trail that clears', async () => {
  const r = await page.evaluate(async () => {
    const { SWINGS, MELEE_ORDER, sample } = await import('./js/melee.js');
    const h = window.__game, g = await __start({ botCount: 0 }), p = g.player, rd = h.renderer;
    const out = {};
    for (const m of MELEE_ORDER) {
      const sw = SWINGS[m];
      h.settings.melee = m;
      p.equip('melee', g.time, true);
      rd.render(0, 1 / 60, { dx: 0, dy: 0 });
      g.emit('swing', { who: p, heavy: false }); g.emit('swing', { who: p, heavy: true });
      const tracks = [...sw.light, sw.heavy].map(s => JSON.stringify(sample(s.track, s.dur * 0.3)));
      out[m] = { light: sw.light.length, trails: rd.trails.live.length, distinct: new Set(tracks).size === tracks.length, anim: rd.vm.swingAnim === sw.heavy };
      rd.trails.clear();
    }
    const flat = JSON.stringify(Object.values(SWINGS).map(s => s.heavy.trail));
    g.emit('swing', { who: p, heavy: true });
    const live = rd.trails.live.length;
    return { out, unique: new Set(Object.values(SWINGS).map(s => JSON.stringify(s.light[0].trail))).size, kinds: MELEE_ORDER.length, flat: flat.length > 0, live };
  });
  await page.waitForTimeout(1600); // trails run on the clock; the longest lasts about 1.1 s
  const after = await page.evaluate(() => { const rd = window.__game.renderer; rd.render(0, 1 / 60, { dx: 0, dy: 0 }); return { left: rd.trails.live.length, meshes: rd.vmScene.children.filter(o => o.isMesh || o.isPoints).length }; });
  const all = Object.values(r.out);
  return {
    pass: all.length === r.kinds && all.every(o => o.light >= 2 && o.trails >= 2 && o.distinct && o.anim) && r.unique === r.kinds && r.live > 0 && after.left === 0 && after.meshes === 0,
    ...r.out.tanto, unique: r.unique, ...after,
  };
});

await check('No page errors', () => ({ pass: errors.length === 0, errors: errors.slice(0, 3) }));

await browser.close();
server.close();
process.exit(failed ? 1 : 0);
