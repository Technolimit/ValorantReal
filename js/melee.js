// Melee types: cosmetic models for the knife slot (they all hit like the knife), each with its own set of
// inspect moves, merged into one smooth inspect (chainInspects, at the end). Press inspect (Y) to play it, and
// press it again to start it over.
//
// An inspect is a set of keyframe tracks, sampled with sample():
//   track  the whole viewmodel: [t, px, py, pz, rx, ry, rz], offsets added to the resting pose (camera space)
//   parts  named model parts (see DESIGNS in models.js): [t, px, py, pz, rx, ry, rz, scaleZ]; every melee model
//          is wrapped in a part `w` that pivots on `pivot`, so the weapon can spin while the hand stays put
//   glow   [t, k]: multiplies the skin's glow (1 = as painted)
// Segments ease in and out; a frame made with L() is reached at constant speed instead (spins), and a
// frame made with S() snaps out fast and settles (flicks and catches).

const TAU = Math.PI * 2;
const L = (...f) => Object.assign(f, { ease: 'lin' });
const S = (...f) => Object.assign(f, { ease: 'snap' });
const Z = [0, 0, 0, 0, 0, 0];

// The gun inspect, also the Tactical Knife's first: turn to one side, flip to the other, settle.
export const GUN_INSPECT = {
  name: 'Inspect', dur: 3.3,
  track: [
    [0, ...Z],
    [0.45, -0.1, 0.05, -0.05, 0.1, 1.2, -0.25],
    [1.5, -0.1, 0.06, -0.05, 0.16, 1.32, -0.3],
    [2.0, -0.05, 0.09, -0.12, 0.08, 0.35, 0.8],
    [2.8, -0.05, 0.08, -0.12, 0.1, 0.3, 0.75],
    [3.3, ...Z],
  ],
};

// The Orbital orb's path round a gun, as keyframes from t0 to t1: from `lift` above its seat, once round an
// ellipse in the side (y-z) plane centred `drop` below the seat and `rz` long, over the muzzle side first and
// back under the stock, spinning as it goes.
function orbit(t0, t1, lift, rz, drop, n = 16) {
  const ry = lift + drop, out = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    out.push(L(t0 + (t1 - t0) * (i / n), 0, -drop + ry * Math.cos(a), -Math.sin(a) * rz, 0, TAU * (1 + (3 * i) / n), 0, 1));
  }
  return out;
}

// Inspects that come with a gun model (model skins, see `models` in skins.js), by design id.
export const MODEL_INSPECTS = {
  // Orbital Vandal: the orb floats straight up out of the reactor spire and hovers, turning, while the gun is brought
  // round side-on and level in front of you so you see all of it; then the orb settles back in.
  vandalOrb: [{
    name: 'Orbit', dur: 4.2,
    track: [
      [0, ...Z],
      [0.6, -0.05, 0.03, -0.02, 0.06, 0.4, 0.2],
      [1.4, -0.08, 0.06, -0.3, 0.02, 1.5, 0.45],
      [3.0, -0.08, 0.065, -0.3, 0.04, 1.53, 0.45],
      [3.6, -0.06, 0.03, -0.03, 0.05, 0.4, 0.15],
      [4.2, ...Z],
    ],
    parts: {
      orb: [
        [0, ...Z, 1],
        [0.25, ...Z, 1],
        L(1.0, -0.01, 0.05, 0, 0, TAU * 0.5, 0, 1),
        L(1.6, -0.01, 0.065, 0, 0.3, TAU * 1.0, 0, 1),
        L(2.2, -0.01, 0.055, 0, -0.2, TAU * 1.5, 0, 1),
        L(2.8, -0.01, 0.067, 0, 0.2, TAU * 2.0, 0, 1),
        L(3.3, -0.01, 0.05, 0, 0, TAU * 2.4, 0, 1),
        S(3.75, 0, 0, 0, 0, TAU * 2.5, 0, 1),
        [4.2, 0, 0, 0, 0, TAU * 2.5, 0, 1],
      ],
    },
    glow: [[0, 1], [1.0, 1.9], [2.8, 2.1], S(3.8, 2.8), [4.2, 1]],
  }],

  // Orbital Stinger: a quick roll to show the top while the orb hops out and spins, then a flick side-on as
  // it drops back in with a flare.
  stingerOrb: [{
    name: 'Flicker', dur: 3.4,
    track: [
      [0, ...Z],
      [0.4, -0.04, 0.04, -0.05, 0.25, 0.3, 0.9],
      [1.6, -0.05, 0.05, -0.06, 0.3, 0.35, 0.95],
      S(2.05, -0.08, 0.05, -0.2, 0.05, 1.45, 0.3),
      [2.8, -0.08, 0.055, -0.2, 0.06, 1.5, 0.32],
      [3.4, ...Z],
    ],
    parts: {
      orb: [
        [0, ...Z, 1],
        [0.3, ...Z, 1],
        S(0.55, 0, 0.045, 0, 0, TAU * 0.5, 0, 1),
        L(1.0, 0, 0.038, 0, 0.4, TAU * 1.5, 0, 1),
        L(1.5, 0, 0.05, 0, -0.4, TAU * 2.5, 0, 1),
        S(1.9, 0, 0, 0, 0, TAU * 3, 0, 1),
        [3.4, 0, 0, 0, 0, TAU * 3, 0, 1],
      ],
    },
    glow: [[0, 1], [0.55, 2.2], [1.5, 1.6], S(1.95, 2.8), [2.8, 1.3], [3.4, 1]],
  }],

  // Orbital Phantom: brought round side-on and level, and the orb leaves the spire to circle the whole gun,
  // over the top and under the mag, before it drops back in.
  phantomOrb: [{
    name: 'Orbit', dur: 4.6,
    track: [
      [0, ...Z],
      [0.6, -0.05, 0.03, -0.02, 0.06, 0.4, 0.2],
      [1.3, -0.08, 0.06, -0.3, 0.02, 1.5, 0.4],
      [3.5, -0.08, 0.065, -0.3, 0.04, 1.53, 0.42],
      [4.0, -0.06, 0.03, -0.03, 0.05, 0.4, 0.15],
      [4.6, ...Z],
    ],
    parts: {
      orb: [
        [0, ...Z, 1],
        [0.4, ...Z, 1],
        [1.0, 0, 0.04, 0, 0, TAU * 0.5, 0, 1],
        ...orbit(1.2, 3.4, 0.04, 0.17, 0.072),
        S(3.85, 0, 0, 0, 0, TAU * 4, 0, 1),
        [4.6, 0, 0, 0, 0, TAU * 4, 0, 1],
      ],
    },
    glow: [[0, 1], [1.0, 1.8], [2.3, 2.2], [3.4, 1.8], S(3.9, 2.8), [4.6, 1]],
  }],

  // Orbital Bulldog: heaved up so you look down into the spire; the orb kicks three times like a burst, each
  // with a flare, then spins up high and slams back home.
  bulldogOrb: [{
    name: 'Burst', dur: 3.9,
    track: [
      [0, ...Z],
      [0.5, -0.04, 0.05, -0.08, 0.55, 0.25, 0.6],
      [2.6, -0.045, 0.055, -0.08, 0.58, 0.28, 0.62],
      [3.15, -0.06, 0.03, -0.12, 0.1, 1.0, 0.2],
      [3.9, ...Z],
    ],
    parts: {
      orb: [
        [0, ...Z, 1],
        [0.6, ...Z, 1],
        ...[0.7, 1.0, 1.3].flatMap((t, i) => [S(t, 0, 0.028, 0, 0, TAU * (i + 0.5) / 3, 0, 1), [t + 0.15, 0, 0, 0, 0, TAU * (i + 1) / 3, 0, 1]]),
        L(2.0, 0, 0.085, 0, 0.3, TAU * 2.5, 0, 1),
        L(2.4, 0, 0.09, 0, -0.3, TAU * 4, 0, 1),
        S(2.6, 0, 0, 0, 0, TAU * 4.5, 0, 1),
        [3.9, 0, 0, 0, 0, TAU * 4.5, 0, 1],
      ],
    },
    glow: [[0, 1], S(0.72, 2.4), [0.85, 1.4], S(1.02, 2.6), [1.15, 1.5], S(1.32, 2.8), [1.6, 1.6], [2.4, 2.0], S(2.65, 3.0), [3.9, 1]],
  }],

  // Starspur Sheriff: twirled twice round the trigger finger and caught, then shown side-on, the spur rowel
  // still spinning; or rolled over so the drum swings out, spun up until the chambers blaze, and flicked shut.
  sheriffSpur: [
    {
      name: 'Gunslinger', dur: 3.4,
      track: [[0, ...Z], [0.3, -0.02, 0.03, 0, 0.12, 0, 0], [1.4, -0.02, 0.03, 0, 0.12, 0, 0], S(1.55, -0.02, 0.01, 0, 0, 0, 0), [2.0, -0.09, 0.06, -0.05, 0.12, 1.15, -0.3], [2.8, -0.09, 0.065, -0.05, 0.14, 1.2, -0.32], [3.4, ...Z]],
      parts: {
        w: [[0, ...Z, 1], [0.3, ...Z, 1], ...spin(0.3, 1.0, 0, -1), ...spin(1.0, 1.45, 0, -1, Z, -TAU), S(1.6, 0, 0, 0, -2 * TAU + 0.15, 0, 0, 1), [1.9, 0, 0, 0, -2 * TAU, 0, 0, 1], [3.4, 0, 0, 0, -2 * TAU, 0, 0, 1]],
        spur: [[0, ...Z, 1], [0.3, ...Z, 1], ...spin(0.3, 1.5, 0, 3), [2.4, 0, 0, 0, 3 * TAU + TAU / 3, 0, 0, 1], [3.4, 0, 0, 0, 3 * TAU + TAU / 3, 0, 0, 1]],
      },
      glow: [[0, 1], [1.4, 1.6], S(1.6, 3.2), [2.4, 1.2], [3.4, 1]],
    },
    {
      name: 'Cylinder roll', dur: 3.3,
      track: [[0, ...Z], [0.4, -0.05, 0.04, -0.02, 0.3, 0.35, 1.0], [2.2, -0.05, 0.045, -0.02, 0.32, 0.38, 1.05], S(2.4, -0.03, 0.03, -0.02, 0.2, 0.2, 0.6), [3.3, ...Z]],
      parts: {
        cyl: [[0, ...Z, 1], [0.35, ...Z, 1], [0.6, -0.05, 0, 0, 0, 0, 0.4, 1], ...spin(0.6, 1.8, 2, 3, [-0.05, 0, 0, 0, 0, 0.4]), [2.15, -0.05, 0, 0, 0, 0, 0.4 + 3 * TAU + TAU / 6, 1], S(2.35, 0, 0, 0, 0, 0, 3 * TAU + TAU / 6, 1), [3.3, 0, 0, 0, 0, 0, 3 * TAU + TAU / 6, 1]],
      },
      glow: [[0, 1], [0.6, 1.2], [1.8, 3.2], S(2.4, 3.6), [3.0, 1.2], [3.3, 1]],
    },
  ],

  // Starspur Marshal: a long look down the gun, side-on, panning from the stock to the muzzle; or the bolt
  // worked with a flourish, its rowel knob spinning.
  marshalSpur: [
    {
      name: 'Long look', dur: 3.6,
      track: [[0, ...Z], [0.7, -0.12, 0.05, -0.28, 0.04, 1.45, 0.08], L(2.4, -0.02, 0.055, -0.3, 0.05, 1.52, 0.08), [2.9, -0.05, 0.03, -0.1, 0.1, 0.6, 0.05], [3.6, ...Z]],
      parts: { rowel: [[0, ...Z, 1], [0.7, ...Z, 1], ...spin(0.7, 2.4, 0, 1), [3.6, 0, 0, 0, TAU, 0, 0, 1]] },
      glow: [[0, 1], [0.7, 1.2], [1.6, 2.4], [2.4, 1.4], [3.6, 1]],
    },
    {
      name: 'Spur cock', dur: 2.8,
      track: [[0, ...Z], [0.35, -0.03, 0.01, 0.02, 0.15, 0.05, -0.5], [1.5, -0.03, 0.012, 0.02, 0.16, 0.05, -0.52], S(1.65, -0.02, 0, 0, 0.05, 0, 0.1), [2.2, -0.01, 0, 0, 0.02, 0, 0], [2.8, ...Z]],
      parts: {
        bolt: [[0, ...Z, 1], [0.4, ...Z, 1], [0.6, 0, 0, 0, 0, 0, 1.1, 1], [0.8, 0, 0, 0.05, 0, 0, 1.1, 1], [1.1, 0, 0, 0.05, 0, 0, 1.1, 1], [1.3, 0, 0, 0, 0, 0, 1.1, 1], S(1.45, ...Z, 1), [2.8, ...Z, 1]],
        rowel: [[0, ...Z, 1], [0.8, ...Z, 1], ...spin(0.8, 1.6, 0, 2), [2.2, 0, 0, 0, 2 * TAU + TAU / 3, 0, 0, 1], [2.8, 0, 0, 0, 2 * TAU + TAU / 3, 0, 0, 1]],
      },
      glow: [[0, 1], [0.8, 1.5], [1.45, 1.2], S(1.6, 3), [2.4, 1], [2.8, 1]],
    },
  ],

  // Starspur Judge: turned side-on so the drum faces you and spun against the spur; or swung barrels-up for a
  // beat, the way you'd carry a coach gun.
  judgeSpur: [
    {
      name: 'Drum roll', dur: 3.2,
      track: [[0, ...Z], [0.5, -0.1, 0.06, -0.12, 0.12, 1.2, 0.25], [2.3, -0.1, 0.065, -0.12, 0.14, 1.25, 0.28], [3.2, ...Z]],
      parts: {
        mag: [[0, ...Z, 1], [0.5, ...Z, 1], ...spin(0.5, 1.7, 0, 2), [2.3, 0, 0, 0, 2 * TAU + TAU / 5, 0, 0, 1], [3.2, 0, 0, 0, 2 * TAU + TAU / 5, 0, 0, 1]],
        spur: [[0, ...Z, 1], [0.5, ...Z, 1], ...spin(0.5, 1.7, 0, -2), [2.3, 0, 0, 0, -2 * TAU - TAU / 6, 0, 0, 1], [3.2, 0, 0, 0, -2 * TAU - TAU / 6, 0, 0, 1]],
      },
      glow: [[0, 1], [0.5, 1.3], [1.7, 3], [2.3, 1.5], [3.2, 1]],
    },
    {
      name: 'Barrels up', dur: 3.2,
      track: [[0, ...Z], [0.6, -0.06, 0.02, -0.12, 0.85, 0.45, 0.55], [1.0, -0.06, 0.014, -0.12, 0.82, 0.45, 0.55], [1.3, -0.06, 0.022, -0.12, 0.87, 0.45, 0.55], [2.3, -0.06, 0.02, -0.12, 0.85, 0.45, 0.55], [3.2, ...Z]],
      glow: [[0, 1], [1.0, 1.8], [2.3, 1.4], [3.2, 1]],
    },
  ],
  // Oathblade Vandal: brought round side-on, the edge goes dark and relights slowly from the guard to the tip
  // until it flares; or two crisp wrist cuts, one each way, as if clearing the blade.
  vandalOath: [
    {
      name: 'Edge light', dur: 3.6,
      track: [[0, ...Z], [0.6, -0.06, 0.03, -0.05, 0.06, 0.5, 0.15], [1.3, -0.08, 0.06, -0.28, 0.02, 1.5, 0.1], [2.8, -0.08, 0.062, -0.28, 0.04, 1.52, 0.1], [3.6, ...Z]],
      parts: { edge: [[0, ...Z, 1], [1.2, ...Z, 1], S(1.35, ...Z, 0.001), [1.6, ...Z, 0.001], L(2.6, ...Z, 1), [3.6, ...Z, 1]] },
      glow: [[0, 1], [1.3, 1.2], [1.4, 0.5], [2.5, 2.4], S(2.7, 3.6), [3.2, 1.2], [3.6, 1]],
    },
    {
      name: 'Two cuts', dur: 2.6,
      track: [[0, ...Z], [0.3, -0.02, 0.02, 0, 0.25, 0.1, 0.15], S(0.55, 0.03, -0.02, -0.04, -0.1, -0.25, -0.7), [0.8, 0.03, -0.02, -0.04, -0.1, -0.25, -0.72], [1.0, -0.02, 0.03, 0, 0.2, 0.2, 0.35], S(1.25, -0.05, -0.01, -0.04, -0.05, 0.4, 0.8), [1.6, -0.05, -0.008, -0.04, -0.05, 0.4, 0.8], [2.6, ...Z]],
      parts: { edge: [[0, ...Z, 1], [2.6, ...Z, 1]] },
      glow: [[0, 1], S(0.57, 2.6), [0.9, 1.1], S(1.27, 2.8), [1.8, 1.1], [2.6, 1]],
    },
  ],

  // Oathblade Sheriff: rolled twice about the barrel and caught dead level, then shown side-on; or raised
  // side-on while the edge goes dark and relights along the blade.
  sheriffOath: [
    {
      name: 'Barrel roll', dur: 3.0,
      track: [[0, ...Z], [0.3, -0.02, 0.03, 0, 0.1, 0, 0], [1.4, -0.02, 0.03, 0, 0.1, 0, 0], [2.0, -0.09, 0.06, -0.05, 0.12, 1.15, -0.3], [2.6, -0.09, 0.065, -0.05, 0.14, 1.2, -0.32], [3.0, ...Z]],
      parts: { w: [[0, ...Z, 1], [0.3, ...Z, 1], ...spin(0.3, 1.25, 2, 2), [3.0, 0, 0, 0, 0, 0, 2 * TAU, 1]] },
      glow: [[0, 1], [1.2, 1.4], S(1.35, 3.2), [2.0, 1.2], [3.0, 1]],
    },
    {
      name: 'Edge light', dur: 3.2,
      track: [[0, ...Z], [0.5, -0.1, 0.06, -0.12, 0.1, 1.25, -0.1], [2.5, -0.1, 0.065, -0.12, 0.12, 1.3, -0.12], [3.2, ...Z]],
      parts: { edge: [[0, ...Z, 1], [0.6, ...Z, 1], S(0.75, ...Z, 0.001), [1.0, ...Z, 0.001], L(2.0, ...Z, 1), [3.2, ...Z, 1]] },
      glow: [[0, 1], [0.7, 0.5], [1.9, 2.4], S(2.1, 3.4), [2.7, 1.1], [3.2, 1]],
    },
  ],
};

// Pullout (equip) animations that come with a gun model, by design id: keyframes as in an inspect, played
// across the weapon's equip time (`dur` is stretched to fit it). They replace the plain raise-from-below.
export const EQUIP_ANIMS = {
  // Starspur Sheriff: comes up spinning twice round the trigger finger and is caught level, chambers flashing.
  sheriffSpur: {
    dur: 1.0,
    track: [[0, 0.02, -0.16, 0.04, -0.45, 0, 0.1], [0.45, 0, -0.02, 0, 0.12, 0, 0], S(0.82, 0, 0.005, 0, -0.04, 0, 0), [1.0, ...Z]],
    parts: {
      w: [[0, ...Z, 1], ...spin(0.04, 0.4, 0, -1), ...spin(0.4, 0.72, 0, -1, Z, -TAU), S(0.8, 0, 0, 0, -2 * TAU + 0.12, 0, 0, 1), [1.0, 0, 0, 0, -2 * TAU, 0, 0, 1]],
      spur: [[0, ...Z, 1], ...spin(0.1, 0.8, 0, 2), [1.0, 0, 0, 0, 2 * TAU, 0, 0, 1]],
    },
    glow: [[0, 1], [0.72, 1.4], S(0.82, 3), [1.0, 1]],
  },
  // Starspur Marshal: swung up from the hip with one full spin round the trigger guard, caught at the shoulder.
  marshalSpur: {
    dur: 1.25,
    track: [[0, 0.05, -0.2, 0.06, -0.4, 0, 0.35], [0.55, 0.03, -0.06, 0.03, 0.08, 0, 0.12], S(1.0, 0, 0.004, 0, -0.03, 0, 0), [1.25, ...Z]],
    parts: {
      w: [[0, ...Z, 1], [0.1, ...Z, 1], ...spin(0.1, 0.92, 0, -1), S(1.0, 0, 0, 0, -TAU + 0.1, 0, 0, 1), [1.25, 0, 0, 0, -TAU, 0, 0, 1]],
      rowel: [[0, ...Z, 1], ...spin(0.2, 1.0, 0, 2), [1.25, 0, 0, 0, 2 * TAU, 0, 0, 1]],
    },
    glow: [[0, 1], [0.9, 1.4], S(1.02, 2.8), [1.25, 1]],
  },
  // Oathblade: drawn like a blade. The Vandal comes up out of a low hip draw, edge turned outward, and cuts up
  // into place with a little overshoot; its edge lights from the guard to the tip as it travels and flashes as
  // it stops.
  vandalOath: {
    dur: 1.0,
    track: [[0, 0.09, -0.2, 0.12, -0.5, -0.35, -1.4], S(0.5, -0.03, 0.02, -0.03, 0.14, 0.08, 0.18), [0.72, 0.004, 0, 0, -0.03, 0, -0.03], [1.0, ...Z]],
    parts: { edge: [[0, ...Z, 0.001], [0.12, ...Z, 0.001], L(0.5, ...Z, 1), [1.0, ...Z, 1]] },
    glow: [[0, 1], [0.45, 1.3], S(0.52, 3.2), [0.85, 1.1], [1.0, 1]],
  },
  // The Sheriff comes down from above in a cut, rolling once about its barrel, and stops dead at the hip.
  sheriffOath: {
    dur: 0.9,
    track: [[0, -0.07, 0.14, 0.02, 0.95, 0.15, 0.5], S(0.42, 0.01, -0.025, -0.01, -0.16, -0.05, -0.08), [0.62, 0, 0.004, 0, 0.03, 0, 0], [0.9, ...Z]],
    parts: {
      w: [[0, 0, 0, 0, 0, 0, TAU, 1], L(0.25, 0, 0, 0, 0, 0, Math.PI * 0.7, 1), S(0.42, ...Z, 1), [0.9, ...Z, 1]],
      edge: [[0, ...Z, 0.001], [0.2, ...Z, 0.001], L(0.42, ...Z, 1), [0.9, ...Z, 1]],
    },
    glow: [[0, 1], S(0.44, 3.2), [0.8, 1.1], [0.9, 1]],
  },
  // The Tanto comes up in a reverse grip and is flipped point-forward, its cord swinging, edge lit as it turns.
  tanto: {
    dur: 0.8,
    track: [[0, 0.03, -0.16, 0.05, -0.3, 0, 0.3], S(0.45, 0, 0.01, -0.01, 0.06, 0, -0.05), [0.8, ...Z]],
    parts: {
      w: [[0, 0, 0, 0, -Math.PI, 0, 0, 1], L(0.2, 0, 0.03, 0, -Math.PI * 0.55, 0, 0, 1), S(0.45, ...Z, 1), [0.8, ...Z, 1]],
      edge: [[0, ...Z, 0.001], [0.15, ...Z, 0.001], L(0.45, ...Z, 1), [0.8, ...Z, 1]],
      cord: [[0, ...Z, 1], [0.3, 0, 0, 0, 0.6, 0, 0, 1], [0.55, 0, 0, 0, -0.3, 0, 0, 1], [0.8, ...Z, 1]],
    },
    glow: [[0, 1], S(0.47, 3), [0.8, 1]],
  },
};

// A spin made of quarter turns at constant speed, so it doesn't slow down at every keyframe.
function spin(t0, t1, axis, turns, base = [0, 0, 0, 0, 0, 0], from = 0) {
  const n = Math.max(1, Math.round(Math.abs(turns) * 4)), out = [];
  for (let i = 1; i <= n; i++) {
    const f = [...base];
    f[3 + axis] += from + (turns * TAU * i) / n;
    out.push(L(t0 + ((t1 - t0) * i) / n, ...f, 1)); // trailing 1: a part's scale
  }
  return out;
}

export const MELEE = {
  knife: {
    name: 'Tactical Knife', blurb: 'Standard-issue combat knife. Flip it, check the edge, show it off.',
    pivot: [0, 0, 0],
    inspects: [
      { ...GUN_INSPECT, name: 'Turn', track: GUN_INSPECT.track.map(([t, ...v]) => [t, v[0], v[1], v[2], v[3] * 0.6, v[4] * 0.6, v[5] * 0.6]) },
      {
        name: 'Flip catch', dur: 2.7,
        track: [[0, ...Z], [0.3, -0.03, 0.04, -0.02, 0.2, 0, -0.1], [0.95, -0.03, 0.06, -0.02, 0.25, 0, -0.1], S(1.1, -0.03, 0.01, -0.02, 0.05, 0, -0.1), [1.5, -0.08, 0.05, -0.04, 0.1, 0.95, -0.35], [2.1, -0.08, 0.05, -0.04, 0.12, 1.05, -0.4], [2.7, ...Z]],
        parts: { w: [[0, ...Z, 1], [0.3, 0, 0, 0, 0, 0, 0, 1], L(0.6, 0, 0.16, -0.02, -Math.PI, 0, 0, 1), L(0.95, 0, 0.0, 0, -TAU, 0, 0, 1), [2.7, 0, 0, 0, -TAU, 0, 0, 1]] },
        glow: [[0, 1], [0.95, 1], S(1.05, 3), [1.6, 1], [2.7, 1]],
      },
      {
        name: 'Edge check', dur: 3.2,
        track: [[0, ...Z], [0.5, -0.06, 0.06, -0.03, 0.05, 1.45, -0.15], L(1.6, -0.15, 0.07, -0.04, 0.05, 1.5, -0.15), [2.0, -0.12, 0.08, -0.05, 0.5, 1.3, 0.3], [2.6, -0.1, 0.07, -0.05, 0.4, 1.2, 0.25], [3.2, ...Z]],
        glow: [[0, 1], [0.5, 1], [1.6, 3.5], [2.1, 1.5], [3.2, 1]],
      },
    ],
  },

  axe: {
    name: 'Hatchet', blurb: 'A short bearded axe. Heft it, toss it end over end, thumb the bit.',
    pivot: [0, 0, 0], hip: [0, -0.01, 0.04], rot: [0.15, 0, 0],
    inspects: [
      {
        name: 'Heft', dur: 3.0,
        track: [[0, ...Z], [0.3, -0.02, -0.02, 0, -0.2, 0.2, 0], S(0.5, -0.02, 0.05, 0, 0.25, 0.2, 0), [0.75, -0.02, -0.01, 0, -0.15, 0.2, 0], S(0.95, -0.02, 0.05, 0, 0.25, 0.2, 0), [1.5, -0.1, 0.06, -0.03, 0.15, 1.15, -0.45], [2.4, -0.1, 0.07, -0.03, 0.2, 1.25, -0.5], [3.0, ...Z]],
      },
      {
        name: 'Tomahawk toss', dur: 2.6,
        track: [[0, ...Z], [0.25, 0, -0.03, 0.02, -0.25, 0, 0], S(0.4, 0, 0.03, 0, 0.3, 0, 0), [1.3, 0, 0.03, -0.01, 0.3, 0, 0], S(1.45, 0, -0.03, 0, -0.1, 0, 0), [2.0, 0, 0, 0, 0.05, 0, 0], [2.6, ...Z]],
        parts: { w: [[0, ...Z, 1], [0.4, ...Z, 1], L(0.7, 0, 0.22, 0.02, -Math.PI * 0.75, 0, 0, 1), L(1.0, 0, 0.24, 0.02, -Math.PI * 1.5, 0, 0, 1), L(1.35, 0, 0, 0, -TAU, 0, 0, 1), [2.6, 0, 0, 0, -TAU, 0, 0, 1]] },
        glow: [[0, 1], [1.35, 1], S(1.45, 3), [2.0, 1], [2.6, 1]],
      },
      {
        name: 'Thumb the bit', dur: 3.2,
        track: [[0, ...Z], [0.6, -0.12, 0.08, -0.06, 0.1, 1.35, 1.0], [1.0, -0.12, 0.085, -0.06, 0.12, 1.4, 1.05], S(1.1, -0.12, 0.08, -0.06, 0.1, 1.35, 0.95), [1.5, -0.12, 0.085, -0.06, 0.12, 1.4, 1.05], S(1.6, -0.12, 0.08, -0.06, 0.1, 1.35, 0.95), [2.6, -0.1, 0.07, -0.05, 0.1, 1.3, 1.0], [3.2, ...Z]],
        glow: [[0, 1], [0.6, 1], S(1.1, 2.5), [1.4, 1.2], S(1.6, 3), [2.4, 1], [3.2, 1]],
      },
    ],
  },

  katana: {
    name: 'Katana', blurb: 'A curved single-edged sword. Present the blade, flick it clean, twirl it.',
    pivot: [0, 0, 0], hip: [0.03, -0.05, 0.02], rot: [0.3, 0.2, -0.25],
    inspects: [
      {
        name: 'Present the blade', dur: 3.6,
        track: [[0, ...Z], [0.7, -0.1, 0.12, -0.05, -0.15, 1.05, -0.15], L(2.2, -0.04, 0.12, -0.05, -0.12, 1.15, -0.2), [2.7, -0.05, 0.1, -0.05, 0.2, 0.9, 0.9], [3.1, -0.05, 0.08, -0.05, 0.15, 0.6, 0.6], [3.6, ...Z]],
        glow: [[0, 1], [0.7, 1], [1.5, 3.5], [2.2, 1.5], [3.6, 1]],
      },
      {
        name: 'Chiburi', dur: 2.4,
        track: [[0, ...Z], [0.55, -0.03, 0.08, 0.02, 0.85, 0.2, -0.3], [0.8, -0.03, 0.09, 0.02, 0.9, 0.2, -0.35], S(0.92, 0.04, -0.03, -0.02, -0.3, -0.15, 0.25), [1.6, 0.04, -0.03, -0.02, -0.27, -0.13, 0.22], [2.4, ...Z]],
        glow: [[0, 1], [0.8, 1], S(0.95, 4), [1.6, 1.2], [2.4, 1]],
      },
      {
        name: 'Twirl', dur: 2.6,
        track: [[0, ...Z], [0.35, -0.12, 0.05, -0.2, -0.3, -0.32, 0.25], [2.2, -0.12, 0.05, -0.2, -0.3, -0.32, 0.25], [2.6, ...Z]],
        parts: { w: [[0, ...Z, 1], [0.35, 0, 0, 0, 0, Math.PI / 2, 0, 1], ...spin(0.35, 1.25, 2, 1, [0, 0, 0, 0, Math.PI / 2, 0]), ...spin(1.25, 1.95, 2, 1, [0, 0, 0, 0, Math.PI / 2, 0], TAU), [2.2, 0, 0, 0, 0, Math.PI / 2, 2 * TAU, 1], [2.6, 0, 0, 0, 0, 0, 2 * TAU, 1]] },
        glow: [[0, 1], [0.4, 1], [1.2, 2.5], [2.0, 1], [2.6, 1]],
      },
    ],
  },

  karambit: {
    name: 'Karambit', blurb: 'A hooked claw with a finger ring. Spin it on the ring, both ways.',
    pivot: [0, 0, 0.095], hip: [-0.02, 0.03, -0.02], rot: [0.3, 0.25, 0],
    inspects: [
      {
        name: 'Ring spin', dur: 3.0,
        track: [[0, ...Z], [0.3, -0.05, 0.06, -0.04, 0.15, 0.35, -0.1], [2.5, -0.05, 0.06, -0.04, 0.15, 0.35, -0.1], [3.0, ...Z]],
        parts: { w: [[0, ...Z, 1], [0.3, ...Z, 1], ...spin(0.3, 0.95, 0, -2), [1.2, 0, 0, 0, -2 * TAU, 0, 0, 1], ...spin(1.2, 1.9, 0, 2, Z, -2 * TAU), S(2.0, 0, 0, 0, 0.25, 0, 0, 1), [2.5, ...Z, 1]] },
        glow: [[0, 1], [0.95, 2.5], [1.2, 1], [1.9, 2.5], S(2.05, 3.5), [3.0, 1]],
      },
      {
        name: 'Claw present', dur: 3.0,
        track: [[0, ...Z], [0.55, -0.09, 0.07, -0.05, 0.3, 1.25, -0.2], [1.3, -0.09, 0.07, -0.05, 0.35, 1.35, -0.25], [1.8, -0.08, 0.08, -0.08, -0.2, 1.6, 1.4], [2.4, -0.08, 0.08, -0.08, -0.15, 1.55, 1.35], [3.0, ...Z]],
        glow: [[0, 1], [1.3, 2.5], [2.4, 1.5], [3.0, 1]],
      },
      {
        name: 'Wrist roll', dur: 2.6,
        track: [[0, ...Z], [0.3, -0.04, 0.05, -0.03, 0.3, 0, 0], ...spin(0.3, 1.5, 2, 2, [-0.04, 0.05, -0.03, 0.3, 0, 0]), [2.0, -0.04, 0.05, -0.03, 0.3, 0, 2 * TAU], [2.6, 0, 0, 0, 0, 0, 2 * TAU]],
        parts: { w: [[0, ...Z, 1], [0.3, ...Z, 1], ...spin(0.3, 1.5, 1, -1), [2.6, 0, 0, 0, 0, -TAU, 0, 1]] },
      },
    ],
  },

  balisong: {
    name: 'Balisong', blurb: 'A butterfly knife. Fans open with a flip, closes, and does it all again in the air.',
    pivot: [0, 0, 0], hip: [-0.015, 0.025, -0.02], rot: [0.25, 0.3, 0],
    inspects: [
      {
        name: 'Flip open', dur: 3.0,
        track: [[0, ...Z], [0.3, -0.03, 0.04, -0.02, 0.2, 0.35, 0], [0.8, -0.03, 0.05, -0.02, 0.25, 0.35, -0.5], [1.3, -0.03, 0.05, -0.02, 0.25, 0.35, 0.5], [1.8, -0.03, 0.05, -0.02, 0.25, 0.35, -0.4], [2.4, -0.03, 0.04, -0.02, 0.2, 0.35, 0], [3.0, ...Z]],
        parts: {
          blade: [[0, ...Z, 1], [0.3, ...Z, 1], L(0.55, 0, 0, 0, Math.PI / 2, 0, 0, 1), L(0.8, 0, 0, 0, Math.PI, 0, 0, 1), [1.05, 0, 0, 0, Math.PI, 0, 0, 1], L(1.3, 0, 0, 0, Math.PI * 1.5, 0, 0, 1), S(1.55, 0, 0, 0, TAU, 0, 0, 1), L(1.8, 0, 0, 0, Math.PI * 2.5, 0, 0, 1), L(2.05, 0, 0, 0, Math.PI * 3, 0, 0, 1), L(2.3, 0, 0, 0, Math.PI * 3.5, 0, 0, 1), S(2.45, 0, 0, 0, 4 * Math.PI, 0, 0, 1), [3.0, 0, 0, 0, 4 * Math.PI, 0, 0, 1]],
          h2: [[0, ...Z, 1], [0.8, ...Z, 1], L(1.05, 0, 0, 0, -Math.PI, 0, 0, 1), L(1.3, 0, 0, 0, -TAU, 0, 0, 1), [1.8, 0, 0, 0, -TAU, 0, 0, 1], L(2.05, 0, 0, 0, -3 * Math.PI, 0, 0, 1), S(2.3, 0, 0, 0, -4 * Math.PI, 0, 0, 1), [3.0, 0, 0, 0, -4 * Math.PI, 0, 0, 1]],
        },
        glow: [[0, 1], [1.5, 1], S(1.6, 2.5), [2.4, 1], S(2.5, 3.5), [3.0, 1]],
      },
      {
        name: 'Aerial', dur: 2.6,
        track: [[0, ...Z], [0.25, 0, -0.02, 0, -0.2, 0, 0], S(0.4, 0, 0.03, 0, 0.3, 0, 0), [1.3, 0, 0.03, 0, 0.3, 0, 0], S(1.45, 0, -0.02, 0, -0.05, 0, 0), [2.6, ...Z]],
        parts: {
          w: [[0, ...Z, 1], [0.4, ...Z, 1], L(0.85, 0, 0.2, 0, -Math.PI, 0, 0, 1), L(1.35, 0, 0, 0, -TAU, 0, 0, 1), [2.6, 0, 0, 0, -TAU, 0, 0, 1]],
          blade: [[0, ...Z, 1], [0.45, ...Z, 1], [0.85, 0, 0, 0, Math.PI, 0, 0, 1], [1.3, 0, 0, 0, TAU, 0, 0, 1], [2.6, 0, 0, 0, TAU, 0, 0, 1]],
        },
        glow: [[0, 1], [1.35, 1], S(1.45, 3), [2.2, 1], [2.6, 1]],
      },
      {
        name: 'Close and show', dur: 3.4,
        track: [[0, ...Z], [0.7, -0.1, 0.07, -0.05, 0.15, 1.3, -0.3], [1.6, -0.1, 0.07, -0.05, 0.2, 1.4, 0.4], [2.0, -0.04, 0.05, -0.03, 0.2, 0.3, 0], [2.8, -0.04, 0.05, -0.03, 0.2, 0.3, 0], [3.4, ...Z]],
        parts: {
          blade: [[0, ...Z, 1], [0.6, 0, 0, 0, Math.PI, 0, 0, 1], [2.0, 0, 0, 0, Math.PI, 0, 0, 1], L(2.25, 0, 0, 0, Math.PI * 1.5, 0, 0, 1), S(2.45, 0, 0, 0, TAU, 0, 0, 1), [3.4, 0, 0, 0, TAU, 0, 0, 1]],
          h2: [[0, ...Z, 1], [2.0, ...Z, 1], L(2.2, 0, 0, 0, -Math.PI, 0, 0, 1), S(2.4, 0, 0, 0, -TAU, 0, 0, 1), [3.4, 0, 0, 0, -TAU, 0, 0, 1]],
        },
        glow: [[0, 1], [2.3, 1], S(2.45, 4), [3.4, 1]],
      },
    ],
  },

  kunai: {
    name: 'Kunai', blurb: 'A ring-pommel throwing dagger. Helicopter spins, a fake throw, a palm roll.',
    pivot: [0, 0, 0.105], hip: [-0.015, 0.025, -0.02], rot: [0.25, 0.25, 0],
    inspects: [
      {
        name: 'Helicopter', dur: 2.9,
        track: [[0, ...Z], [0.3, -0.05, 0.07, -0.05, 0.35, 0.2, 0], [2.4, -0.05, 0.07, -0.05, 0.35, 0.2, 0], [2.9, ...Z]],
        parts: { w: [[0, ...Z, 1], [0.3, ...Z, 1], ...spin(0.3, 1.0, 1, 1), ...spin(1.0, 1.5, 1, 1, Z, TAU), ...spin(1.5, 1.9, 1, 1, Z, 2 * TAU), S(2.05, 0, 0, 0, 0, 3 * TAU + 0.2, 0, 1), [2.4, 0, 0, 0, 0, 3 * TAU, 0, 1]] },
        glow: [[0, 1], [1.9, 3], [2.4, 1], [2.9, 1]],
      },
      {
        name: 'Fake throw', dur: 2.4,
        track: [[0, ...Z], [0.5, 0.02, 0.1, 0.1, 0.9, -0.1, 0.2], [0.75, 0.02, 0.11, 0.1, 0.95, -0.1, 0.2], S(0.85, -0.03, 0.02, -0.12, -0.2, 0, 0), [1.25, -0.03, 0.02, -0.12, -0.15, 0, 0], [1.6, -0.07, 0.06, -0.06, 0.2, 1.2, -0.2], [2.0, -0.07, 0.06, -0.06, 0.2, 1.25, -0.2], [2.4, ...Z]],
        glow: [[0, 1], [0.75, 1], S(0.9, 3.5), [1.5, 1], [2.4, 1]],
      },
      {
        name: 'Palm roll', dur: 2.8,
        track: [[0, ...Z], [0.4, -0.09, 0.07, -0.05, 0.1, 1.3, 0], [2.3, -0.09, 0.07, -0.05, 0.1, 1.3, 0], [2.8, ...Z]],
        parts: { w: [[0, ...Z, 1], [0.4, ...Z, 1], ...spin(0.4, 1.3, 2, 1), [1.5, 0, 0, 0, 0, 0, TAU, 1], ...spin(1.5, 2.2, 2, -1, Z, TAU), [2.8, ...Z, 1]] },
        glow: [[0, 1], [1.3, 2.5], [1.5, 1], [2.2, 2.5], [2.8, 1]],
      },
    ],
  },

  arc: {
    name: 'Arc Blade', blurb: 'A hard-light blade on an emitter hilt. Kill and relight it, overcharge it, spin it.',
    pivot: [0, 0, 0], hip: [0.01, -0.02, 0.01], rot: [0.2, 0.15, -0.1],
    inspects: [
      {
        name: 'Relight', dur: 2.8,
        track: [[0, ...Z], [0.4, -0.06, 0.05, -0.03, 0.1, 0.9, -0.2], [2.2, -0.06, 0.05, -0.03, 0.12, 0.95, -0.2], [2.8, ...Z]],
        parts: { beam: [[0, ...Z, 1], [0.4, ...Z, 1], [0.7, ...Z, 0.02], [1.3, ...Z, 0.02], S(1.45, ...Z, 1.15), [1.8, ...Z, 1], [2.8, ...Z, 1]] },
        glow: [[0, 1], [0.7, 0.3], [1.3, 0.3], S(1.45, 5), [2.2, 1.2], [2.8, 1]],
      },
      {
        name: 'Overcharge', dur: 3.0, jitter: true,
        track: [[0, ...Z], [0.6, -0.1, 0.09, -0.05, 0.05, 1.35, -0.1], [2.2, -0.1, 0.1, -0.05, 0.08, 1.4, -0.12], S(2.35, -0.08, 0.07, -0.04, 0.0, 1.2, -0.05), [3.0, ...Z]],
        parts: { beam: [[0, ...Z, 1], [0.6, ...Z, 1], [2.2, ...Z, 1.25], S(2.35, ...Z, 1), [3.0, ...Z, 1]] },
        glow: [[0, 1], [0.6, 1.2], [2.2, 5.5], S(2.35, 1), [3.0, 1]],
      },
      {
        name: 'Saber spin', dur: 2.6,
        track: [[0, ...Z], [0.35, -0.12, 0.05, -0.18, -0.25, -0.15, 0.1], [2.2, -0.12, 0.05, -0.18, -0.25, -0.15, 0.1], [2.6, ...Z]],
        parts: { w: [[0, ...Z, 1], [0.35, 0, 0, 0, 0, Math.PI / 2, 0, 1], ...spin(0.35, 0.95, 2, -1, [0, 0, 0, 0, Math.PI / 2, 0]), ...spin(0.95, 1.5, 2, -1, [0, 0, 0, 0, Math.PI / 2, 0], -TAU), ...spin(1.5, 1.95, 2, -1, [0, 0, 0, 0, Math.PI / 2, 0], -2 * TAU), [2.2, 0, 0, 0, 0, Math.PI / 2, -3 * TAU, 1], [2.6, 0, 0, 0, 0, 0, -3 * TAU, 1]] },
        glow: [[0, 1], [0.4, 1.5], [1.9, 3], [2.6, 1]],
      },
    ],
  },
  bowie: {
    name: 'Bowie', blurb: 'A frontier bowie with a spur rowel at the guard. Flick the rowel, flip it twice, catch the last light on the blade.',
    pivot: [0, 0, 0], hip: [0, -0.005, 0.02], rot: [0.2, 0.15, -0.1],
    inspects: [
      {
        name: 'Rowel spin', dur: 3.0,
        track: [[0, ...Z], [0.45, -0.1, 0.09, -0.07, 0.1, 1.3, -0.2], [2.4, -0.1, 0.095, -0.07, 0.12, 1.35, -0.22], [3.0, ...Z]],
        parts: { rowel: [[0, ...Z, 1], [0.5, ...Z, 1], ...spin(0.5, 1.8, 0, 4), [2.5, 0, 0, 0, 4 * TAU + TAU / 3, 0, 0, 1], [3.0, 0, 0, 0, 4 * TAU + TAU / 3, 0, 0, 1]] },
        glow: [[0, 1], [0.6, 1.5], [1.8, 3.2], [2.5, 1.2], [3.0, 1]],
      },
      {
        name: 'Double flip', dur: 2.9,
        track: [[0, ...Z], [0.25, -0.02, 0.03, -0.02, 0.2, 0, -0.1], [1.3, -0.02, 0.05, -0.02, 0.25, 0, -0.1], S(1.45, -0.02, 0, -0.02, 0.05, 0, -0.1), [1.9, -0.08, 0.05, -0.04, 0.1, 1.0, -0.35], [2.4, -0.08, 0.05, -0.04, 0.12, 1.05, -0.38], [2.9, ...Z]],
        parts: { w: [[0, ...Z, 1], [0.3, ...Z, 1], L(0.55, 0, 0.15, -0.02, -Math.PI, 0, 0, 1), L(0.8, 0, 0.22, -0.02, -TAU, 0, 0, 1), L(1.05, 0, 0.15, -0.02, -3 * Math.PI, 0, 0, 1), L(1.3, 0, 0, 0, -2 * TAU, 0, 0, 1), [2.9, 0, 0, 0, -2 * TAU, 0, 0, 1]] },
        glow: [[0, 1], [1.3, 1], S(1.4, 3), [2.0, 1], [2.9, 1]],
      },
      {
        name: 'Last light', dur: 3.2,
        track: [[0, ...Z], [0.6, -0.1, 0.09, -0.05, 0.45, 1.3, 0.2], L(1.6, -0.1, 0.09, -0.05, 0.45, 0.9, 0.15), [2.0, -0.06, 0.07, -0.05, 0.1, 1.4, -0.3], [2.6, -0.06, 0.07, -0.05, 0.1, 1.45, -0.32], [3.2, ...Z]],
        glow: [[0, 1], [0.6, 1], [1.1, 4], [1.6, 1.4], [3.2, 1]],
      },
    ],
  },
  tanto: {
    name: 'Tanto', blurb: 'A lacquered tanto on a silk cord. Light the edge, flip it to a reverse grip and back, spin the cord.',
    pivot: [0, 0, 0], hip: [0, -0.005, 0.02], rot: [0.2, 0.15, -0.1],
    inspects: [
      {
        name: 'Edge light', dur: 3.0,
        track: [[0, ...Z], [0.5, -0.1, 0.09, -0.07, 0.1, 1.3, -0.2], [2.4, -0.1, 0.095, -0.07, 0.12, 1.35, -0.22], [3.0, ...Z]],
        parts: { edge: [[0, ...Z, 1], [0.5, ...Z, 1], S(0.7, ...Z, 0.001), [1.0, ...Z, 0.001], L(2.0, ...Z, 1), [3.0, ...Z, 1]] },
        glow: [[0, 1], [0.6, 1], [0.7, 0.6], [1.9, 2.6], S(2.1, 3.4), [2.6, 1.2], [3.0, 1]],
      },
      {
        name: 'Reverse grip', dur: 2.6,
        track: [[0, ...Z], [0.5, -0.03, 0.04, -0.02, 0.15, 0.3, -0.1], [1.5, -0.03, 0.045, -0.02, 0.2, 0.35, -0.1], [2.6, ...Z]],
        parts: {
          w: [[0, ...Z, 1], [0.25, ...Z, 1], S(0.55, 0, 0, 0, -Math.PI, 0, 0, 1), [1.4, 0, 0, 0, -Math.PI, 0, 0, 1], S(1.75, 0, 0, 0, -TAU, 0, 0, 1), [2.6, 0, 0, 0, -TAU, 0, 0, 1]],
          cord: [[0, ...Z, 1], [0.4, 0, 0, 0, 0.7, 0, 0, 1], [0.8, 0, 0, 0, -0.3, 0, 0, 1], [1.5, 0, 0, 0, 0.5, 0, 0, 1], [1.9, 0, 0, 0, -0.4, 0, 0, 1], [2.6, ...Z, 1]],
        },
        glow: [[0, 1], S(0.57, 2.2), [1.0, 1], S(1.77, 2.8), [2.2, 1], [2.6, 1]],
      },
      {
        name: 'Cord spin', dur: 3.0,
        track: [[0, ...Z], [0.4, -0.04, 0.07, -0.03, 0.55, 0.2, -0.1], [2.4, -0.04, 0.072, -0.03, 0.58, 0.22, -0.1], [3.0, ...Z]],
        parts: { cord: [[0, ...Z, 1], [0.4, ...Z, 1], ...spin(0.4, 2.2, 2, 3), [2.6, 0, 0, 0, 0, 0, 3 * TAU, 1], [3.0, 0, 0, 0, 0, 0, 3 * TAU, 1]] },
        glow: [[0, 1], [0.6, 1.4], [2.2, 2.2], [3.0, 1]],
      },
    ],
  },
};

// Swings: each melee type cuts its own way. `light` (fire) is a list played in turn, so the cuts alternate
// sides; `heavy` (alt fire) winds up for the 0.18 s before it lands. Each is keyframed like an inspect (track,
// parts, glow; `dur` in seconds) and carries `trail`: the strokes of light it leaves on screen (see swingfx.js:
// half-screen-height units from the middle, y up; `color` 'glow' or 'accent' takes the theme's colour).
// `sound` shapes its whoosh (Sound.swing).
const flipX = (s) => ({ ...s, pts: s.pts?.map(([x, y]) => [-x, y]), arc: s.arc && [-s.arc[0], s.arc[1], s.arc[2], Math.PI - s.arc[3], Math.PI - s.arc[4]] });
// The same cut from the other side, a backhand: turns flipped, the strokes mirrored, and the hand starting across
// the body and sweeping back out (flipping the hand's sideways move as well would swing it off the screen).
function mirrored(sw) {
  const reach = Math.min(...sw.track.map(f => f[1]));
  const fl = (f, i, all) => {
    const px = i === 0 || i === all.length - 1 ? f[1] : reach - f[1];
    return Object.assign([f[0], px, f[2], f[3], f[4], -f[5], -f[6], ...f.slice(7)], { ease: f.ease });
  };
  return { ...sw, track: sw.track.map(fl), trail: sw.trail.map(flipX) };
}
// Three parallel strokes a little apart along `off`, each a beat after the last: claw marks.
const rake = (pts, off, t0, t1, rest) => [-1, 0, 1].map((k, i) => ({ pts: pts.map(([x, y]) => [x + off[0] * k, y + off[1] * k]), t0: t0 + i * 0.02, t1: t1 + i * 0.02, ...rest }));
// A hexagon of radius r round (cx, cy), with points along each side so the curve through them stays straight.
const hexPts = (cx, cy, r, rot = Math.PI / 6) => {
  const v = [...Array(7)].map((_, i) => [cx + Math.cos(rot + (i * TAU) / 6) * r, cy + Math.sin(rot + (i * TAU) / 6) * r]), out = [];
  for (let i = 0; i < 6; i++) for (let k = 0; k < 4; k++) out.push([v[i][0] + (v[i + 1][0] - v[i][0]) * (k / 4), v[i][1] + (v[i + 1][1] - v[i][1]) * (k / 4)]);
  out.push(v[6]);
  return out;
};

const KNIFE_LIGHT = {
  dur: 0.42,
  track: [[0, ...Z], [0.04, 0.03, 0.02, 0, 0.1, -0.35, -0.3], S(0.16, -0.16, -0.03, -0.06, -0.15, 0.85, 0.55), [0.42, ...Z]],
  trail: [{ pts: [[1.0, 0.45], [0.3, 0.1], [-0.4, -0.2], [-1.0, -0.45]], t0: 0.03, t1: 0.15, w: 0.05, linger: 0.14, core: 0.45 }],
};
const AXE_LIGHT = {
  dur: 0.45,
  track: [[0, ...Z], [0.05, 0.02, 0.05, 0.02, 0.45, -0.25, -0.4], S(0.18, -0.12, -0.03, -0.05, -0.2, 0.5, 0.75), [0.45, ...Z]],
  glow: [[0, 1], S(0.18, 2.2), [0.45, 1]],
  trail: [{ pts: [[0.85, 0.8], [0.35, 0.25], [-0.15, -0.25], [-0.5, -0.75]], t0: 0.04, t1: 0.18, w: 0.11, linger: 0.18, core: 0.3, sparks: 5, sparkSize: 9 }],
};
// The hatchet's backhand is its own (mirrored, the chop would drop it out of sight): high across the body, down and out.
const AXE_BACK = {
  ...AXE_LIGHT,
  track: [[0, ...Z], [0.05, -0.15, 0.06, 0.02, 0.45, 0.3, 0.45], S(0.18, 0, -0.01, -0.05, -0.2, -0.45, -0.75), [0.45, ...Z]],
  trail: AXE_LIGHT.trail.map(flipX),
};
const KATANA_LIGHT = {
  dur: 0.44,
  track: [[0, ...Z], [0.04, 0.06, 0.04, 0.02, 0.05, -0.6, -1.3], S(0.17, -0.2, 0.02, -0.06, 0, 1.0, -1.35), [0.44, ...Z]],
  glow: [[0, 1], S(0.15, 3), [0.44, 1]],
  trail: [{ pts: [[1.8, 0.05], [0.6, -0.08], [-0.6, -0.06], [-1.8, 0.08]], t0: 0.03, t1: 0.16, w: 0.045, linger: 0.28, core: 0.9 }],
};
const KARAMBIT_LIGHT = {
  dur: 0.44,
  track: [[0, ...Z], [0.04, 0.03, 0, 0, 0.2, -0.3, -0.2], S(0.18, -0.13, -0.04, -0.04, -0.2, 0.7, 0.8), [0.44, ...Z]],
  parts: { w: [[0, ...Z, 1], ...spin(0, 0.12, 0, -1), [0.44, 0, 0, 0, -TAU, 0, 0, 1]] },
  glow: [[0, 1], [0.18, 2.6], [0.44, 1]],
  trail: [{ arc: [0.25, -0.15, 0.75, 0.35, Math.PI + 0.6], t0: 0.03, t1: 0.2, w: 0.07, linger: 0.22, core: 0.45 }],
};
const BALISONG_LIGHT = {
  dur: 0.4,
  track: [[0, ...Z], [0.04, 0.03, 0.03, 0, 0.25, -0.3, -0.3], S(0.15, -0.1, -0.05, -0.04, -0.2, 0.6, 0.5), [0.4, ...Z]],
  parts: { w: [[0, ...Z, 1], ...spin(0.02, 0.2, 2, 1), [0.4, 0, 0, 0, 0, 0, TAU, 1]] },
  trail: rake([[0.6, 0.55], [0.15, 0.05], [-0.3, -0.45]], [0.11, -0.1], 0.03, 0.13, { w: 0.045, linger: 0.22, core: 0.55 }),
};
const KUNAI_LIGHT = {
  dur: 0.38,
  track: [[0, ...Z], [0.03, 0.01, 0, 0.04, 0.05, 0.05, 0], S(0.11, -0.08, 0.05, -0.16, -0.05, 0.12, 0), [0.38, ...Z]],
  glow: [[0, 1], S(0.11, 2.5), [0.38, 1]],
  trail: [{ pts: [[0.6, -0.7], [0.3, -0.35], [0.06, -0.04]], t0: 0.02, t1: 0.1, w: 0.06, linger: 0.14, core: 0.7, taper: 0.6 }],
};
// A second jab, rising from lower down (a thrust mirrored would come from the wrong hand).
const KUNAI_JAB = {
  ...KUNAI_LIGHT,
  track: [[0, ...Z], [0.03, 0.01, -0.02, 0.04, -0.1, 0.02, 0.3], S(0.11, -0.06, 0.07, -0.16, 0.1, 0.1, 0.35), [0.38, ...Z]],
  trail: [{ pts: [[0.42, -0.85], [0.2, -0.42], [0.02, 0.02]], t0: 0.02, t1: 0.1, w: 0.06, linger: 0.14, core: 0.7, taper: 0.6 }],
};
const ARC_LIGHT = {
  dur: 0.44,
  track: [[0, ...Z], [0.04, 0.04, 0.04, 0.02, 0.2, -0.5, -0.6], S(0.17, -0.17, -0.02, -0.06, -0.1, 0.95, 0.7), [0.44, ...Z]],
  parts: { beam: [[0, ...Z, 1], S(0.12, ...Z, 1.2), [0.4, ...Z, 1]] },
  glow: [[0, 1], S(0.12, 3), [0.44, 1]],
  trail: [
    { pts: [[1.3, 0.7], [0.5, 0.2], [-0.4, -0.15], [-1.3, -0.35]], t0: 0.03, t1: 0.17, w: 0.12, linger: 0.3, core: 0.75, sparks: 8, sparkSize: 11, sparkColor: 0xffffff },
    { pts: [[1.3, 0.7], [0.5, 0.2], [-0.4, -0.15], [-1.3, -0.35]], t0: 0.03, t1: 0.17, w: 0.26, linger: 0.36, core: 0, alpha: 0.55, color: 0xc86bff },
  ],
};
const TANTO_LIGHT = {
  dur: 0.46,
  track: [[0, ...Z], [0.04, 0.05, 0.04, 0.02, 0.15, -0.55, -0.9], S(0.15, -0.2, -0.03, -0.07, -0.1, 1.0, 0.3), [0.46, ...Z]],
  glow: [[0, 1], S(0.13, 3.6), [0.46, 1]],
  trail: [
    { pts: [[1.9, 0.6], [0.6, 0.06], [-0.6, -0.16], [-1.9, -0.12]], t0: 0.03, t1: 0.15, w: 0.07, linger: 0.55, core: 1, sparks: 9, sparkSize: 9 },
    { pts: [[1.9, 0.54], [0.6, 0.015], [-0.6, -0.2], [-1.9, -0.16]], t0: 0.045, t1: 0.165, w: 0.025, linger: 0.4, core: 0.2, color: 'accent', alpha: 0.9 },
  ],
};
const BOWIE_LIGHT = {
  dur: 0.42,
  track: [[0, ...Z], [0.04, -0.02, -0.02, 0.02, -0.1, 0.45, 0.5], S(0.16, 0.04, 0.04, -0.06, 0.25, -0.75, -0.6), [0.42, ...Z]],
  parts: { rowel: [[0, ...Z, 1], ...spin(0, 0.4, 0, 3), [0.42, 0, 0, 0, 3 * TAU, 0, 0, 1]] },
  glow: [[0, 1], S(0.16, 2.6), [0.42, 1]],
  trail: [{ pts: [[-1.1, -0.4], [-0.3, -0.05], [0.4, 0.2], [1.1, 0.45]], t0: 0.03, t1: 0.16, w: 0.07, linger: 0.25, core: 0.5, sparks: 6, sparkSize: 13, sparkColor: 'accent' }],
};

export const SWINGS = {
  // Standard issue: a quick, clean slash with a thin status-light streak; the heavy is a straight stab.
  knife: {
    light: [KNIFE_LIGHT, mirrored(KNIFE_LIGHT)],
    heavy: {
      dur: 0.85,
      track: [[0, ...Z], [0.16, 0.02, -0.01, 0.08, 0.15, 0.1, 0], S(0.27, -0.09, 0.05, -0.2, -0.05, 0.1, 0), [0.4, -0.085, 0.05, -0.19, -0.04, 0.1, 0], [0.85, ...Z]],
      trail: [{ pts: [[0.75, -0.75], [0.35, -0.35], [0.05, -0.03]], t0: 0.19, t1: 0.27, w: 0.07, linger: 0.16, core: 0.6, taper: 0.6, burst: 4, sparkSize: 9 }],
    },
  },
  // Heirloom hatchet: forehand chops that shed embers; the heavy is an overhead chop with a shower of sparks.
  axe: {
    light: [AXE_LIGHT, AXE_BACK],
    heavy: {
      dur: 0.9,
      track: [[0, ...Z], [0.18, 0, 0.06, 0.08, 0.8, 0.1, 0.1], S(0.32, -0.05, -0.1, -0.08, -0.85, 0.1, 0), [0.5, -0.05, -0.095, -0.08, -0.8, 0.1, 0], [0.9, ...Z]],
      glow: [[0, 1], [0.18, 1.4], S(0.32, 3), [0.9, 1]],
      trail: [{ pts: [[0.15, 1.1], [0.1, 0.5], [0.02, -0.1], [-0.02, -0.8]], t0: 0.2, t1: 0.32, w: 0.15, linger: 0.25, core: 0.35, burst: 10, sparkSize: 10 }],
    },
  },
  // Damascus katana: a flat cut across the whole screen, a thin silver crescent; the heavy rises corner to corner.
  katana: {
    light: [KATANA_LIGHT, mirrored(KATANA_LIGHT)],
    heavy: {
      dur: 0.9,
      track: [[0, ...Z], [0.17, -0.06, -0.08, 0.04, -0.3, 0.6, 0.9], S(0.3, 0.08, 0.08, -0.06, 0.5, -0.7, -0.6), [0.5, 0.075, 0.075, -0.06, 0.48, -0.68, -0.6], [0.9, ...Z]],
      glow: [[0, 1], S(0.3, 3.5), [0.9, 1]],
      trail: [{ pts: [[-1.5, -0.9], [-0.5, -0.3], [0.5, 0.25], [1.6, 0.85]], t0: 0.18, t1: 0.3, w: 0.06, linger: 0.45, core: 1, sparks: 4, sparkSize: 9 }],
    },
  },
  // Nightglass karambit: a hooking cut that spins once on the ring; the heavy spins a full violet circle, then rips.
  karambit: {
    light: [KARAMBIT_LIGHT, mirrored(KARAMBIT_LIGHT)],
    heavy: {
      dur: 0.85,
      track: [[0, ...Z], [0.18, 0, 0.05, 0.03, 0.3, -0.2, -0.2], S(0.32, -0.12, -0.05, -0.08, -0.3, 0.7, 0.9), [0.45, -0.11, -0.045, -0.075, -0.28, 0.68, 0.88], [0.85, ...Z]],
      parts: { w: [[0, ...Z, 1], ...spin(0, 0.2, 0, -2), [0.85, 0, 0, 0, -2 * TAU, 0, 0, 1]] },
      glow: [[0, 1], [0.2, 2.8], S(0.32, 3.5), [0.85, 1]],
      trail: [
        { arc: [0.05, 0, 0.5, -Math.PI / 2, -Math.PI / 2 + TAU], t0: 0.02, t1: 0.2, w: 0.05, linger: 0.32, core: 0.4 },
        { pts: [[0.7, 0.5], [0, 0], [-0.7, -0.5]], t0: 0.22, t1: 0.32, w: 0.08, linger: 0.25, core: 0.6 },
      ],
    },
  },
  // Tiger Stripe balisong: a flick-cut that rolls the knife and rakes three claw marks; the heavy rakes the other way.
  balisong: {
    light: [BALISONG_LIGHT, mirrored(BALISONG_LIGHT)],
    heavy: {
      dur: 0.85,
      track: [[0, ...Z], [0.17, 0, 0.06, 0.04, 0.5, 0.4, 0.6], S(0.3, 0.02, -0.08, -0.06, -0.4, -0.3, -0.4), [0.45, 0.02, -0.075, -0.06, -0.38, -0.28, -0.4], [0.85, ...Z]],
      parts: { w: [[0, ...Z, 1], ...spin(0, 0.17, 2, 2), [0.85, 0, 0, 0, 0, 0, 2 * TAU, 1]] },
      glow: [[0, 1], S(0.3, 2.6), [0.85, 1]],
      trail: rake([[-0.7, 0.8], [0, 0.05], [0.6, -0.7]], [0.12, 0.1], 0.19, 0.31, { w: 0.06, linger: 0.3, core: 0.55 }),
    },
  },
  // Hexcore kunai: fast red jabs from low and lower; the heavy helicopters once in the hand, then stabs and throws out a hexagon.
  kunai: {
    light: [KUNAI_LIGHT, KUNAI_JAB],
    heavy: {
      dur: 0.85,
      track: [[0, ...Z], [0.16, 0.02, 0.04, 0.06, 0.3, 0.1, 0], S(0.26, -0.09, 0.06, -0.2, -0.05, 0.12, 0), [0.45, -0.085, 0.058, -0.19, -0.05, 0.12, 0], [0.85, ...Z]],
      parts: { w: [[0, ...Z, 1], ...spin(0, 0.18, 1, 1), [0.85, 0, 0, 0, 0, TAU, 0, 1]] },
      glow: [[0, 1], [0.18, 2], S(0.27, 4), [0.85, 1]],
      trail: [
        { pts: [[0.6, -0.7], [0.3, -0.35], [0.06, -0.04]], t0: 0.18, t1: 0.26, w: 0.07, linger: 0.16, core: 0.7, taper: 0.6 },
        { pts: hexPts(0.04, 0, 0.3), t0: 0.26, t1: 0.36, w: 0.06, linger: 0.34, core: 1, taper: 0, burst: 6, sparkSize: 10 },
      ],
    },
  },
  // Nebula arc blade: a wide saber sweep, a cyan core in a violet haze shedding stars; the heavy sweeps most of a circle.
  arc: {
    light: [ARC_LIGHT, mirrored(ARC_LIGHT)],
    heavy: {
      dur: 0.9,
      track: [[0, ...Z], [0.17, 0.02, 0.06, 0.04, 0.4, -0.6, -0.9], S(0.32, -0.16, -0.03, -0.08, -0.2, 1.1, 0.9), [0.5, -0.155, -0.028, -0.078, -0.19, 1.08, 0.88], [0.9, ...Z]],
      parts: { beam: [[0, ...Z, 1], [0.17, ...Z, 1.1], S(0.3, ...Z, 1.3), [0.6, ...Z, 1], [0.9, ...Z, 1]] },
      glow: [[0, 1], [0.17, 2], S(0.3, 4.5), [0.9, 1]],
      trail: [
        { arc: [0, 0, 0.85, 0.2, Math.PI + 0.8], t0: 0.18, t1: 0.32, w: 0.12, linger: 0.4, core: 0.75, sparks: 14, sparkSize: 11, sparkColor: 0xffffff },
        { arc: [0, 0, 0.85, 0.2, Math.PI + 0.8], t0: 0.18, t1: 0.32, w: 0.28, linger: 0.45, core: 0, alpha: 0.55, color: 0xc86bff },
      ],
    },
  },
  // Oathblade tanto: one drawn cut clean across the screen that leaves a long trail of light, a thread of red
  // lacquer under it, motes drifting off; the heavy cuts an X, the second stroke breaking into light at the cross.
  tanto: {
    light: [TANTO_LIGHT, mirrored(TANTO_LIGHT)],
    heavy: {
      dur: 0.95,
      track: [[0, ...Z], [0.15, 0.06, 0.07, 0.04, 0.6, -0.4, -0.6], S(0.27, -0.16, -0.06, -0.07, -0.4, 0.8, 0.5), [0.34, -0.15, 0.06, -0.04, 0.5, 0.7, 0.6], S(0.49, 0.06, -0.07, -0.07, -0.4, -0.5, -0.4), [0.62, 0.055, -0.065, -0.065, -0.38, -0.48, -0.38], [0.95, ...Z]],
      glow: [[0, 1], S(0.27, 3.6), [0.36, 1.6], S(0.49, 4), [0.95, 1]],
      trail: [
        { pts: [[1.4, 1.0], [0.45, 0.3], [-0.45, -0.3], [-1.4, -1.0]], t0: 0.18, t1: 0.27, w: 0.055, linger: 0.6, core: 1 },
        { pts: [[1.4, 0.95], [0.45, 0.26], [-0.45, -0.34], [-1.4, -1.05]], t0: 0.19, t1: 0.28, w: 0.018, linger: 0.45, core: 0.15, color: 'accent', alpha: 0.9 },
        { pts: [[-1.4, 0.95], [-0.45, 0.3], [0.45, -0.3], [1.4, -0.95]], t0: 0.4, t1: 0.49, w: 0.055, linger: 0.6, core: 1, burst: 10, burstAt: 0.5, sparkSize: 9 },
        { pts: [[-1.4, 0.9], [-0.45, 0.26], [0.45, -0.34], [1.4, -1.0]], t0: 0.41, t1: 0.5, w: 0.018, linger: 0.45, core: 0.15, color: 'accent', alpha: 0.9 },
      ],
    },
  },
  // Starspur bowie: a rising backhand with the rowel spinning, a teal arc that throws copper stars; the heavy hacks
  // down overhead and bursts a spray of stars where it crosses the middle.
  bowie: {
    light: [BOWIE_LIGHT, mirrored(BOWIE_LIGHT)],
    heavy: {
      dur: 0.88,
      track: [[0, ...Z], [0.17, 0.02, 0.09, 0.05, 0.9, -0.2, -0.3], S(0.3, -0.1, -0.08, -0.07, -0.7, 0.4, 0.3), [0.48, -0.095, -0.075, -0.07, -0.68, 0.38, 0.3], [0.88, ...Z]],
      parts: { rowel: [[0, ...Z, 1], ...spin(0, 0.5, 0, 4), [0.88, 0, 0, 0, 4 * TAU, 0, 0, 1]] },
      glow: [[0, 1], [0.17, 1.6], S(0.3, 3.4), [0.88, 1]],
      trail: [{ pts: [[0.6, 1.0], [0.25, 0.35], [-0.1, -0.25], [-0.4, -0.85]], t0: 0.19, t1: 0.3, w: 0.1, linger: 0.3, core: 0.5, burst: 12, burstAt: 0.5, sparkSize: 14, sparkColor: 'accent' }],
    },
  },
};
// How each swing sounds: the whoosh's filter, and any ring or click on top (Sound.swing).
for (const [id, snd] of Object.entries({
  axe: { whoosh: { lp: 900, decay: 0.2 }, heavyWhoosh: { lp: 700, decay: 0.3, gain: 0.26 } },
  katana: { whoosh: { hp: 1400, lp: 6000, decay: 0.12, gain: 0.17 }, tones: [{ freq: 2800, end: 2300, decay: 0.3, gain: 0.02, type: 'triangle' }] },
  karambit: { whoosh: { hp: 700, lp: 2600, decay: 0.09 }, again: 0.08 },
  balisong: { whoosh: { lp: 2200, decay: 0.11 }, tones: [{ freq: 3200, decay: 0.025, gain: 0.03, type: 'square' }] },
  kunai: { whoosh: { hp: 1200, lp: 4000, decay: 0.08, gain: 0.18 } },
  arc: { whoosh: { lp: 2400, decay: 0.18 }, tones: [{ freq: 140, end: 230, decay: 0.28, gain: 0.05, type: 'sawtooth' }] },
  tanto: { whoosh: { hp: 1500, lp: 7000, decay: 0.14, gain: 0.18 }, tones: [{ at: 0.04, freq: 3600, end: 3300, decay: 0.6, gain: 0.04, type: 'triangle' }] },
  bowie: { whoosh: { lp: 1900, decay: 0.15 }, tones: [{ at: 0.03, freq: 2400, decay: 0.2, gain: 0.022, type: 'triangle' }, { at: 0.07, freq: 3100, decay: 0.22, gain: 0.02, type: 'triangle' }] },
})) SWINGS[id].sound = snd;

export const MELEE_ORDER = Object.keys(MELEE);
export const isMelee = (id) => !!MELEE[id];
export const meleeId = (id) => (MELEE[id] ? id : 'knife');

const smooth = (u) => u * u * (3 - 2 * u);
const snap = (u) => 1 - Math.pow(1 - u, 3);

// Sample a keyframe track at time t: the interpolated values (without the time column).
export function sample(frames, t) {
  if (!frames?.length) return null;
  if (t <= frames[0][0]) return frames[0].slice(1);
  const last = frames[frames.length - 1];
  if (t >= last[0]) return last.slice(1);
  let i = 1;
  while (frames[i][0] < t) i++;
  const A = frames[i - 1], B = frames[i];
  const u = Math.min(1, Math.max(0, (t - A[0]) / (B[0] - A[0])));
  const s = B.ease === 'lin' ? u : B.ease === 'snap' ? snap(u) : smooth(u);
  const out = new Array(B.length - 1);
  for (let j = 1; j < B.length; j++) out[j - 1] = (A[j] ?? 0) + ((B[j] ?? 0) - (A[j] ?? 0)) * s;
  return out;
}

// Everything an inspect does at time t: the viewmodel offset, each part's offset, and the glow multiplier.
export function inspectPose(ins, t) {
  const pose = sample(ins.track, t) || [0, 0, 0, 0, 0, 0];
  const parts = {};
  for (const [name, frames] of Object.entries(ins.parts || {})) parts[name] = sample(frames, t);
  const glow = sample(ins.glow, t)?.[0] ?? 1;
  if (ins.jitter && glow > 1.2) { // overcharge: the blade buzzes harder the brighter it gets
    const a = (glow - 1.2) * 0.0018;
    pose[0] += (Math.random() - 0.5) * a; pose[1] += (Math.random() - 0.5) * a; pose[5] += (Math.random() - 0.5) * a * 6;
  }
  return { pose, parts, glow };
}

// One smooth inspect per weapon: a weapon's inspects play back to back as a single animation. Each one is an
// offset from the resting pose that starts and ends at rest, so where one settles and the next sets off they
// overlap and add together: the weapon flows from one move into the next without stopping at rest. The result
// is baked into linear keyframes, so it plays like any other inspect.
const CHAIN_OVERLAP = 0.45, CHAIN_FPS = 40;
export function chainInspects(list, name = 'Inspect') {
  if (list.length < 2) return list[0];
  // Clamp each overlap to the first inspect's settle and the next one's set-off, so moves aren't cut short.
  const starts = [0];
  for (let i = 1; i < list.length; i++) {
    const a = list[i - 1], b = list[i];
    const o = Math.min(CHAIN_OVERLAP, (a.dur - a.track.at(-2)[0]) * 0.9, b.track[1][0] * 0.9);
    starts.push(starts[i - 1] + a.dur - o);
  }
  const dur = starts.at(-1) + list.at(-1).dur;
  const names = [...new Set(list.flatMap(ins => Object.keys(ins.parts || {})))];
  const track = [], glow = [], parts = Object.fromEntries(names.map(n => [n, []]));
  const n = Math.ceil(dur * CHAIN_FPS);
  for (let f = 0; f <= n; f++) {
    const t = Math.min(dur, f / CHAIN_FPS), pose = [0, 0, 0, 0, 0, 0], pp = Object.fromEntries(names.map(k => [k, [0, 0, 0, 0, 0, 0, 1]]));
    let g = 1;
    list.forEach((ins, i) => {
      const lt = t - starts[i];
      // An inspect not yet started is at rest; one that's over holds its last frame (a part may end a full turn round).
      const p = inspectPose({ ...ins, jitter: false }, Math.max(0, Math.min(ins.dur, lt)));
      for (let j = 0; j < 6; j++) pose[j] += p.pose[j];
      for (const k of names) {
        const v = p.parts[k];
        if (!v) continue;
        for (let j = 0; j < 6; j++) pp[k][j] += v[j] ?? 0;
        pp[k][6] *= v[6] ?? 1;
      }
      g += p.glow - 1;
    });
    track.push(L(t, ...pose));
    glow.push(L(t, g));
    for (const k of names) parts[k].push(L(t, ...pp[k]));
  }
  const out = { name, dur, track, glow, jitter: list.some(ins => ins.jitter), moves: list.map(ins => ins.name), from: list };
  if (names.length) out.parts = parts;
  return out;
}

for (const m of Object.values(MELEE)) m.inspects = [chainInspects(m.inspects)];
for (const [id, set] of Object.entries(MODEL_INSPECTS)) MODEL_INSPECTS[id] = [chainInspects(set)];
