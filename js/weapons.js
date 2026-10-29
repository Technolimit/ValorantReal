// Weapon table. Damage brackets are [maxRange m, head, body, leg]; the last bracket covers anything farther.
// Shotgun brackets are per pellet (Shorty 22/11/9 and Bucky 34/17/14 up close, as after patch 12.09).
// Spread values are cone half-angles in degrees:
//   hip / ads   first-shot spread standing still
//   run / walk  extra error at full run speed and at walk speed (linear in between, zero below the deadzone)
//   air         extra error while airborne
//   deadzone    share of the gun's run speed you can still move at and keep first-shot accuracy
// fe: firing error (bloom) that ramps in from `start` to `end` consecutive shots, up to `max` degrees.
// recoil: a fixed, learnable spray pattern per weapon (same every spray, plus a little jitter):
//   v / tail   vertical (pitch) kick in degrees for each shot of the spray; `tail` once the table runs out.
//   h          horizontal path as [shot, degrees] waypoints, linear in between. Positive drifts LEFT,
//              negative RIGHT. The pattern holds still past the last waypoint unless `loop` is set.
//   loop       shot index the horizontal path repeats from once it runs out (long mags: Spectre, Ares, Odin).
//   hJit       random horizontal noise per shot, degrees (keeps it from feeling robotic).
//   vJit       random vertical noise per shot, as a share of that shot's kick.
// Pull down against the climb, then counter the sideways path: the spray trainer overlay (settings) draws
// the pattern and where your own bullets went. Directions follow published spray guides (e.g. Vandal: first
// three on target, then up and left, then back right; Phantom: right first, then up and left; Spectre and
// Bulldog climb left; Stinger right then sharply left; Ares right then left; Odin climbs left with a
// random-feeling sway, hence its larger hJit). Exact per-shot angles are estimates, not Riot data.
// reload / reloadOne: full reload, and the shorter one when only one round is missing (Outlaw). A magazine
//   reload can't be cut short by firing (only by switching weapons), as in Valorant.
// perRound: loads one round at a time instead (Bucky, Marshal): `first` seconds to open up, then `each` per
//   round, so an empty gun takes `reload` seconds. Every loaded round can be fired straight away, which cancels
//   the rest.
// equip / reload / fire rates / magazines follow the official VALORANT wiki (wiki.playvalorant.com).
// recovery: seconds to settle back to first-shot accuracy after you stop firing.
// ADS (alt zoom / scope): rateMult slows fire while aimed in; recoil shrinks to ADS_RECOIL of hip recoil and
// the view follows the full climb (the crosshair tracks where bullets go). Zooms as in Valorant: Operator
// 2.5x/5x, Outlaw and Marshal 3.5x; Warden 2x; Guardian 1.5x; Bulldog, Phantom, Vandal 1.25x; Stinger,
// Spectre, Ares, Odin 1.15x. A zoom of N divides the horizontal FOV by N (see Renderer.vfov).
// Burst alt-fires (zoomBurst): `interval` between rounds of a burst, `cooldown` after it; Stinger and Bulldog
// are tuned to Valorant's ADS fire rates (8.47 and 6.32 rounds/s over a full burst cycle).

const RIFLE_MOVE = 5.4;
const LIGHT_MOVE = 5.73;
const HEAVY_MOVE = 5.13;

export const WEAPONS = {
  knife: {
    name: 'Knife', cat: 'Melee', slot: 'melee', cost: 0, model: 'knife', move: 6.75, equip: 0.6,
    melee: { range: 2.0, primary: { dmg: 50, back: 100, cycle: 0.5 }, alt: { dmg: 75, back: 150, cycle: 1.0, windup: 0.18 } },
  },

  // Sidearms
  classic: {
    name: 'Classic', cat: 'Sidearm', slot: 'secondary', cost: 0, model: 'pistol', auto: false,
    rate: 6.75, mag: 12, reserve: 36, reload: 1.75, equip: 0.75, pen: 'low', move: LIGHT_MOVE,
    dmg: [[30, 78, 26, 22], [50, 66, 22, 18]],
    spread: { hip: 0.4, ads: 0.4, run: 1.1, walk: 0.75, air: 3.0, deadzone: 0.3 },
    fe: { max: 1.6, start: 1, end: 5 }, recovery: 0.22,
    recoil: { v: [0.6, 0.6, 0.55, 0.5, 0.45, 0.4], tail: 0.3, h: [[0,0],[3,0.2],[6,-0.6],[9,0.5],[12,-0.4]], hJit: 0.06, vJit: 0.06 },
    alt: { type: 'burst', count: 3, interval: 0.05, cooldown: 0.35, spread: 1.9 },
  },
  shorty: {
    name: 'Shorty', cat: 'Sidearm', slot: 'secondary', cost: 300, model: 'shotgun', auto: false,
    rate: 3.33, mag: 2, reserve: 6, reload: 1.75, equip: 0.75, pen: 'low', move: LIGHT_MOVE, pellets: 15,
    dmg: [[7, 22, 11, 9], [15, 16, 8, 6], [50, 6, 3, 2]],
    spread: { hip: 4.0, ads: 4.0, run: 0.5, walk: 0.3, air: 1.5, deadzone: 0.3 },
    fe: { max: 0, start: 0, end: 1 }, recovery: 0.3,
    recoil: { v: [2.5], tail: 2.0, h: [[0,0],[1,0.15],[2,-0.1]], hJit: 0.25, vJit: 0.08 },
    alt: { type: 'none' },
  },
  frenzy: {
    name: 'Frenzy', cat: 'Sidearm', slot: 'secondary', cost: 450, model: 'pistol', auto: true,
    rate: 10, mag: 13, reserve: 26, reload: 1.5, equip: 1.0, pen: 'low', move: LIGHT_MOVE,
    dmg: [[20, 78, 26, 22], [50, 63, 21, 17]],
    spread: { hip: 0.45, ads: 0.45, run: 1.3, walk: 0.8, air: 3.0, deadzone: 0.3 },
    fe: { max: 2.2, start: 2, end: 7 }, recovery: 0.25,
    recoil: { v: [0.45, 0.55, 0.6, 0.55, 0.5, 0.4], tail: 0.15, h: [[0,0],[2,0.1],[5,0.9],[7,1.0],[10,-0.4],[13,-1.2]], hJit: 0.14, vJit: 0.08 },
    alt: { type: 'none' },
  },
  ghost: {
    name: 'Ghost', cat: 'Sidearm', slot: 'secondary', cost: 500, model: 'pistol', auto: false, suppressed: true,
    rate: 6.75, mag: 13, reserve: 39, reload: 1.5, equip: 0.75, pen: 'medium', move: LIGHT_MOVE,
    dmg: [[30, 105, 30, 25], [50, 87, 25, 21]],
    spread: { hip: 0.3, ads: 0.2, run: 1.6, walk: 1.0, air: 3.5, deadzone: 0.3 },
    fe: { max: 1.2, start: 1, end: 5 }, recovery: 0.22,
    recoil: { v: [0.5, 0.6, 0.6, 0.5, 0.4], tail: 0.25, h: [[0,0],[3,-0.15],[7,0.5],[11,-0.4],[15,0.3]], hJit: 0.05, vJit: 0.06 },
    alt: { type: 'none' }, // no aim-down-sights in Valorant
  },
  sheriff: {
    name: 'Sheriff', cat: 'Sidearm', slot: 'secondary', cost: 800, model: 'revolver', auto: false,
    rate: 4, mag: 6, reserve: 24, reload: 2.25, equip: 1.0, pen: 'high', move: LIGHT_MOVE,
    dmg: [[30, 159, 55, 46], [50, 145, 50, 42]],
    spread: { hip: 0.25, ads: 0.25, run: 3.0, walk: 1.6, air: 6.0, deadzone: 0.3 },
    fe: { max: 2.4, start: 1, end: 3 }, recovery: 0.4,
    recoil: { v: [2.4, 2.2, 2.0, 1.6, 1.2], tail: 1.0, h: [[0,0],[2,0.3],[4,-0.5],[6,0.2]], hJit: 0.12, vJit: 0.06 },
    alt: { type: 'none' }, // no aim-down-sights in Valorant
  },

  // SMGs
  stinger: {
    name: 'Stinger', cat: 'SMG', slot: 'primary', cost: 1100, model: 'smg', auto: true,
    rate: 16, mag: 20, reserve: 60, reload: 2.25, equip: 0.75, pen: 'low', move: LIGHT_MOVE,
    dmg: [[15, 67, 27, 22], [50, 62, 25, 21]],
    spread: { hip: 0.65, ads: 0.5, run: 2.0, walk: 1.2, air: 4.0, deadzone: 0.3 },
    fe: { max: 2.4, start: 2, end: 8 }, recovery: 0.3,
    recoil: { v: [0.3, 0.4, 0.45, 0.4, 0.35, 0.3, 0.3, 0.3, 0.35, 0.45, 0.5, 0.45, 0.35], tail: 0.2, h: [[0,0],[2,0],[6,-1.1],[9,-1.5],[13,0.5],[17,2.1],[20,2.5]], hJit: 0.08, vJit: 0.07 },
    alt: { type: 'zoomBurst', zoom: 1.15, time: 0.2, moveMult: 0.76, count: 4, interval: 0.0625, cooldown: 0.2847 },
  },
  spectre: {
    name: 'Spectre', cat: 'SMG', slot: 'primary', cost: 1600, model: 'smg', auto: true, suppressed: true,
    rate: 13.33, mag: 30, reserve: 90, reload: 2.25, equip: 0.75, pen: 'medium', move: LIGHT_MOVE,
    dmg: [[20, 78, 26, 22], [50, 66, 22, 18]],
    spread: { hip: 0.4, ads: 0.25, run: 1.6, walk: 1.0, air: 4.0, deadzone: 0.3 },
    fe: { max: 1.4, start: 3, end: 9 }, recovery: 0.3,
    recoil: { v: [0.08, 0.12, 0.18, 0.28, 0.34, 0.36, 0.36, 0.32, 0.3, 0.26, 0.24, 0.2], tail: 0.1, h: [[0,0],[4,0.05],[9,0.5],[11,0.9],[13,0.5],[16,1.6],[19,1.2],[23,2.3],[27,2.0],[30,2.6]], hJit: 0.09, vJit: 0.06 },
    alt: { type: 'zoom', zoom: 1.15, time: 0.2, rateMult: 0.9, moveMult: 0.76 },
  },

  // Shotguns
  bucky: {
    name: 'Bucky', cat: 'Shotgun', slot: 'primary', cost: 850, model: 'shotgun', auto: false,
    rate: 1.1, mag: 5, reserve: 10, reload: 2.5, perRound: { first: 0.25, each: 0.45 }, equip: 1.0, pen: 'low', move: LIGHT_MOVE, pellets: 15,
    dmg: [[8, 34, 17, 14], [12, 26, 13, 11], [50, 18, 9, 7]],
    spread: { hip: 3.0, ads: 3.0, run: 0.5, walk: 0.3, air: 1.5, deadzone: 0.3 },
    fe: { max: 0, start: 0, end: 1 }, recovery: 0.5,
    recoil: { v: [3.0], tail: 3.0, h: [[0,0],[1,0.2],[2,-0.1]], hJit: 0.3, vJit: 0.08 },
    alt: { type: 'none' },
  },
  judge: {
    name: 'Judge', cat: 'Shotgun', slot: 'primary', cost: 1850, model: 'shotgun', auto: true,
    rate: 3.5, mag: 5, reserve: 15, reload: 2.2, equip: 1.0, pen: 'medium', move: LIGHT_MOVE, pellets: 12,
    dmg: [[10, 34, 17, 14], [15, 26, 13, 11], [50, 20, 10, 8]],
    spread: { hip: 2.5, ads: 2.5, run: 0.5, walk: 0.3, air: 1.5, deadzone: 0.3 },
    fe: { max: 0.6, start: 1, end: 4 }, recovery: 0.4,
    recoil: { v: [1.8, 1.5, 1.2, 1.0], tail: 0.8, h: [[0,0],[2,-0.4],[4,0.6],[7,-0.3]], hJit: 0.15, vJit: 0.07 },
    alt: { type: 'none' },
  },

  // Rifles
  bulldog: {
    name: 'Bulldog', cat: 'Rifle', slot: 'primary', cost: 2050, model: 'rifle', auto: true,
    rate: 9.15, mag: 24, reserve: 72, reload: 2.5, equip: 1.0, pen: 'medium', move: RIFLE_MOVE,
    dmg: [[50, 115, 35, 29]],
    spread: { hip: 0.3, ads: 0.15, run: 5.0, walk: 2.2, air: 8.0, deadzone: 0.27 },
    fe: { max: 1.4, start: 3, end: 8 }, recovery: 0.35,
    recoil: { v: [0.05, 0.1, 0.15, 0.6, 0.75, 0.75, 0.65, 0.55, 0.4], tail: 0.1, h: [[0,0],[3,0],[8,0.7],[13,1.5],[18,2.0],[24,2.3]], hJit: 0.06, vJit: 0.05 },
    alt: { type: 'zoomBurst', zoom: 1.25, time: 0.2, moveMult: 0.76, count: 3, interval: 0.0625, cooldown: 0.35 },
  },
  guardian: {
    name: 'Guardian', cat: 'Rifle', slot: 'primary', cost: 2250, model: 'dmr', auto: false,
    rate: 6.5, mag: 12, reserve: 36, reload: 2.5, equip: 1.0, pen: 'high', move: RIFLE_MOVE,
    dmg: [[50, 195, 65, 49]],
    spread: { hip: 0.1, ads: 0.03, run: 5.0, walk: 2.2, air: 8.0, deadzone: 0.27 },
    fe: { max: 0.6, start: 1, end: 4 }, recovery: 0.3,
    recoil: { v: [1.1, 1.1, 1.0, 1.0, 0.9], tail: 0.6, h: [[0,0],[3,-0.2],[6,0.6],[9,0.9],[12,-0.3]], hJit: 0.05, vJit: 0.05 },
    alt: { type: 'zoom', zoom: 1.5, time: 0.2, rateMult: 1, moveMult: 0.76 },
  },
  phantom: {
    name: 'Phantom', cat: 'Rifle', slot: 'primary', cost: 2900, model: 'rifle', auto: true, suppressed: true,
    rate: 11, mag: 30, reserve: 60, reload: 2.5, equip: 1.0, pen: 'medium', move: RIFLE_MOVE,
    dmg: [[15, 156, 39, 33], [30, 140, 35, 29], [50, 124, 31, 26]],
    spread: { hip: 0.2, ads: 0.11, run: 5.0, walk: 2.2, air: 8.0, deadzone: 0.27 },
    fe: { max: 1.1, start: 4, end: 10 }, recovery: 0.32,
    recoil: { v: [0.05, 0.1, 0.2, 0.35, 0.5, 0.55, 0.55, 0.5, 0.45, 0.35, 0.25, 0.15, 0.1], tail: 0.05, h: [[0,0],[5,-0.1],[10,-0.8],[14,-1.0],[18,0.2],[23,1.4],[30,1.8]], hJit: 0.05, vJit: 0.05 },
    alt: { type: 'zoom', zoom: 1.25, time: 0.2, rateMult: 0.9, moveMult: 0.76 },
  },
  vandal: {
    name: 'Vandal', cat: 'Rifle', slot: 'primary', cost: 2900, model: 'rifle', auto: true,
    rate: 9.75, mag: 25, reserve: 50, reload: 2.5, equip: 1.0, pen: 'medium', move: RIFLE_MOVE,
    dmg: [[50, 160, 40, 34]],
    spread: { hip: 0.25, ads: 0.157, run: 5.0, walk: 2.2, air: 8.0, deadzone: 0.27 },
    fe: { max: 1.6, start: 3, end: 9 }, recovery: 0.375,
    recoil: { v: [0.05, 0.1, 0.15, 0.6, 0.85, 0.9, 0.85, 0.75, 0.6, 0.4, 0.25], tail: 0.06, h: [[0,0],[3,0],[7,0.8],[11,1.6],[14,1.7],[18,0.6],[22,-0.6],[25,-1.0]], hJit: 0.05, vJit: 0.05 },
    alt: { type: 'zoom', zoom: 1.25, time: 0.2, rateMult: 0.9, moveMult: 0.76 },
  },
  warden: {
    name: 'Warden', cat: 'Rifle', slot: 'primary', cost: 2900, model: 'dmr', auto: true,
    rate: 6.5, mag: 18, reserve: 36, reload: 2.5, equip: 1.0, pen: 'medium', move: RIFLE_MOVE,
    dmg: [[50, 200, 50, 42]],
    spread: { hip: 0.15, ads: 0.04, run: 5.0, walk: 2.2, air: 8.0, deadzone: 0.27 },
    fe: { max: 0.8, start: 2, end: 6 }, recovery: 0.35,
    recoil: { v: [0.9, 1.0, 1.0, 0.9, 0.8, 0.6, 0.4], tail: 0.1, h: [[0,0],[3,0.2],[6,-0.6],[10,-1.1],[14,0.5],[18,1.0]], hJit: 0.05, vJit: 0.05 },
    alt: { type: 'zoom', zoom: 2.0, time: 0.25, rateMult: 1, moveMult: 0.76, scopeView: true }, // aims through a scope, like a sniper
  },

  // Snipers
  marshal: {
    name: 'Marshal', cat: 'Sniper', slot: 'primary', cost: 950, model: 'sniper', auto: false,
    rate: 1.5, mag: 5, reserve: 10, reload: 2.5, perRound: { first: 0.25, each: 0.45 }, equip: 1.25, pen: 'medium', move: RIFLE_MOVE,
    dmg: [[50, 202, 101, 85]],
    spread: { hip: 1.0, ads: 0, run: 5.0, walk: 2.5, air: 8.0, deadzone: 0.27 },
    fe: { max: 1.0, start: 0, end: 1 }, recovery: 0.5,
    recoil: { v: [3.5], tail: 3.5, h: [[0,0],[1,0.1],[2,-0.1]], hJit: 0.3, vJit: 0.06 },
    alt: { type: 'scope', levels: [3.5], time: 0.3, moveMult: 0.76, rateMult: 0.8 }, // 1.5 -> 1.2 rounds/s scoped
  },
  outlaw: {
    name: 'Outlaw', cat: 'Sniper', slot: 'primary', cost: 2400, model: 'sniper', auto: false,
    rate: 2.75, mag: 2, reserve: 10, reload: 3.8, reloadOne: 2.3, equip: 1.25, pen: 'high', move: RIFLE_MOVE,
    dmg: [[50, 238, 140, 119]],
    spread: { hip: 1.5, ads: 0, run: 6.0, walk: 3.0, air: 10.0, deadzone: 0.27 },
    fe: { max: 1.0, start: 0, end: 1 }, recovery: 0.4,
    recoil: { v: [3.0, 3.0], tail: 3.0, h: [[0,0],[1,-0.15],[2,0.15]], hJit: 0.3, vJit: 0.06 },
    alt: { type: 'scope', levels: [3.5], time: 0.3, moveMult: 0.76 },
  },
  operator: {
    name: 'Operator', cat: 'Sniper', slot: 'primary', cost: 4700, model: 'sniper', auto: false,
    rate: 0.6, mag: 5, reserve: 10, reload: 3.7, equip: 1.5, pen: 'high', move: HEAVY_MOVE,
    dmg: [[50, 255, 150, 127]],
    spread: { hip: 5.0, ads: 0, run: 8.0, walk: 4.0, air: 15.0, deadzone: 0.27 },
    fe: { max: 2.0, start: 0, end: 1 }, recovery: 0.6,
    recoil: { v: [5.0], tail: 5.0, h: [[0,0],[1,0.1],[2,-0.1]], hJit: 0.4, vJit: 0.06 },
    alt: { type: 'scope', levels: [2.5, 5], time: 0.35, moveMult: 0.72 }, // 72% speed scoped (~3.69 m/s)
  },

  // Heavies. The Odin's fire rate spins up while you hold the trigger (aimed in it starts at full speed); the
  // Ares has had no spin-up since patch 4.0 and fires a flat 13 rounds/s.
  ares: {
    name: 'Ares', cat: 'Heavy', slot: 'primary', cost: 1600, model: 'heavy', auto: true,
    rate: 13, mag: 50, reserve: 100, reload: 3.25, equip: 1.25, pen: 'high', move: HEAVY_MOVE,
    dmg: [[30, 72, 30, 25], [50, 67, 28, 23]],
    spread: { hip: 1.0, ads: 0.8, run: 3.0, walk: 1.6, air: 6.0, deadzone: 0.27 },
    fe: { max: 1.4, start: 4, end: 14 }, recovery: 0.4,
    recoil: { v: [0.15, 0.2, 0.25, 0.3, 0.3, 0.3, 0.25, 0.2, 0.2, 0.15, 0.1], tail: 0.05, h: [[0,0],[4,-0.2],[10,-0.9],[16,-1.2],[22,-0.4],[30,0.9],[38,1.6],[50,2.0]], hJit: 0.08, vJit: 0.07 },
    alt: { type: 'zoom', zoom: 1.15, time: 0.25, rateMult: 1, moveMult: 0.76 },
  },
  odin: {
    name: 'Odin', cat: 'Heavy', slot: 'primary', cost: 3200, model: 'heavy', auto: true,
    rate: 12, spin: { to: 15.6, time: 1.0, adsInstant: true }, mag: 100, reserve: 200, reload: 5.0, equip: 1.25, pen: 'high', move: HEAVY_MOVE,
    dmg: [[30, 95, 38, 32], [50, 77, 31, 26]],
    spread: { hip: 0.8, ads: 0.5, run: 3.5, walk: 1.8, air: 6.0, deadzone: 0.27 },
    fe: { max: 1.8, start: 5, end: 16 }, recovery: 0.4,
    recoil: { v: [0.08, 0.12, 0.16, 0.3, 0.4, 0.42, 0.4, 0.35, 0.3, 0.25, 0.2, 0.15], tail: 0.06, h: [[0,0],[6,0.05],[12,0.8],[18,1.6],[26,2.0],[34,1.2],[42,2.2]], loop: 26, hJit: 0.13, vJit: 0.07 },
    alt: { type: 'zoom', zoom: 1.15, time: 0.25, rateMult: 1, moveMult: 0.76 },
  },

  // Ability weapons (Regent): not in the buy menu.
  headhunter: {
    name: 'Sovereign', cat: 'Ability', slot: 'ability', cost: 0, model: 'revolver', auto: false, ability: true,
    rate: 4, mag: 8, reserve: 0, reload: 1, equip: 0.5, pen: 'medium', move: LIGHT_MOVE,
    dmg: [[30, 159, 55, 46], [50, 145, 50, 42]],
    spread: { hip: 0.2, ads: 0.05, run: 2.5, walk: 1.4, air: 5.0, deadzone: 0.3 },
    fe: { max: 1.5, start: 1, end: 4 }, recovery: 0.35,
    recoil: { v: [1.6, 1.4, 1.2], tail: 1.0, h: [[0, 0], [2, 0.2], [4, -0.2]], hJit: 0.1, vJit: 0.06 },
    alt: { type: 'zoom', zoom: 1.5, time: 0.15, rateMult: 1, moveMult: 0.76 },
  },
  tourdeforce: {
    name: 'Coup de Grace', cat: 'Ability', slot: 'ability', cost: 0, model: 'sniper', auto: false, ability: true,
    rate: 0.9, mag: 5, reserve: 0, reload: 1, equip: 0.8, pen: 'high', move: HEAVY_MOVE,
    dmg: [[50, 255, 150, 127]],
    spread: { hip: 3.0, ads: 0, run: 6.0, walk: 3.0, air: 10.0, deadzone: 0.27 },
    fe: { max: 1.0, start: 0, end: 1 }, recovery: 0.5,
    recoil: { v: [4.0], tail: 4.0, h: [[0, 0], [1, 0.1], [2, -0.1]], hJit: 0.3, vJit: 0.06 },
    alt: { type: 'scope', levels: [3.5], time: 0.3, moveMult: 0.76 },
  },
};

for (const [id, w] of Object.entries(WEAPONS)) w.id = id;

export const BUY_GROUPS = [
  ['Sidearms', ['classic', 'shorty', 'frenzy', 'ghost', 'sheriff']],
  ['SMGs', ['stinger', 'spectre']],
  ['Shotguns', ['bucky', 'judge']],
  ['Rifles', ['bulldog', 'guardian', 'phantom', 'vandal', 'warden']],
  ['Snipers', ['marshal', 'outlaw', 'operator']],
  ['Heavies', ['ares', 'odin']],
];

export function damageAt(def, dist) {
  for (const b of def.dmg) if (dist <= b[0]) return b;
  return def.dmg[def.dmg.length - 1];
}
