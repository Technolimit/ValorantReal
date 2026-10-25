// Player settings, saved in localStorage.

const KEY = 'tapfire-settings-v1';

export const DEFAULTS = {
  sensitivity: 0.4, // same scale as Valorant (0.07 degrees per count per 1.0)
  zoomSensMult: 1.0, // scoped/ADS multiplier, applied on top of zoom-ratio scaling
  invertY: false,
  adsMode: 'hold', // 'hold' | 'toggle'
  walkMode: 'hold',
  crouchMode: 'hold',
  wheel: 'weapons', // 'weapons' | 'jump'
  volume: 0.6,
  showImpacts: true,
  impactSeconds: 6,
  damageNumbers: true,
  debug: false,
  recoilFeel: 1, // physical recoil strength (camera punch, gun kick); 0 turns it off
  sprayTrainer: true, // overlay that draws the spray pattern and where your shots went
  shadows: true,
  renderScale: 1,
  // crosshair
  chColor: '#00ff9c',
  chOutline: true,
  chDot: false,
  chLength: 5,
  chThickness: 2,
  chGap: 3,
  chError: 'off', // 'off' | 'firing' (lines spread with movement and firing error)
  // match
  botCount: 6,
  difficulty: 'normal',
  botMode: 'fight',
  botWeapons: 'rifles',
  killLimit: 40,
  timeMinutes: 6,
  loadout: { primary: 'vandal', secondary: 'classic' },
  skins: {}, // weapon id -> skin id (see skins.js)
  agent: 'zephyr',
  mode: 'dm', // 'dm' | 'rounds'
  map: 'arena', // deathmatch map
  side: 'random', // 5v5 starting side
  // online
  netName: 'Player',
  netColor: '#6aa7ff',
  netTransport: 'local', // 'local' (BroadcastChannel) | 'peer' (PeerJS)
};

export function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...DEFAULTS, ...s, loadout: { ...DEFAULTS.loadout, ...(s.loadout || {}) }, skins: { ...(s.skins || {}) } };
  } catch {
    return { ...DEFAULTS, loadout: { ...DEFAULTS.loadout }, skins: {} };
  }
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}
