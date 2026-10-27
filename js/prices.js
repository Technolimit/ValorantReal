// 5v5 ability prices, taken from the official VALORANT wiki's ability list (wiki.playvalorant.com/en-us/Abilities,
// checked October 2026). Each of our agents is priced like the Valorant agent whose kit it mirrors, ability by
// ability: [credits per charge, max charges you can hold, free charges handed out each round].
// Signatures (E) are free and refill every round unless they're listed here as purchasable.
export const PRICES = {
  zephyr:   { c: [200, 2], q: [150, 1] },                         // Jett: Cloudburst, Updraft
  cinder:   { c: [150, 1], q: [200, 1], e: [250, 2, 1] },         // Phoenix: Blaze, Hot Hands (Q), Curveball (E: signature, 1 free)
  umbra:    { c: [100, 2], q: [250, 1], e: [150, 2, 1] },         // Omen: Shrouded Step (C), Paranoia (Q), Dark Cover (E, 1 free)
  hawke:    { c: [400, 1], q: [150, 2] },                         // Sova: Owl Drone (C), Shock Bolt (Q)
  bastion:  { c: [200, 2], q: [200, 1] },                         // Killjoy: Nanoswarm, Alarmbot
  blitz:    { c: [300, 1], q: [200, 2] },                         // Raze: Boom Bot, Blast Pack
  granite:  { c: [200, 1], q: [250, 1], e: [100, 3, 1] },         // Brimstone: Stim Beacon, Incendiary, Sky Smoke (1 free)
  venom:    { c: [300, 1], q: [200, 1] },                         // Viper: Snake Bite, Poison Cloud
  vex:      { c: [250, 2], q: [200, 2, 1] },                      // Reyna: Leer, Devour + Dismiss (one shared pool, 1 free)
  quake:    { c: [200, 1], q: [250, 2] },                         // Breach: Aftershock, Flashpoint
  volt:     { c: [300, 1], q: [200, 1] },                         // Neon: Fast Lane, Relay Bolt
  mirage:   { c: [200, 1], q: [250, 1] },                         // Yoru: Fakeout, Blindside
  fawn:     { c: [150, 1], q: [300, 1] },                         // Skye: Regrowth, Trailblazer
  lattice:  { c: [200, 2], q: [100, 2] },                         // Cypher: Trapwire, Cyber Cage
  nyx:      { c: [250, 2], q: [200, 1] },                         // Fade: Prowler, Seize
  solace:   { c: [300, 1], q: [200, 2] },                         // Sage: Barrier Orb, Slow Orb
  stella:   { c: [150, 1], q: [150, 1] },                         // Astra: stars, 150 each
  regent:   { c: [200, 1], q: [100, 8], bullets: 'q' },           // Chamber: Trademark, Headhunter (100 per bullet, 8 max)
  marina:   { c: [200, 1], q: [300, 1] },                         // Harbor: Storm Surge, High Tide (Q); Cove is the signature (E)
  vanta:    { c: [200, 1], q: [300, 1] },                         // Iso: Contingency, Undercut
  ballast:  { c: [400, 1], q: [200, 1], e: [150, 2, 1] },         // Tejo: Stealth Drone, Special Delivery, Guided Salvo (1 free)
  override: { c: [200, 1], q: [250, 2] },                         // KAY/O: FRAG/ment, FLASH/drive
  thistle:  { c: [200, 1], q: [250, 1], e: [150, 2, 1] },         // Clove: Pick-me-up, Meddle, Ruse (1 free)
  lumen:    { c: [300, 1], q: [300, 1] },                         // Waylay: Saturate, Lightspeed
};

// { cost, max, free } for one ability slot in round mode. cost is null when it can't be bought.
export function priceOf(agentId, ab, k) {
  const p = PRICES[agentId]?.[k];
  if (p) return { cost: p[0], max: p[1], free: p[2] ?? 0 };
  if (k === 'e') return { cost: null, max: ab.charges, free: ab.charges };
  return { cost: k === 'c' ? 200 : 250, max: ab.charges, free: 0 };
}
