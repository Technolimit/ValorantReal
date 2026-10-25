// Source for maps/divide.json (run tools/bake-maps.mjs after editing). "Divide": the 5v5 map, traced from the full tactical map shown in the user's Split walkthrough video
// (VALORANT Split, 11:13 into the video, de-rotated 26° so the lanes run along the axes). The trace is in
// map units of 6 m: x grows toward A (east), z toward the attackers (south), matching the in-game map's
// orientation. Every corridor, site and connector in that map is a rectangle here: Attacker Side Spawn,
// B Lobby, B Main, B Link, Mid Bottom, the ropes up to Mid Mail / Mid Top, Mid Vent, A Ramps, A Rafters,
// A Tower, A Main, A Lobby, A Sewer, A Site, A Screens, A Back, B Site, B Back, B Alley, B Rafters /
// B Tower, B Stairs and Defender Side Spawn. Floor heights come from the map's layers (the heavens, Mid
// Mail / Mid Top and Vent are a storey up); textures stay simple.
//
// Grid: 2 m cells (3 per map unit) over x ∈ [-72, 72], z ∈ [-66, 66]. F[z][x] is a walkable cell's floor
// height (null = solid). Stairs are built from fine 0.5 m treads so their steeper per-cell climbs stay walkable.
import { CELL } from '../js/config.js';

const W = 72, H = 66, OX = -72, OZ = -66, WALL_H = 8, UP = 3.2, HALF = 1.6;
const PX = 0.2; // metres per pixel of the reference map image (rotated 180° so attackers are south)

export function buildDivide() {
  const F = Array.from({ length: H }, () => Array(W).fill(null));
  const O = Array.from({ length: H }, () => Array(W).fill(''));
  const fine = Array.from({ length: H }, () => Array(W).fill(null));
  const REG = Array.from({ length: H }, () => Array(W).fill(null)); // which named area each floor cell belongs to
  let cur = null;
  const area = (name) => { cur = name; };
  const cxOf = (x) => Math.floor((x - OX) / CELL), czOf = (z) => Math.floor((z - OZ) / CELL);
  const fx = (a) => Math.ceil((a - OX) / CELL - 0.5), fz = (a) => Math.ceil((a - OZ) / CELL - 0.5);
  const cells = (x0, z0, x1, z1, fn) => {
    for (let z = fz(z0); z < fz(z1); z++) for (let x = fx(x0); x < fx(x1); x++) if (x >= 0 && z >= 0 && x < W && z < H) fn(x, z);
  };
  const wx_ = (px) => (px - 326) * PX, wz_ = (py) => (py - 300) * PX; // reference-image pixels -> metres
  const open = (u0, v0, u1, v1, h = 0) => cells(wx_(u0), wz_(v0), wx_(u1), wz_(v1), (x, z) => { F[z][x] = h; O[z][x] = ''; fine[z][x] = null; REG[z][x] = cur; });
  const wall = (u0, v0, u1, v1) => cells(wx_(u0), wz_(v0), wx_(u1), wz_(v1), (x, z) => { F[z][x] = null; fine[z][x] = null; });
  const objs = (u0, v0, u1, v1, t) => cells(wx_(u0), wz_(v0), wx_(u1), wz_(v1), (x, z) => { if (F[z][x] !== null) O[z][x] = t; });
  // Stairs from height a to b along `axis` (in map units); dir +1 climbs toward +axis, -1 toward -axis.
  const stairs = (u0, v0, u1, v1, axis, dir, a, b) => {
    const lo = axis === 'x' ? wx_(u0) : wz_(v0), hi = axis === 'x' ? wx_(u1) : wz_(v1);
    const flight = { axis, dir, a, b };
    cells(wx_(u0), wz_(v0), wx_(u1), wz_(v1), (x, z) => {
      const c = axis === 'x' ? OX + (x + 0.5) * CELL : OZ + (z + 0.5) * CELL;
      let t = (c - lo) / (hi - lo);
      if (dir < 0) t = 1 - t;
      F[z][x] = +(a + (b - a) * t).toFixed(2);
      O[z][x] = '';
      fine[z][x] = flight;
      REG[z][x] = cur;
    });
  };
  const h = (v) => v;

  // Rectangles below are in pixels of the clean overhead Split map the user supplied, turned 180° (attackers
  // south, A east). 1 px = 0.2 m. Heights: ground 0; Mid Top / Mid Mail / B Tower / B Rafters / A Tower /
  // A Rafters one storey up (UP); Mid Vent higher still (VENT), with ropes up from Mid Top and A Tower.

  // ---------------- defender side ----------------
  area('defspawn');
  open(290, 3, 343, 165);                 // Defender Side Spawn
  open(327, 93, 480, 115);                // path east, opening into A Screens
  open(200, 132, 290, 158);               // path west toward B Stairs / B Alley
  area('balley');
  open(175, 82, 202, 132);                // B Alley
  open(97, 97, 175, 128);
  open(97, 128, 118, 165);
  open(137, 118, 175, 130);

  // ---------------- B ----------------
  area('bsite');
  open(15, 125, 60, 268);                 // B Back
  open(60, 162, 167, 268);                // B Site
  wall(68, 210, 118, 232); wall(15, 190, 43, 200);
  area('bmain');
  open(47, 268, 67, 290);                 // B Site <-> B Main
  open(37, 290, 147, 360);                // B Main: an L on its side —
  open(37, 360, 85, 382);                 // the lower-right corner is closed off
  area('blobby');
  open(108, 360, 148, 405);               // B Main <-> B Lobby (the attackers' barrier sits where B Main's roof starts)
  open(105, 405, 170, 503);               // B Lobby
  area('blink');
  open(170, 370, 213, 445);               // B Link
  open(213, 392, 232, 415);
  area('btower');
  open(160, 192, 212, 235, UP);           // B Rafters
  open(147, 235, 192, 300, UP);           // B Tower
  open(192, 235, 233, 330, UP);
  wall(147, 288, 157, 300);               // no drop from B Tower straight into B Main
  area('bstairs');
  stairs(212, 158, 270, 192, 'z', 1, 0, 1.4);   // B Stairs: up from the defender path...
  stairs(233, 192, 245, 262, 'z', 1, 1.4, UP);  // ...to Mid Mail / B Tower

  // ---------------- mid ----------------
  area('midbottom');
  open(232, 370, 330, 437);               // Mid Bottom
  open(270, 340, 330, 370);
  open(320, 370, 392, 386);               // Mid Bottom -> A Sewer
  area('midtop');
  stairs(285, 300, 330, 340, 'z', -1, 0, HALF); // short ramp up from Mid Bottom...
  open(285, 258, 330, 300, HALF);         // ...to the half-height Mid Top platform
  open(300, 225, 330, 258, HALF);
  area('midmail');
  stairs(258, 262, 285, 300, 'x', -1, HALF, UP); // second ramp up from the platform to Mail / B Tower
  open(233, 262, 258, 300, UP);           // Mid Mail
  area('midvent');
  open(330, 230, 365, 250, HALF);         // Mid Vent: a closed duct through a doorway off the platform...
  area('ventpit');
  stairs(365, 230, 395, 250, 'x', -1, 0, HALF); // ...that steps down at the far end...
  open(377, 205, 395, 230);               // ...into a pit with a rope up into A Tower

  // ---------------- A ----------------
  area('ascreens');
  open(440, 56, 568, 93);                 // A Screens
  open(520, 93, 542, 108);                // the one opening from Screens into the site
  area('atower');
  open(410, 115, 440, 127);
  stairs(410, 127, 440, 172, 'z', 1, 0, UP); // narrow defender stairs up to A Tower
  open(398, 172, 440, 228, UP);           // A Tower: a narrow covered room
  area('arafters');
  open(440, 185, 520, 248, UP);           // A Rafters (over the site)
  area('asite');
  open(520, 108, 605, 248);               // A Site
  open(572, 130, 643, 255);
  wall(545, 130, 588, 160);               // site box / pillar
  area('aback');
  open(530, 100, 605, 130);               // A Back
  area('amain');
  open(518, 248, 542, 262);               // A Site <-> A Main
  open(500, 262, 590, 357);               // A Main
  wall(500, 313, 540, 357);               // (lower-left filled in: A Main narrows toward A Lobby)
  area('aramps');
  open(425, 228, 465, 236, UP);           // top of A Ramps (into A Tower / Rafters)
  stairs(425, 236, 465, 300, 'z', -1, 0, UP); // A Ramps, climbing north from A Main
  open(425, 300, 457, 336);
  open(457, 290, 500, 313);               // A Ramps <-> A Main
  area('alobby');
  open(552, 357, 622, 397);               // A Lobby (opening into A Main = the attackers' A exit)
  open(530, 395, 590, 467);
  area('asewer');
  open(393, 350, 408, 425);               // A Sewer: a tunnel barely wider than a player
  open(393, 410, 530, 425);               // one way in from A Lobby

  // ---------------- attackers ----------------
  area('atkspawn');
  open(412, 432, 590, 467);               // A Lobby side of the spawn street
  open(335, 467, 463, 517);
  open(320, 467, 350, 513);
  open(263, 513, 350, 595);               // Attacker Side Spawn
  open(170, 445, 203, 490);               // toward B Link
  open(160, 490, 268, 531);               // toward B Lobby (4 cells wide, like the street out to A Lobby)
  open(105, 490, 170, 531);

  // ---------------- cover ----------------
  objs(600, 175, 612, 187, 'C'); objs(620, 215, 630, 225, 'c'); objs(585, 225, 597, 237, 'c');     // A site
  objs(95, 175, 107, 187, 'C'); objs(120, 175, 130, 185, 'c'); objs(30, 230, 40, 240, 'c');        // B site
  objs(290, 395, 302, 407, 'C'); objs(250, 420, 260, 430, 'c');                                     // Mid Bottom
  objs(560, 300, 570, 310, 'c'); objs(80, 340, 92, 352, 'C'); objs(140, 470, 150, 480, 'C');       // lanes
  objs(470, 70, 480, 80, 'c'); objs(310, 30, 320, 40, 'c');
  const ox = OX, oz = OZ;
  const cellCenter = (cx, cz) => ({ x: ox + (cx + 0.5) * CELL, z: oz + (cz + 0.5) * CELL });
  const cellOf = (x, z) => [Math.floor((x - ox) / CELL), Math.floor((z - oz) / CELL)];
  const wx = (cx) => ox + cx * CELL, wz = (cz) => oz + cz * CELL;

  // ---- look of each area, matched to the walkthrough video ----
  // floor: floor material; wall/base: upper wall and lower band; hMin/hMax: building heights; roof: tiled caps;
  // decor: what gets put on the walls facing that area (see decorate below); trees: canopy colour behind walls.
  const STYLE = {
    atkspawn:  { floor: 'asphalt', wall: 'plaster', base: 'stonewall', band: 1.4, hMin: 4, hMax: 11, roof: true, decor: ['vines', 'slats', 'glass', 'cone', 'gate'], trees: [0xe58fb5, 0x5f8f45] },
    blobby:    { floor: 'concrete', wall: 'terra2', base: 'rust', band: 2.2, hMin: 6, hMax: 10, decor: ['neon', 'crates', 'poster', 'pipe'] },
    bmain:     { floor: 'darkconcrete', wall: 'brick', ceil: 4.9, hMin: 7, hMax: 9, decor: ['shutter', 'lamp', 'canopy', 'poster'] },
    blink:     { floor: 'darkconcrete', wall: 'terra2', ceil: 3.6, hMin: 6, hMax: 9, decor: ['bench', 'pipe'] },
    midbottom: { floor: 'paving', wall: 'woodfacade', base: 'salmon', band: 0.6, hMin: 7, hMax: 11, roof: true, decor: ['shop', 'lantern', 'pot', 'crates'], trees: [0x5f8f45] },
    midtop:    { floor: 'darkstone', wall: 'olive', base: 'salmon', band: 3.2, hMin: 7, hMax: 9, decor: ['mailbox', 'lamp'] },
    midmail:   { floor: 'woodfloor', wall: 'mural', base: 'whitetile', band: 2.2, hMin: 6.5, hMax: 7.5, decor: ['mailbox', 'lamp'] },
    ventpit:   { floor: 'grate', wall: 'bluemetal', ceil: 4.6, hMin: 9.5, hMax: 10, decor: ['pipe'] },
    midvent:   { floor: 'grate', wall: 'bluemetal', ceil: 2.4, hMin: 6.5, hMax: 7.5, decor: ['pipe', 'doorframe'] },
    aramps:    { floor: 'diamond', wall: 'beige', base: 'tealpanel', band: 0.8, hMin: 7, hMax: 9, decor: ['hazard', 'doorframe', 'boxes'] },
    atower:    { floor: 'slate', wall: 'white', base: 'tealpanel', band: 1.0, ceil: 5.4, hMin: 9.5, hMax: 10, decor: ['screen', 'boxes'] },
    arafters:  { floor: 'slate', wall: 'white', base: 'tealpanel', band: 1.0, hMin: 7, hMax: 10, decor: ['screen'] },
    asite:     { floor: 'slate', wall: 'white', base: 'darkband', band: 1.3, hMin: 7, hMax: 12, decor: ['vines', 'screen', 'planterbox'], trees: [0x6a9a4a] },
    ascreens:  { floor: 'darkconcrete', wall: 'woodpanel', base: 'darkband', band: 0.6, hMin: 7, hMax: 10, decor: ['petals', 'pipe'] },
    aback:     { floor: 'slate', wall: 'white', base: 'darkband', band: 1.0, hMin: 7, hMax: 10, decor: ['planterbox'] },
    amain:     { floor: 'lightconcrete', wall: 'beige', base: 'greenmetal', band: 1.6, hMin: 6, hMax: 10, decor: ['planks', 'planterbox', 'vines'] },
    alobby:    { floor: 'lightconcrete', wall: 'greenmetal', base: 'woodpanel', band: 1.6, hMin: 6, hMax: 9, decor: ['poster', 'vines'] },
    asewer:    { floor: 'darkconcrete', wall: 'sewerblue', ceil: 2.15, hMin: 6, hMax: 8, decor: ['pipe'] },
    defspawn:  { floor: 'bluetile', wall: 'greymetal', base: 'salmon', band: 2.6, hMin: 7, hMax: 10, roof: true, decor: ['shutter', 'planterwall', 'poster'] },
    balley:    { floor: 'grass', wall: 'plaster', hMin: 5, hMax: 8, roof: true, decor: ['vines', 'slats'], trees: [0xe58fb5, 0xd96d9a] },
    bsite:     { floor: 'concrete', wall: 'greyplaster', base: 'salmon', band: 1.8, hMin: 7, hMax: 12, roof: true, decor: ['poster', 'bluetiles', 'crates', 'ac'], trees: [0x6a9a4a] },
    btower:    { floor: 'woodfloor', wall: 'beigetile', base: 'salmon', band: 1.2, ceil: 8.1, hMin: 11.8, hMax: 12.5, decor: ['mural', 'ac'] },
    bstairs:   { floor: 'woodfloor', wall: 'beige', hMin: 7, hMax: 9, decor: ['chalkboard', 'poster'] },
  };
  const DEF_STYLE = { floor: 'concrete', wall: 'plaster', hMin: 7, hMax: 10, decor: [] };
  const hash = (x, z, k = 0) => { let n = (x * 73856093) ^ (z * 19349663) ^ (k * 83492791); n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };

  // Each wall cell takes the style of the nearest floor cell, so a building looks like the street it faces.
  const wallReg = Array.from({ length: H }, () => Array(W).fill(null));
  const wallFloor = Array.from({ length: H }, () => Array(W).fill(0));
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    if (F[z][x] !== null) continue;
    let best = null, bd = 99, bf = 0;
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      const r = REG[z + dz]?.[x + dx];
      if (r && F[z + dz][x + dx] !== null && dx * dx + dz * dz < bd) { bd = dx * dx + dz * dz; best = r; bf = F[z + dz][x + dx]; }
    }
    wallReg[z][x] = best;
    wallFloor[z][x] = bf; // floor height of the street this wall faces: its lower band starts there
  }

  // ---- covered areas: ceiling height per area ----
  const ceilTop = {};
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const r = REG[z][x]; if (F[z][x] === null || !STYLE[r]?.ceil) continue;
    const f = fine[z][x] ? Math.max(fine[z][x].a, fine[z][x].b) : F[z][x];
    ceilTop[r] = Math.max(ceilTop[r] ?? 0, f);
  }
  for (const r in ceilTop) ceilTop[r] += STYLE[r].ceil;
  const roofOf = (x, z) => { if (x < 0 || z < 0 || x >= W || z >= H || F[z][x] === null) return null; const r = REG[z][x]; return ceilTop[r] !== undefined ? r : null; };
  // Walls next to a covered area rise past its ceiling so the roof meets them with no gap.
  const wallNeed = Array.from({ length: H }, () => Array(W).fill(0));
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    if (F[z][x] !== null) continue;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const r = roofOf(x + dx, z + dz); if (r) wallNeed[z][x] = Math.max(wallNeed[z][x], ceilTop[r] + 0.6); }
  }

  // ---- boxes (merged runs) ----
  const boxes = [];
  const floorSkins = []; // visual floor surfaces at street level (no collision)
  const decor = [];      // visual-only boxes: { min, max, color, glow }
  const trees = [];
  const used = Array.from({ length: H }, () => Array(W).fill(false));
  const kindOf = (x, z) => (F[z][x] === null ? 'wall:' + (wallReg[z][x] || '') + ':' + wallFloor[z][x] : fine[z][x] ? 'fine' : 'floor' + F[z][x] + ':' + (REG[z][x] || ''));
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    if (used[z][x]) continue;
    const k = kindOf(x, z);
    if (k === 'fine') continue;
    let x1 = x;
    while (x1 + 1 < W && !used[z][x1 + 1] && kindOf(x1 + 1, z) === k && x1 - x < 5) x1++;
    let z1 = z;
    grow: while (z1 + 1 < H && z1 - z < 5) { for (let xx = x; xx <= x1; xx++) if (used[z1 + 1][xx] || kindOf(xx, z1 + 1) !== k) break grow; z1++; }
    for (let zz = z; zz <= z1; zz++) for (let xx = x; xx <= x1; xx++) used[zz][xx] = true;
    if (k.startsWith('wall')) {
      const st = STYLE[wallReg[z][x]] || DEF_STYLE;
      // Buildings of different heights give each street a skyline.
      const wf = wallFloor[z][x];
      let need = 0; for (let zz = z; zz <= z1; zz++) for (let xx = x; xx <= x1; xx++) need = Math.max(need, wallNeed[zz][xx]);
      const top = +Math.max(need, Math.max(st.hMin, wf + 3.5) + (st.hMax - st.hMin) * hash(x, z, 1)).toFixed(1);
      if (st.base) {
        const band = wf + st.band;
        boxes.push({ min: [wx(x), 0, wz(z)], max: [wx(x1 + 1), band, wz(z1 + 1)], mat: st.base, pen: false });
        boxes.push({ min: [wx(x), band, wz(z)], max: [wx(x1 + 1), top, wz(z1 + 1)], mat: st.wall, pen: false });
      } else boxes.push({ min: [wx(x), 0, wz(z)], max: [wx(x1 + 1), top, wz(z1 + 1)], mat: st.wall, pen: false });
      if (st.roof) decor.push({ min: [wx(x) - 0.25, top, wz(z) - 0.25], max: [wx(x1 + 1) + 0.25, top + 0.35, wz(z1 + 1) + 0.25], color: 0x4a5058 });
      else decor.push({ min: [wx(x), top, wz(z)], max: [wx(x1 + 1), top + 0.12, wz(z1 + 1)], color: 0x5c6168 }); // parapet
    } else {
      const st = STYLE[REG[z][x]] || DEF_STYLE;
      if (F[z][x] > 0) boxes.push({ min: [wx(x), 0, wz(z)], max: [wx(x1 + 1), F[z][x], wz(z1 + 1)], mat: st.floor, pen: false });
      else floorSkins.push({ min: [wx(x), -0.05, wz(z)], max: [wx(x1 + 1), 0.006, wz(z1 + 1)], mat: st.floor });
    }
  }

  // ---- ceilings over the covered areas (solid: they stop players, bullets and throws) ----
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const r = roofOf(x, z); if (!r || roofOf(x - 1, z) === r) continue;
    let x1 = x; while (roofOf(x1 + 1, z) === r) x1++;
    const y = ceilTop[r];
    boxes.push({ min: [wx(x) - 0.05, y, wz(z) - 0.05], max: [wx(x1 + 1) + 0.05, y + 0.5, wz(z + 1) + 0.05], mat: 'ceiling', pen: false });
  }
  // Openings out of a covered area are door / window sized: a header wall fills the edge above head height.
  {
    const floorAt = (x, z) => (fine[z][x] ? Math.max(fine[z][x].a, fine[z][x].b) : F[z][x]);
    const T = 0.3;
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      const r = roofOf(x, z); if (!r) continue;
      const cTop = ceilTop[r], st = STYLE[r];
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= W || nz >= H || F[nz][nx] === null) continue;
        const o = roofOf(nx, nz); if (o === r) continue;
        let lo = Math.max(floorAt(x, z), floorAt(nx, nz)) + 2.7;
        if (o) lo = Math.min(lo, ceilTop[o]);
        if (lo >= cTop - 0.05) continue;
        const x0 = dx > 0 ? wx(x + 1) - T : dx < 0 ? wx(x) : wx(x), x1 = dx > 0 ? wx(x + 1) : dx < 0 ? wx(x) + T : wx(x + 1);
        const z0 = dz > 0 ? wz(z + 1) - T : dz < 0 ? wz(z) : wz(z), z1 = dz > 0 ? wz(z + 1) : dz < 0 ? wz(z) + T : wz(z + 1);
        boxes.push({ min: [x0, lo, z0], max: [x1, cTop + 0.05, z1], mat: st.wall, pen: false });
      }
    }
  }

  // ---- decoration on the walls facing each area ----
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const add = (b) => decor.push(b);
  // A box flat against the wall face of cell (x,z) on side d: u along the wall (-1..1 of the cell), y up, t out.
  const onFace = (x, z, [dx, dz], u0, u1, y0, y1, t0, t1, color, glow = false) => {
    const fx = dx ? (dx > 0 ? wx(x + 1) : wx(x)) : null, fz = dz ? (dz > 0 ? wz(z + 1) : wz(z)) : null;
    const cx = wx(x) + CELL / 2, cz = wz(z) + CELL / 2;
    if (dx) { const X = fx, s = -dx; add({ min: [Math.min(X + s * t0, X + s * t1), y0, cz + u0], max: [Math.max(X + s * t0, X + s * t1), y1, cz + u1], color, glow }); }
    else { const Z = fz, s = -dz; add({ min: [cx + u0, y0, Math.min(Z + s * t0, Z + s * t1)], max: [cx + u1, y1, Math.max(Z + s * t0, Z + s * t1)], color, glow }); }
  };
  const floorBox = (x, z, u0, v0, u1, v1, y0, y1, color, glow = false) => { const f = F[z][x]; add({ min: [wx(x) + u0, f + y0, wz(z) + v0], max: [wx(x) + u1, f + y1, wz(z) + v1], color, glow }); };
  const DECOR = {
    vines: (x, z, d, f) => { const w = 0.4 + hash(x, z, 5) * 0.55; onFace(x, z, d, -w, w, f + 1.2 + hash(x, z, 6) * 1.2, f + 4.6, 0, 0.12, hash(x, z, 7) < 0.5 ? 0x4f7a3a : 0x60894a); },
    slats: (x, z, d, f) => { for (let i = -4; i <= 4; i++) onFace(x, z, d, i * 0.22 - 0.07, i * 0.22 + 0.07, f, f + 2.4, 0, 0.06, 0x8b6a4a); },
    glass: (x, z, d, f) => { onFace(x, z, d, -0.95, 0.95, f + 0.1, f + 2.6, 0, 0.05, 0x3d5f75); onFace(x, z, d, -0.95, 0.95, f + 2.7, f + 3.3, 0, 0.12, 0x2e8fe8, true); },
    gate: (x, z, d, f) => { onFace(x, z, d, -0.9, 0.9, f, f + 2.5, 0, 0.08, 0x8a5a35); onFace(x, z, d, -0.03, 0.03, f, f + 2.5, 0.08, 0.1, 0x5a3a22); onFace(x, z, d, -1, 1, f + 2.5, f + 2.75, 0, 0.3, 0x4a5058); },
    cone: (x, z, d, f) => { const o = [0.5 - d[0] * 0.7, 0.5 - d[1] * 0.7].map(v => v * CELL); floorBox(x, z, o[0] - 0.15, o[1] - 0.15, o[0] + 0.15, o[1] + 0.15, 0, 0.5, 0xff7a1a); },
    shop: (x, z, d, f) => { onFace(x, z, d, -1, 1, f, f + 3.2, 0, 0.1, 0x6b4530); onFace(x, z, d, -0.8, 0.8, f + 0.1, f + 2.4, 0.1, 0.14, 0x9c7a56); onFace(x, z, d, -0.85, 0.85, f + 2.4, f + 3.0, 0.1, 0.16, 0x2d3e5a); onFace(x, z, d, -1.05, 1.05, f + 3.2, f + 3.45, 0, 0.6, 0x4a5058); },
    lantern: (x, z, d, f) => { onFace(x, z, d, -0.17, 0.17, f + 2.9, f + 3.45, 0.35, 0.7, 0xff5a3a, true); onFace(x, z, d, -0.02, 0.02, f + 3.45, f + 3.8, 0.5, 0.54, 0x2b2f36); },
    pot: (x, z, d, f) => { const o = [0.5 - d[0] * 0.65, 0.5 - d[1] * 0.65].map(v => v * CELL); floorBox(x, z, o[0] - 0.22, o[1] - 0.22, o[0] + 0.22, o[1] + 0.22, 0, 0.4, 0xb0603e); floorBox(x, z, o[0] - 0.3, o[1] - 0.3, o[0] + 0.3, o[1] + 0.3, 0.4, 0.85, 0x5c8a42); },
    crates: (x, z, d, f) => { onFace(x, z, d, -0.8, 0.2, f, f + 1.0, 0, 0.9, 0xa47c4c); onFace(x, z, d, -0.6, 0.1, f + 1.0, f + 1.8, 0.05, 0.8, 0xb48a58); },
    boxes: (x, z, d, f) => { onFace(x, z, d, 0.1, 0.9, f, f + 0.8, 0, 0.7, 0xb48a58); },
    neon: (x, z, d, f) => { onFace(x, z, d, -0.8, 0.8, f + 2.6, f + 3.4, 0, 0.08, 0xff4fa0, true); },
    poster: (x, z, d, f) => { const n = 1 + Math.floor(hash(x, z, 8) * 3); for (let i = 0; i < n; i++) { const u = -0.7 + i * 0.5 + hash(x, z, 9 + i) * 0.1, y = f + 1.2 + hash(x, z, 12 + i) * 0.9; onFace(x, z, d, u, u + 0.38, y, y + 0.52, 0, 0.02, 0xe8e2d0); } },
    pipe: (x, z, d, f) => { onFace(x, z, d, -1, 1, f + 3.3, f + 3.45, 0.05, 0.2, 0x3a3f45); },
    shutter: (x, z, d, f) => { onFace(x, z, d, -0.9, 0.9, f, f + 2.8, 0, 0.06, 0x8a9096); for (let i = 1; i < 7; i++) onFace(x, z, d, -0.9, 0.9, f + i * 0.4, f + i * 0.4 + 0.04, 0.06, 0.08, 0x6d737a); },
    lamp: (x, z, d, f) => { onFace(x, z, d, -0.25, 0.25, f + 3.0, f + 3.12, 0, 0.3, 0xfff2c8, true); },
    canopy: (x, z, d, f) => { onFace(x, z, d, -1, 1, f + 4.2, f + 4.35, 0, 1.4, 0x4f7a5a); },
    bench: (x, z, d, f) => { onFace(x, z, d, -0.9, 0.9, f + 0.42, f + 0.5, 0, 0.45, 0x8b6a4a); },
    mailbox: (x, z, d, f) => { onFace(x, z, d, -0.8, 0.8, f + 1.2, f + 2.2, 0, 0.12, 0x9aa0a6); for (let i = -3; i <= 3; i++) onFace(x, z, d, i * 0.22 - 0.01, i * 0.22 + 0.01, f + 1.2, f + 2.2, 0.12, 0.13, 0x6d737a); },
    doorframe: (x, z, d, f) => { onFace(x, z, d, -0.8, -0.65, f, f + 2.6, 0, 0.12, 0x3f8f95); onFace(x, z, d, 0.65, 0.8, f, f + 2.6, 0, 0.12, 0x3f8f95); onFace(x, z, d, -0.8, 0.8, f + 2.5, f + 2.65, 0, 0.12, 0x3f8f95); onFace(x, z, d, -0.65, 0.65, f, f + 2.5, 0, 0.03, 0x2a2f34); },
    hazard: (x, z, d, f) => { for (let i = -2; i <= 2; i++) onFace(x, z, d, i * 0.4 - 0.2, i * 0.4, f + 1.1, f + 1.35, 0, 0.03, i % 2 ? 0x1f1f1f : 0xe8c23a); },
    screen: (x, z, d, f) => { onFace(x, z, d, -0.75, 0.75, f + 1.0, f + 2.0, 0, 0.08, 0x6fc8ff, true); },
    planterbox: (x, z, d, f) => { onFace(x, z, d, -0.8, 0.8, f, f + 0.7, 0, 0.6, 0xe8e6e0); onFace(x, z, d, -0.7, 0.7, f + 0.7, f + 1.0, 0.05, 0.55, 0x5c8a42); },
    planks: (x, z, d, f) => { for (let i = 0; i < 8; i++) onFace(x, z, d, -1, 1, f + 0.2 + i * 0.32, f + 0.48 + i * 0.32, 0, 0.05, i % 2 ? 0xa0704a : 0x8c5f3c); },
    petals: (x, z, d, f) => { for (let i = 0; i < 5; i++) { const u = hash(x, z, 20 + i) * CELL, v = hash(x, z, 30 + i) * CELL; floorBox(x, z, u, v, u + 0.25, v + 0.2, 0.008, 0.015, 0xd9708f); } },
    planterwall: (x, z, d, f) => { onFace(x, z, d, -1, 1, f, f + 1.1, 0, 0.7, 0xc2b394); onFace(x, z, d, -0.95, 0.95, f + 1.1, f + 1.5, 0.05, 0.65, 0x5c8a42); },
    bluetiles: (x, z, d, f) => { onFace(x, z, d, -1, 1, f, f + 2.6, 0, 0.04, 0x4e7b8a); },
    ac: (x, z, d, f) => { onFace(x, z, d, -0.45, 0.45, f + 2.5, f + 3.1, 0, 0.45, 0xc9ccd0); },
    mural: (x, z, d, f) => { onFace(x, z, d, -1, 1, f + 2.9, f + 4.2, 0, 0.02, 0x6aa38f); onFace(x, z, d, -0.4, 0.4, f + 3.2, f + 3.8, 0.02, 0.03, 0xd05a4a); },
    chalkboard: (x, z, d, f) => { onFace(x, z, d, -0.95, 0.95, f + 0.9, f + 2.2, 0, 0.05, 0x355a40); DECOR.poster(x, z, d, f); },
  };
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    if (F[z][x] === null || fine[z][x]) continue;
    const st = STYLE[REG[z][x]];
    if (!st || !st.decor.length) continue;
    // Floor-only decoration (petals, grass) covers the cell; everything else goes on a wall face.
    if (st.decor.includes('petals') && hash(x, z, 40) < 0.5) DECOR.petals(x, z, null, F[z][x]);
    for (const d of DIRS) {
      const nx = x + d[0], nz = z + d[1];
      if (F[nz]?.[nx] !== null || nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
      if (hash(x, z, 50 + d[0] * 3 + d[1]) > 0.42) continue;
      const kinds = st.decor.filter(k => k !== 'petals');
      if (!kinds.length) continue;
      DECOR[kinds[Math.floor(hash(x, z, 60 + d[0] + d[1] * 2) * kinds.length)]](x, z, d, F[z][x]);
    }
  }
  // Attacker spawn: the zebra crossing on the street.
  { const [x0, z0] = [wx_(268), wz_(560)]; for (let i = 0; i < 7; i++) floorSkins.push({ min: [x0 + 1 + i * 2.2, 0.006, z0], max: [x0 + 2.2 + i * 2.2, 0.012, z0 + 4.5], mat: 'stripe' }); }
  // Trees over the walls (cherry blossom at spawn and B Alley, greens elsewhere): on solid cells next to areas that have them.
  for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) {
    const r = wallReg[z][x], st = STYLE[r];
    if (F[z][x] !== null || !st?.trees || hash(x, z, 70) > 0.09) continue;
    trees.push({ x: wx(x) + CELL / 2, z: wz(z) + CELL / 2, y: st.hMax + 0.5, r: 2.2 + hash(x, z, 71) * 1.6, color: st.trees[Math.floor(hash(x, z, 72) * st.trees.length)] });
  }

  // Stairs: one box per 0.5 m tread spanning the whole flight's width.
  const flights = new Map();
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) { const s = fine[z][x]; if (s) { if (!flights.has(s)) flights.set(s, []); flights.get(s).push([x, z]); } }
  for (const [s, list] of flights) {
    const xs = list.map(c => c[0]), zs = list.map(c => c[1]);
    const X0 = wx(Math.min(...xs)), X1 = wx(Math.max(...xs) + 1), Z0 = wz(Math.min(...zs)), Z1 = wz(Math.max(...zs) + 1);
    const lo = s.axis === 'x' ? X0 : Z0, hi = s.axis === 'x' ? X1 : Z1, n = Math.round((hi - lo) / 0.5);
    for (let i = 0; i < n; i++) {
      const a0 = lo + i * 0.5, a1 = a0 + 0.5;
      let t = (i + 1) / n; if (s.dir < 0) t = 1 - i / n;
      const h = s.a + (s.b - s.a) * t;
      if (h <= 0.01) continue;
      const smat = (STYLE[REG[list[0][1]][list[0][0]]] || DEF_STYLE).floor;
      boxes.push(s.axis === 'x' ? { min: [a0, 0, Z0], max: [a1, h, Z1], mat: smat, pen: false } : { min: [X0, 0, a0], max: [X1, h, a1], mat: smat, pen: false });
    }
  }
  // cover objects sit on their cell's floor
  const OBJ = { c: { h: 1.0, mat: 'crate', pen: true }, C: { h: 2.0, mat: 'crate', pen: true }, h: { h: 1.0, mat: 'half', pen: false }, p: { h: 0.8, mat: 'planter', pen: false },
    T: { h: 4, mat: 'plaster', pen: false }, U: { h: 8, mat: 'terra', pen: false },
    P: { h: h(2.8), mat: 'plaster', pen: false }, H: { h: 1.0, mat: 'half', pen: false } };
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const t = O[z][x];
    if (!t || F[z][x] === null) continue;
    const d = OBJ[t], f = F[z][x];
    const inset = t === 'T' || t === 'U' ? 0 : 0.08;
    let min = [wx(x) + inset, f, wz(z) + inset], max = [wx(x + 1) - inset, f + d.h, wz(z + 1) - inset];
    if (t === 'h') { min = [wx(x) + 0.75, f, wz(z)]; max = [wx(x + 1) - 0.75, f + d.h, wz(z + 1)]; } // railing along z
    if (t === 'H') { min = [wx(x), f, wz(z) + 0.75]; max = [wx(x + 1), f + d.h, wz(z + 1) - 0.75]; } // railing along x
    boxes.push({ min, max, mat: d.mat, pen: d.pen });
  }
  boxes.push({ min: [ox, -1, oz], max: [ox + W * CELL, 0, oz + H * CELL], mat: 'tile', pen: false, floor: true });

  // ---- navigation ----
  const heights = F.map((row, z) => row.map((h, x) => (h === null || O[z][x] ? null : h)));
  const stairCell = fine; // each stair cell's flight (or null)
  const walkable = [];
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (heights[z][x] !== null) walkable.push([x, z]);

  // ---- spawns, sites, barriers (positions in reference-image pixels) ----
  const M = (u, v) => [wx_(u), wz_(v)];
  const atU = (u, v, yaw) => { const [x, z] = M(u, v); const [cx, cz] = cellOf(x, z); const c = cellCenter(cx, cz); return { x: c.x, y: F[cz]?.[cx] ?? 0, z: c.z, yaw }; };
  // Attackers spawn south and face north (-z); defenders spawn north and face south.
  const teamSpawns = {
    atk: [[280, 540], [300, 540], [320, 540], [290, 560], [310, 560], [330, 560], [280, 580], [300, 580], [320, 580], [335, 530]].map(([u, v]) => atU(u, v, 0)),
    def: [[300, 20], [316, 20], [332, 20], [300, 40], [316, 40], [332, 40], [300, 60], [316, 60], [332, 60], [316, 80]].map(([u, v]) => atU(u, v, Math.PI)),
  };
  const dmPts = [[316, 40], [600, 200], [540, 130], [447, 200], [490, 215], [312, 240], [246, 280], [305, 280], [310, 425], [250, 410], [190, 410],
    [125, 385], [140, 460], [100, 200], [35, 160], [140, 110], [175, 260], [470, 417], [570, 330], [430, 320], [500, 75], [300, 560], [230, 145]];
  const spawns = dmPts.map(([u, v]) => { const s = atU(u, v, 0); s.yaw = Math.atan2(s.x, s.z); return s; });

  const zone = (u0, v0, u1, v1) => { const [x0, z0] = M(u0, v0), [x1, z1] = M(u1, v1); return { min: [x0, 0, z0], max: [x1, 0, z1] }; };
  const sites = {
    A: { ...zone(572, 132, 640, 252), name: 'A' },
    B: { ...zone(80, 164, 155, 218), name: 'B' },
  };
  for (const s of Object.values(sites)) s.center = [(s.min[0] + s.max[0]) / 2, 0, (s.min[2] + s.max[2]) / 2];
  const bar = (team, u0, v0, u1, v1) => {
    const [x0, z0] = M(u0, v0), [x1, z1] = M(u1, v1);
    let fl = Infinity, a = Infinity, b = Infinity, c = -1, d = -1;
    cells(x0, z0, x1, z1, (x, z) => { fl = Math.min(fl, F[z][x] ?? 0); a = Math.min(a, x); b = Math.min(b, z); c = Math.max(c, x); d = Math.max(d, z); });
    if (fl === Infinity) return { team, min: [x0, -0.5, z0], max: [x1, 7, z1] };
    // Snap to whole cells so no sliver of floor is left beside the barrier for a player to squeeze through.
    return { team, min: [OX + a * CELL, fl - 0.5, OZ + b * CELL], max: [OX + (c + 1) * CELL, fl + 7, OZ + (d + 1) * CELL] };
  };
  // The red and cyan bars on the reference map.
  const barriers = [
    bar('atk', 552, 352, 592, 362), bar('atk', 380, 370, 392, 386), bar('atk', 213, 392, 223, 415), bar('atk', 108, 361, 148, 369),
    bar('def', 270, 340, 330, 350), bar('def', 413, 263, 465, 271), bar('def', 518, 250, 542, 258), bar('def', 47, 272, 67, 280),
  ];
  // Ropes (bottom -> top): Mid Bottom up to Mid Top; Mid Top up into the vent; A Tower up into the vent; B Site up to
  // B Tower; A Site up to A Rafters.
  const ropes = [[[388, 215], [402, 215]], [[140, 250], [152, 250]], [[525, 230], [515, 230]]].map(([b, t]) => {
    const pb = M(...b), pt = M(...t);
    const cb = cellCenter(...cellOf(...pb)), ct = cellCenter(...cellOf(...pt));
    const dx = ct.x - cb.x, dz = ct.z - cb.z, l = Math.hypot(dx, dz) || 1;
    const fb = F[cellOf(...pb)[1]][cellOf(...pb)[0]], ft = F[cellOf(...pt)[1]][cellOf(...pt)[0]];
    return { x: cb.x + dx / l * 0.55, z: cb.z + dz / l * 0.55, bottom: fb, top: ft, toward: [dx / l, dz / l] };
  });

  const L = (text, u, v, size = 1) => { const [x, z] = M(u, v); const [cx, cz] = cellOf(x, z); return { text, x, z, y: (F[cz]?.[cx] ?? 0) + 0.02, size }; };
  const labels = [L('A', 608, 190, 1.6), L('B', 118, 190, 1.6), L('MID', 280, 400), L('MAIL', 260, 282, 0.6), L('MID TOP', 308, 290, 0.6),
    L('VENT', 348, 245, 0.5), L('A MAIN', 545, 320, 0.7), L('A RAMPS', 437, 285, 0.6), L('A SEWER', 460, 418, 0.5), L('A LOBBY', 580, 380, 0.6),
    L('A TOWER', 424, 200, 0.6), L('A SCREENS', 500, 72, 0.6), L('A BACK', 575, 115, 0.5), L('B MAIN', 90, 335, 0.7), L('B LOBBY', 135, 450, 0.6),
    L('B LINK', 192, 410, 0.5), L('B TOWER', 170, 265, 0.5), L('B ALLEY', 140, 112, 0.6), L('B BACK', 37, 150, 0.6), L('B STAIRS', 240, 175, 0.5)];

  // Decoration: coloured shop signs on a few walls (purely visual).
  const props = [];
  const sign = (u, v, nx, nz, y, color, w = 1.6, hh = 0.7) => { const [x, z] = M(u, v); props.push({ type: 'sign', pos: [x, y, z], n: [nx, nz], w, h: hh, color }); };
  sign(263.5, 550, 1, 0, 3.0, 0xff4655, 1.2, 1.4); sign(349.5, 560, -1, 0, 3.0, 0x3fb8ff, 1.2, 1.4); sign(37.5, 330, 1, 0, 3.2, 0xffb547, 1.2, 1.6);
  sign(589.5, 300, -1, 0, 3.2, 0x4fd1a5, 1.2, 1.6); sign(642.5, 200, -1, 0, 3.4, 0xc86bff, 1.4, 1.8); sign(15.5, 200, 1, 0, 3.4, 0xff7ab8, 1.4, 1.8);

  // Bot positions (pixels -> metres). Defender holds (stand here, watch there); attacker staging.
  const P = (u, v) => { const [x, z] = M(u, v); const [cx, cz] = cellOf(x, z); return [x, F[cz]?.[cx] ?? 0, z]; };
  const holds = {
    A: [{ pos: P(447, 200), look: P(530, 255) }, { pos: P(615, 195), look: P(530, 255) }, { pos: P(570, 118), look: P(508, 100) }],
    B: [{ pos: P(172, 250), look: P(57, 278) }, { pos: P(35, 200), look: P(57, 278) }, { pos: P(135, 245), look: P(57, 278) }],
    mid: [{ pos: P(305, 282), look: P(300, 360) }, { pos: P(246, 282), look: P(300, 360) }],
  };
  // Where attackers wait behind their barriers during the buy phase, per lane.
  const buyStage = {
    A: { main: [P(562, 378), P(582, 380), P(572, 388)], mid: [P(400, 396), P(400, 404)] },
    B: { main: [P(118, 384), P(138, 384), P(128, 394)], mid: [P(188, 404), P(198, 418)] },
  };
  const stage = {
    A: { main: [P(545, 320), P(570, 340), P(525, 300)], mid: [P(470, 417), P(400, 395), P(430, 318)] },
    B: { main: [P(90, 340), P(125, 330), P(70, 360)], mid: [P(195, 410), P(250, 400), P(300, 350)] },
  };

  return {
    id: 'divide', name: 'Divide', holds, stage, buyStage, W, H, ox, oz, boxes, floorSkins, decor, trees, heights, spawns, walkable, labels, props,
    teamSpawns, sites, barriers, ropes, sky: 0x8ea3b6, fog: [140, 300], stairCell,
  };
}
