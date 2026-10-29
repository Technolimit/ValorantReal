// First-person reload and chambering animations. Each style moves the whole gun (returned as a pose offset
// in camera space) and the model's tagged parts (mag, bolt, slide, cyl, barrels, pump, lid, shell).
//
//   pistol    Classic / Ghost / Frenzy: tilt, mag drops from the grip, fresh mag slapped in, slide snaps home
//   mag       SMGs and rifles: tilt, mag out, fresh mag in with a seating jolt, charging handle racked
//   revolver  Sheriff: cylinder swings out, casings dumped muzzle-up, speed loader in, cylinder flicked shut
//   break     Shorty / Outlaw: barrels break open, shells slid into each chamber, action snapped closed
//   feed      Judge: rolled over, shells fed one by one into the drum, then racked
//   tube      Bucky (round by round): each shell pushed into the loading port; can fire between shells
//   boltRound Marshal (round by round): bolt up and back, round pressed in, bolt forward, can fire
//   boltMag   Operator: bolt open, mag swapped, bolt closed
//   box       Ares / Odin: feed cover opened, ammo box swapped, cover slammed, charging handle racked
//   orb       Orbital guns: the spent orb pops out of the reactor ring, the off-hand seats a fresh one
//   oathMag   Oathblade Vandal: the edge goes dark, the mag is flicked out and a fresh one snapped in, then the
//             off-hand runs along the blade and the edge relights behind it
//   oathCyl   Oathblade Sheriff: the edge goes dark, the drum is flicked out, loaded and flicked shut, then a
//             thumb along the blade relights the edge
//   cell      Apogee guns: the top hinges open to the left, the spent energy cell pops out and is flicked away, the off-hand
//             lays a fresh glowing one in its channel, and the top is slammed shut with a flash
//
// Model skins reload as their model (`design` in models.js), so these tables can key on a design id too.
// Between shots the bolt guns cycle their bolt and the Bucky works its pump (see `cycle`).

export const RELOAD_STYLE = {
  classic: 'pistol', ghost: 'pistol', frenzy: 'pistol', sheriff: 'revolver', shorty: 'break',
  stinger: 'mag', spectre: 'mag', bulldog: 'mag', guardian: 'mag', phantom: 'mag', vandal: 'mag', warden: 'mag',
  bucky: 'tube', judge: 'feed', marshal: 'boltRound', outlaw: 'rear', operator: 'boltMag', ares: 'box', odin: 'box',
  vandalOrb: 'orb', phantomOrb: 'orb', bulldogOrb: 'orb', stingerOrb: 'orb', vandalOath: 'oathMag', sheriffOath: 'oathCyl',
  classicApo: 'cell', spectreApo: 'cell', vandalApo: 'cell', guardianApo: 'cell',
};
// What happens after each shot, and how much of the shot interval it takes.
export const CYCLE_STYLE = { marshal: 'bolt', operator: 'bolt', bucky: 'pump' };

// Sound cues as [share of the reload, kind]: click = latch/mag release, thunk = mag or cover seating, shing = a
// hand along a blade, charge = an energy cell powering up as it seats.
export const RELOAD_SOUNDS = {
  pistol: [[0.2, 'click'], [0.68, 'thunk'], [0.8, 'click']],
  mag: [[0.18, 'click'], [0.66, 'thunk'], [0.79, 'click'], [0.84, 'click']],
  revolver: [[0.16, 'click'], [0.34, 'click'], [0.62, 'thunk'], [0.77, 'click']],
  break: [[0.16, 'thunk'], [0.46, 'click'], [0.68, 'click'], [0.83, 'thunk']],
  rear: [[0.14, 'click'], [0.42, 'click'], [0.66, 'click'], [0.84, 'thunk']],
  feed: [[0.28, 'click'], [0.43, 'click'], [0.58, 'click'], [0.73, 'click'], [0.82, 'click']],
  boltMag: [[0.12, 'click'], [0.32, 'click'], [0.7, 'thunk'], [0.86, 'click']],
  box: [[0.15, 'click'], [0.36, 'click'], [0.68, 'thunk'], [0.84, 'thunk'], [0.92, 'click']],
  orb: [[0.14, 'click'], [0.2, 'click'], [0.66, 'thunk'], [0.76, 'click']],
  oathMag: [[0.08, 'click'], [0.56, 'thunk'], [0.6, 'click'], [0.66, 'shing']],
  oathCyl: [[0.07, 'click'], [0.18, 'click'], [0.54, 'click'], [0.64, 'thunk'], [0.72, 'shing']],
  cell: [[0.06, 'click'], [0.18, 'click'], [0.58, 'charge'], [0.71, 'thunk'], [0.74, 'click']],
  tube: [[0, 'click']],
  boltRound: [[0, 'click']],
};

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ss = (t, a, b) => { const x = clamp01((t - a) / (b - a)); return x * x * (3 - 2 * x); };
// 0 -> 1 -> 0 over [a, b]
const pulse = (t, a, b) => (t < a || t > b ? 0 : Math.sin(((t - a) / (b - a)) * Math.PI));
// in over [a, b], held, out over [c, d]
const hold = (t, a, b, c, d) => ss(t, a, b) * (1 - ss(t, c, d));

function resetParts(parts) {
  for (const p of Object.values(parts)) {
    const b = p.userData.base;
    p.position.copy(b.pos);
    p.rotation.copy(b.rot);
    p.scale.set(1, 1, 1);
    p.visible = true;
  }
  if (parts.shell) parts.shell.visible = false;
}

// A magazine leaving downward, gone for a moment, then a fresh one rising back in.
function magSwap(P, t, outA, outB, inA, inB, drop = 0.28, tip = 0.35) {
  if (!P.mag) return;
  const out = ss(t, outA, outB), back = 1 - ss(t, inA, inB);
  const k = t < inA ? out : back;
  P.mag.position.y -= drop * k;
  P.mag.position.z += 0.04 * k;
  P.mag.rotation.x += (t < inA ? tip : -tip * 0.5) * k;
  P.mag.visible = k < 0.98;
}

// A loose round travelling from the hand (off to the lower right) into a port, then hidden.
function feedShell(P, t, a, b, to, from = [0.07, -0.1, 0.06], aim = 0) {
  const s = P.shell;
  if (!s || t < a || t > b) return;
  const k = ss(t, a, b * 0.9 + a * 0.1);
  s.visible = true;
  s.position.set(from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k, from[2] + (to[2] - from[2]) * k);
  s.rotation.set(aim + (1 - k) * 0.6, 0, (1 - k) * 0.8);
}

const STYLES = {
  pistol(t, P) {
    const tilt = hold(t, 0, 0.14, 0.82, 1);
    if (P.slide) P.slide.position.z += 0.022 * (1 - ss(t, 0.74, 0.8)) * ss(t, 0.02, 0.08);
    magSwap(P, t, 0.12, 0.3, 0.42, 0.66, 0.22, 0.25);
    const slap = pulse(t, 0.66, 0.74), snap = pulse(t, 0.78, 0.86);
    return { rz: 0.35 * tilt, rx: 0.18 * tilt + 0.08 * slap, py: -0.025 * tilt + 0.01 * slap, pz: 0.01 * snap };
  },

  mag(t, P) {
    const tilt = hold(t, 0, 0.12, 0.86, 1);
    magSwap(P, t, 0.1, 0.3, 0.42, 0.64);
    const seat = pulse(t, 0.64, 0.72);
    let rack = 0;
    if (P.bolt) { rack = ss(t, 0.74, 0.8) * (1 - ss(t, 0.82, 0.85)); P.bolt.position.z += 0.06 * rack; }
    return { rz: 0.42 * tilt, rx: 0.12 * tilt + 0.09 * seat, ry: -0.08 * tilt, py: -0.03 * tilt + 0.012 * seat, pz: 0.012 * pulse(t, 0.83, 0.9) };
  },

  revolver(t, P) {
    const tilt = hold(t, 0, 0.12, 0.84, 1);
    const open = ss(t, 0.08, 0.2) * (1 - ss(t, 0.72, 0.78));
    if (P.cyl) {
      P.cyl.position.x -= 0.05 * open;
      P.cyl.rotation.z += 0.4 * open + (t > 0.5 && t < 0.75 ? (t - 0.5) * 12 : 0);
    }
    // Muzzle up to dump the casings, then back down to load.
    const dump = hold(t, 0.2, 0.3, 0.36, 0.44);
    feedShell(P, t, 0.45, 0.66, [-0.05, 0.027, 0.03], [0.02, -0.12, 0.12]);
    const flick = pulse(t, 0.72, 0.8);
    return { rz: 0.55 * tilt - 0.25 * flick, rx: 0.15 * tilt + 0.55 * dump, py: -0.02 * tilt, px: -0.02 * tilt };
  },

  break(t, P, def) {
    const two = def.id === 'shorty' || def.id === 'outlaw';
    const tilt = hold(t, 0, 0.12, 0.86, 1);
    const open = ss(t, 0.08, 0.2) * (1 - ss(t, 0.76, 0.82));
    if (P.barrels) P.barrels.rotation.x -= 0.6 * open;
    const breech = def.id === 'shorty' ? [0, 0.0, -0.02] : [0, -0.01, -0.09];
    feedShell(P, t, 0.3, 0.48, [breech[0] - 0.0135, breech[1] + 0.03, breech[2]], undefined, -0.6);
    if (two) feedShell(P, t, 0.52, 0.7, [breech[0] + 0.0135, breech[1] + 0.03, breech[2]], undefined, -0.6);
    const snap = pulse(t, 0.8, 0.88);
    return { rz: 0.3 * tilt, rx: 0.25 * tilt + 0.1 * snap, py: -0.02 * tilt + 0.01 * snap };
  },

  // Outlaw: the action at the back of the gun, behind the scope, opens; two slugs are pushed in from the rear
  // (one per barrel), then it's snapped shut.
  rear(t, P) {
    // Outlaw: break the front down at the hinge behind the scope, push a slug into each barrel, snap it shut.
    const open = ss(t, 0.08, 0.2) * (1 - ss(t, 0.76, 0.84));
    if (P.barrels) P.barrels.rotation.x -= 0.5 * open;
    feedShell(P, t, 0.24, 0.46, [0, 0.034, 0.072], [0.08, 0.1, 0.2], -0.5);
    feedShell(P, t, 0.48, 0.7, [0, 0.008, 0.074], [0.08, 0.08, 0.2], -0.5);
    const snap = pulse(t, 0.8, 0.9);
    return { rx: 0.12 * snap, pz: 0.01 * snap };
  },

  feed(t, P) {
    const tilt = hold(t, 0, 0.12, 0.86, 1);
    // Four shells pressed into the drum's port, one after another.
    for (let i = 0; i < 4; i++) {
      const a = 0.15 + i * 0.15;
      feedShell(P, t, a, a + 0.13, [0, -0.04, -0.03], [0.06, -0.15, 0.04], 0);
    }
    if (P.mag) P.mag.rotation.x += Math.min(t, 0.75) * 6;
    let rack = 0;
    if (P.bolt) { rack = ss(t, 0.76, 0.82) * (1 - ss(t, 0.84, 0.87)); P.bolt.position.z += 0.06 * rack; }
    const push = [0, 1, 2, 3].reduce((s, i) => s + pulse(t, 0.24 + i * 0.15, 0.3 + i * 0.15), 0);
    return { rz: -0.55 * tilt, rx: 0.1 * tilt + 0.04 * push, py: -0.02 * tilt };
  },

  // Round-by-round styles get `r`, the progress through the current round, plus `env` for open/close.
  tube(t, P, def, r, env) {
    feedShell(P, r, 0.05, 0.75, [0, -0.025, -0.06], [0.07, -0.12, 0.05], 0);
    const push = pulse(r, 0.6, 0.85);
    return { rz: -0.5 * env, rx: 0.1 * env + 0.05 * push, py: -0.02 * env };
  },

  boltRound(t, P, def, r, env) {
    if (P.bolt) {
      const open = ss(r, 0.0, 0.18) * (1 - ss(r, 0.72, 0.92));
      P.bolt.rotation.z += 1.1 * open;
      P.bolt.position.z += 0.05 * ss(r, 0.12, 0.25) * (1 - ss(r, 0.7, 0.85));
    }
    feedShell(P, r, 0.25, 0.62, [0, 0.03, 0.0], [0.11, 0.14, 0.05], 0); // hand comes in from the top right
    const press = pulse(r, 0.52, 0.66);
    return { rz: 0.35 * env, rx: 0.12 * env + 0.04 * press, py: -0.02 * env };
  },

  boltMag(t, P) {
    const tilt = hold(t, 0, 0.12, 0.88, 1);
    if (P.bolt) {
      const open = ss(t, 0.06, 0.16) * (1 - ss(t, 0.78, 0.9));
      P.bolt.rotation.z += 1.1 * open;
      P.bolt.position.z += 0.06 * ss(t, 0.12, 0.2) * (1 - ss(t, 0.76, 0.84));
    }
    magSwap(P, t, 0.2, 0.36, 0.46, 0.68);
    const seat = pulse(t, 0.68, 0.75);
    return { rz: 0.4 * tilt, rx: 0.12 * tilt + 0.08 * seat, py: -0.03 * tilt + 0.01 * seat };
  },

  box(t, P) {
    const tilt = hold(t, 0, 0.12, 0.88, 1);
    const open = ss(t, 0.08, 0.2) * (1 - ss(t, 0.74, 0.8));
    if (P.lid) P.lid.rotation.x += 1.0 * open;
    magSwap(P, t, 0.22, 0.4, 0.48, 0.68, 0.32, 0.2);
    const clunk = pulse(t, 0.79, 0.88);
    let rack = 0;
    if (P.bolt) { rack = ss(t, 0.86, 0.91) * (1 - ss(t, 0.92, 0.95)); P.bolt.position.z += 0.07 * rack; }
    return { rz: -0.3 * tilt, rx: 0.16 * tilt + 0.1 * clunk, ry: 0.1 * tilt, py: -0.035 * tilt + 0.015 * clunk };
  },

  // Orbital: thumb the latch and the spent orb pops up out of the spire, spinning, and is flicked away
  // (shrinking out); the off-hand brings a fresh one down from above and presses it in until it seats.
  orb(t, P) {
    const o = P.orb;
    if (o) {
      if (t < 0.4) {
        const pop = ss(t, 0.14, 0.24), fly = ss(t, 0.24, 0.38);
        o.position.x -= 0.1 * fly;
        o.position.y += 0.06 * pop + 0.1 * fly;
        o.position.z += 0.06 * fly;
        o.rotation.y += 9 * (pop + fly);
        o.scale.setScalar(1 - 0.9 * fly);
        o.visible = fly < 0.99;
      } else {
        const k = 1 - ss(t, 0.42, 0.66);
        o.position.x -= 0.07 * k;
        o.position.y += 0.08 * k;
        o.position.z += 0.03 * k;
        o.rotation.y -= 3 * k;
        o.visible = t > 0.42;
      }
    }
    const pop = pulse(t, 0.14, 0.22), seat = pulse(t, 0.64, 0.72);
    return { rx: 0.08 * pop, py: 0.008 * pop - 0.01 * seat, rz: 0.06 * seat };
  },
  // Oathblade: the edge drains back into the guard as the reload starts; at the end the off-hand (part
  // `swipe`) runs from the guard toward the tip and the edge relights right behind it, with a flash at the tip.
  oathMag(t, P) {
    if (P.mag) {
      if (t < 0.3) { // flicked out: drops fast, kicked to the right, tumbling
        const k = ss(t, 0.08, 0.2);
        P.mag.position.y -= 0.3 * k; P.mag.position.x += 0.07 * k; P.mag.rotation.x += 1.3 * k;
        P.mag.visible = k < 0.98;
      } else { // a fresh one up from below, snapped home
        const k = 1 - ss(t, 0.3, 0.54);
        P.mag.position.y -= 0.24 * k; P.mag.position.z += 0.04 * k; P.mag.rotation.x -= 0.2 * k;
      }
    }
    oathEdge(P, t, 0.06, 0.16, 0.64, 0.8, 0.36);
    const seat = pulse(t, 0.54, 0.62), cut = pulse(t, 0.8, 0.9);
    return { rx: 0.1 * seat, py: 0.012 * seat, rz: -0.1 * cut, glow: 1 + 2.2 * pulse(t, 0.78, 0.94) };
  },

  oathCyl(t, P) {
    const open = ss(t, 0.05, 0.12) * (1 - ss(t, 0.6, 0.65));
    if (P.cyl) {
      P.cyl.position.x -= 0.05 * open;
      P.cyl.rotation.z += 0.4 * open + 9 * ss(t, 0.3, 0.6) * open;
    }
    feedShell(P, t, 0.32, 0.54, [-0.05, 0.027, 0.03], [0.02, -0.12, 0.12]);
    oathEdge(P, t, 0.05, 0.14, 0.72, 0.84, 0.19);
    const shut = pulse(t, 0.6, 0.68);
    return { rz: -0.15 * shut, rx: 0.05 * shut, glow: 1 + 2.4 * pulse(t, 0.82, 0.95) };
  },
  // Apogee: thumb the latch and the top swings up and over to the left on its hinge; the spent cell jumps up out of its channel
  // and is flicked away (shrinking out) as the gun's light dims; the off-hand lays a fresh one in from above-left,
  // it powers up as it seats, and the top is slammed shut with a flare.
  cell(t, P) {
    const open = ss(t, 0.06, 0.17) * (1 - ss(t, 0.66, 0.72));
    if (P.lid) P.lid.rotation.z += 1.9 * open;
    const c = P.cell;
    if (c) {
      if (t < 0.4) {
        const pop = ss(t, 0.18, 0.26), fly = ss(t, 0.26, 0.38);
        c.position.x -= 0.1 * fly;
        c.position.y += 0.05 * pop + 0.09 * fly;
        c.position.z += 0.05 * fly;
        c.rotation.x += 0.6 * pop + 2.5 * fly;
        c.rotation.y += 1.5 * fly;
        c.scale.setScalar(Math.max(0.001, 1 - 0.9 * fly));
        c.visible = fly < 0.99;
      } else {
        const k = 1 - ss(t, 0.42, 0.6);
        c.position.x -= 0.07 * k;
        c.position.y += 0.08 * k;
        c.position.z += 0.02 * k;
        c.rotation.y -= 1.2 * k;
        c.visible = t > 0.42;
      }
    }
    const pop = pulse(t, 0.18, 0.26), slam = pulse(t, 0.7, 0.8);
    const glow = 1 - 0.65 * ss(t, 0.2, 0.3) + 0.65 * ss(t, 0.56, 0.62) + 2.3 * pulse(t, 0.69, 0.9);
    return { rx: 0.06 * pop + 0.1 * slam, py: 0.006 * pop - 0.01 * slam, rz: 0.04 * slam, glow };
  },
};

// The Oathblade edge (part `edge`, scaled along the blade from its guard end): dark from a0..a1, relit from
// b0..b1 as the swipe hand travels `len` along the spine.
function oathEdge(P, t, a0, a1, b0, b1, len) {
  const lit = t < b0 ? 1 - ss(t, a0, a1) : ss(t, b0, b1);
  if (P.edge) { P.edge.scale.z = Math.max(0.001, lit); P.edge.visible = lit > 0.01; }
  if (P.swipe) {
    P.swipe.position.z -= len * ss(t, b0, b1);
    P.swipe.visible = t > b0 - 0.05 && t < b1 + 0.05;
  }
}

const ZERO = { px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0 };

// The big whole-gun move during each reload, matched to reference footage: how far the muzzle swings up
// (rx), turns (ry) and rolls (rz, positive = top leans left), and where the gun travels (px, py, pz). It
// eases in over the first ~15% of the reload and back out over the last ~18%; the mechanism styles above
// add their smaller jolts on top.
export const RELOAD_POSE = {
  classic: { rx: 0.75, ry: 0.2, rz: 0.5, px: -0.03, py: 0.035 },   // flips up and over to the left, mag from below
  ghost: { rx: 0.9, ry: 0.25, rz: 0.55, px: -0.035, py: 0.045 },   // swings high, muzzle up
  frenzy: { rx: 0.7, ry: 0.15, rz: 0.65, px: -0.04, py: 0.03 },    // tipped up-left, mag slapped into the grip
  sheriff: { rx: 0.65, ry: 0.4, rz: 1.15, px: -0.06, py: 0.045 },  // rolled so the cylinder faces you
  shorty: { rx: 0.3, ry: 0.05, rz: 0.12, py: 0.01 },                // mostly still; breaks open, then a flick up
  stinger: { rx: 1.15, ry: 0.15, rz: 0.3, px: -0.02, py: 0.065 },  // muzzle nearly straight up
  spectre: { rx: 0.9, ry: 0.1, rz: 0.5, px: -0.03, py: 0.05 },
  bucky: { rx: 1.0, ry: 0.0, rz: 0.45, px: -0.02, py: 0.05 },     // muzzle up, rolled so the loading port faces you
  judge: { rx: 0.3, ry: 0.35, rz: 0.95, px: -0.045, py: -0.02 },   // rolled toward you to feed the drum
  bulldog: { rx: 1.2, ry: 0.1, rz: 0.25, px: 0.015, py: 0.065 },   // stood upright on the right
  guardian: { rx: 1.2, ry: -0.05, rz: -0.15, py: 0.065 },           // upright, mag from the left hand
  phantom: { rx: 0.95, ry: 0.15, rz: 0.6, py: 0.045 },
  vandal: { rx: 1.0, ry: 0.15, rz: 0.75, py: 0.045 },
  warden: { rx: 1.0, ry: 0.1, rz: 0.45, py: 0.05 },
  marshal: { rx: 0.1, ry: 0.0, rz: -0.1, py: -0.005 },             // almost still; rounds pressed in from the top right
  operator: { rx: 0.2, ry: 0.55, rz: 0.6, px: -0.08, py: -0.03 },   // swung across to the left
  outlaw: { rx: 0.5, ry: 0.1, rz: 0.3, py: 0.02 },
  ares: { rx: 0.9, ry: 0.15, rz: 0.4, py: 0.045 },                  // tipped up, drum box from below
  odin: { rx: -0.2, ry: 0.25, rz: -0.35, px: -0.03, py: -0.05 },               // dips low, cover up, belt box swapped
};

// Every reload also drifts the gun toward the middle of the screen so the action stays in view.
const CENTER = { px: -0.05, py: 0.0 };

// Keyframe tracks traced from reference reload footage, frame by frame. Each entry is [share of the reload,
// pose]; poses are eased between keyframes. These replace RELOAD_POSE for magazine-style reloads.
const Z = {};
export const RELOAD_TRACK = {
  // Classic: flips up and rolls left so the grip faces you, mag in from below, flick right to release the slide.
  classic: [[0, Z], [0.12, { rx: 0.55, rz: 0.9, ry: 0.2, px: -0.04, py: 0.03 }], [0.45, { rx: 0.6, rz: 0.95, ry: 0.25, px: -0.05, py: 0.03 }], [0.62, { rx: 0.35, rz: 0.4, ry: 0.1, px: -0.02, py: 0.02 }], [0.76, { rx: 0.5, rz: -0.2, py: 0.02 }], [0.9, { rx: 0.1 }], [1, Z]],
  // Shorty: drops with the barrels broken down, shells in, then a sharp flick up to close.
  shorty: [[0, Z], [0.12, { rx: -0.45, rz: 0.2, py: -0.06 }], [0.62, { rx: -0.5, rz: 0.25, px: -0.02, py: -0.07 }], [0.76, { rx: 0.55, py: 0.02 }], [0.88, { rx: 0.15 }], [1, Z]],
  // Frenzy: rolls hard right to show the mag well, then tips muzzle-up while the mag is slapped in.
  frenzy: [[0, Z], [0.12, { rx: 0.5, rz: -0.8, px: -0.03, py: 0.03 }], [0.35, { rx: 0.3, rz: -1.2, ry: 0.2, px: -0.05 }], [0.6, { rx: 0.8, rz: -0.4, py: 0.04 }], [0.8, { rx: 0.7, rz: -0.2, py: 0.04 }], [1, Z]],
  // Ghost: swings up and over, mag swap with the grip toward you, then straight up to rack the slide.
  ghost: [[0, Z], [0.15, { rx: 0.9, rz: 0.5, py: 0.04 }], [0.4, { rx: 0.8, rz: 0.9, ry: 0.2, px: -0.03, py: 0.04 }], [0.65, { rx: 1.35, rz: 0.2, py: 0.06 }], [0.82, { rx: 1.3, rz: 0.1, py: 0.06 }], [1, Z]],
  // Sheriff: rolls left for the cylinder, muzzle up to dump the casings, rolls back to load, flicks shut.
  sheriff: [[0, Z], [0.12, { rx: 0.3, rz: 1.1, ry: 0.3, px: -0.05, py: 0.03 }], [0.3, { rx: 0.4, rz: 1.2, ry: 0.35, px: -0.05, py: 0.03 }], [0.42, { rx: 1.35, rz: 0.4, py: 0.06 }], [0.56, { rx: 0.6, rz: 1.0, px: -0.04, py: 0.03 }], [0.75, { rx: 1.0, rz: 0.5, py: 0.05 }], [0.86, { rx: 0.4, rz: -0.3, py: 0.02 }], [1, Z]],
  // Stinger: up and rolled to drop the mag, nearly vertical while the new one goes in and it's racked.
  stinger: [[0, Z], [0.12, { rx: 0.8, rz: 0.6, px: -0.02, py: 0.04 }], [0.25, { rx: 1.2, rz: 0.5, py: 0.06 }], [0.45, { rx: 0.7, rz: 1.0, ry: 0.2, px: -0.04, py: 0.04 }], [0.6, { rx: 1.3, rz: 0.2, py: 0.07 }], [0.8, { rx: 1.0, rz: 0.3, py: 0.05 }], [1, Z]],
  // Spectre: angled up-left for the mag swap, then vertical to work the charging handle.
  spectre: [[0, Z], [0.12, { rx: 0.7, rz: 0.55, px: -0.02, py: 0.03 }], [0.5, { rx: 0.75, rz: 0.6, px: -0.03, py: 0.03 }], [0.65, { rx: 1.25, rz: 0.2, py: 0.06 }], [0.85, { rx: 1.2, rz: 0.2, py: 0.06 }], [1, Z]],
  // Judge: rolled toward you so the drum faces you, shells fed in, then tipped up to rack.
  judge: [[0, Z], [0.12, { rx: 0.2, rz: 0.8, ry: 0.35, px: -0.04 }], [0.5, { rx: 0.5, rz: 0.7, ry: 0.3, px: -0.04, py: 0.01 }], [0.68, { rx: 1.0, rz: 0.3, py: 0.05 }], [0.82, { rx: 0.3, rz: 0.2, py: -0.02 }], [1, Z]],
  // Bulldog: rolled hard left, then stood upright on the right edge of the screen for the whole swap.
  bulldog: [[0, Z], [0.12, { rx: 0.7, rz: 1.2, px: 0.01, py: 0.03 }], [0.3, { rx: 1.35, rz: 0.6, px: 0.02, py: 0.07 }], [0.7, { rx: 1.4, rz: 0.5, px: 0.02, py: 0.07 }], [0.85, { rx: 1.5, rz: 0.3, py: 0.07 }], [1, Z]],
  // Guardian: straight up, mag from the left hand, held vertical until it's racked.
  guardian: [[0, Z], [0.12, { rx: 1.1, rz: -0.1, py: 0.06 }], [0.3, { rx: 1.4, rz: -0.2, py: 0.07 }], [0.75, { rx: 1.4, rz: -0.15, py: 0.07 }], [0.88, { rx: 1.2, rz: 0.2, py: 0.05 }], [1, Z]],
  // Phantom: snaps vertical and rolled, mag in from below, then the left hand racks it over the top.
  phantom: [[0, Z], [0.1, { rx: 1.35, rz: 0.5, py: 0.07 }], [0.5, { rx: 1.35, rz: 0.5, py: 0.07 }], [0.68, { rx: 1.2, rz: -0.15, py: 0.06 }], [0.85, { rx: 1.0, rz: -0.1, py: 0.05 }], [1, Z]],
  // Vandal: rolled left and tipped for the mag swap, then vertical for the rack.
  vandal: [[0, Z], [0.12, { rx: 0.8, rz: 0.8, ry: 0.15, py: 0.04 }], [0.45, { rx: 0.8, rz: 0.85, ry: 0.2, px: -0.02, py: 0.04 }], [0.62, { rx: 1.3, rz: 0.3, py: 0.07 }], [0.85, { rx: 1.3, rz: 0.25, py: 0.07 }], [1, Z]],
  // Orbital Vandal: tipped up and rolled so the top of the gun, and the reactor ring on it, faces you through
  // the swap; a little nod as the old orb pops and as the new one seats.
  vandalOrb: [[0, Z], [0.12, { rx: 0.3, ry: 0.2, rz: 0.75, px: -0.03, py: 0.03 }], [0.4, { rx: 0.35, ry: 0.25, rz: 0.8, px: -0.04, py: 0.035 }], [0.7, { rx: 0.3, ry: 0.25, rz: 0.8, px: -0.04, py: 0.03 }], [0.84, { rx: 0.35, ry: 0.1, rz: 0.2, py: 0.02 }], [1, Z]],
  // Orbital Phantom: rolled further and turned toward you so you look down into the spire, the suppressor
  // swinging out left; a dip as the fresh orb seats.
  phantomOrb: [[0, Z], [0.12, { rx: 0.4, ry: 0.3, rz: 0.7, px: -0.04, py: 0.035 }], [0.4, { rx: 0.45, ry: 0.32, rz: 0.75, px: -0.045, py: 0.04 }], [0.7, { rx: 0.4, ry: 0.3, rz: 0.75, px: -0.045, py: 0.032 }], [0.84, { rx: 0.3, ry: 0.1, rz: 0.15, py: 0.02 }], [1, Z]],
  // Orbital Bulldog: heaved up and rolled hard so the big spire faces you, held steady, then dropped back level.
  bulldogOrb: [[0, Z], [0.12, { rx: 0.5, ry: 0.1, rz: 0.9, px: -0.02, py: 0.045 }], [0.4, { rx: 0.55, ry: 0.12, rz: 0.95, px: -0.025, py: 0.05 }], [0.7, { rx: 0.5, ry: 0.12, rz: 0.92, px: -0.025, py: 0.045 }], [0.85, { rx: 0.4, rz: 0.25, py: 0.04 }], [1, Z]],
  // Orbital Stinger: a quick wrist roll to show the top, a snappier swap, and a flick back.
  stingerOrb: [[0, Z], [0.1, { rx: 0.35, ry: 0.15, rz: 0.9, px: -0.03, py: 0.03 }], [0.4, { rx: 0.38, ry: 0.18, rz: 0.95, px: -0.035, py: 0.035 }], [0.7, { rx: 0.35, ry: 0.15, rz: 0.92, px: -0.035, py: 0.03 }], [0.82, { rx: 0.2, rz: -0.15, py: 0.02 }], [1, Z]],
  // Oathblade Vandal: the edge turned out to the right as the mag is flicked away, rolled back to take the fresh
  // one, then swung side-on so you watch the hand relight the blade; a crisp snap back to the hip.
  vandalOath: [[0, Z], [0.08, { rx: 0.35, rz: -0.55, ry: -0.1, py: 0.02 }], [0.2, { rx: 0.4, rz: -0.6, py: 0.025 }], [0.3, { rx: 0.55, rz: 0.5, ry: 0.15, px: -0.02, py: 0.03 }], [0.54, { rx: 0.6, rz: 0.55, ry: 0.18, px: -0.02, py: 0.035 }], [0.6, { rx: 0.5, rz: 0.5, ry: 0.15, py: 0.025 }], [0.67, { rx: 0.12, ry: 0.6, rz: 0.12, px: -0.05, py: 0.03, pz: -0.02 }], [0.8, { rx: 0.1, ry: 0.62, rz: 0.1, px: -0.05, py: 0.03, pz: -0.02 }], [0.88, { rx: -0.05, rz: -0.12 }], [1, Z]],
  // Oathblade Sheriff: a wrist flick swings the drum out, muzzle up to dump, back to load, flicked shut, then
  // turned side-on for the thumb along the blade, and snapped back.
  sheriffOath: [[0, Z], [0.07, { rx: 0.25, rz: 1.0, ry: 0.3, px: -0.05, py: 0.03 }], [0.16, { rx: 1.3, rz: 0.4, py: 0.06 }], [0.25, { rx: 1.3, rz: 0.4, py: 0.06 }], [0.33, { rx: 0.35, rz: 1.05, ry: 0.3, px: -0.05, py: 0.03 }], [0.58, { rx: 0.4, rz: 1.1, ry: 0.32, px: -0.05, py: 0.03 }], [0.65, { rx: 0.2, rz: -0.35, py: 0.02 }], [0.72, { rx: 0.12, ry: 0.6, rz: 0.1, px: -0.04, py: 0.03 }], [0.86, { rx: 0.1, ry: 0.62, rz: 0.1, px: -0.04, py: 0.03 }], [0.93, { rx: -0.04, rz: -0.06 }], [1, Z]],
  // Apogee: tipped up and rolled so the top of the gun, and the hinged cover on it, faces you through the swap;
  // a little dip as the fresh cell seats and a nod as the cover is slammed shut.
  vandalApo: [[0, Z], [0.12, { rx: 0.32, ry: 0.2, rz: 0.8, px: -0.03, py: 0.03 }], [0.42, { rx: 0.36, ry: 0.24, rz: 0.85, px: -0.04, py: 0.035 }], [0.62, { rx: 0.34, ry: 0.24, rz: 0.84, px: -0.04, py: 0.028 }], [0.74, { rx: 0.42, ry: 0.12, rz: 0.4, py: 0.02 }], [0.86, { rx: 0.12, rz: 0.08 }], [1, Z]],
  guardianApo: [[0, Z], [0.12, { rx: 0.3, ry: 0.25, rz: 0.85, px: -0.04, py: 0.03 }], [0.42, { rx: 0.34, ry: 0.28, rz: 0.9, px: -0.05, py: 0.035 }], [0.62, { rx: 0.32, ry: 0.28, rz: 0.88, px: -0.05, py: 0.028 }], [0.74, { rx: 0.4, ry: 0.12, rz: 0.35, py: 0.02 }], [0.86, { rx: 0.1, rz: 0.06 }], [1, Z]],
  spectreApo: [[0, Z], [0.1, { rx: 0.35, ry: 0.18, rz: 0.9, px: -0.03, py: 0.03 }], [0.42, { rx: 0.38, ry: 0.2, rz: 0.95, px: -0.035, py: 0.035 }], [0.62, { rx: 0.36, ry: 0.2, rz: 0.93, px: -0.035, py: 0.028 }], [0.73, { rx: 0.45, ry: 0.08, rz: 0.3, py: 0.025 }], [0.85, { rx: 0.1, rz: -0.08 }], [1, Z]],
  classicApo: [[0, Z], [0.1, { rx: 0.4, ry: 0.2, rz: 0.95, px: -0.04, py: 0.03 }], [0.42, { rx: 0.44, ry: 0.24, rz: 1.0, px: -0.045, py: 0.035 }], [0.62, { rx: 0.42, ry: 0.24, rz: 0.98, px: -0.045, py: 0.03 }], [0.73, { rx: 0.5, ry: 0.1, rz: 0.3, py: 0.025 }], [0.86, { rx: 0.12 }], [1, Z]],
  warden: [[0, Z], [0.12, { rx: 0.9, rz: 0.6, py: 0.05 }], [0.6, { rx: 0.9, rz: 0.6, py: 0.05 }], [0.75, { rx: 1.2, rz: 0.2, py: 0.06 }], [1, Z]],
  // Operator: bolt up, tipped muzzle-up to pull the mag, dropped low-left to seat the new one, bolt home.
  operator: [[0, Z], [0.12, { rx: 0.05, rz: 0.1 }], [0.3, { rx: 0.9, rz: -0.6, ry: -0.1, py: 0.04 }], [0.5, { rx: 0.4, rz: 0.9, ry: 0.5, px: -0.12, py: -0.08 }], [0.7, { rx: 0.3, rz: 0.6, ry: 0.4, px: -0.08, py: -0.05 }], [0.85, { rx: 0.05, rz: 0.1 }], [1, Z]],
  // Outlaw: tipped muzzle-up and rolled so the back of the receiver, behind the scope, faces you while slugs go in.
  outlaw: [[0, Z], [0.15, { rx: 0.1, rz: 0.05, ry: 1.15, px: -0.16, py: 0.1, pz: -0.2 }], [0.75, { rx: 0.12, rz: 0.08, ry: 1.2, px: -0.17, py: 0.1, pz: -0.21 }], [0.88, { rx: 0.25, rz: 0.05, py: 0.02 }], [1, Z]],
  // Ares: tipped up and rolled right to swap the drum box, then flattened to rack.
  ares: [[0, Z], [0.15, { rx: 0.8, rz: -0.6, ry: -0.1, py: 0.04 }], [0.55, { rx: 0.8, rz: -0.65, py: 0.04 }], [0.72, { rx: 0.1, rz: 0.1, py: -0.02 }], [0.88, { rx: 0.15 }], [1, Z]],
  // Odin: turned across to the right and dropped low with the feed cover up while the belt box is swapped.
  odin: [[0, Z], [0.15, { rx: -0.05, ry: -0.35, rz: -0.25, px: 0.0, py: -0.05 }], [0.8, { rx: -0.05, ry: -0.35, rz: -0.25, px: 0.0, py: -0.055 }], [0.9, { rx: 0.1, py: -0.01 }], [1, Z]],
};

function evalTrack(track, t) {
  let i = 0;
  while (i < track.length - 2 && t > track[i + 1][0]) i++;
  const [ta, a] = track[i], [tb, b] = track[i + 1];
  const k = ss(t, ta, tb);
  const out = {};
  for (const key of ['rx', 'ry', 'rz', 'px', 'py', 'pz']) out[key] = (a[key] || 0) + ((b[key] || 0) - (a[key] || 0)) * k;
  // As a gun tips toward vertical it also rolls about its barrel, so you see its side panel (as in the footage)
  // rather than its top edge.
  out.rz -= 1.05 * ss(out.rx, 0.6, 1.3);
  // During the reload the gun is brought in closer and toward the middle of the screen.
  const lift = Math.min(1, Math.abs(out.rx) + Math.abs(out.rz) * 0.6 + Math.abs(out.ry));
  out.px -= 0.04 * lift;
  out.pz += 0.06 * lift;
  return out;
}

function envelope(t) { return ss(t, 0, 0.15) * (1 - ss(t, 0.82, 1)); }

function addPose(a, b, k) {
  return {
    glow: a.glow ?? b.glow, // a style's glow multiplier (Oathblade's edge flash) rides along unscaled
    px: (a.px || 0) + (b.px || 0) * k, py: (a.py || 0) + (b.py || 0) * k, pz: (a.pz || 0) + (b.pz || 0) * k,
    rx: (a.rx || 0) + (b.rx || 0) * k, ry: (a.ry || 0) + (b.ry || 0) * k, rz: (a.rz || 0) + (b.rz || 0) * k,
  };
}
const half = (p) => addPose(ZERO, p, 0.45);

// The off-hand rides on the mag / round being loaded; only shown while a reload is under way. `on` may be a
// function of the part a hand rides on, to show each hand on its own.
function showHands(model, on) {
  for (const h of model.userData.hands || []) h.visible = typeof on === 'function' ? on(h.userData.part) : on;
}
// When each hand shows during a reload (share of the reload), by style; the default is the whole reload.
const HANDS = {
  orb: (t) => () => t > 0.42 && t < 0.7, // the orb's hand only carries the new orb
  oathMag: (t) => (part) => (part === 'swipe' ? t > 0.6 && t < 0.86 : t > 0.26 && t < 0.6),
  oathCyl: (t) => (part) => (part === 'swipe' ? t > 0.68 && t < 0.9 : t > 0.3 && t < 0.56),
  cell: (t) => () => t > 0.42 && t < 0.64, // the cell's hand only carries the fresh cell
};

// Pose for this frame. `now` is game time. `cycle` = { start, dur } for the post-shot bolt/pump.
export function reloadPose(model, def, gun, now, cycle) {
  const P = model.userData.parts || {};
  resetParts(P);
  const id = model.userData.design || def.id;
  const style = RELOAD_STYLE[id] || RELOAD_STYLE[def.id];
  let pose = ZERO;
  const big = RELOAD_POSE[id] || RELOAD_POSE[def.id] || ZERO;
  showHands(model, false);
  if (style && STYLES[style]) {
    if (def.perRound) {
      // Opens on the way in, closes after the last round (or when you fire).
      const env = gun.reloading
        ? ss(now - gun.reloadStart, 0, def.perRound.first)
        : 1 - ss(now - gun.reloadStopped, 0, 0.22);
      if (env > 0) {
        const r = gun.reloading && now >= gun.roundStart ? clamp01((now - gun.roundStart) / def.perRound.each) : 0;
        pose = addPose(addPose(half(STYLES[style](0, P, def, gun.reloading ? r : 0, env)), big, env), CENTER, env);
        showHands(model, gun.reloading);
      }
    } else if (gun.reloading) {
      const t = clamp01(1 - (gun.reloadEnd - now) / gun.reloadDur);
      const track = RELOAD_TRACK[id] || RELOAD_TRACK[def.id];
      pose = track
        ? addPose(addPose(ZERO, STYLES[style](t, P, def), 0.25), evalTrack(track, t), 1) // the traced motion, plus a little of the mechanism's jolt
        : addPose(addPose(half(STYLES[style](t, P, def)), big, envelope(t)), CENTER, envelope(t));
      showHands(model, HANDS[style] ? HANDS[style](t) : t > 0.04 && t < 0.92);
    } else if (now - gun.reloadStopped < 0.25) {
      // A cancelled reload (you fired) eases back to the hip instead of snapping.
      const k = 1 - ss(now - gun.reloadStopped, 0, 0.25);
      pose = addPose(ZERO, big, k * 0.6);
    }
  }
  // Bolt / pump cycling between shots.
  const cs = CYCLE_STYLE[def.id];
  if (cs && cycle && !gun.reloading) {
    const c = clamp01((now - cycle.start) / cycle.dur);
    if (c < 1) {
      const out = { ...pose };
      if (cs === 'bolt' && P.bolt) {
        const open = ss(c, 0.1, 0.3) * (1 - ss(c, 0.65, 0.85));
        P.bolt.rotation.z += 1.1 * open;
        P.bolt.position.z += 0.05 * ss(c, 0.25, 0.42) * (1 - ss(c, 0.5, 0.68));
        out.rz += 0.12 * pulse(c, 0.1, 0.9);
        out.py -= 0.01 * pulse(c, 0.1, 0.9);
      } else if (cs === 'pump' && P.pump) {
        P.pump.position.z += 0.055 * ss(c, 0.15, 0.35) * (1 - ss(c, 0.45, 0.65));
        out.rx += 0.04 * pulse(c, 0.15, 0.65);
      }
      pose = out;
    }
  }
  return pose;
}
