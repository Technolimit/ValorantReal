import { priceOf } from './prices.js';
// DOM HUD: crosshair, vitals, ammo, kill feed, damage feedback, scoreboard, death report, buy menu.
import { WEAPONS, BUY_GROUPS } from './weapons.js';
import { PLAYER, TICK_RATE } from './config.js';
import { patternPreview } from './gun.js';
import { MELEE } from './melee.js';
import { KillBanner, bannerColors } from './killbanner.js';
import { AGENTS, SMOKE, BLADES, BEAMS, insideSlab, bloomTargets, BLOOM, PICKUPS } from './abilities.js';

const DEG = Math.PI / 180;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class Hud {
  constructor(game, renderer, settings) {
    this.game = game;
    this.renderer = renderer;
    this.settings = settings;
    this.cache = {};
    this.ch = $('crosshair');
    this.chCtx = this.ch.getContext('2d');
    this.chKey = '';
    this.feed = [];
    this.dirs = [];
    this.nums = [];
    this.centerUntil = 0;
    this.banner = new KillBanner($('killbanner'));
    this.streak = 0;
    this.fps = 0;
    this.buyOpen = false;
    this.cursor = { x: innerWidth / 2, y: innerHeight / 2 };
    this.spray = $('spray');
    this.sprayCtx = this.spray.getContext('2d');
    this.sprayKey = '';
    this.buildAbilities('zephyr');
    this.buildBuyMenu();
    this.hookEvents();
  }

  set(id, value) {
    if (this.cache[id] === value) return;
    this.cache[id] = value;
    $(id).textContent = value;
  }

  hookEvents() {
    const g = this.game;
    g.on('kill', ({ killer, victim, def, headshot, wallbang }) => {
      this.addFeed(killer, victim, def, headshot, wallbang);
      if (killer === g.player && victim !== g.player && g.isEnemy(killer, victim)) this.killBanner(victim, def, headshot);
      if (victim === g.player) {
        // Deathmatch streaks end when you die; in rounds they run for the whole round, like the kill count.
        if (!g.mode) this.streak = 0;
        this.showDeath();
      }
    });
    g.on('round', () => { this.streak = 0; this.banner.clear(); });
    g.on('start', () => { this.streak = 0; this.banner.clear(); });
    g.on('hit', ({ attacker, target, part, amount, point, wallbang }) => {
      if (target === g.player) {
        this.flashDamage(attacker);
      } else if (attacker === g.player && this.settings.damageNumbers) {
        const el = document.createElement('div');
        el.className = 'dmgnum' + (part === 'head' ? ' head' : '') + (wallbang ? ' wall' : '');
        el.textContent = amount;
        $('dmgnums').appendChild(el);
        this.nums.push({ el, point: [...point], t: performance.now() });
      }
    });
    g.on('respawn', ({ who }) => { if (who === g.player) $('death').hidden = true; });
    g.on('start', () => { if (g.player.kit) this.buildAbilities(g.player.kit.id); });
    g.on('abilityLocked', ({ who, key }) => { if (who === g.player && performance.now() - (this.lockMsgAt || 0) > 600) { this.lockMsgAt = performance.now(); this.center(key === 'suppressed' ? '<small>SUPPRESSED · NO ABILITIES</small>' : '<small>CAN\'T USE THAT UNTIL THE ROUND STARTS</small>'); } });
    g.on('abilityFail', ({ who }) => { if (who === g.player) this.center('<small>CAN\'T PLACE THAT THERE</small>'); });
  }

  center(html) {
    const el = $('center-msg');
    el.innerHTML = html;
    el.style.opacity = 1;
    this.centerUntil = performance.now() + 1600;
  }

  // The kill banner, in the colours of the skin on whatever got the kill (your melee's skin for knife kills,
  // your agent's colour for ability kills). An ace is every enemy in the round, all killed by you.
  killBanner(victim, def, headshot) {
    const g = this.game, p = g.player, r = this.renderer;
    this.streak++;
    const colors = WEAPONS[def.id] ? bannerColors(r.skinOf(p, r.modelOf(p, def.id))) : bannerColors('standard', p.kit?.agent.color);
    const enemies = g.mode ? g.combatants.filter(c => g.isEnemy(p, c)) : [];
    const ace = enemies.length > 1 && this.streak >= enemies.length && enemies.every(c => !c.alive);
    this.banner.show({ count: this.streak, colors, ace, caption: `<b>ELIMINATED</b> ${esc(victim.name)}${headshot ? '<small>HEADSHOT</small>' : ''}` });
  }

  addFeed(killer, victim, def, headshot, wallbang) {
    const p = this.game.player;
    const el = document.createElement('div');
    el.className = 'feed' + (killer === p || victim === p ? ' me' : '');
    el.innerHTML = `<span class="k">${esc(killer.name)}</span><span class="w">${esc(def.name)}${wallbang ? ' ⟂' : ''}${headshot ? ' ◎' : ''}</span><span class="v">${esc(victim.name)}</span>`;
    $('killfeed').prepend(el);
    this.feed.push({ el, t: performance.now() });
    while ($('killfeed').children.length > 6) $('killfeed').lastChild.remove();
  }

  flashDamage(attacker) {
    const p = this.game.player;
    const v = $('vignette');
    v.style.opacity = 0.55;
    if (!attacker || attacker === p) return;
    const el = document.createElement('div');
    el.className = 'dmgdir';
    $('dmgdirs').appendChild(el);
    this.dirs.push({ el, from: [...attacker.pos], t: performance.now() });
  }

  showDeath() {
    this.renderDeath();
    $('death').hidden = false;
    this.deathRefresh = performance.now() + 500;
  }

  // Damage recap: every opponent you traded damage with this life, what it came to (your kill, an assist,
  // or the one who killed you), and where your hits landed. Kept up to date while you're dead, so an
  // assist shows once a teammate finishes someone you hurt.
  renderDeath() {
    const p = this.game.player;
    const kb = p.killedBy || {};
    const killer = kb.killer && kb.killer !== p ? kb.killer : null;
    const parts = (h, b, l) => (h + b + l ? `<span class="parts">${h ? `<i class="ph">${h}H</i>` : ''}${b ? `<i>${b}B</i>` : ''}${l ? `<i>${l}L</i>` : ''}</span>` : '');
    const outcome = (o, r) => {
      const dead = !o.alive && o.diedAt >= r.since;
      if (dead && o.killedBy?.killer === p) return ['kill', 'KILL'];
      if (dead && r.dealt > 0) return ['assist', 'ASSIST'];
      return null;
    };
    const list = [...p.report.entries()].map(([o, r]) => ({ o, r, oc: outcome(o, r), you: o === killer }));
    const rank = (e) => (e.you ? 0 : e.oc?.[0] === 'kill' ? 1 : e.oc ? 2 : 3);
    list.sort((a, b) => rank(a) - rank(b) || b.r.dealt - a.r.dealt);
    const rows = list.map(({ o, r, oc, you }) => {
      const tags = (you ? '<span class="tag killer">KILLED YOU</span>' : '') + (oc ? `<span class="tag ${oc[0]}">${oc[1]}</span>` : '');
      return `<tr class="${you ? 'is-killer' : ''}"><td><b>${esc(o.name)}</b>${o.kit ? ` <small>${esc(o.kit.agent.name)}</small>` : ''}<div>${tags}</div></td>` +
        `<td><b>${r.dealt}</b> <small>${r.dealtHits} hit${r.dealtHits === 1 ? '' : 's'}</small>${parts(r.head, r.body, r.legs)}</td>` +
        `<td><b>${r.taken}</b> <small>${r.takenHits} hit${r.takenHits === 1 ? '' : 's'}</small>${parts(r.tHead, r.tBody, r.tLegs)}</td></tr>`;
    }).join('');
    $('death-title').innerHTML = killer
      ? `Killed by <b>${esc(killer.name)}</b> · ${esc(kb.def.name)}${kb.headshot ? ' · headshot' : ''}${kb.wallbang ? ' · wallbang' : ''}`
      : 'You died';
    $('death-report').innerHTML = rows ? `<table><tr><th></th><th>Dealt</th><th>Taken</th></tr>${rows}</table>` : '<small>No damage traded this life.</small>';
  }

  update(dt, view) {
    const g = this.game, p = g.player, s = this.settings, now = performance.now();
    if (!p) return;
    this.fps = this.fps * 0.95 + (dt > 0 ? 1 / dt : 0) * 0.05;
    if (!p.alive && !$('death').hidden && now >= (this.deathRefresh || 0)) { this.deathRefresh = now + 500; this.renderDeath(); }
    // While spectating, health, shield and ammo are the spectated teammate's.
    const sv = (!p.alive && this.specTarget?.alive) ? this.specTarget : p;
    const gun = sv.gun, def = gun.def;

    this.set('hp', Math.max(0, Math.ceil(sv.hp)));
    this.set('armor', Math.max(0, Math.ceil(sv.armor)));
    $('hpbar').style.width = `${Math.min(100, Math.max(0, sv.hp) / PLAYER.hp * 100)}%`;
    $('armorbar').style.width = `${Math.max(0, sv.armor) / PLAYER.armor * 100}%`;
    const blades = p.kit?.blades, beams = p.kit?.beams;
    if (blades) { this.set('mag', blades.left); this.set('reserve', ` / ${BLADES.count}`); }
    else if (beams) { this.set('mag', beams.left); this.set('reserve', ` / ${BEAMS.count}`); }
    else if (def.melee) { this.set('mag', '—'); this.set('reserve', ''); }
    else { this.set('mag', gun.mag); this.set('reserve', ` / ${gun.reserve}`); }
    this.set('wname', blades ? BLADES.name : beams ? BEAMS.name : def.id === 'knife' ? MELEE[this.renderer.meleeOf(sv)].name : def.name);
    this.updateShadowMap(p);
    // "F: pick up" when looking at a dropped gun.
    const look = p.alive && this.game.drops?.length ? this.game.dropInView(p) : null;
    // ...or at your own placed utility you can pick back up.
    const mine = p.alive && p.kit ? p.kit.pickupInView() : null;
    const mineName = mine && (PICKUPS[mine.kind].star ? 'Star' : p.kit.agent.abilities[PICKUPS[mine.kind].k].name);
    const ph = mine ? `<kbd>F</kbd>Pick up ${esc(mineName)}` : look ? `<kbd>F</kbd>${p.inv[look.gun.def.slot] ? 'Swap for' : 'Pick up'} ${esc(look.gun.def.name)}` : '';
    if (this.pickKey !== ph) { this.pickKey = ph; $('pickhint').innerHTML = ph; $('pickhint').hidden = !ph; }
    // While spectating, the ability bar shows the spectated teammate's agent and charges.
    const abWho = sv.kit ? sv : p;
    if (abWho.kit && this.abFor !== abWho.kit.id) this.buildAbilities(abWho.kit.id);
    this.updateAbilities(abWho, g.time);
    this.updateTimers(p, g.time);
    this.updateScreenFx(p, g.time);
    let mode = '';
    const kit = p.kit;
    if (blades) mode = 'LEFT CLICK ONE · RIGHT CLICK ALL';
    else if (beams) mode = `LEFT CLICK TO FIRE · ${Math.max(0, beams.until - g.time).toFixed(1)}s`;
    else if (kit?.armed) { const a = kit.agent.abilities[kit.armed.k]; mode = `${a.name.toUpperCase()} · ${a.armHint || 'LEFT CLICK TO USE'} · ${kit.armed.k.toUpperCase()} TO PUT AWAY`; }
    else if (g.devices.some(d => d.kind === 'cloud' && d.owner === p)) mode = 'VEIL · STEER WITH MOUSE · RELEASE C TO BURST';
    else if (g.devices.some(d => d.kind === 'blaze' && d.owner === p)) mode = kit?.id === 'marina' ? 'RIPTIDE · HOLD E AND TURN TO STEER IT' : 'FIREBREAK · HOLD C AND TURN TO BEND IT';
    else if (p.forced) mode = 'VANISH · STEER WITH MOUSE';
    else if (kit?.tailwind) mode = g.time >= kit.tailwind.readyAt ? `SLIPSTREAM READY · PRESS E · ${(kit.tailwind.until - g.time).toFixed(1)}s` : 'GATHERING WIND…';
    else if (kit?.shadow?.phase === 'channel') mode = `NIGHTWALK · ${(kit.shadow.until - g.time).toFixed(1)}s`;
    else if (kit?.rebirth) mode = `REKINDLE · ${(kit.rebirth.until - g.time).toFixed(1)}s`;
    else if (kit?.launcher) mode = 'FINALE · LEFT CLICK TO FIRE · X TO PUT AWAY';
    else if (kit?.overdrive) mode = `OVERLOAD · HOLD LEFT CLICK · ${(kit.overdrive.until - g.time).toFixed(0)}s`;
    else if (kit?.highGear) mode = `OVERCLOCK · ENERGY ${Math.round(kit.energy)}% · CROUCH TO SLIDE${g.time < kit.slideAt ? ' (' + (kit.slideAt - g.time).toFixed(0) + 's)' : ''}`;
    else if (kit?.drift) mode = `PHASED OUT · ${(kit.drift.until - g.time).toFixed(1)}s · X TO RETURN`;
    else if (kit?.pilot?.kind === 'tiger') mode = `STALKER · STEER WITH MOUSE · LEFT CLICK TO POUNCE · ${(kit.pilot.until - g.time).toFixed(1)}s`;
    else if (kit?.view) mode = g.time >= (kit.view.dartReady || 0) ? 'WATCHER · LEFT CLICK: TRACKING DART · E TO LEAVE' : 'WATCHER · E TO LEAVE';
    else if (kit?.hawk && !kit.hawk.removed) mode = 'LANTERN HAWK · PRESS E TO BURST';
    else if (kit?.gate && !kit.gate.removed) mode = 'RIFTWALK READY · PRESS E TO TELEPORT';
    else if (p.st.disarmUntil > g.time) mode = `DETAINED · ${(p.st.disarmUntil - g.time).toFixed(1)}s`;
    else if (p.st.suppressUntil > g.time) mode = `SUPPRESSED · ${(p.st.suppressUntil - g.time).toFixed(1)}s`;
    else if (p.st.deafUntil > g.time) mode = `DEAFENED · ${(p.st.deafUntil - g.time).toFixed(1)}s`;
    else if (p.st.intangibleUntil > g.time) mode = 'VANISHED';
    else if (kit && g.time < kit.empressUntil) mode = `RAVENOUS · ${(kit.empressUntil - g.time).toFixed(0)}s`;
    else if (kit?.orbs?.length) mode = 'SOUL ORB · Q FEAST · E VANISH';
    else if (kit?.regrow?.on) mode = `BLOOM · ${kit.regrow.healing?.length ? 'HEALING ' + kit.regrow.healing.map(c => esc(c.name)).join(', ') : 'NO ONE TO HEAL'} · POOL ${Math.ceil(kit.regrow.pool)}`;
    else if (kit?.id === 'fawn' && sv === p && (kit.regrow || kit.charges.c > 0) && bloomTargets(p).length) { const n = bloomTargets(p).length; mode = `BLOOM CAN HEAL ${n} TEAMMATE${n > 1 ? 'S' : ''} · HOLD C`; }
    else if (kit?.id === 'venom') mode = `FUEL ${Math.round(kit.gas.fuel)}%`;
    else if (kit?.id === 'lattice' && g.devices.some(d => d.kind === 'cage' && d.owner === p)) mode = 'LOOK AT A CAGE AND PRESS Q TO TRIGGER IT';
    else if (kit?.id === 'stella') mode = g.devices.some(d => d.kind === 'star' && d.owner === p) ? `LOOK AT A STAR: C GRAVITY WELL · Q NOVA PULSE · E NEBULA · ${kit.starsLeft} TO PLACE` : `${kit.starsLeft} STARS · E TO PLACE THEM`;
    else if (kit?.pilot?.kind === 'sdrone') mode = `SCOUT DRONE · FLY WITH MOUSE · LEFT CLICK TO PULSE · ${(kit.pilot.until - g.time).toFixed(1)}s`;
    else if (p.st.downedUntil > g.time) mode = `DOWN · GETTING UP IN ${(p.st.downedUntil - g.time).toFixed(1)}s`;
    else if (kit && g.time < kit.secondLife) mode = `SECOND DAWN · ${(kit.secondLife - g.time).toFixed(0)}s`;
    else if (kit && g.time < kit.nullUntil) mode = `OVERLOADED · ${(kit.nullUntil - g.time).toFixed(0)}s`;
    else if (kit?.shield) mode = 'FOCUS SHIELD UP';
    else if (kit && g.time < kit.focusUntil) mode = `FOCUS · NEXT KILL SHIELDS YOU · ${(kit.focusUntil - g.time).toFixed(0)}s`;
    else if (g.contract && (g.contract.a === p || g.contract.b === p)) mode = `DUEL · ${(g.contract.until - g.time).toFixed(0)}s`;
    else if (kit?.id === 'volt') mode = `ENERGY ${Math.round(kit.energy)}%`;
    else if (gun.reloading) mode = 'RELOADING';
    else if (g.time < gun.equipEnd) mode = 'EQUIPPING';
    else if (def.alt?.type === 'scope' && gun.zoomLevel) mode = `SCOPE ${gun.targetZoom()}x`;
    else if (def.alt?.type === 'zoomBurst' && gun.adsT > 0.5) mode = `ADS ${def.alt.zoom}x · ${def.alt.count}-BURST`;
    else if (def.alt?.type === 'zoom' && gun.adsT > 0.5) mode = `ADS ${def.alt.zoom}x`;
    else if (def.spin && gun.spinT > 0) mode = `SPIN ${gun.rate().toFixed(1)}/s`;
    this.set('wmode', mode);
    $('mag').classList.toggle('low', !def.melee && gun.mag <= Math.ceil(def.mag * 0.25));

    const left = Math.max(0, g.timeLimit - g.time);
    this.set('timer', `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`);
    const leader = [...g.combatants].sort((a, b) => b.stats.kills - a.stats.kills)[0];
    this.set('score', `You ${p.stats.kills} · ${leader === p ? 'leading' : `${leader.name} ${leader.stats.kills}`} · first to ${g.killLimit}`);

    // Crosshair and scope
    const scoped = gun.scoped();
    $('scope').hidden = !scoped || !sv.alive;
    this.ch.style.display = scoped || !sv.alive ? 'none' : '';
    let errPx = 0;
    if (s.chError === 'firing' && !def.melee) {
      errPx = Math.tan(gun.lastSpread * DEG) / Math.tan(this.renderer.vfov() / 2) * (innerHeight / 2);
    }
    this.drawCrosshair(Math.round(errPx));

    // Respawn countdown
    if (!p.alive) this.set('respawn', g.state === 'playing' ? `Respawning in ${Math.max(0, p.respawnAt - g.time).toFixed(1)}` : '');

    // Fades
    const v = $('vignette');
    v.style.opacity = Math.max(0, parseFloat(v.style.opacity || 0) - dt * 1.5);
    if (now > this.centerUntil) $('center-msg').style.opacity = Math.max(0, parseFloat($('center-msg').style.opacity || 0) - dt * 3);
    this.feed = this.feed.filter(f => { if (now - f.t > 6000) { f.el.remove(); return false; } return true; });
    this.dirs = this.dirs.filter(d => {
      const age = (now - d.t) / 1000;
      if (age > 1.4) { d.el.remove(); return false; }
      const dx = d.from[0] - p.pos[0], dz = d.from[2] - p.pos[2];
      const f = [-Math.sin(p.yaw), -Math.cos(p.yaw)], r = [Math.cos(p.yaw), -Math.sin(p.yaw)];
      const ang = Math.atan2(dx * r[0] + dz * r[1], dx * f[0] + dz * f[1]);
      d.el.style.transform = `translate(-50%, -50%) rotate(${ang}rad)`;
      d.el.style.opacity = 1 - age / 1.4;
      return true;
    });
    this.nums = this.nums.filter(n => {
      const age = (now - n.t) / 1000;
      if (age > 0.9) { n.el.remove(); return false; }
      const sp = this.renderer.project([n.point[0], n.point[1] + age * 0.6, n.point[2]]);
      if (!sp) { n.el.style.opacity = 0; return true; }
      n.el.style.transform = `translate(${sp.x}px, ${sp.y}px) translate(-50%, -100%)`;
      n.el.style.opacity = 1 - age / 0.9;
      return true;
    });

    if (!$('scoreboard').hidden) this.renderScoreboard($('scoreboard-body'));

    this.drawSpray(gun, p.alive && s.sprayTrainer && !def.melee && !gun.scoped() && !blades && !beams);

    $('debug').hidden = !s.debug;
    if (s.debug) {
      const sp = p.horizSpeed();
      const rate = def.melee ? 0 : gun.rate();
      $('debug').textContent =
        `fps ${this.fps.toFixed(0)} · tick ${TICK_RATE} Hz\n` +
        `speed ${sp.toFixed(2)} / ${p.maxSpeed(g.time).toFixed(2)} m/s  (${(sp / def.move * 100).toFixed(0)}% of run)\n` +
        `${p.grounded ? 'ground' : 'air'}${p.crouched ? ' · crouch' : ''}${p.input.walk ? ' · walk' : ''} · tag ${(p.tagAmount(g.time) * 100).toFixed(0)}%\n` +
        (def.melee ? '' :
          `spread ${gun.lastSpread.toFixed(3)}° · heat ${gun.heat.toFixed(2)} · ads ${gun.adsT.toFixed(2)}\n` +
          `recoil ${(gun.offP / DEG).toFixed(2)}° up ${(gun.offY / DEG).toFixed(2)}° side · ${rate.toFixed(2)} rps`);
    }

    if (this.buyOpen) {
      const c = $('cursor');
      c.style.transform = `translate(${this.cursor.x}px, ${this.cursor.y}px)`;
    }
  }

  // Spray trainer: grey = the weapon's pattern (where bullets go if you don't move the mouse), red = where
  // your bullets actually went relative to where the spray started. Pull down and against the grey path to
  // pull the red dots into a tight group.
  buildAbilities(agentId) {
    this.abFor = agentId;
    const agent = AGENTS[agentId] || AGENTS.zephyr;
    const root = $('abilities');
    root.innerHTML = '';
    root.style.setProperty('--agent', agent.color);
    this.ab = {};
    for (const k of ['c', 'q', 'e', 'x']) {
      const a = agent.abilities[k];
      const el = document.createElement('div');
      el.className = 'ab' + (k === 'x' ? ' ult' : '');
      const n = k === 'x' ? a.points : this.game.mode ? Math.min(4, priceOf(agentId, a, k).max) : a.charges;
      el.innerHTML = `<i class="cd"></i><b>${k.toUpperCase()}</b><span>${a.name}</span><div class="pips">${'<i></i>'.repeat(n)}</div>`;
      root.appendChild(el);
      this.ab[k] = { el, cd: el.querySelector('.cd'), pips: [...el.querySelectorAll('.pips i')], key: '' };
    }
  }

  updateAbilities(p, now) {
    const kit = p.kit;
    $('abilities').hidden = !kit || !p.alive || (p === this.game.player && !!kit.mapPick);
    if (!kit) return;
    const AB = kit.agent.abilities;
    for (const k of ['q', 'e', 'c', 'x']) {
      const a = this.ab[k];
      let have, frac = 0, ready;
      if (k === 'x') { have = kit.ultPoints; ready = have >= AB.x.points && !kit.blades; }
      else {
        have = kit.charges[k];
        ready = have > 0 || (k === 'c' && !!kit.regrow);
        if (kit.ready[k] && AB[k].cooldown) frac = kit.cooldownLeft(k, now) / AB[k].cooldown;
      }
      if (p.st.suppressUntil > now) ready = false; // suppressed: every ability greys out
      const flash = now - kit.lastUse[k] < 0.15;
      const heal = k === 'c' && kit.id === 'fawn' && ready && p.alive ? bloomTargets(p).length : 0; // Bloom: someone to heal?
      const key = `${have}|${ready}|${flash}|${frac.toFixed(2)}|${!!kit.blades}|${heal}`;
      if (key === a.key) continue;
      a.key = key;
      a.pips.forEach((pip, i) => pip.classList.toggle('on', i < have));
      a.el.classList.toggle('empty', !ready);
      a.el.classList.toggle('ready', k === 'x' && ready);
      a.el.classList.toggle('flash', flash);
      a.el.classList.toggle('canheal', heal > 0);
      a.cd.style.height = `${frac * 100}%`;
    }
  }

  // ---- Ability timers: everything you have running that expires, with a draining bar ----
  timerRows(p, now) {
    const kit = p.kit, g = this.game, rows = [];
    if (!kit || !p.alive) return rows;
    const add = (name, until, total, extra = '') => { const left = until - now; if (left > 0) rows.push({ name, frac: Math.min(1, left / total), text: left.toFixed(1) + 's' + extra }); };
    const pct = (name, frac) => rows.push({ name, frac, text: Math.round(frac * 100) + '%' });
    if (kit.chargeT > 0 && kit.armed) pct('Charge', kit.chargeT / kit.agent.abilities[kit.armed.k].charge);
    if (kit.tailwind) add(now < kit.tailwind.readyAt ? 'Slipstream (gathering)' : 'Slipstream ready', kit.tailwind.until, 7.5);
    if (now < (kit.focusWind || 0)) add('Focus', kit.focusWind, 1);
    add('Focus', kit.focusUntil, 12, kit.shield ? ' · shield up' : '');
    if (kit.shield && now >= kit.focusUntil) rows.push({ name: 'Shield', frac: 1, text: 'up' });
    if (kit.overdrive) add('Overload', kit.overdrive.until, 20);
    if (kit.highGear || kit.id === 'volt') pct('Energy', kit.energy / 100);
    if (kit.id === 'venom') pct('Fuel', kit.gas.fuel / 100);
    if (kit.regrow) pct('Bloom pool', kit.regrow.pool / BLOOM.pool);
    if (kit.drift) add('Phase Out', kit.drift.until, 9);
    if (kit.rebirth) add('Rekindle', kit.rebirth.until, 10);
    add('Second Dawn', kit.secondLife, 40);
    add('Overload', kit.nullUntil, 12);
    add('Ravenous', kit.empressUntil, 30);
    if (kit.shadow?.phase === 'channel') add('Nightwalk', kit.shadow.until, 3);
    if (kit.pilot) add({ tiger: 'Stalker', sdrone: 'Scout Drone', owl: 'Kestrel' }[kit.pilot.kind] || 'Drone', kit.pilot.until, kit.pilot.life);
    if (kit.pilot?.kind === 'owl' && now < kit.pilot.dartReady) add('Dart reload', kit.pilot.dartReady, 5);
    if (kit.beams) add('Talon Strike', kit.beams.until, 6);
    if (g.contract && (g.contract.a === p || g.contract.b === p)) add('Duel', g.contract.until, 15);
    if (kit.nest) add('Nest', kit.nest.until, 15);
    for (const o of kit.orbs || []) add('Soul orb', o.until, 3);
    if (now < (kit.tpReady || 0)) add('Anchor cooldown', kit.tpReady, 20);
    // Your own smokes, fields, walls and gadgets, grouped by type (longest remaining shown).
    const best = new Map();
    const keep = (name, until, total) => { const b = best.get(name); if (!b || until > b.until) best.set(name, { until, total }); };
    const SM = { smoke: 'Smoke', gas: 'Toxin', water: 'Water', cove: 'Lagoon', lane: 'Static Lanes', fire: 'Fire', cage: 'Cage smoke' };
    for (const s of g.smokes) if (s.owner === p && !s.nest && s.until - s.born < 60) keep(SM[s.kind] || 'Smoke', s.until, s.until - s.born);
    for (const z of g.zones) if (z.owner === p && z.until - z.born < 60 && z.kind !== 'trap' && !z.gas) keep(z.def?.name || { slowfield: 'Slow field', stim: 'Rally', lockdown: 'Clampdown' }[z.kind] || 'Field', z.until, z.until - z.born);
    for (const w of g.walls) if (w.owner === p && !w.removed && w.style !== 'arena') keep(w.style === 'cosmic' ? 'Rift Line' : 'Wall', w.until, w.until - w.born);
    const DV = { gate: 'Riftwalk', hawk: 'Lantern Hawk', focusorb: 'Focus orb', cascade: 'Breaker', cloud: 'Veil', blaze: p.kit?.id === 'marina' ? 'Riptide' : 'Firebreak', turret: 'Sentry', decoy: 'Double', leer: 'Glare', drone: 'Drone', boombot: 'Boomer', satchel: 'Charge', prowler: 'Hound', seeker: 'Hunters' };
    for (const d of g.devices) if (d.owner === p && !d.removed && DV[d.kind] && d.until - d.born < 60) keep(DV[d.kind], d.until, d.until - d.born);
    for (const [name, b] of best) add(name, b.until, b.total);
    return rows.slice(0, 8);
  }

  updateTimers(p, now) {
    const rows = this.timerRows(p, now), el = $('timers');
    const key = rows.map(r => r.name + r.text).join('|');
    if (key === this.timerKey) return;
    this.timerKey = key;
    el.innerHTML = rows.map(r => `<div class="tm"><span>${esc(r.name)}</span><i><b style="width:${(r.frac * 100).toFixed(1)}%"></b></i><em>${r.text}</em></div>`).join('');
    el.style.setProperty('--agent', p.kit?.agent.color || '#fff');
  }

  // Grey-out while your head is inside smoke; wind vignette during a dash or lift.
  updateScreenFx(p, now) {
    const eye = p.eye();
    let inside = 0;
    for (const s of this.game.smokes) {
      if (now < s.born || s.kind === 'fire' || (s.nest && s.owner === p)) continue; // your own Nest doesn't blind you
      const grow = Math.min(1, (now - s.born) / SMOKE.grow), fade = Math.min(1, (s.until - now) / 0.4);
      if (s.slab) { if (insideSlab(s, eye, 0.1)) inside = Math.max(inside, 0.85 * fade); continue; }
      const d = Math.hypot(eye[0] - s.pos[0], eye[1] - s.pos[1], eye[2] - s.pos[2]);
      const r = s.radius * grow;
      if (d < r) inside = Math.max(inside, Math.min(1, (r - d) / 0.6) * fade * 0.16); // inside a smoke is a clear pocket; only a light haze
    }
    $('veil').style.opacity = p.alive ? inside.toFixed(3) : 0;
    const kit = p.kit;
    let wind = 0;
    if (kit && kit.id === 'zephyr') {
      wind = Math.max(1 - (now - kit.lastUse.e) / 0.35, (1 - (now - kit.lastUse.q) / 0.5) * 0.7, 0);
      if (!p.grounded && p.input.jumpHeld && p.vel[1] <= -2.2) wind = Math.max(wind, 0.25);
    }
    $('speedlines').style.opacity = wind.toFixed(3);
    // Flashed: white-out that fades over the last part of the blind.
    const bl = p.st.blindUntil - now;
    $('blind').style.opacity = p.alive && bl > 0 ? Math.min(1, bl / Math.max(0.3, p.st.blindLen * 0.5)).toFixed(3) : 0;
    // Concussed: the world goes grey, blurry and shaky with static over it.
    const su = p.alive ? p.st.stunUntil - now : 0, sk = su > 0 ? Math.min(1, su / 0.5) : 0;
    if (sk !== this.lastStun) {
      this.lastStun = sk;
      $('view').style.filter = sk > 0 ? `grayscale(${sk}) blur(${(3.2 * sk).toFixed(2)}px) contrast(${1 - 0.25 * sk})` : '';
    }
    $('stunfx').style.opacity = (sk * 0.75).toFixed(3);
    if (sk > 0) $('stunfx').style.transform = `translate(${(Math.random() * 20 - 10) | 0}px, ${(Math.random() * 20 - 10) | 0}px)`;
    // Channelling Nightwalk: the world darkens around you.
    const sh = p.kit?.shadow;
    $('dusk').style.opacity = sh ? 0.85 : p.kit?.mapPick ? 0.35 : p.kit?.drift ? 0.7 : p.kit?.view ? 0.3 : p.kit?.rebirth ? 0.25 : p.st.intangibleUntil > now ? 0.5 : 0;
    $('dusk').classList.toggle('ember', !!p.kit?.rebirth && !sh);
  }

  // ---- Nightwalk map: top-down view of the map, click to choose where to teleport ----
  updateShadowMap(p) {
    const mp = (p.alive || p.kit?.agent.deadCast) && p.kit?.mapPick;
    const want = !!mp;
    if (want) $('shadowhint').innerHTML = `<b style="color:${mp.color}">${mp.title}</b> ${mp.hint}`;
    if (want && !this.mapOpen) { this.mapOpen = true; this.mapCursor = { x: innerWidth / 2, y: innerHeight / 2 }; }
    if (!want && this.mapOpen) this.mapOpen = false;
    $('shadowmap').hidden = !want;
    $('shadowhint').hidden = !want;
    if (want) this.drawShadowMap(p);
  }

  // Where map picks are measured from: where you stand, or where you fell for abilities used while dead.
  mapOrigin(p) { return p.alive ? p.pos : (p.deathPos || p.pos); }

  mapView() {
    const p = this.game.player, mp = p?.kit?.mapPick;
    const boxes = this.game.map.boxes.filter(b => !b.floor && !b.temp);
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const b of boxes) { x0 = Math.min(x0, b.min[0]); z0 = Math.min(z0, b.min[2]); x1 = Math.max(x1, b.max[0]); z1 = Math.max(z1, b.max[2]); }
    const full = [x0, z0, x1, z1];
    if (mp?.range) {
      // Limited-range picks (sky smokes, Ruse) only show the part of the map around you.
      const o = this.mapOrigin(p), r = mp.range * 1.12;
      x0 = o[0] - r; x1 = o[0] + r; z0 = o[2] - r; z1 = o[2] + r;
    }
    const s = Math.min(innerWidth * 0.86 / (x1 - x0), innerHeight * 0.8 / (z1 - z0));
    const ox = (innerWidth - (x1 - x0) * s) / 2 - x0 * s, oy = (innerHeight - (z1 - z0) * s) / 2 - z0 * s;
    return { boxes, s, ox, oy, x0, z0, x1, z1, full };
  }

  mapToWorld(px, py) {
    const v = this.mapView();
    return [(px - v.ox) / v.s, (py - v.oy) / v.s];
  }

  drawShadowMap(p) {
    const cv = $('shadowmap'), dpr = devicePixelRatio || 1;
    if (cv.width !== innerWidth * dpr || cv.height !== innerHeight * dpr) { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; }
    const c = cv.getContext('2d'), v = this.mapView();
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, innerWidth, innerHeight);
    c.fillStyle = 'rgba(24, 12, 40, 0.92)';
    c.fillRect(0, 0, innerWidth, innerHeight);
    c.fillStyle = '#3a2f55';
    const [fx0, fz0, fx1, fz1] = v.full;
    c.fillRect(fx0 * v.s + v.ox, fz0 * v.s + v.oy, (fx1 - fx0) * v.s, (fz1 - fz0) * v.s);
    for (const b of v.boxes) {
      const h = b.max[1];
      c.fillStyle = h >= 4 ? '#c9b8ff' : h >= 1.9 ? '#8d7bc4' : h >= 1 ? '#6d5d9e' : '#54487c';
      c.fillRect(b.min[0] * v.s + v.ox, b.min[2] * v.s + v.oy, (b.max[0] - b.min[0]) * v.s, (b.max[2] - b.min[2]) * v.s);
    }
    const mp = p.kit.mapPick;
    if (mp.range) {
      // Darken everything outside the usable radius and clip the map to the window around you.
      const o = this.mapOrigin(p), cx = o[0] * v.s + v.ox, cy = o[2] * v.s + v.oy, rr = mp.range * v.s;
      c.save();
      c.fillStyle = 'rgba(10, 6, 18, 0.97)';
      c.beginPath(); c.rect(0, 0, innerWidth, innerHeight); c.arc(cx, cy, rr, 0, Math.PI * 2, true); c.fill('evenodd');
      c.strokeStyle = mp.color; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, rr, 0, Math.PI * 2); c.stroke();
      c.restore();
    }
    // You
    const me = this.mapOrigin(p);
    const px = me[0] * v.s + v.ox, py = me[2] * v.s + v.oy;
    c.fillStyle = '#a67bff';
    c.beginPath(); c.arc(px, py, 7, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#a67bff'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(px, py); c.lineTo(px - Math.sin(p.yaw) * 18, py - Math.cos(p.yaw) * 18); c.stroke();
    // Spots already picked (sky smokes)
    for (const pk of mp.picks || []) {
      c.fillStyle = mp.color + '66'; c.strokeStyle = mp.color; c.lineWidth = 2;
      c.beginPath(); c.arc(pk[0] * v.s + v.ox, pk[2] * v.s + v.oy, (mp.radius || 1) * v.s, 0, Math.PI * 2); c.fill(); c.stroke();
    }
    const m = this.mapCursor, [wx, wz] = this.mapToWorld(m.x, m.y);
    const f = this.game.floorAt(wx, wz), ok = f && (mp.valid ? mp.valid(f) : true) && this.inRange(p, wx, wz);
    if (mp.radius && ok) { c.strokeStyle = mp.color; c.setLineDash([4, 4]); c.beginPath(); c.arc(m.x, m.y, mp.radius * v.s, 0, Math.PI * 2); c.stroke(); c.setLineDash([]); }
    c.strokeStyle = ok ? '#7dffb0' : '#ff4655'; c.lineWidth = 2;
    c.beginPath(); c.arc(m.x, m.y, 12, 0, Math.PI * 2); c.moveTo(m.x - 18, m.y); c.lineTo(m.x + 18, m.y); c.moveTo(m.x, m.y - 18); c.lineTo(m.x, m.y + 18); c.stroke();
  }

  inRange(p, wx, wz) {
    const r = p.kit.mapPick?.range, o = this.mapOrigin(p);
    return !r || Math.hypot(wx - o[0], wz - o[2]) <= r;
  }

  pickShadow(p) {
    const [wx, wz] = this.mapToWorld(this.mapCursor.x, this.mapCursor.y);
    const f = this.game.floorAt(wx, wz);
    if (!this.inRange(p, wx, wz)) { this.center('<small>OUT OF RANGE</small>'); return; }
    if (!p.kit.mapClick(f)) this.center('<small>CAN\'T PICK THAT SPOT</small>');
  }

  drawSpray(gun, show) {
    this.spray.hidden = !show;
    if (!show) { this.sprayKey = ''; return; }
    const sp = gun.spray;
    const key = `${gun.def.id}|${sp ? sp.id + ':' + sp.pts.length : '-'}|${devicePixelRatio}`;
    if (key === this.sprayKey) return;
    this.sprayKey = key;
    const dpr = devicePixelRatio || 1, W = 150, H = 200;
    if (this.spray.width !== W * dpr) {
      this.spray.width = W * dpr; this.spray.height = H * dpr;
      this.spray.style.width = `${W}px`; this.spray.style.height = `${H}px`;
    }
    const c = this.sprayCtx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    c.font = '10px system-ui, sans-serif';
    c.fillStyle = 'rgba(236,232,225,0.75)';
    c.fillText('SPRAY', 8, 14);
    c.fillStyle = 'rgba(236,232,225,0.4)';
    c.fillText('pattern', 52, 14);
    c.fillStyle = '#ff4655';
    c.fillText('your shots', 96, 14);
    const pts = sp && sp.pts.length ? sp.pts : [];
    if (!this.previews) this.previews = {};
    const ref = this.previews[gun.def.id] ||= patternPreview(gun.def);
    // Fit the full-mag pattern (and your spray) in the box, at most 18 px per degree.
    let ext = 0.5 * DEG;
    for (const q of ref) ext = Math.max(ext, Math.abs(q.p), Math.abs(q.y) * 2);
    for (const q of pts) ext = Math.max(ext, Math.abs(q.ap), Math.abs(q.ay) * 2);
    const S = Math.min(18, (H - 42) / (ext / DEG));
    const ox = W / 2, oy = H - 14;
    c.strokeStyle = 'rgba(255,255,255,0.12)';
    c.beginPath(); c.moveTo(ox, 24); c.lineTo(ox, H - 4); c.moveTo(8, oy); c.lineTo(W - 8, oy); c.stroke();
    const P = (y, p) => [ox - (y / DEG) * S, oy - (p / DEG) * S];
    const path = (list, get, stroke, width, fill, r) => {
      c.strokeStyle = stroke; c.lineWidth = width; c.lineJoin = 'round';
      c.beginPath();
      list.forEach((q, i) => { const [x, y] = get(q); i ? c.lineTo(x, y) : c.moveTo(x, y); });
      c.stroke();
      c.fillStyle = fill;
      for (const q of list) { const [x, y] = get(q); c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
    };
    // Reference: where the whole magazine goes if you don't touch the mouse. Shots you've fired light up.
    path(ref, q => P(q.y, q.p), 'rgba(236,232,225,0.22)', 3, 'rgba(236,232,225,0.35)', 1.5);
    const done = ref.slice(0, pts.length);
    if (done.length) path(done, q => P(q.y, q.p), 'rgba(236,232,225,0.5)', 3, 'rgba(236,232,225,0.8)', 1.6);
    if (pts.length) path(pts, q => P(q.ay, q.ap), 'rgba(255,70,85,0.5)', 1, '#ff4655', 2.2);
  }

  drawCrosshair(err) {
    const s = this.settings;
    const key = [s.chColor, s.chOutline, s.chDot, s.chLength, s.chThickness, s.chGap, err, devicePixelRatio].join('|');
    if (key === this.chKey) return;
    this.chKey = key;
    const dpr = devicePixelRatio || 1;
    const size = 240;
    this.ch.width = this.ch.height = size * dpr;
    this.ch.style.width = this.ch.style.height = `${size}px`;
    const c = this.chCtx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, size, size);
    const mid = size / 2, t = s.chThickness, L = s.chLength, gap = s.chGap + err;
    const rects = [];
    if (L > 0) {
      rects.push([mid - t / 2, mid - gap - L, t, L]); // up
      rects.push([mid - t / 2, mid + gap, t, L]); // down
      rects.push([mid - gap - L, mid - t / 2, L, t]); // left
      rects.push([mid + gap, mid - t / 2, L, t]); // right
    }
    if (s.chDot) rects.push([mid - t / 2, mid - t / 2, t, t]);
    if (s.chOutline) {
      c.fillStyle = 'rgba(0,0,0,0.85)';
      for (const [x, y, w, h] of rects) c.fillRect(x - 1, y - 1, w + 2, h + 2);
    }
    c.fillStyle = s.chColor;
    for (const [x, y, w, h] of rects) c.fillRect(x, y, w, h);
  }

  renderScoreboard(tbody) {
    const g = this.game;
    const sortK = (a, b) => b.stats.kills - a.stats.kills || a.stats.deaths - b.stats.deaths;
    const row = (c) => {
      const st = c.stats, hits = st.head + st.body + st.legs;
      const hs = hits ? Math.round(st.head / hits * 100) : 0;
      const ally = c.team === g.player.team;
      return `<tr class="${c === g.player ? 'me' : ''}${c.alive ? '' : ' deadrow'}"><td><span class="tdot" style="background:${ally ? '#4fd1c5' : '#ff5a5a'}"></span>${esc(c.name)}${c.kit ? ` <small>${esc(c.kit.agent.name)}</small>` : ''}${ally && c.alive ? ` <small class="wpn">${esc((c.inv.primary || c.inv.secondary)?.def.name || '')}${c.armor ? ' · ' + (c.armor > 25 ? 'Heavy' : c.armorKind === 'regen' ? 'Regen' : 'Light') : ''}</small>` : ''}</td><td>${st.kills}</td><td>${st.deaths}</td><td>${hs}%</td><td>${ally ? '¤' + c.credits.toLocaleString() : '—'}</td><td>${st.damage}</td></tr>`;
    };
    if (g.mode) {
      const head = (t, cls) => `<tr class="sbteam ${cls}"><td colspan="6">${t}</td></tr>`;
      const mine = g.combatants.filter(c => c.team === g.player.team).sort(sortK), theirs = g.combatants.filter(c => c.team !== g.player.team).sort(sortK);
      const sd = (t) => g.mode.sideOf(t) === 'atk' ? 'ATTACK' : 'DEFENSE';
      tbody.innerHTML = head(`YOUR TEAM · ${sd(g.player.team)} · ${g.mode.score[g.player.team]}`, 'a') + mine.map(row).join('') + head(`ENEMY TEAM · ${sd(1 - g.player.team)} · ${g.mode.score[1 - g.player.team]}`, 'e') + theirs.map(row).join('');
      $('sb-col5').textContent = 'Credits';
      return;
    }
    $('sb-col5').textContent = 'Acc';
    const rows = [...g.combatants].sort(sortK);
    tbody.innerHTML = rows.map(c => {
      const st = c.stats, hits = st.head + st.body + st.legs;
      const hs = hits ? Math.round(st.head / hits * 100) : 0;
      const acc = st.shots ? Math.round(st.hits / st.shots * 100) : 0;
      return `<tr class="${c === this.game.player ? 'me' : ''}"><td>${esc(c.name)}</td><td>${st.kills}</td><td>${st.deaths}</td><td>${hs}%</td><td>${acc}%</td><td>${st.damage}</td></tr>`;
    }).join('');
  }

  buildBuyMenu() {
    const root = $('buy-groups');
    root.innerHTML = BUY_GROUPS.map(([title, ids]) => `
      <section><h3>${title}</h3>${ids.map(id => {
        const w = WEAPONS[id];
        const b = w.dmg[0];
        const rate = w.spin ? `${w.rate}→${w.spin.to}` : w.rate;
        return `<button class="card" data-id="${id}"><span class="n">${w.name}</span><span class="c">¤${w.cost}</span>
          <span class="s">${b[1]} / ${b[2]} / ${b[3]}${w.pellets ? ` ×${w.pellets}` : ''} · ${rate}/s · ${w.mag} rds</span></button>`;
      }).join('')}</section>`).join('');
  }

  markLoadout(loadout) {
    for (const el of document.querySelectorAll('#buy .card')) {
      el.classList.toggle('sel', el.dataset.id === loadout.primary || el.dataset.id === loadout.secondary);
    }
  }
}
