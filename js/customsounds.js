// Your own sound files for each gun (fire, reload, equip), kept in this browser's IndexedDB.
// Keys look like 'vandal:fire'. Values: { name, data: ArrayBuffer }.

const DB = 'tapfire-sounds', STORE = 'clips';
export const SLOTS = [['fire', 'Fire'], ['reload', 'Reload'], ['equip', 'Equip'], ['inspect', 'Inspect']];
export const MAX_BYTES = 4 * 1024 * 1024;

let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    if (!globalThis.indexedDB) { rej(new Error('This browser has no IndexedDB, so sounds can\'t be saved')); return; }
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}

function run(mode, fn) {
  return db().then((d) => new Promise((res, rej) => {
    const tx = d.transaction(STORE, mode), st = tx.objectStore(STORE);
    const r = fn(st);
    tx.oncomplete = () => res(r?.result);
    tx.onerror = () => rej(tx.error);
  }));
}

// Every saved clip, as a Map key -> { name, data }.
export async function loadClips() {
  const out = new Map();
  try {
    await db().then((d) => new Promise((res, rej) => {
      const r = d.transaction(STORE).objectStore(STORE).openCursor();
      r.onsuccess = () => { const c = r.result; if (!c) { res(); return; } out.set(c.key, c.value); c.continue(); };
      r.onerror = () => rej(r.error);
    }));
  } catch { /* storage unavailable: just no custom sounds */ }
  return out;
}

export const saveClip = (key, clip) => run('readwrite', (st) => st.put(clip, key));
export const deleteClip = (key) => run('readwrite', (st) => st.delete(key));
export const clearClips = () => run('readwrite', (st) => st.clear());

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
