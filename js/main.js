// Entry point: input, menus, settings UI and the fixed-tick game loop.
import { Game } from './game.js';
import { Renderer } from './render.js';
import { Sound } from './audio.js';
import { Hud } from './hud.js';
import { loadSettings, saveSettings, DEFAULTS } from './settings.js';
import { ACTIONS, FIXED, DEFAULT_BINDS, actionFor, rebind, keyLabel } from './keybinds.js';
import { DT, YAW_PER_COUNT } from './config.js';
import { WEAPONS, BUY_GROUPS } from './weapons.js';
import { SKINS, SKIN_ORDER, skinFor, swatch, isCustom, saveCustomSkin, deleteCustomSkin, skinCode, parseSkinCode, sanitizeSkin, registerSkin, PATTERNS } from './skins.js';
import { GunPreview } from './models.js';
import { MELEE, MELEE_ORDER, isMelee, meleeId } from './melee.js';
import { RELOAD_STYLE, RELOAD_SOUNDS } from './reloadanim.js';
import { loadGameSounds } from './customsounds.js';
import { AGENTS, AGENT_ORDER, Kit } from './abilities.js';
import { ROUND } from './rounds.js';
import { Minimap } from './minimap.js';
import { RoundHud } from './roundhud.js';
import { MAPS, loadMapIndex, preloadMap, mapList, mapInfo, mapJSON, addMap, removeCustomMap, supportsMode, upgradeMap, stringifyMap } from './map.js';
import { NetSession, roomCode, peerOptions } from './net.js';
import { Lobby, SelectScreen, emblem } from './agentselect.js';
import { ServerDirectory } from './servers.js';

const DEG = Math.PI / 180;
const $ = (id) => document.getElementById(id);

const settings = loadSettings();
// Maps come from maps/index.json; the default one must be loaded before the game can be built.
try {
  await loadMapIndex();
  await preloadMap('arena');
} catch (err) {
  document.body.insertAdjacentHTML('beforeend', `<div class="overlay"><div class="panel"><h2>Couldn't load the maps</h2><p class="note">${String(err.message).replace(/</g, '&lt;')}</p><p class="note">Serve this folder over HTTP (for example <code>npx serve</code> or <code>python3 -m http.server</code>) instead of opening index.html from disk, since browsers block fetch and modules on file:// pages.</p></div></div>`);
  throw err;
}
if (!mapInfo(settings.map)) settings.map = 'arena';
const game = new Game();
const canvas = $('view');
const renderer = new Renderer(canvas, game, settings);
const sound = new Sound();
sound.setVolume(settings.volume);
// The game's own sound files from sounds/index.json, which everyone hears.
loadGameSounds(WEAPONS).then((clips) => { for (const [key, c] of clips) sound.setClip(`${key}@game`, c.data); });
const hud = new Hud(game, renderer, settings);
const rhud = new RoundHud(game);
const minimap = new Minimap(game);
renderer.spectate = () => rhud.spectateTarget();
const net = new NetSession(game, {
  onStatus: (msg) => netStatus(msg),
  onWelcome: (w) => joinedMatch(w),
  onEnd: () => {},
  onLeft: (why) => { if (running) { running = false; game.state = 'idle'; } netStatus(why, true); updateMenuLoadout(); show('online'); },
  onRoster: () => updateNetBadge(),
  onBuy: (err) => { rhud.shopKey = ''; if (err) hud.center(`<small>${escHtml(err).toUpperCase()}</small>`); else sound.click(0, 0.25); },
  onLobby: (state, me, host) => lobbyState(state, me, host),
  onLobbyDone: (lobby) => startFromLobby(lobby),
  onPick: (info) => joinPick(info),
});

let running = false;
let paused = true;
let locked = false;
let acc = 0;
let last = performance.now();
let walkToggled = false;
let crouchToggled = false;
let settingsReturn = 'menu';
const keys = new Set();
const mouse = [false, false, false];
const look = { dx: 0, dy: 0 };

const isPlayer = (who) => who === game.player;
// Whose ears you hear through: yours, or (dead in 5v5) the teammate you're spectating. Their shots and steps
// play up close like your own; everything else is placed relative to them.
const ears = () => renderer.specTarget || game.player;
const isEars = (who) => who === ears();

// ---- sound hooks ----
game.on('shot', ({ who, gun }) => { if (isPlayer(who)) sound.stopAction(); sound.gunshot(gun.def, isEars(who) ? null : who.eye(), gun); });
game.on('footstep', ({ who }) => sound.footstep(isEars(who) ? null : who.pos, isEars(who)));
game.on('land', ({ who }) => sound.land(isEars(who) ? null : who.pos, isEars(who)));
game.on('hit', ({ attacker, target, part, killed, dot }) => {
  if (isPlayer(attacker) && !isPlayer(target) && (!dot || killed)) sound.hitConfirm(part, killed);
  if (isPlayer(target)) sound.hurt(part === 'head');
});
// The HUD's kill listener runs first (it was hooked when the HUD was built), so hud.streak already counts this kill.
game.on('kill', ({ killer, victim }) => { if (isPlayer(killer) && !isPlayer(victim) && game.isEnemy(killer, victim)) sound.killStreak(hud.streak); });
game.on('reload', ({ who, gun }) => { if (isPlayer(who)) sound.reload(gun.reloadDur, RELOAD_SOUNDS[RELOAD_STYLE[gun.def.id]], gun.def.id); });
game.on('reloadRound', ({ who }) => { if (isPlayer(who)) { sound.click(0, 0.3); sound.thunk(0.03); } });
game.on('dry', ({ who }) => { if (isPlayer(who)) sound.click(0, 0.3); });
game.on('equip', ({ who, gun }) => { if (isPlayer(who)) sound.equip(gun?.def?.id); });
game.on('swing', ({ who, heavy }) => { if (isPlayer(who)) sound.swing(heavy); });
game.on('ability', ({ who, type }) => { if (isPlayer(who)) sound.ability(type); });
game.on('smoke', ({ pos, kind }) => { if (kind !== 'fire') sound.smoke(pos); });
game.on('flash', ({ pos }) => sound.flashbang(pos));
game.on('pulse', ({ pos, type }) => sound.pulse(type === 'reveal' ? null : pos, type));
game.on('wall', ({ box }) => sound.thunk(0));
game.on('teleport', ({ who }) => { if (isPlayer(who)) sound.ability('dash'); });
game.on('trap', () => sound.pulse(null, 'trap'));
game.on('lockdown', () => sound.pulse(null, 'lockdown'));
game.on('turretShot', ({ pos }) => sound.gunshot(WEAPONS.classic, pos));
game.on('beam', () => { sound.pulse(null, 'lockdown'); sound.flashbang(null); });
game.on('alarm', ({ pos }) => sound.pulse(pos, 'trap'));
game.on('tag', () => sound.pulse(null, 'reveal'));
game.on('abilityArm', ({ who }) => { if (isPlayer(who)) sound.click(0, 0.3); });
game.on('shadowChannel', () => sound.pulse(null, 'near'));
game.on('blade', ({ who }) => { if (isPlayer(who)) sound.swing(false); });
game.on('end', () => showEnd());
game.on('planted', () => sound.sting('planted'));
game.on('live', () => sound.sting('start'));
game.on('roundEnd', (r) => { if (r.reason === 'detonated') sound.sting('detonate'); else if (r.reason === 'defused') sound.sting('defused'); setTimeout(() => sound.sting(r.winTeam === game.player.team ? 'win' : 'loss'), r.reason === 'detonated' ? 900 : 300); });
let lastBeep = 0;
function spikeBeeps() {
  const m = game.mode, sp = m?.spike;
  if (!sp || sp.state !== 'planted' || m.phase !== 'planted') return;
  const left = sp.plantedAt + ROUND.spike - game.time;
  const gap = left > 20 ? 1 : left > 10 ? 0.5 : left > 5 ? 0.25 : 0.12;
  if (game.time - lastBeep >= gap) { lastBeep = game.time; sound.beep(sp.pos, left < 10); }
}

// ---- pointer lock ----
async function lock() {
  try {
    await canvas.requestPointerLock({ unadjustedMovement: true });
  } catch {
    try { await canvas.requestPointerLock(); } catch { $('pause-hint').textContent = 'Click Resume again to capture the mouse.'; }
  }
}

document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (locked) { $('pause-hint').textContent = ''; return; }
  if (running && !paused && game.state === 'playing') pause();
});
document.addEventListener('pointerlockerror', () => { $('pause-hint').textContent = 'Click Resume again to capture the mouse.'; });

function releaseInputs() {
  keys.clear();
  mouse.fill(false);
}

function pause() {
  paused = true;
  releaseInputs();
  if (hud.buyOpen) toggleBuy(false);
  $('scoreboard').hidden = true;
  $('pause-agent').hidden = !!game.mode || net.active;
  $('restart').hidden = net.active;
  $('pause-net').hidden = !net.active;
  if (net.active) $('pause-net').textContent = `Online in room ${net.room}: the match keeps running while you're in this menu.`;
  show('pause');
}

function resume() {
  sound.init();
  show(null);
  paused = false;
  acc = 0;
  lock();
}

function show(id) {
  if (id === 'pause') $('pause-agent').textContent = `Change agent (${key('agent')})`;
  for (const o of ['menu', 'pause', 'settings', 'skins', 'agents', 'select', 'end', 'online', 'maps']) $(o).hidden = o !== id;
  $('hud').hidden = !running;
}

// ---- input ----
// Keys come from settings.binds (Settings → Keybinds, see keybinds.js).
const key = (action) => keyLabel(settings.binds[action]);

addEventListener('keydown', (e) => {
  if (!running || paused) return;
  const act = actionFor(settings.binds, e.code);
  if (act || e.ctrlKey) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  const p = game.player, inp = p.input;
  if (act === 'buy') { toggleBuy(); return; }
  if (act === 'map') { minimap.big = !minimap.big; return; }
  if (act === 'inspect') { // press again to chain the next inspect, hold to examine
    const before = renderer.inspecting;
    renderer.inspect();
    if (renderer.inspecting && renderer.inspecting !== before) sound.inspect(renderer.inspecting.gun.def.id);
    return;
  }
  if (act === 'drop') { if (p.alive) game.dropGun(p, p.slot, true); return; }
  if (act === 'agent') { if (!net.active) openAgents(true); return; } // change agent mid-match (offline only: other players' copies keep your agent)
  if (act === 'scores') { $('scoreboard').hidden = false; return; }
  if (act === 'debug') { settings.debug = !settings.debug; saveSettings(settings); return; }
  if (act === 'walk' && settings.walkMode === 'toggle') walkToggled = !walkToggled;
  if (act === 'crouch' && settings.crouchMode === 'toggle') crouchToggled = !crouchToggled;
  if (!p.alive) {
    // Some agents can still act while dead (Thistle's smokes and her ultimate).
    if (p.kit?.agent.deadCast && game.mode && (act === 'abE' || act === 'abX')) inp[act] = true;
    return;
  }
  if (act === 'jump') inp.jump = true;
  if (act === 'reload') inp.reload = true;
  if (act === 'primary' || act === 'secondary' || act === 'melee') p.equip(act, game.time);
  // Agent abilities
  if (act === 'abC' || act === 'abQ' || act === 'abE' || act === 'abX') inp[act] = true;
});

addEventListener('keyup', (e) => {
  keys.delete(e.code);
  const act = actionFor(settings.binds, e.code);
  if (act === 'scores') $('scoreboard').hidden = true;
  if (act === 'inspect') renderer.inspectRelease();
});

addEventListener('blur', releaseInputs);

document.addEventListener('mousedown', (e) => {
  if (!locked || paused) return;
  if (hud.buyOpen) { clickBuy(e.button); return; }
  if (!game.player.alive && game.mode && !hud.mapOpen) { if (e.button === 0) rhud.nextSpectate(); return; }
  if (hud.mapOpen) {
    const p = game.player;
    if (e.button === 0) hud.pickShadow(p);
    if (e.button === 2 && p.kit?.mapPick) { if (p.kit.mapPick.picks?.length) p.kit.mapConfirm(); else p.kit.mapCancel(); }
    return;
  }
  mouse[e.button] = true;
  const p = game.player;
  if (!p.alive) return;
  if (e.button === 0) p.input.firePressed = true;
  if (e.button === 2) p.input.altPressed = true;
});
document.addEventListener('mouseup', (e) => { mouse[e.button] = false; });
document.addEventListener('contextmenu', (e) => e.preventDefault());

document.addEventListener('mousemove', (e) => {
  if (!locked || paused) return;
  if (hud.buyOpen) {
    hud.cursor.x = Math.min(innerWidth - 2, Math.max(0, hud.cursor.x + e.movementX));
    hud.cursor.y = Math.min(innerHeight - 2, Math.max(0, hud.cursor.y + e.movementY));
    return;
  }
  if (hud.mapOpen) {
    hud.mapCursor.x = Math.min(innerWidth - 2, Math.max(0, hud.mapCursor.x + e.movementX));
    hud.mapCursor.y = Math.min(innerHeight - 2, Math.max(0, hud.mapCursor.y + e.movementY));
    return;
  }
  const p = game.player;
  if (!p || !p.alive) return;
  // Examining a weapon (inspect held): the mouse turns the weapon, not you.
  if (renderer.examining()) { renderer.examineLook(e.movementX, e.movementY * (settings.invertY ? -1 : 1)); return; }
  const gun = p.gun;
  const zoom = gun.adsT > 0.5 ? gun.targetZoom() : 1;
  // Same scale as Valorant: 0.07 degrees per count times sensitivity; zoomed views scale by 1/zoom.
  let deg = YAW_PER_COUNT * settings.sensitivity;
  if (zoom > 1) deg *= settings.zoomSensMult / zoom;
  if (p.st.castLockUntil > game.time) deg *= 0.25; // casting Convergent Paths: aim held back
  p.yaw -= e.movementX * deg * DEG;
  p.pitch -= e.movementY * deg * DEG * (settings.invertY ? -1 : 1);
  p.pitch = Math.max(-89 * DEG, Math.min(89 * DEG, p.pitch));
  look.dx += e.movementX;
  look.dy += e.movementY;
});

addEventListener('wheel', (e) => {
  if (!locked || paused || hud.buyOpen) return;
  const p = game.player;
  if (!p.alive) return;
  if (settings.wheel === 'jump') { p.input.jump = true; return; }
  const order = ['primary', 'secondary', 'melee'].filter(s => p.inv[s]);
  const i = order.indexOf(p.slot);
  p.equip(order[(i + (e.deltaY > 0 ? 1 : -1) + order.length) % order.length], game.time);
}, { passive: true });

function playerInput() {
  const p = game.player, i = p.input;
  const k = (action) => keys.has(settings.binds[action]);
  if (!p.alive) { i.fwd = i.side = 0; i.fire = i.alt = false; return; }
  i.fwd = (k('fwd') ? 1 : 0) - (k('back') ? 1 : 0);
  i.side = (k('right') ? 1 : 0) - (k('left') ? 1 : 0);
  i.walk = settings.walkMode === 'toggle' ? walkToggled : k('walk');
  i.crouch = settings.crouchMode === 'toggle' ? crouchToggled : k('crouch');
  i.jumpHeld = k('jump');
  i.use = k('use'); // plant / defuse
  i.abCHeld = k('abC'); i.abQHeld = k('abQ'); i.abEHeld = k('abE'); // steerable abilities
  i.fire = mouse[0] && !hud.buyOpen;
  i.alt = mouse[2] && !hud.buyOpen;
}

// ---- buy menu (virtual cursor so the mouse stays captured) ----
function toggleBuy(open = !hud.buyOpen) {
  hud.buyOpen = open;
  if (game.mode) { rhud.toggleShop(open); $('buy').hidden = true; }
  else $('buy').hidden = !open;
  $('cursor').hidden = !open;
  hud.cursor = { x: innerWidth / 2, y: innerHeight / 2 };
  hud.markLoadout(settings.loadout);
  mouse.fill(false);
}

function clickBuy(button = 0) {
  if (game.mode) {
    const el = document.elementFromPoint(hud.cursor.x, hud.cursor.y)?.closest('.scard, #shop-close');
    if (!el) return;
    if (el.id === 'shop-close') { toggleBuy(false); return; }
    const err = rhud.shopClick(el, button);
    if (err) hud.center(`<small>${err.toUpperCase()}</small>`);
    else sound.click(0, 0.25);
    return;
  }
  if (button !== 0) return;
  const el = document.elementFromPoint(hud.cursor.x, hud.cursor.y)?.closest('.card, #buy-close');
  if (!el) return;
  if (el.id === 'buy-close') { toggleBuy(false); return; }
  const w = WEAPONS[el.dataset.id];
  settings.loadout[w.slot] = w.id;
  saveSettings(settings);
  const p = game.player;
  p.loadout = { ...settings.loadout };
  if (p.alive) {
    p.give(w.id);
    p.equip(w.slot, game.time, true);
  }
  hud.markLoadout(settings.loadout);
}

// ---- match flow ----
async function startMatch(extra = {}) {
  sound.init();
  if (!extra.online && net.active) net.close();
  const mapId = extra.map || settings.map;
  try {
    await preloadMap(settings.mode === 'rounds' && !extra.online && !supportsMode(mapId, 'rounds') ? 'divide' : mapId);
  } catch (err) {
    hud.center(`<small>${String(err.message).toUpperCase()}</small>`);
    return false;
  }
  game.start({
    botCount: settings.botCount,
    difficulty: settings.difficulty,
    botMode: settings.botMode,
    botWeapons: settings.botWeapons,
    killLimit: settings.killLimit,
    timeLimit: settings.timeMinutes * 60,
    loadout: { ...settings.loadout },
    agent: settings.agent,
    mode: settings.mode,
    map: mapId,
    side: settings.side,
    ...extra,
  });
  if (hud.buyOpen) toggleBuy(false);
  game.player.adsHold = settings.adsMode === 'hold';
  renderer.clearDecals();
  $('killfeed').innerHTML = '';
  $('death').hidden = true;
  walkToggled = crouchToggled = false;
  running = true;
  updateNetBadge();
  if (extra.noResume) pause(); else resume();
  return true;
}

function showEnd() {
  paused = true;
  releaseInputs();
  if (document.pointerLockElement) document.exitPointerLock();
  const p = game.player, st = p.stats;
  const hits = st.head + st.body + st.legs;
  const pct = (n) => (hits ? Math.round(n / hits * 100) : 0) + '%';
  if (game.mode) {
    const [a, b] = game.mode.score;
    $('end-title').innerHTML = `${a > b ? 'Victory' : 'Defeat'} · ${a} – ${b}`;
  } else {
    const winner = [...game.combatants].sort((a, b) => b.stats.kills - a.stats.kills)[0];
    $('end-title').textContent = winner === p ? 'You win' : `${winner.name} wins`;
  }
  $('end-stats').innerHTML = `
    <div><b>${st.kills}</b><span>Kills</span></div><div><b>${st.deaths}</b><span>Deaths</span></div>
    <div><b>${st.shots ? Math.round(st.hits / st.shots * 100) : 0}%</b><span>Accuracy</span></div>
    <div><b>${pct(st.head)}</b><span>Head</span></div><div><b>${pct(st.body)}</b><span>Body</span></div><div><b>${pct(st.legs)}</b><span>Legs</span></div>`;
  hud.renderScoreboard($('end-table'));
  $('again').hidden = net.active;
  show('end');
}

// ---- settings UI ----
const SCHEMA = [
  ['Mouse', [
    ['sensitivity', 'Sensitivity (Valorant scale)', 'number', { min: 0.01, max: 10, step: 0.001 }],
    ['zoomSensMult', 'Scoped / ADS sensitivity multiplier', 'number', { min: 0.1, max: 3, step: 0.01 }],
    ['invertY', 'Invert Y', 'checkbox'],
  ]],
  ['Controls', [
    ['adsMode', 'Aim down sights', 'select', { hold: 'Hold', toggle: 'Toggle' }],
    ['walkMode', 'Walk', 'select', { hold: 'Hold', toggle: 'Toggle' }],
    ['crouchMode', 'Crouch', 'select', { hold: 'Hold', toggle: 'Toggle' }],
    ['wheel', 'Mouse wheel', 'select', { weapons: 'Switch weapon', jump: 'Jump' }],
  ]],
  ['Gunplay', [
    ['recoilFeel', 'Physical recoil (camera & gun kick)', 'range', { min: 0, max: 2, step: 0.1 }],
    ['sprayTrainer', 'Spray pattern overlay', 'checkbox'],
  ]],
  ['Crosshair', [
    ['chColor', 'Color', 'color'],
    ['chOutline', 'Outline', 'checkbox'],
    ['chDot', 'Center dot', 'checkbox'],
    ['chLength', 'Line length', 'range', { min: 0, max: 20, step: 1 }],
    ['chThickness', 'Line thickness', 'range', { min: 1, max: 6, step: 1 }],
    ['chGap', 'Gap', 'range', { min: 0, max: 20, step: 1 }],
    ['chError', 'Show spread', 'select', { off: 'Off', firing: 'Movement + firing error' }],
  ]],
  ['Match (applies next match)', [
    ['mode', 'Mode', 'select', { dm: 'Deathmatch', rounds: '5v5 Rounds' }],
    ['map', 'Deathmatch map', 'select', MAPS],
    ['side', '5v5 starting side', 'select', { random: 'Random', atk: 'Attack', def: 'Defense' }],
    ['botCount', 'Bots (deathmatch)', 'range', { min: 1, max: 10, step: 1 }],
    ['difficulty', 'Bot difficulty', 'select', { easy: 'Easy', normal: 'Normal', hard: 'Hard', pro: 'Pro' }],
    ['botMode', 'Bot behaviour', 'select', { fight: 'Fight back', passive: 'Move, never shoot', static: 'Stand still' }],
    ['botWeapons', 'Bot weapons', 'select', { rifles: 'Vandal / Phantom', match: 'Same as mine', random: 'Random' }],
    ['killLimit', 'Kill limit', 'number', { min: 1, max: 200, step: 1 }],
    ['timeMinutes', 'Time limit (minutes)', 'number', { min: 1, max: 60, step: 1 }],
  ]],
  ['Video & audio', [
    ['volume', 'Volume', 'range', { min: 0, max: 1, step: 0.05 }],
    ['shadows', 'Shadows', 'checkbox'],
    ['renderScale', 'Render scale', 'select', { auto: 'Auto (drops when the frame rate does)', 0.5: '50%', 0.75: '75%', 1: '100%' }],
    ['showImpacts', 'Bullet holes', 'checkbox'],
    ['impactSeconds', 'Bullet holes last (s)', 'range', { min: 1, max: 30, step: 1 }],
    ['damageNumbers', 'Damage numbers', 'checkbox'],
    ['debug', 'Debug readout', 'checkbox'],
  ]],
];

function buildSettings() {
  const root = $('settings-form');
  root.innerHTML = '';
  for (const [title, fields] of SCHEMA) {
    const sec = document.createElement('section');
    sec.innerHTML = `<h3>${title}</h3>`;
    for (const [key, label, type, opt] of fields) {
      const row = document.createElement('label');
      row.className = 'row';
      row.innerHTML = `<span>${label}</span>`;
      let input;
      if (type === 'select') {
        input = document.createElement('select');
        for (const [v, t] of Object.entries(opt)) input.add(new Option(t, v));
        input.value = String(settings[key]);
      } else {
        input = document.createElement('input');
        input.type = type;
        if (opt) Object.assign(input, opt);
        if (type === 'checkbox') input.checked = !!settings[key];
        else input.value = settings[key];
      }
      const out = document.createElement('output');
      const showVal = () => { out.textContent = type === 'range' ? input.value : ''; };
      showVal();
      input.addEventListener('input', () => {
        let v = type === 'checkbox' ? input.checked : input.value;
        if (type === 'number' || type === 'range') { v = parseFloat(v); if (!Number.isFinite(v)) return; }
        if (key === 'renderScale') v = v === 'auto' ? 'auto' : parseFloat(v);
        settings[key] = v;
        showVal();
        applySettings(key);
        saveSettings(settings);
      });
      row.append(input, out);
      sec.appendChild(row);
    }
    root.appendChild(sec);
  }
}

// Settings → Keybinds: click a key, then press the new one (Esc cancels). A key already in use swaps over.
let capture = null; // { action, btn } while waiting for a key
function buildKeybinds(note = '') {
  const root = $('keybinds');
  root.innerHTML = `<h3>Keybinds</h3><p class="note" id="kb-note">${escHtml(note) || 'Click a key to change it, then press the new key. Saved in this browser.'}</p>`;
  const grid = document.createElement('div');
  grid.className = 'kb-grid';
  for (const [title, list] of ACTIONS) {
    const sec = document.createElement('section');
    sec.innerHTML = `<h4>${title}</h4>`;
    for (const [action, label] of list) {
      const row = document.createElement('div');
      row.className = 'kb-row';
      const btn = document.createElement('button');
      btn.className = 'kb-key' + (settings.binds[action] !== DEFAULT_BINDS[action] ? ' changed' : '');
      btn.textContent = key(action);
      btn.dataset.action = action;
      btn.onclick = () => {
        if (capture) capture.btn.textContent = key(capture.action);
        capture = { action, btn };
        btn.textContent = 'Press a key…';
        btn.classList.add('wait');
      };
      row.innerHTML = `<span>${label}</span>`;
      row.appendChild(btn);
      sec.appendChild(row);
    }
    grid.appendChild(sec);
  }
  const fixed = document.createElement('section');
  fixed.innerHTML = '<h4>Fixed</h4>' + FIXED.map(([l, k]) => `<div class="kb-row"><span>${l}</span><span class="kb-fixed">${k}</span></div>`).join('');
  grid.appendChild(fixed);
  root.appendChild(grid);
  const reset = document.createElement('button');
  reset.className = 'mini'; reset.textContent = 'Reset keybinds';
  reset.onclick = () => { capture = null; settings.binds = { ...DEFAULT_BINDS }; saveSettings(settings); buildKeybinds('Keybinds are back to the defaults.'); };
  root.appendChild(reset);
}

addEventListener('keydown', (e) => {
  if (!capture || $('settings').hidden) return;
  e.preventDefault(); e.stopImmediatePropagation();
  const { action } = capture;
  capture = null;
  if (e.code === 'Escape') { buildKeybinds(); return; }
  const label = ACTIONS.flatMap(([, l]) => l).find(([a]) => a === action)[1];
  const other = rebind(settings.binds, action, e.code);
  saveSettings(settings);
  const otherLabel = other && ACTIONS.flatMap(([, l]) => l).find(([a]) => a === other)[1];
  buildKeybinds(other ? `${keyLabel(e.code)} was on ${otherLabel}, so that's on ${key(other)} now.` : `${label}: ${keyLabel(e.code)}.`);
}, true);

function applySettings(key) {
  if (key === 'volume') sound.setVolume(settings.volume);
  if (key === 'shadows') renderer.setShadows(settings.shadows);
  if (key === 'renderScale') renderer.resize();
  if (key === 'adsMode' && game.player) game.player.adsHold = settings.adsMode === 'hold';
  if (key === 'showImpacts' && !settings.showImpacts) renderer.clearDecals();
}

function openSettings(from) {
  settingsReturn = from;
  capture = null;
  buildSettings();
  buildKeybinds();
  show('settings');
}

// ---- skins menu ----
let skinsReturn = 'menu';
let skinWeapon = null;
let preview = null;

function openSkins(from) {
  skinsReturn = from;
  skinWeapon = skinWeapon || (game.player?.gun?.def?.id && WEAPONS[game.player.gun.def.id]?.recoil ? game.player.gun.def.id : settings.loadout.primary || 'vandal');
  show('skins');
  if (!preview) preview = new GunPreview($('skin-preview'));
  buildSkinWeapons();
  selectSkinWeapon(skinWeapon);
  preview.start();
}

function closeSkins() {
  if (editing) closeEditor();
  skinStatus('');
  preview?.stop();
  show(skinsReturn);
}

function buildSkinWeapons() {
  const nav = $('skin-weapons');
  nav.innerHTML = '';
  const groups = [...BUY_GROUPS, ['Melee', MELEE_ORDER]];
  for (const [title, ids] of groups) {
    const h = document.createElement('h3');
    h.textContent = title;
    nav.appendChild(h);
    for (const id of ids) {
      const b = document.createElement('button');
      b.dataset.id = id;
      const worn = isMelee(id) && meleeId(settings.melee) === id ? ' · <em>equipped</em>' : '';
      b.innerHTML = `<span>${weaponName(id)}</span><small>${escHtml(SKINS[skinFor(settings, id)].name)}${worn}</small>`;
      b.onclick = () => selectSkinWeapon(id);
      nav.appendChild(b);
    }
  }
}

// Weapons and melee types share the skin menu (the knife is both).
const weaponName = (id) => MELEE[id]?.name || WEAPONS[id]?.name || id;

function selectSkinWeapon(id) {
  // Picking a melee type in the menu equips it (it's what shows in your knife slot).
  if (isMelee(id) && meleeId(settings.melee) !== id) { settings.melee = id; saveSettings(settings); skinWeapon = id; buildSkinWeapons(); }
  skinWeapon = id;
  inspectIdx = 0;
  $('skin-inspect').hidden = !isMelee(id);
  $('skin-inspect').textContent = 'Play inspect';
  for (const b of $('skin-weapons').querySelectorAll('button')) b.classList.toggle('sel', b.dataset.id === id);
  const grid = $('skin-grid');
  grid.innerHTML = '';
  const cur = skinFor(settings, id);
  for (const sid of SKIN_ORDER) {
    const s = SKINS[sid];
    const card = document.createElement('button');
    card.className = 'skin-card' + (sid === cur ? ' sel' : '');
    card.innerHTML = `<span class="sw">${swatch(sid).map(c => `<i style="background:${c}"></i>`).join('')}</span><b>${escHtml(s.name)}</b><small class="${isCustom(sid) ? 'custom' : ''}">${escHtml(s.tier)}</small>`;
    card.onclick = () => applySkin(id, sid);
    card.onmouseenter = () => showSkin(id, sid);
    card.onmouseleave = () => showSkin(id, skinFor(settings, id));
    grid.appendChild(card);
  }
  showSkin(id, cur);
  $('skin-edit').hidden = $('skin-delete').hidden = !isCustom(cur);
}

function showSkin(id, sid) {
  preview.show(id, sid);
  $('skin-title').textContent = `${SKINS[sid].name} ${weaponName(id)}`;
  $('skin-sub').textContent = isMelee(id) && sid === 'standard' ? MELEE[id].blurb : SKINS[sid].blurb;
}

function applySkin(id, sid) {
  if (sid === 'standard') delete settings.skins[id]; else settings.skins[id] = sid;
  saveSettings(settings);
  buildSkinWeapons();
  selectSkinWeapon(id);
}

$('menu-skins').onclick = () => openSkins('menu');
$('pause-skins').onclick = () => openSkins('pause');
$('pause-agent').onclick = () => openAgents(true);
$('skins-back').onclick = closeSkins;
$('skin-all').onclick = () => {
  const sid = skinFor(settings, skinWeapon);
  for (const id of [...Object.keys(WEAPONS), ...MELEE_ORDER]) { if (sid === 'standard') delete settings.skins[id]; else settings.skins[id] = sid; }
  saveSettings(settings);
  buildSkinWeapons();
  selectSkinWeapon(skinWeapon);
};
$('skin-reset').onclick = () => {
  settings.skins = {};
  saveSettings(settings);
  buildSkinWeapons();
  selectSkinWeapon(skinWeapon);
};
addEventListener('keydown', (e) => { if (e.code === 'Escape' && !$('skins').hidden) closeSkins(); });
// Melee types: play their inspects on the showcase, one after another.
let inspectIdx = 0;
$('skin-inspect').onclick = () => {
  const list = MELEE[skinWeapon]?.inspects;
  if (!list) return;
  const ins = list[inspectIdx++ % list.length];
  preview.inspect(ins);
  $('skin-inspect').textContent = `Inspect: ${ins.name} (${(inspectIdx - 1) % list.length + 1}/${list.length})`;
};

// ---- agent select ----
let pickedAgent = settings.agent;

let agentsMid = false; // opened during a match (F2 / pause menu): lock-in swaps your agent and resumes
let joining = null; // joining a match that's already running: { taken: Set of agents someone else has }

// The deathmatch-style screen: offline deathmatch, F2 mid-match, and joining an online match already running.
function openAgents(mid = false, join = null) {
  if (mid && game.mode) { hud.center('<small>AGENTS ARE LOCKED IN FOR 5V5</small>'); return; } // no swapping in rounds
  joining = join;
  agentsMid = !join && mid && running && game.state === 'playing';
  if (agentsMid) {
    paused = true; // set first so losing the pointer lock doesn't open the pause menu
    releaseInputs();
    if (hud.buyOpen) toggleBuy(false);
    if (document.pointerLockElement) document.exitPointerLock();
  }
  show('agents');
  const grid = $('agent-grid');
  grid.innerHTML = '';
  for (const id of AGENT_ORDER) {
    const a = AGENTS[id];
    const b = document.createElement('button');
    b.className = 'agent-card';
    b.dataset.id = id;
    b.style.setProperty('--ac', a.color);
    b.innerHTML = `${emblem(a.emblem, a.color)}<b>${a.name}</b><small>${a.role}</small>`;
    b.onclick = () => selectAgent(id);
    b.ondblclick = () => { selectAgent(id); lockIn(); };
    grid.appendChild(b);
  }
  $('agent-sub').textContent = join ? 'This match is already running. Pick an agent to join it; greyed-out agents are taken.' : 'Your agent\'s abilities are on C, Q, E and X (ultimate, charged by kills).';
  $('agent-note').textContent = '';
  markTaken(true);
}

// Greys out the agents a joiner can't have and moves the selection off them.
function markTaken(first = false) {
  const taken = joining?.taken || new Set();
  for (const c of $('agent-grid').children) { c.classList.toggle('taken', taken.has(c.dataset.id)); c.disabled = taken.has(c.dataset.id); }
  const want = AGENTS[pickedAgent] ? pickedAgent : 'zephyr';
  if (taken.has(want)) selectAgent(AGENT_ORDER.find(a => !taken.has(a)) || want);
  else if (first) selectAgent(want);
}

function selectAgent(id) {
  if (joining?.taken.has(id)) return;
  pickedAgent = id;
  const a = AGENTS[id];
  for (const c of $('agent-grid').children) c.classList.toggle('sel', c.dataset.id === id);
  const d = $('agent-detail');
  d.style.setProperty('--ac', a.color);
  const row = (key, ab, extra) => `<div class="ab-row"><kbd>${key}</kbd><div><b>${ab.name}<em>${extra}</em></b><span>${ab.desc}</span></div></div>`;
  const ab = a.abilities;
  const tag = (x) => (x.cooldown ? `${x.charges}× · ${x.cooldown}s` : /soul orb/i.test(x.desc) ? `${x.charges}× · soul orb` : 'toggle');
  d.innerHTML = `
    <div class="agent-hero">${emblem(a.emblem, a.color)}<div><h3>${a.name}</h3><div class="role">${a.role}</div></div></div>
    <p class="agent-blurb">${a.blurb}</p>
    <div class="ab-list">
      ${row(key('abC'), ab.c, tag(ab.c))}
      ${row(key('abQ'), ab.q, tag(ab.q))}
      ${row(key('abE'), ab.e, tag(ab.e))}
      ${row(key('abX'), ab.x, `${ab.x.points} kills`)}
      ${a.passive ? row('—', a.passive, 'passive') : ''}
    </div>
    <div class="lock"><button id="agent-back">Back</button><button id="agent-lock" class="primary">Lock in</button></div>`;
  $('agent-back').onclick = () => (joining ? leaveRoom() : agentsMid ? resume() : show('menu'));
  $('agent-lock').textContent = joining ? 'Join match' : agentsMid ? 'Swap agent' : 'Lock in';
  $('agent-lock').onclick = lockIn;
}

function lockIn() {
  if (joining?.taken.has(pickedAgent)) return;
  settings.agent = pickedAgent;
  saveSettings(settings);
  updateMenuLoadout();
  if (joining) { $('agent-note').textContent = 'Joining…'; $('agent-lock').disabled = true; net.pickAgent(pickedAgent); }
  else if (agentsMid) { switchAgent(pickedAgent); resume(); }
  else startMatch();
}

// ---- Valorant-style pick (agentselect.js): online rooms, and offline 5v5 ----
let localPick = null; // offline 5v5: { lobby, timer }
const select = new SelectScreen($('select'), {
  onHover: (a) => { if (localPick) { localPick.lobby.hover('me', a); select.update(localPick.lobby.state()); } else net.lobbyHover(a); },
  onLock: (a) => {
    settings.agent = a; saveSettings(settings); updateMenuLoadout();
    if (localPick) { localPick.lobby.lock('me', a); select.update(localPick.lobby.state()); } else net.lobbyLock(a);
  },
  onStart: () => net.lobbyStart(),
  onBack: () => { if (localPick) { clearInterval(localPick.timer); localPick = null; show('menu'); } else leaveRoom(); },
});

function leaveRoom() {
  net.close();
  joining = null;
  netStatus('You left the room');
  show('online');
}

// Offline 5v5: you pick, then the nine bots pick from what's left, then the match starts.
function openLocalPick() {
  const map = supportsMode(settings.map, 'rounds') ? settings.map : 'divide';
  const lobby = new Lobby({ mode: 'rounds', map, mapName: MAPS[map] || map });
  lobby.add('me', 'You', true);
  lobby.start();
  preloadMap(map).catch(() => {}); // startMatch reports it if it really fails
  localPick = { lobby };
  select.show(lobby.state(), 'me', { preferred: settings.agent });
  show('select');
  localPick.timer = setInterval(() => {
    if (!localPick || localPick.lobby !== lobby) return;
    const done = lobby.step();
    select.update(lobby.state());
    if (!done) return;
    clearInterval(localPick.timer);
    localPick = null;
    matchFromPick(() => startMatch({ map, agent: lobby.get('me').a, lineup: lobby.lineup(), noResume: true }));
  }, 100);
}

// The pick ended on its own, so there's no click to capture the mouse with: wait on the pause menu.
async function matchFromPick(start) {
  const ok = await start();
  if (ok) $('pause-hint').textContent = 'Match started. Click Resume to play.';
  return ok;
}

let autoAgent = null; // automated checks: lock this agent as soon as a pick screen opens

function lobbyState(state, me, host) {
  state = { ...state, room: net.room }; // shown on the pick screen so the host can share it
  if ($('select').hidden || localPick) { localPick && clearInterval(localPick.timer); localPick = null; select.show(state, me, { host, preferred: settings.agent }); show('select'); }
  else select.update(state);
  const mine = state.players.find(p => p.n === me);
  if (autoAgent && mine && !mine.locked && (state.phase === 'wait' || state.phase === 'pick')) net.lobbyLock(autoAgent);
}

// Host: the pick is over. Start the match with everyone's agents, then let the others in.
async function startFromLobby(lobby) {
  const ok = await matchFromPick(() => startMatch({ online: true, mode: lobby.mode, map: lobby.map, agent: lobby.get(net.nid)?.a, lineup: lobby.lineup(), noResume: true }));
  if (!ok) { net.close(); show('online'); return; }
  net.startFromLobby();
  updateNetBadge();
}

// Joining a running match: pick on the deathmatch-style screen, with the agents in use greyed out.
function joinPick(info) {
  if (info.mapJSON) { try { addMap(info.mapJSON); } catch { /* the welcome brings it again */ } }
  else preloadMap(info.map).catch(() => {});
  const taken = new Set(info.taken);
  if (autoAgent && !info.retry) { net.pickAgent(autoAgent); return; }
  if (!joining || $('agents').hidden) openAgents(false, { taken });
  else { joining.taken = taken; markTaken(); }
  if (info.retry) { $('agent-note').textContent = 'Someone took that agent just before you. Pick another.'; $('agent-lock').disabled = false; }
}

// Swap the player's agent in the middle of a match: abilities reset, ultimate points carry over.
function switchAgent(id) {
  const p = game.player;
  const pts = p.kit ? p.kit.ultPoints : 0;
  if (p.kit) p.kit.cleanup();
  p.kit = new Kit(p, id);
  p.kit.reset(game.time);
  p.kit.ultPoints = Math.min(pts, p.kit.ultCost);
  if (p.alive) p.equip(p.slot, game.time, true);
  hud.buildAbilities(id);
  hud.center(`<b>AGENT</b> ${AGENTS[id].name}`);
}

function updateMenuLoadout() {
  for (const b of document.querySelectorAll('.mode')) b.classList.toggle('sel', b.dataset.mode === settings.mode);
  $('menu-agent').textContent = (AGENTS[settings.agent] || AGENTS.zephyr).name;
  const l = settings.loadout;
  $('menu-loadout').textContent = `${WEAPONS[l.primary]?.name || 'No primary'} + ${WEAPONS[l.secondary]?.name}`;
  $('menu-map').textContent = settings.mode === 'rounds' && !supportsMode(settings.map, 'rounds') ? 'Divide (5v5 needs a 5v5 map)' : MAPS[settings.map] || settings.map;
}

$('play').onclick = () => (settings.mode === 'rounds' ? openLocalPick() : openAgents());
for (const b of document.querySelectorAll('.mode')) b.onclick = () => { settings.mode = b.dataset.mode; saveSettings(settings); updateMenuLoadout(); };
$('menu-settings').onclick = () => openSettings('menu');
$('resume').onclick = resume;
$('pause-settings').onclick = () => openSettings('pause');
$('restart').onclick = () => startMatch();
const toMenu = () => { net.close(); running = false; game.state = 'idle'; updateNetBadge(); updateMenuLoadout(); show('menu'); };
$('quit').onclick = toMenu;
$('settings-back').onclick = () => show(settingsReturn);
$('settings-reset').onclick = () => {
  const loadout = settings.loadout;
  const skins = settings.skins, melee = settings.melee;
  Object.assign(settings, DEFAULTS, { loadout, skins, melee, binds: { ...DEFAULT_BINDS } });
  saveSettings(settings);
  for (const k of Object.keys(DEFAULTS)) applySettings(k);
  hud.chKey = '';
  capture = null;
  buildSettings();
  buildKeybinds();
};
$('again').onclick = () => startMatch();
$('end-menu').onclick = toMenu;
updateMenuLoadout();
if (!matchMedia('(any-pointer: fine)').matches) $('touch-note').hidden = false;

addEventListener('pagehide', () => net.close());
addEventListener('beforeunload', (e) => {
  if (running && game.state === 'playing') { e.preventDefault(); e.returnValue = ''; }
});

// ---- online (see net.js) ----
const escHtml = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function netStatus(msg, err = false) {
  const el = $('online-status');
  el.textContent = msg;
  el.classList.toggle('err', err);
  updateNetBadge();
}

function updateNetBadge() {
  const b = $('netbadge');
  b.hidden = !net.active || !running;
  if (b.hidden) return;
  const humans = game.combatants.filter(c => c.nid && !c.isBot).length;
  b.innerHTML = `${net.role === 'host' ? 'HOSTING' : 'ONLINE'} · ROOM <b>${escHtml(net.room)}</b> · ${humans} player${humans === 1 ? '' : 's'}`;
}

// What other players need to draw us: name, colour, loadout and skins (custom skin designs included).
function netProfile() {
  const skinDefs = {};
  for (const sid of Object.values(settings.skins)) if (isCustom(sid) && SKINS[sid]) skinDefs[sid] = SKINS[sid];
  return { name: settings.netName, color: parseInt(settings.netColor.slice(1), 16), loadout: { ...settings.loadout }, skins: { ...settings.skins }, skinDefs, melee: meleeId(settings.melee) };
}

function readProfile() {
  settings.netName = $('net-name').value.trim().slice(0, 16) || 'Player';
  settings.netColor = $('net-color').value;
}

const cleanRoom = (r) => String(r || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

// Create server: name, mode, map, max players, who can join, room code.
function readCreateForm() {
  readProfile();
  settings.netTransport = $('net-transport').value;
  if ($('net-mode').value) settings.mode = $('net-mode').value;
  if ($('net-map').value) settings.map = $('net-map').value;
  settings.netMax = parseInt($('net-max').value, 10) || 10;
  settings.netServer = $('net-server').value.trim().slice(0, 32);
  saveSettings(settings);
  const server = { name: settings.netServer || `${settings.netName}'s server`, max: settings.netMax };
  return { transport: settings.netTransport, room: cleanRoom($('net-room').value), server };
}

function readJoinForm() {
  readProfile();
  settings.netTransport = $('net-join-transport').value;
  saveSettings(settings);
  return { transport: settings.netTransport, room: cleanRoom($('net-code').value) };
}

// Maps that can run the chosen mode, the current one selected.
function fillServerMaps() {
  const mode = $('net-mode').value, sel = $('net-map');
  const maps = mapList().filter(m => mode !== 'rounds' || m.modes.includes('rounds'));
  const want = maps.some(m => m.id === settings.map) ? settings.map : mode === 'rounds' && maps.some(m => m.id === 'divide') ? 'divide' : maps[0]?.id;
  sel.innerHTML = '';
  for (const m of maps) sel.add(new Option(m.name, m.id));
  if (want) sel.value = want;
}

function serverTab(tab) {
  servers.internet.start(); // join the internet list (see servers.js)
  for (const t of ['join', 'create']) { $('srv-tab-' + t).classList.toggle('sel', t === tab); $('srv-' + t).hidden = t !== tab; }
  if (tab === 'join') servers.refresh();
}

function openOnline(tab = 'join') {
  $('net-name').value = settings.netName;
  $('net-color').value = settings.netColor;
  $('net-transport').value = $('net-join-transport').value = settings.netTransport;
  $('net-mode').value = settings.mode;
  fillServerMaps();
  const max = $('net-max');
  if (!max.options.length) for (let n = 2; n <= 10; n++) max.add(new Option(String(n), String(n)));
  max.value = String(settings.netMax);
  $('net-server').value = settings.netServer;
  $('net-server').placeholder = `${settings.netName}'s server`;
  if (!$('net-room').value) $('net-room').value = roomCode();
  netStatus(net.active ? `In room ${net.room}` : '');
  serverTab(tab);
  show('online');
  serverListKey = '';
  buildServerList();
}

// The server list: rooms hosted in other tabs of this browser (see servers.js).
const servers = new ServerDirectory(() => net.serverInfo());
servers.onchange = () => { if (!$('online').hidden) buildServerList(); };

let serverListKey = '';
function buildServerList() {
  const list = $('srv-list'), all = servers.servers();
  // Hosts re-announce every second: only redraw when something changed, so a Join button stays put under the mouse.
  const listKey = JSON.stringify([net.room, net.active, servers.internet.state, all.map(({ seen, ...s }) => s)]);
  if (listKey === serverListKey && list.isConnected) return;
  serverListKey = listKey;
  list.innerHTML = '';
  $('srv-empty').hidden = all.length > 0;
  $('srv-net').textContent = {
    connecting: 'Internet list: connecting…',
    holder: 'Internet list: connected (your browser is holding the list right now)',
    member: 'Internet list: connected',
    offline: 'Internet list: can\'t reach the PeerJS broker. Servers in this browser still show, and codes still work.',
  }[servers.internet.state] || '';
  for (const s of all) {
    const full = s.players >= s.max, mine = net.active && net.room === s.room;
    const row = document.createElement('div');
    row.className = 'srv-row';
    row.innerHTML = `<div><b>${escHtml(s.name)}</b><small>Code ${escHtml(s.room)}${s.transport === 'peer' ? ' · internet' : ''}</small></div>`
      + `<div>${s.mode === 'rounds' ? '5v5 Rounds' : 'Deathmatch'} · ${escHtml(s.map)}<br><small>${s.phase === 'pick' ? 'Agent select' : 'Match running'}</small></div>`
      + `<div class="${full ? 'full' : ''}">${s.players}/${s.max}</div>`;
    const join = document.createElement('button');
    join.className = 'mini';
    join.textContent = mine ? 'Yours' : full ? 'Full' : 'Join';
    join.disabled = full || mine;
    join.onclick = () => joinOnline({ room: s.room, transport: s.transport });
    row.appendChild(join);
    list.appendChild(row);
  }
}

// The room opens on the agent select screen. `lobby: false` (automated checks) starts the match right away
// and people join it with the deathmatch-style picker.
async function hostOnline({ lobby = true } = {}) {
  const { transport, room, server } = readCreateForm();
  if (!room) { netStatus('Pick a room code first', true); return false; }
  const rounds = settings.mode === 'rounds';
  const id = rounds && !supportsMode(settings.map, 'rounds') ? 'divide' : settings.map;
  const mj = () => (mapInfo(id)?.file ? null : mapJSON(id));
  if (lobby) {
    try { await preloadMap(id); } catch (err) { netStatus(err.message, true); return false; }
    if (transport === 'peer') servers.internet.start(); // so the server shows up on other computers
    if (running) { running = false; game.state = 'idle'; }
    try {
      await net.host({ transport, room, server, profile: netProfile(), mapJSON: mj(), lobby: new Lobby({ mode: settings.mode, map: id, mapName: MAPS[id] || id, botCount: settings.botCount }) });
    } catch (err) { netStatus(err.message, true); net.close(); return false; }
    return true;
  }
  const ok = await startMatch({ online: true, mode: settings.mode, map: id, noResume: true });
  if (!ok) return false;
  try {
    await net.host({ transport, room, server, profile: netProfile(), mapJSON: mj() });
  } catch (err) {
    netStatus(err.message, true);
    toMenu();
    show('online');
    return false;
  }
  updateNetBadge();
  return true;
}

// Join the code typed in, or `room` over `transport` (a server picked from the list).
async function joinOnline({ agent = null, room: pick = null, transport: via = null } = {}) {
  autoAgent = AGENTS[agent] ? agent : null;
  joining = null;
  let { transport, room } = readJoinForm();
  if (pick) { room = cleanRoom(pick); transport = via || transport; }
  if (!room) { netStatus('Enter the host\'s room code', true); return; }
  if (running) toMenu();
  try {
    await net.join({ transport, room, profile: netProfile() });
  } catch (err) {
    netStatus(err.message, true);
    net.close();
  }
}

// The host answered: load its map, start a local match with no bots, then hand control to the session.
async function joinedMatch(w) {
  try {
    if (w.mapJSON) addMap(w.mapJSON);
    else await preloadMap(w.map);
  } catch (err) { netStatus(`Can't load the host's map: ${err.message}`, true); net.close(); return; }
  const rounds = w.mode === 'rounds';
  const flip = rounds && w.team === 1; // locally, our team is always team 0
  const ok = await startMatch({
    online: true, mode: rounds ? 'rounds' : 'dm', map: w.map, botCount: 0, agent: AGENTS[w.agent] ? w.agent : settings.agent, killLimit: w.opts.killLimit, timeLimit: w.opts.timeLimit, noResume: true,
    netRounds: rounds, flip, startSide: rounds ? (flip ? (w.ss === 'atk' ? 'def' : 'atk') : w.ss) : undefined, credits: w.credits, net,
  });
  if (!ok) { net.close(); return; }
  net.attachClient(w);
  joining = null;
  updateNetBadge();
  $('pause-hint').textContent = 'Joined. Click Resume to play.';
}

$('menu-online').onclick = () => openOnline();
$('srv-tab-join').onclick = () => serverTab('join');
$('srv-tab-create').onclick = () => serverTab('create');
$('srv-refresh').onclick = () => servers.refresh();
$('net-mode').onchange = fillServerMaps;
$('net-code').onkeydown = (e) => { if (e.key === 'Enter') joinOnline(); };
$('online-back').onclick = () => show(running ? 'pause' : 'menu');
$('net-newroom').onclick = () => { $('net-room').value = roomCode(); };
$('net-host').onclick = () => hostOnline();
$('net-join').onclick = () => joinOnline();

// ---- maps screen ----
function openMaps() {
  buildMapList();
  $('map-status').textContent = '';
  show('maps');
}

function buildMapList() {
  const list = $('map-list');
  list.innerHTML = '';
  for (const m of mapList()) {
    const row = document.createElement('div');
    row.className = 'map-row' + (m.id === settings.map ? ' sel' : '');
    row.innerHTML = `<div><b>${escHtml(m.name)}</b><small>${escHtml(m.blurb || '')}</small></div><span class="tag">${m.modes.includes('rounds') ? 'DM · 5v5' : 'DM'}${m.custom ? ' · imported' : ''}</span><span class="inline"></span>`;
    const btns = row.lastChild;
    const use = document.createElement('button');
    use.textContent = m.id === settings.map ? 'Selected' : 'Use';
    use.onclick = async () => {
      try { await preloadMap(m.id); } catch (err) { $('map-status').textContent = err.message; return; }
      settings.map = m.id; saveSettings(settings); updateMenuLoadout(); buildMapList();
    };
    btns.appendChild(use);
    // The map as a version 2 file, to edit and import again (older maps are converted on the way out).
    const dl = document.createElement('button');
    dl.textContent = 'Download';
    dl.title = 'Save this map as a JSON file you can edit, then load it with Import file';
    dl.onclick = async () => {
      try {
        const text = stringifyMap(upgradeMap(await preloadMap(m.id)));
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        a.download = `${m.id}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      } catch (err) { $('map-status').textContent = err.message; }
    };
    btns.appendChild(dl);
    if (m.custom && !m.file) {
      const del = document.createElement('button');
      del.textContent = 'Remove';
      del.onclick = () => { removeCustomMap(m.id); if (settings.map === m.id) settings.map = 'arena'; saveSettings(settings); updateMenuLoadout(); buildMapList(); };
      btns.appendChild(del);
    }
    list.appendChild(row);
  }
}

function importMapJSON(json, from) {
  try {
    const id = addMap(json, { custom: true, persist: true });
    settings.map = id; saveSettings(settings); updateMenuLoadout();
    $('map-status').textContent = `Loaded "${MAPS[id]}" from ${from} and selected it.`;
    buildMapList();
  } catch (err) { $('map-status').textContent = `That map didn't load: ${err.message}`; }
}

$('menu-maps').onclick = openMaps;
$('maps-back').onclick = () => show('menu');
$('map-file').onchange = async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try { importMapJSON(JSON.parse(await f.text()), f.name); } catch (err) { $('map-status').textContent = `Not valid JSON: ${err.message}`; }
};
$('map-url-go').onclick = async () => {
  const url = $('map-url').value.trim();
  if (!url) return;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    importMapJSON(await res.json(), new URL(url, location.href).hostname || 'that URL');
  } catch (err) { $('map-status').textContent = `Couldn't fetch the map: ${err.message}`; }
};

// ---- custom skin editor ----
const SLOT_LABELS = { body: 'Body', trim: 'Trim', metal: 'Metal', grip: 'Grip' };
let editing = null; // { id (null = new), def }

const hexOf = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');

function skinStatus(msg) { $('skin-status').textContent = msg; }

function openEditor(id = null) {
  const src = id ? SKINS[id] : SKINS[skinFor(settings, skinWeapon)];
  editing = { id, def: structuredClone(sanitizeSkin(src)) };
  if (!id) { editing.def.name = 'My skin'; editing.def.tier = 'Custom'; editing.def.blurb = 'Designed in the skin editor.'; }
  $('skin-grid').hidden = true;
  $('skin-actions').hidden = true;
  const ed = $('skin-editor');
  ed.hidden = false;
  const patOpts = (cur) => `<option value="">None</option>` + Object.entries(PATTERNS).map(([k, p]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${p.label}</option>`).join('');
  const d = editing.def;
  ed.innerHTML = `
    <div class="form"><label>Name</label><input data-k="name" maxlength="28" value="${escHtml(d.name)}">
      <label>Description</label><input data-k="blurb" maxlength="90" value="${escHtml(d.blurb)}"></div>
    <div class="slots">
      ${Object.entries(SLOT_LABELS).map(([slot, label]) => `
        <fieldset><legend>${label}</legend><div class="form">
          <label>Colour</label><input type="color" data-s="${slot}" data-f="color" value="${hexOf(d[slot].color)}">
          <label>Roughness</label><input type="range" min="0" max="1" step="0.01" data-s="${slot}" data-f="rough" value="${d[slot].rough}">
          <label>Metallic</label><input type="range" min="0" max="1" step="0.01" data-s="${slot}" data-f="metal" value="${d[slot].metal}">
          <label>Pattern</label><select data-s="${slot}" data-f="tex">${patOpts(d[slot].tex)}</select>
          <label>Pattern ink</label><input type="color" data-s="${slot}" data-f="texColor" value="${d[slot].texColor || '#ffffff'}">
          <label>Pattern base</label><input type="color" data-s="${slot}" data-f="texBase" value="${d[slot].texBase || hexOf(d[slot].color)}">
        </div></fieldset>`).join('')}
      <fieldset><legend>Glow</legend><div class="form">
        <label>Colour</label><input type="color" data-s="glow" data-f="color" value="${hexOf(d.glow.color)}">
        <label>Strength</label><input type="range" min="0" max="4" step="0.05" data-s="glow" data-f="intensity" value="${d.glow.intensity}">
      </div></fieldset>
    </div>
    <div class="buttons"><button id="ed-save" class="primary">Save and apply</button><button id="ed-random">Randomize</button><button id="ed-cancel">Cancel</button></div>`;
  const sync = () => {
    for (const el of ed.querySelectorAll('[data-k]')) d[el.dataset.k] = el.value;
    for (const el of ed.querySelectorAll('[data-s]')) {
      const slot = d[el.dataset.s], f = el.dataset.f;
      if (f === 'color') slot.color = parseInt(el.value.slice(1), 16);
      else if (f === 'tex') { if (el.value) slot.tex = el.value; else delete slot.tex; }
      else if (f === 'texColor' || f === 'texBase') slot[f] = el.value;
      else slot[f] = parseFloat(el.value);
    }
    previewDraft();
  };
  ed.oninput = sync;
  $('ed-save').onclick = () => {
    sync();
    const sid = saveCustomSkin(d, editing.id);
    if (!sid) return;
    settings.skins[skinWeapon] = sid;
    saveSettings(settings);
    closeEditor();
    skinStatus(`Saved "${SKINS[sid].name}" and put it on the ${weaponName(skinWeapon)}.`);
  };
  $('ed-cancel').onclick = closeEditor;
  $('ed-random').onclick = () => {
    const rc = () => '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
    const pats = Object.keys(PATTERNS);
    for (const el of ed.querySelectorAll('[data-s]')) {
      if (el.type === 'color') el.value = rc();
      else if (el.type === 'range') el.value = el.dataset.f === 'intensity' ? (Math.random() * 3).toFixed(2) : Math.random().toFixed(2);
      else if (el.tagName === 'SELECT') el.value = el.dataset.s === 'body' || Math.random() < 0.25 ? pats[Math.floor(Math.random() * pats.length)] : '';
    }
    sync();
  };
  previewDraft();
}

// The draft is registered under a throwaway id so the preview can draw it; never saved.
function previewDraft() {
  registerSkin('__draft', sanitizeSkin(editing.def), { temporary: true });
  preview.show(skinWeapon, '__draft');
  $('skin-title').textContent = `${editing.def.name} ${weaponName(skinWeapon)}`;
  $('skin-sub').textContent = editing.def.blurb;
}

function closeEditor() {
  editing = null;
  delete SKINS.__draft;
  $('skin-editor').hidden = true;
  $('skin-grid').hidden = false;
  $('skin-actions').hidden = false;
  buildSkinWeapons();
  selectSkinWeapon(skinWeapon);
}

function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function adoptSkin(def, how) {
  if (!def) { skinStatus(`That ${how} isn't a Tapfire skin.`); return; }
  const sid = saveCustomSkin(def);
  settings.skins[skinWeapon] = sid;
  saveSettings(settings);
  buildSkinWeapons();
  selectSkinWeapon(skinWeapon);
  skinStatus(`Added "${SKINS[sid].name}" from a ${how}.`);
}

$('skin-new').onclick = () => openEditor(null);
$('skin-edit').onclick = () => openEditor(skinFor(settings, skinWeapon));
$('skin-delete').onclick = () => {
  const sid = skinFor(settings, skinWeapon);
  if (!isCustom(sid) || !confirm(`Delete "${SKINS[sid].name}"? Weapons using it go back to Standard Issue.`)) return;
  for (const [w, x] of Object.entries(settings.skins)) if (x === sid) delete settings.skins[w];
  deleteCustomSkin(sid);
  saveSettings(settings);
  buildSkinWeapons();
  selectSkinWeapon(skinWeapon);
  skinStatus('Deleted.');
};
$('skin-share').onclick = async () => {
  const code = skinCode(skinFor(settings, skinWeapon));
  try { await navigator.clipboard.writeText(code); skinStatus('Share code copied. Anyone can paste it into their skin menu.'); }
  catch { prompt('Copy this share code:', code); }
};
$('skin-paste').onclick = () => {
  const code = prompt('Paste a skin share code (TFSKIN1.…):');
  if (code) adoptSkin(parseSkinCode(code), 'share code');
};
$('skin-export').onclick = () => {
  const sid = skinFor(settings, skinWeapon);
  download(`${SKINS[sid].name.replace(/[^\w-]+/g, '_')}.tapfire-skin.json`, JSON.stringify({ tapfireSkin: 1, ...SKINS[sid] }, null, 2));
};
$('skin-import').onchange = async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try { adoptSkin(sanitizeSkin(JSON.parse(await f.text())), 'file'); } catch { skinStatus('That file isn\'t valid JSON.'); }
};

// ---- loop: simulation at a fixed 128 Hz, rendering interpolated between ticks ----
// Online, the match keeps running while you're in a menu (and the host's has to, for everyone else).
const simulating = () => running && (!paused || net.active) && !hooks.frozen;
function simulate(dt) {
  acc += dt;
  let n = 0;
  while (acc >= DT && n < 64) {
    playerInput();
    game.tick();
    net.tick();
    acc -= DT;
    n++;
  }
  if (n >= 64) acc = 0;
}
// Background tabs get no animation frames; a worker timer keeps an online match ticking there.
let lastBg = performance.now();
try {
  const w = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 20)'], { type: 'text/javascript' })));
  w.onmessage = () => {
    const now = performance.now();
    if (document.hidden && net.active && simulating()) { simulate(Math.min(0.25, (now - lastBg) / 1000)); last = now; }
    lastBg = now;
  };
} catch { /* no workers: hidden tabs just pause */ }

// While inspecting: which inspect is playing and what the key does next.
let inspectKey = '';
function inspectHint() {
  const i = renderer.inspectInfo();
  const key = i ? `${i.name}|${i.idx}|${i.examine}` : '';
  if (key === inspectKey) return;
  inspectKey = key;
  const el = $('inspecthint');
  el.hidden = !i;
  if (!i) return;
  el.innerHTML = i.examine ? `<b>Examine</b>move the mouse to turn it · release <kbd>${key('inspect')}</kbd> to put it back`
    : `<b>${escHtml(i.name)}</b>${i.count > 1 ? `${i.idx + 1}/${i.count}<kbd>${key('inspect')}</kbd>next` : ''}<kbd>hold ${key('inspect')}</kbd>examine`;
}

function frame(t) {
  requestAnimationFrame(frame);
  let dt = (t - last) / 1000;
  last = t;
  if (dt > 0.25) dt = 0.25;
  if (dt < 0) dt = 0;
  if (simulating()) simulate(dt);
  if (running) {
    renderer.render(Math.min(1, acc / DT), dt, look);
    hud.specTarget = renderer.specTarget;
    hud.update(dt, look);
    inspectHint();
    spikeBeeps(); rhud.update(dt);
    minimap.update();
    const ear = ears();
    sound.setListener(ear.eye(), ear.yaw);
    sound.setDeaf(game.player.alive && game.player.st.deafUntil > game.time);
  } else {
    renderer.renderIdle(t / 1000);
  }
  look.dx = look.dy = 0;
}
requestAnimationFrame(frame);

// Exposed for automated checks in a headless browser; `frozen` stops the loop from ticking.
const hooks = { game, renderer, sound, settings, startMatch, playerInput, openAgents, switchAgent, net, hostOnline, joinOnline, servers, peerOptions, frozen: false };
window.__game = hooks;
