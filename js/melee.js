// Melee types: cosmetic models for the knife slot (they all hit like the knife), each with its own set of
// inspect animations. Press inspect (Y) to play the first one, press it again mid-animation to chain into the
// next, and hold it to take the weapon in hand and turn it with the mouse.
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

// Inspects that come with a gun model (model skins, see `models` in skins.js), by design id.
export const MODEL_INSPECTS = {
  // Orbital Vandal: the orb floats straight up out of the reactor ring and hovers, turning, while the gun is brought
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
