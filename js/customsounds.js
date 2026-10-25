// Sound files for each gun (fire, reload, equip, inspect) that ship with the game in sounds/.

export const SLOTS = [['fire', 'Fire'], ['reload', 'Reload'], ['equip', 'Equip'], ['inspect', 'Inspect']];

// The game's own sound files, for every player: sounds/index.json maps a gun id to files in sounds/ per slot,
// e.g. { "vandal": { "fire": "vandal-fire.mp3" } }. Gives a Map 'vandal:fire' -> { name, data }; anything
// missing or broken is skipped (that slot keeps the built-in sound).
export async function loadGameSounds(guns) {
  const out = new Map();
  let manifest;
  try {
    const r = await fetch('sounds/index.json', { cache: 'no-cache' });
    if (!r.ok) return out;
    manifest = await r.json();
  } catch { return out; }
  const slots = new Set(SLOTS.map(([s]) => s));
  await Promise.all(Object.entries(manifest || {}).flatMap(([gun, files]) => {
    if (!guns[gun] || !files || typeof files !== 'object') return [];
    return Object.entries(files).filter(([slot, f]) => slots.has(slot) && typeof f === 'string' && !/^[a-z]+:|^\/|\.\./i.test(f)).map(async ([slot, f]) => {
      try {
        const r = await fetch(`sounds/${f.split('/').map(encodeURIComponent).join('/')}`);
        if (r.ok) out.set(`${gun}:${slot}`, { name: f, data: await r.arrayBuffer() });
      } catch { /* missing file: keep the built-in sound */ }
    });
  }));
  return out;
}
