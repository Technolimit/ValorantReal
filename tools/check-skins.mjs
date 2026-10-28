// Headless checks for skins: the preset list, the single Melee entry (one theme per melee type), the Starspur
// models with their inspects and reloads, and finishers (only the kill that ends the round in 5v5, or the match in deathmatch), and pullouts.
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
  const r = { list: SKIN_ORDER.join(), vandal: on('vandal').join(), sheriff: on('sheriff').join(), marshal: on('marshal').join(), judge: on('judge').join(), phantom: on('phantom').join() };
  return {
    pass: r.list === 'standard,ember,glacier,orbital,starspur' && r.vandal === 'standard,ember,glacier,orbital' && r.phantom === 'standard,ember,glacier'
      && ['sheriff', 'marshal', 'judge'].every(w => r[w] === 'standard,ember,glacier,starspur'),
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
    pass: before.list.join() === 'Standard Issue,Ember Circuit,Glacier,Orbital' && before.swatches === 4 && before.variant === 'Glacial' && before.worn === 'standard'
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
  return { pass: r.list.length === 8 && r.title === 'Damascus Katana' && r.swatches === 1 && r.equipped === 'katana' && r.newHidden, ...r };
});

if (SHOTS) {
  for (const [w, name, v] of [['sheriff', 'Starspur', 0], ['marshal', 'Starspur', 1], ['judge', 'Starspur', 3], ['vandal', 'Orbital', 0], ['vandal', 'Orbital', 1], ['sheriff', 'Starspur', 2]]) {
    await page.evaluate(([w, name, v]) => { __open(w); __pick(name); __variant(v); }, [w, name, v]);
    await page.waitForTimeout(400);
    await shot(`menu-${name.toLowerCase()}-${w}-${v}`, '.panel.skins');
  }
  await page.evaluate(() => { __open('melee'); __pick('Bowie'); });
  await page.waitForTimeout(400);
  await shot('menu-starspur-bowie', '.panel.skins');
  await page.evaluate(() => document.getElementById('skin-detail-back').click());
  await page.waitForTimeout(200);
  await shot('collection-after', '.panel.skins');
}
await page.evaluate(() => { document.getElementById('skin-detail-back').click(); document.getElementById('skins-back').click(); });

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
    out[w] = { d, inspects: ins.map(i => i.name).join('/') };
    if (!parts.every(p => have.includes(p)) || ins.length !== 2) ok = false;
  }
  const b = gunModel('bowie', 'melee-bowie');
  out.bowie = { rowel: !!b.userData.parts.rowel, inspects: MELEE.bowie.inspects.length };
  if (!b.userData.parts.rowel || MELEE.bowie.inspects.length !== 3) ok = false;
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

await check('Deathmatch: only the match-winning kill plays a finisher, and only if that kill used the skin', async () => {
  const r = await page.evaluate(async () => ({
    orbital: await __finish('vandal', { vandal: 'orbital' }, 'knife', ['vandal', { vandal: 'orbital' }]),
    starspur: await __finish('sheriff', { sheriff: 'starspur~2' }),
    lastWithEmber: await __finish('vandal', { vandal: 'ember' }, 'knife', ['vandal', { vandal: 'orbital' }]),
    bowie: await __finish('knife', {}, 'bowie'),
    katana: await __finish('knife', {}, 'katana'),
  }));
  return {
    pass: r.orbital.mid === null && r.orbital.end === 'collapse' && r.orbital.over && r.starspur.end === 'lastLight'
      && r.lastWithEmber.mid === null && r.lastWithEmber.end === null && r.bowie.end === 'lastLight' && r.katana.end === null,
    ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, `${v.mid}/${v.end}`])),
  };
});

if (SHOTS) {
  for (const [kind, weapon, skins, times] of [['collapse', 'vandal', { vandal: 'orbital' }, [0.4, 1.2, 1.7]], ['lastLight', 'sheriff', { sheriff: 'starspur' }, [0.5, 1.2, 1.8]]]) {
    await page.evaluate(async () => {
      const g = await __start({ map: 'arena' });
      // Stand the victim 3.5 m in front of you (your spawn is open ground) and look at it.
      const bot = g.bots[0], p = g.player;
      p.pitch = -0.12;
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
      await page.evaluate((dt) => { __tick(window.__game.game, dt); document.getElementById('pause').hidden = true; }, t - done); done = t;
      await page.waitForTimeout(150);
      await shot(`finisher-${kind}-${t}`);
    }
  }
}

await check('5v5: a finisher waits for the round-ending kill, and needs that kill to be with the skin', () => page.evaluate(async () => {
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
  return { pass: early === null && last === 'collapse' && foes2.length === 5 && ghost === null, early, last, ghost, phase: g.mode.phase };
}));

await check('Finishers leave nothing behind once they end', async () => {
  const out = {};
  for (const [weapon, skins] of [['vandal', { vandal: 'orbital' }], ['sheriff', { sheriff: 'starspur' }]]) {
    const r = await page.evaluate(async ([weapon, skins]) => {
      const h = window.__game, g = await __start({});
      __tick(g, 0.1); h.renderer.updateFx2();
      const before = h.renderer.fx2?.length || 0;
      g.killLimit = g.player.stats.kills + 1; h.settings.skins = skins;
      g.kill(g.bots[0], g.player, { def: __W[weapon], part: 'body' });
      return { before, during: h.renderer.fx2.length };
    }, [weapon, skins]);
    await page.waitForTimeout(1800); // the body's vanish runs on the clock
    out[weapon] = { ...r, ...await page.evaluate(() => {
      const h = window.__game, g = h.game;
      __tick(g, 3); h.renderer.updateFx2();
      return { after: h.renderer.fx2.length - g.drops.length, body: h.renderer.characters.get(g.bots[0]).group.visible };
    }) };
  }
  return { pass: Object.values(out).every(o => o.during > o.before && o.after <= o.before && !o.body), ...out };
});

await check('No page errors', () => ({ pass: errors.length === 0, errors: errors.slice(0, 3) }));

await browser.close();
server.close();
process.exit(failed ? 1 : 0);
