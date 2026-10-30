// Rebindable keys (Settings → Controls). settings.binds maps an action to its primary KeyboardEvent.code and
// settings.binds2 to its secondary one ('' = none); each code belongs to at most one action slot, so rebinding a key
// that's in use swaps the two.

export const ACTIONS = [
  ['Movement', [
    ['fwd', 'Move forward', 'KeyW'],
    ['back', 'Move back', 'KeyS'],
    ['left', 'Strafe left', 'KeyA'],
    ['right', 'Strafe right', 'KeyD'],
    ['walk', 'Walk', 'ShiftLeft'],
    ['crouch', 'Crouch', 'ControlLeft'],
    ['jump', 'Jump', 'Space'],
  ]],
  ['Weapons', [
    ['reload', 'Reload', 'KeyR'],
    ['primary', 'Primary weapon', 'Digit1'],
    ['secondary', 'Sidearm', 'Digit2'],
    ['melee', 'Melee', 'Digit3'],
    ['inspect', 'Inspect (again: restart)', 'KeyY'],
    ['drop', 'Drop weapon', 'KeyG'],
    ['use', 'Pick up / plant / defuse', 'KeyF'],
  ]],
  ['Abilities', [
    ['abC', 'Ability (C slot)', 'KeyC'],
    ['abQ', 'Ability (Q slot)', 'KeyQ'],
    ['abE', 'Ability (E slot)', 'KeyE'],
    ['abX', 'Ultimate (X slot)', 'KeyX'],
  ]],
  ['Interface', [
    ['buy', 'Buy menu / loadout', 'KeyB'],
    ['map', 'Full map', 'KeyM'],
    ['scores', 'Scoreboard (hold)', 'Tab'],
    ['agent', 'Change agent', 'F2'],
    ['debug', 'Debug readout', 'F3'],
  ]],
];

// Not rebindable: shown in the list so every control is in one place.
export const FIXED = [['Fire / alt fire', 'Left / right mouse'], ['Switch weapon', 'Mouse wheel'], ['Pause', 'Esc']];

export const DEFAULT_BINDS = Object.fromEntries(ACTIONS.flatMap(([, list]) => list.map(([id, , code]) => [id, code])));
export const DEFAULT_BINDS2 = Object.fromEntries(Object.keys(DEFAULT_BINDS).map((id) => [id, '']));

// The action bound to a key (primary or secondary), or null.
export function actionFor(binds, code, binds2) {
  for (const a in binds) if (binds[a] === code) return a;
  if (binds2 && code) for (const a in binds2) if (binds2[a] === code) return a;
  return null;
}

// Bind `code` to `action`'s primary (slot 0) or secondary (slot 1) key in settings `s`. Whatever had that key gets
// `action`'s old key in that slot. Returns the other action that lost the key, or null.
export function bindKey(s, action, slot, code) {
  const maps = [s.binds, s.binds2], old = maps[slot][action] || '';
  let other = null;
  for (let i = 0; i < 2 && !other; i++) {
    for (const a in maps[i]) if (maps[i][a] === code && !(i === slot && a === action)) { other = [a, i]; break; }
  }
  if (other) maps[other[1]][other[0]] = old;
  maps[slot][action] = code;
  // A primary key is never left empty while there's a secondary one.
  for (const a of other ? [action, other[0]] : [action]) if (!maps[0][a] && maps[1][a]) { maps[0][a] = maps[1][a]; maps[1][a] = ''; }
  return other && other[0] !== action ? other[0] : null;
}

export function keyLabel(code) {
  if (!code) return '—';
  let m;
  if ((m = /^Key([A-Z])$/.exec(code))) return m[1];
  if ((m = /^Digit(\d)$/.exec(code))) return m[1];
  if ((m = /^Numpad(.+)$/.exec(code))) return 'Num ' + m[1];
  if ((m = /^(Shift|Control|Alt|Meta)(Left|Right)$/.exec(code))) return (m[2] === 'Right' ? 'R ' : '') + { Shift: 'Shift', Control: 'Ctrl', Alt: 'Alt', Meta: 'Meta' }[m[1]];
  if ((m = /^Arrow(.+)$/.exec(code))) return { Up: '↑', Down: '↓', Left: '←', Right: '→' }[m[1]];
  return { Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', CapsLock: 'Caps' }[code] || code;
}
