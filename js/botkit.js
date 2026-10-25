// Bot ability use. Each agent's abilities get a role that says when a bot reaches for it; casting goes
// through the same Kit code a player's click does (aim, then spend), so every ability behaves the same.
//   flash   – blind / stun / nearsight where an enemy was just seen, or onto the site before entering it
//   molly   – damage / slow area where an enemy was just seen, or onto a spike being defused
//   smoke   – attackers smoke the site's defender spots on the execute; defenders smoke a push they see
//   mapSmoke / mapDamage – the same, through the map picker
//   wall    – block sight toward enemies while planting / defusing or holding a lane
//   recon   – reveal the site before going in (attackers) or the lane mid-round (defenders)
//   trap    – defenders set up at their spot during the buy phase
//   heal    – heal when hurt and out of a fight
//   ultFight / ultSelf / ultRecon / ultPlace / ultMap – ultimates
// Abilities a bot would have to steer or pilot (drones, cameras, teleports, ability guns) are left alone.
import { buyPhaseAllows } from './abilities.js';

const R = {
  zephyr: { x: 'ultGun' },
  cinder: { c: 'wall', q: 'flash', e: 'molly', x: 'ultSelf' },
  umbra: { e: 'smoke', q: 'flash' },
  hawke: { q: 'molly', e: 'recon', x: 'ultGun' },
  bastion: { c: 'molly', q: 'trap', e: 'trap', x: 'ultPlace' },
  blitz: { c: 'molly', e: 'molly', x: 'ultGun' },
  granite: { q: 'molly', e: 'mapSmoke', x: 'ultMap' },
  venom: { c: 'molly', q: 'smoke', e: 'wall', x: 'ultPlace' },
  vex: { c: 'flash', x: 'ultFight' },
  quake: { q: 'flash', e: 'flash', x: 'ultFight' },
  volt: { c: 'wall', q: 'flash', x: 'ultGun' },
  mirage: { c: 'flash', q: 'flash' },
  fawn: { c: 'teamHeal', e: 'flash', x: 'ultRecon' },
  lattice: { c: 'trap', x: 'ultRecon' },
  nyx: { c: 'flash', q: 'flash', e: 'recon', x: 'ultRecon' },
  solace: { c: 'wall', q: 'molly', e: 'allyHeal', x: 'revive' },
  stella: { x: 'ultMap' },
  regent: { c: 'trap', x: 'ultGun' },
  marina: { c: 'wall', q: 'smoke', e: 'wall', x: 'ultFight' },
  vanta: { c: 'wall', q: 'flash', e: 'ultSelf', x: 'ultFight' },
  ballast: { q: 'flash', e: 'mapDamage', x: 'ultMap' },
  override: { c: 'molly', q: 'flash', e: 'recon', x: 'ultSelf' },
  thistle: { c: 'afterKill', q: 'molly', e: 'mapSmoke' },
  lumen: { c: 'flash', x: 'ultFight' },
};
// Second press needed to set some of them off (swarm grenades, the hawk).
const REUSE = { 'bastion:c': 1.1, 'fawn:e': 0.9 };

const dist = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

export function castable(bot, k, drawing = false) {
  const me = bot.me, kit = me.kit, g = bot.game, now = g.time;
  if (!kit || !me.alive || kit.busy() || (kit.armed && !drawing) || kit.mapPick || me.st.channelUntil > now || me.st.stunUntil > now || me.st.disarmUntil > now) return false;
  if (g.mode?.phase === 'buy' && !buyPhaseAllows(kit.id, k)) return false;
  if (g.mode?.phase === 'end') return false;
  if (k === 'x') return kit.ultPoints >= kit.ultCost && !kit.rebirth;
  return kit.charges[k] > 0;
}

// Aim at `target` and use ability k the way a player would.
export function cast(bot, k, target, { picks = null, yOff = 0.2 } = {}) {
  const me = bot.me, kit = me.kit, g = bot.game, ab = kit.agent.abilities[k];
  if (target) {
    const e = me.eye(), dx = target[0] - e[0], dy = target[1] + yOff - e[1], dz = target[2] - e[2];
    me.yaw = Math.atan2(-dx, -dz) + (Math.random() - 0.5) * 0.04;
    me.pitch = Math.max(-1.3, Math.min(1.3, Math.atan2(dy, Math.hypot(dx, dz))));
  }
  const d = target ? dist(me.pos, target) : 10;
  const floors = [];
  for (const p of picks || [target]) { const f = p && g.floorAt(p[0], p[2]); if (f) floors.push(f); }
  const params = { dist: ab.distance ? Math.max(ab.distance.min, Math.min(ab.distance.max, d)) : undefined, power: ab.charge ? Math.max(0.15, Math.min(1, d / 45)) : undefined, picks: floors };
  const r = applyCast(me, k, params);
  if (r === false) { bot.lastCast = g.time - 1.2; return false; } // couldn't place it: try again a bit later
  g.emit('botCast', { who: me, k, ...params }); // online: clients replay the same cast (net.js)
  bot.lastCast = g.time;
  return true;
}

// Use ability k with the bot's current aim. Online clients call this to replay a bot's cast exactly.
export function applyCast(me, k, { dist: dd, power, picks = [] } = {}) {
  const kit = me.kit, g = me.game, ab = kit.agent.abilities[k];
  if (dd !== undefined) kit.dist = dd;
  if (power !== undefined) kit.power = power;
  kit.usedAt = -1;
  let r;
  if (k === 'x') {
    r = ab.use(kit, g.time);
    if (r !== false && r !== 'pending' && !kit.mapPick) { kit.ultPoints = 0; kit.lastUse.x = g.time; }
  } else r = kit.spend(k, 'left');
  kit.power = undefined;
  if (kit.mapPick) {
    for (const f of picks) { if (!kit.mapPick) break; kit.mapClick(f); }
    if (kit.mapPick) kit.mapConfirm();
    if (kit.mapPick) kit.mapCancel();
  }
  if (r === false) return false;
  const re = REUSE[kit.id + ':' + k];
  if (re && ab.reuse) kit.timers.push({ at: g.time + re, fn: () => ab.reuse(kit) });
  if (!kit.busy() && me.alive) me.equip(me.slot, g.time, true);
  return true;
}

// Called a few times a second from Bot.think.
export function botAbilities(bot, now) {
  const me = bot.me, kit = me.kit, g = bot.game, m = g.mode;
  if (!kit || !me.alive || bot.mode === 'static') { bot.pending = null; return; }
  // Drawing an ability: like a player, the bot holds it out for a moment (visible in its hands), aiming, then uses it.
  const pd = bot.pending;
  if (pd) {
    if (!castable(bot, pd.k, true) || now > pd.at + 1) { if (kit.armed?.k === pd.k) kit.armed = null; bot.pending = null; if (!kit.busy() && me.alive) me.equip(me.slot, now, true); return; }
    if (pd.target) bot.turnToward(pd.target, 0, 1 / 128, 1.4);
    if (now >= pd.at) { kit.armed = null; bot.pending = null; cast(bot, pd.k, pd.target, { picks: pd.picks }); }
    return;
  }
  if (now < (bot.nextAbilityCheck || 0)) return;
  bot.nextAbilityCheck = now + 0.3;
  if (now - (bot.lastCast ?? -10) < 2.2) return;
  const roles = R[kit.id] || {};
  const used = bot.used || (bot.used = new Set());
  const seenAgo = now - bot.lastSeen;
  const visible = bot.target?.alive && seenAgo < 0.25;
  const last = bot.lastSeenPos;
  const side = m ? m.side(me) : null;
  const sp = m?.spike;
  const gl = bot.goal;
  // Attackers know which site they're hitting; defenders work with the site nearest them.
  let siteName = m?.plan?.site || null;
  if (m && side === 'def' && g.map.sites) siteName = Object.keys(g.map.sites).sort((a, b) => dist(me.pos, g.map.sites[a].center) - dist(me.pos, g.map.sites[b].center))[0];
  if (sp?.state === 'planted') siteName = sp.site;
  const site = siteName ? g.map.sites[siteName] : null;
  const executing = side === 'atk' && gl && (gl.kind === 'entry' || gl.kind === 'plant') && site && dist(me.pos, site.center) < 34;
  const live = m ? m.phase === 'live' || m.phase === 'planted' : true;
  const holdSpots = site ? (g.map.holds?.[siteName] || []).map(h => h.pos) : [];

  for (const k of ['x', 'q', 'c', 'e']) {
    const role = roles[k];
    if (!role || !castable(bot, k)) continue;
    let target = null, picks = null;
    switch (role) {
      case 'flash':
        if (!visible && last && seenAgo > 0.4 && seenAgo < 4 && dist(me.pos, last) < 30) target = [last[0], last[1] + 1.4, last[2]];
        else if (executing && !used.has('flash' + k)) { target = holdSpots[Math.floor(Math.random() * holdSpots.length)] || site.center; target = [target[0], target[1] + 1.5, target[2]]; used.add('flash' + k); }
        if (target) bot.pushUntil = now + 2.5; // flash and go
        break;
      case 'molly':
        if (!visible && last && seenAgo > 0.3 && seenAgo < 5 && dist(me.pos, last) < 25) target = last;
        else if (side === 'atk' && sp?.state === 'planted' && sp.defuser && dist(me.pos, sp.pos) < 25) target = sp.pos;
        else if (side === 'def' && sp?.state === 'carried' && sp.carrier?.st?.channelUntil > now && dist(me.pos, sp.carrier.pos) < 25) target = sp.carrier.pos; // stop the plant
        else if (side === 'def' && sp?.state === 'planted' && dist(me.pos, sp.pos) < 28 && !used.has('retake' + k)) { target = sp.pos; used.add('retake' + k); } // retake: clear the spike area
        break;
      case 'smoke':
        if (executing && used.size < 6) { const i = [...used].filter(u => u.startsWith('smoke')).length; if (holdSpots[i]) { target = holdSpots[i]; used.add('smoke' + i); } }
        else if (side === 'def' && live && last && seenAgo < 3 && dist(me.pos, last) > 12 && !used.has('dsmoke')) { target = last; used.add('dsmoke'); }
        else if (!m && last && seenAgo < 2 && me.hp < 60 && dist(me.pos, last) < 20) target = last; // deathmatch: smoke off a fight you're losing
        break;
      case 'mapSmoke':
        if (executing && !used.has('msmoke')) { picks = holdSpots.slice(0, kit.charges[k]); target = picks[0]; used.add('msmoke'); }
        else if (side === 'def' && live && last && seenAgo < 3 && dist(me.pos, last) > 10 && !used.has('dmsmoke')) { target = last; used.add('dmsmoke'); }
        break;
      case 'mapDamage': case 'ultMap':
        if (last && seenAgo < 2.5 && !visible) target = last;
        else if (side === 'atk' && sp?.state === 'planted' && sp.defuser) target = sp.pos;
        else if (role === 'ultMap' && executing && holdSpots.length) target = holdSpots[Math.floor(Math.random() * holdSpots.length)]; // clear a defender spot on the execute
        else if (role === 'ultMap' && side === 'def' && sp?.state === 'planted' && dist(me.pos, sp.pos) < 50) target = sp.pos; // retake: hit the planters
        break;
      case 'wall':
        if (gl?.action && dist(me.pos, gl.pos) < 2.5 && last && seenAgo < 8) target = last;
        else if (gl?.action && dist(me.pos, gl.pos) < 2.5 && site) target = side === 'atk' ? (holdSpots[0] || site.center) : site.center;
        else if (side === 'def' && last && seenAgo < 2 && dist(me.pos, last) > 8 && dist(me.pos, last) < 25) target = last;
        break;
      case 'recon':
        if (side === 'atk' && gl && (gl.kind === 'entry' || gl.kind === 'stage') && site && dist(me.pos, site.center) < 45 && !used.has('recon')) { target = site.center; used.add('recon'); }
        else if (side === 'def' && live && gl?.look && now - (m.liveAt || 0) > 12 && !used.has('recon')) { target = gl.look; used.add('recon'); }
        else if (!m && last && seenAgo > 1 && seenAgo < 6) target = last;
        break;
      case 'trap':
        if (side === 'def' && gl?.kind === 'hold' && gl.look && dist(me.pos, gl.pos) < 2 && !used.has('trap' + k)) {
          const dx = gl.look[0] - me.pos[0], dz = gl.look[2] - me.pos[2], l = Math.hypot(dx, dz) || 1, r = Math.min(7, l);
          target = [me.pos[0] + dx / l * r, gl.look[1], me.pos[2] + dz / l * r];
          used.add('trap' + k);
        } else if (!m && !visible && seenAgo > 5) target = [me.pos[0] - Math.sin(me.yaw) * 5, me.pos[1], me.pos[2] - Math.cos(me.yaw) * 5];
        break;
      case 'heal':
        if (me.hp < 60 && seenAgo > 2) target = [me.pos[0] - Math.sin(me.yaw) * 3, me.pos[1], me.pos[2] - Math.cos(me.yaw) * 3];
        break;
      case 'allyHeal': case 'teamHeal': {
        // Patch up a hurt teammate in sight (the human player first), or yourself if that's all there is.
        if (visible || seenAgo < 1.5) break;
        const hurt = g.combatants.filter(c => c !== me && c.alive && !g.isEnemy(me, c) && c.hp < 70 && dist(me.pos, c.pos) < 17 && g.canSee(me.eye(), c.eye()))
          .sort((a, b) => (a.isBot ? 0 : -50) + a.hp - ((b.isBot ? 0 : -50) + b.hp))[0];
        if (hurt) target = [hurt.pos[0], hurt.pos[1] + 0.9, hurt.pos[2]];
        else if (role === 'allyHeal' && me.hp < 55 && seenAgo > 2) target = [me.pos[0] - Math.sin(me.yaw) * 3, me.pos[1] - 1, me.pos[2] - Math.cos(me.yaw) * 3];
        break;
      }
      case 'revive':
        // Walked up to a fallen teammate (the planner sends us): look at the body and bring them back.
        if (gl?.kind === 'revive' && gl.who && !gl.who.alive && dist(me.pos, gl.pos) < 5 && seenAgo > 0.8) target = [gl.pos[0], gl.pos[1] + 0.2, gl.pos[2]];
        break;
      case 'ultGun':
        // Ability-gun ultimates: pull it out as soon as a fight starts, or before taking a site.
        if ((visible && dist(me.pos, bot.target.pos) < 35) || (executing && dist(me.pos, site.center) < 24) || (side === 'def' && sp?.state === 'planted' && dist(me.pos, sp.pos) < 30)) target = visible ? bot.target.eye() : site.center;
        break;
      case 'afterKill':
        if (me.hp < 100 && now - (bot.lastKillAt || -20) < 9) cast(bot, k, null);
        continue;
      case 'ultFight':
        if (visible && dist(me.pos, bot.target.pos) < 30) target = bot.target.eye();
        else if (last && seenAgo < 3 && dist(me.pos, last) < 30 && (executing || sp?.state === 'planted')) target = [last[0], last[1] + 1.2, last[2]];
        break;
      case 'ultSelf':
        if (visible && (me.hp < 90 || Math.random() < 0.6)) target = bot.target.eye();
        else if (executing && dist(me.pos, site.center) < 20) target = site.center;
        break;
      case 'ultRecon':
        if ((executing || (side === 'def' && sp?.state === 'planted')) && site) target = sp?.pos || site.center;
        else if (live && m && now - (m.liveAt || now) > 20 && !used.has('urecon')) { target = site?.center || me.pos; used.add('urecon'); } // mid-round info
        else if (!m && seenAgo > 3) target = [me.pos[0] - Math.sin(me.yaw) * 10, me.pos[1], me.pos[2] - Math.cos(me.yaw) * 10];
        break;
      case 'ultPlace':
        if ((executing && site && dist(me.pos, site.center) < 18) || (side === 'def' && sp?.state === 'planted' && dist(me.pos, sp.pos) < 25) || (visible && !m)) target = [me.pos[0] - Math.sin(me.yaw) * 2, me.pos[1], me.pos[2] - Math.cos(me.yaw) * 2];
        break;
    }
    if (!target) continue;
    const ab = kit.agent.abilities[k];
    if (k !== 'x' && !ab.instant) {
      // Equip first: hands come up holding it, then it's thrown / placed ~0.4 s later.
      kit.armed = { k, at: now };
      me.gun.onHolster();
      g.emit('abilityArm', { who: me, key: k });
      bot.pending = { k, target, picks, at: now + 0.35 + Math.random() * 0.2 };
      bot.lastCast = now;
      return;
    }
    if (cast(bot, k, target, { picks })) return; // one ability per check
  }
}
