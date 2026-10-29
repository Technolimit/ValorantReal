// Rebindable keys (Settings → Keybinds). settings.binds maps an action to a KeyboardEvent.code; each code
// belongs to at most one action, so rebinding a key that's in use swaps the two.

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

// The action bound to a key, or null.
export function actionFor(binds, code) {
  for (const a in binds) if (binds[a] === code) return a;
  return null;
}

// Bind `code` to `action`. Returns the action that had that key (it gets `action`'s old key), or null.
export function rebind(binds, action, code) {
  const other = actionFor(binds, code);
  if (other && other !== action) binds[other] = binds[action];
  binds[action] = code;
  return other && other !== action ? other : null;
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
