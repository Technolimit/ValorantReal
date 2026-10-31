// HUD for the 5v5 round mode: score bar with alive markers, round / spike timers, phase banners,
// plant & defuse progress, credits, spectating, and the buy screen.
import { WEAPONS, BUY_GROUPS } from './weapons.js';
import { ROUND, ECON, SHIELDS, abilityPrice } from './rounds.js';
import { AGENTS } from './abilities.js';
import { emblem } from './agentselect.js';
import { gunIcons, warmGunIcons } from './gunicons.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clock = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const SIDE = { atk: 'ATTACK', def: 'DEFENSE' };
const an = (w) => /^[aeiou]/i.test(w) ? 'an' : 'a';
const SHOP_TITLES = { Snipers: 'Sniper rifles', Heavies: 'Machine guns' };
// The credits mark: our own little coin, not Riot's.
const CR = '<svg class="cr" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8 4.3 10.9 8 8 11.7 5.1 8Z" fill="currentColor"/></svg>';
// Shield marks: one chevron (light), a chevron with a refill arc (regen), two chevrons (heavy).
const SHIELD_ICON = {
  light: '<svg class="shi" viewBox="0 0 24 24"><path d="M12 2 21 6v6c0 5-4 8.5-9 10C7 20.5 3 17 3 12V6Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7.5 11.5 12 9l4.5 2.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  regen: '<svg class="shi" viewBox="0 0 24 24"><path d="M12 2 21 6v6c0 5-4 8.5-9 10C7 20.5 3 17 3 12V6Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 13a4 4 0 1 0 2-3.5M8 7.5V10h2.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  heavy: '<svg class="shi" viewBox="0 0 24 24"><path d="M12 2 21 6v6c0 5-4 8.5-9 10C7 20.5 3 17 3 12V6Z" fill="currentColor" opacity=".25"/><path d="M12 2 21 6v6c0 5-4 8.5-9 10C7 20.5 3 17 3 12V6Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7.5 10 12 7.5l4.5 2.5M7.5 14 12 11.5l4.5 2.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
};
// Every gun the buy menu shows, for its icons.
const SHOP_GUNS = Object.keys(WEAPONS).filter(id => WEAPONS[id].cost !== undefined && !WEAPONS[id].melee && !WEAPONS[id].ability);
const REASON = { eliminated: 'Team eliminated', time: 'Time ran out', detonated: 'Spike detonated', defused: 'Spike defused' };

export class RoundHud {
  constructor(game) {
    this.game = game;
    this.cache = {};
    this.bannerUntil = 0;
    this.shopOpen = false;
    this.shopHtml = {};
    this.spectating = null;
    warmGunIcons(SHOP_GUNS); // drawn in the background now, so the first B press doesn't wait for them
    const g = game;
    g.on('round', ({ mode }) => this.banner(`<b>ROUND ${mode.round}</b><small>${mode.round === ROUND.half + 1 ? 'SIDES SWAPPED · ' : ''}${SIDE[mode.sideOf(0)]} · BUY PHASE</small>`, 3));
    g.on('live', () => this.banner('<b>ROUND START</b>', 1.6));
    g.on('planted', ({ site, who }) => this.banner(`<b class="warn">SPIKE PLANTED</b><small>SITE ${site}${who === g.player ? ' · YOU' : ''}</small>`, 2.5));
    g.on('defuseHalf', () => {});
    g.on('orbTaken', ({ who }) => {
      if (who === g.player) {
        this.banner('<b class="good">ULTIMATE ORB</b><small>+1 ULTIMATE POINT</small>', 1.6);
        const ult = document.querySelector('#abilities .ab.ult');
        if (ult) { ult.classList.remove('gain'); void ult.offsetWidth; ult.classList.add('gain'); }
      } else if (who && who.team === g.player.team) this.notice(`<b>${esc(who.name)}</b> took an ultimate orb`);
    });
    // Weapon requests and gifts from teammates, as short notices on the left.
    g.on('request', ({ who, id }) => { if (id && who !== g.player && who.team === g.player.team) this.notice(`<b>${esc(who.name)}</b> requests ${an(WEAPONS[id].name)} <b class="rq">${esc(WEAPONS[id].name)}</b>${this.shopOpen ? '' : ' · B to buy it for them'}`); });
    g.on('gifted', ({ from, to, id }) => {
      if (to === g.player) this.notice(`<b>${esc(from.name)}</b> bought you ${an(WEAPONS[id].name)} <b class="rq">${esc(WEAPONS[id].name)}</b>`);
      else if (from === g.player) this.notice(`You bought <b>${esc(to.name)}</b> ${an(WEAPONS[id].name)} <b class="rq">${esc(WEAPONS[id].name)}</b>`);
    });
    g.on('roundEnd', (r) => {
      const won = r.winTeam === 0;
      this.banner(`<b class="${won ? 'good' : 'warn'}">${won ? 'ROUND WON' : 'ROUND LOST'}</b><small>${REASON[r.reason] || ''}</small>`, ROUND.end - 0.5);
    });
    g.on('start', () => { this.spectating = null; this.shopKey = ''; this.cache = {}; });
  }

  notice(html) {
    const el = document.createElement('div');
    el.innerHTML = html;
    $('rnotice').prepend(el);
    while ($('rnotice').children.length > 4) $('rnotice').lastChild.remove();
    setTimeout(() => el.remove(), 5000);
  }

  set(id, v) { if (this.cache[id] === v) return; this.cache[id] = v; $(id).innerHTML = v; }

  banner(html, secs) {
    const el = $('rbanner');
    el.innerHTML = html;
    el.style.opacity = 1;
    this.bannerUntil = performance.now() + secs * 1000;
  }

  update(dt) {
    const g = this.game, m = g.mode, p = g.player, now = g.time;
    const on = !!m;
    $('rbar').hidden = !on || this.shopOpen; // the shop covers the round HUD, as in Valorant
    $('top').hidden = on || this.shopOpen;
    if (!on) {
      $('rnotice').textContent = ''; $('rchannel').hidden = true; $('rcredits').hidden = true; $('rhint').textContent = '';
      $('shop').hidden = !this.shopOpen; // deathmatch's loadout screen
      if (this.shopOpen) this.renderLoadout();
      return;
    }
    // Score bar
    const mySide = m.sideOf(0);
    this.set('rs0', m.score[0]); this.set('rs1', m.score[1]);
    this.set('rside0', SIDE[mySide]); this.set('rside1', SIDE[m.sideOf(1)]);
    let t, label = '';
    if (m.phase === 'buy') { t = m.phaseEnd - now; label = 'BUY PHASE'; }
    else if (m.phase === 'planted') { t = m.spike.plantedAt + ROUND.spike - now; label = 'SPIKE'; }
    else if (m.phase === 'end') { t = m.phaseEnd - now; label = 'NEXT ROUND'; }
    else { t = m.phaseEnd - now; }
    this.set('rtimer', m.phase === 'planted' ? `<span class="warn">${clock(t)}</span>` : clock(t));
    this.set('rround', label ? `${label} · ROUND ${m.round}` : `ROUND ${m.round}`);
    for (const team of [0, 1]) {
      const list = g.combatants.filter(c => c.team === team);
      // Your team: a health bar and number per player (shield as a cap on top); enemies: plain pips.
      this.set('rpips' + team, list.map(c => team === p.team
        ? `<i class="ally${c.alive ? '' : ' dead'}${c === p ? ' me' : ''}${c.alive && c.hp < 50 ? ' low' : ''}" title="${esc(c.name)}"><s style="height:${c.alive ? Math.min(100, Math.max(0, c.hp)) : 0}%"></s>${c.alive && c.armor > 0 ? `<u style="height:${Math.min(100, c.armor / 50 * 100)}%"></u>` : ''}<em>${c.alive ? Math.ceil(c.hp) : '✕'}</em></i>`
        : `<i class="${c.alive ? '' : 'dead'}" title="${esc(c.name)}"></i>`).join(''));
    }
    // Banner fade
    const bl = this.bannerUntil - performance.now();
    $('rbanner').style.opacity = bl > 0 ? Math.min(1, bl / 400) : 0;
    // Plant / defuse progress
    const sp = m.spike;
    let ch = null;
    if (sp?.state === 'carried' && sp.carrier === p && sp.plantProg > 0) ch = { text: 'PLANTING', frac: sp.plantProg / ROUND.plant };
    if (sp?.state === 'planted' && sp.defuser === p && sp.defuseProg > 0) ch = { text: sp.halfDone ? 'DEFUSING · HALF SAVED' : 'DEFUSING', frac: sp.defuseProg / ROUND.defuse };
    // A teammate planting or defusing: show their progress too.
    else if (sp?.state === 'planted' && sp.defuser && sp.defuser !== p && sp.defuser.team === p.team && sp.defuseProg > 0) ch = { text: `${sp.defuser.name.toUpperCase()} DEFUSING${sp.halfDone ? ' · HALF SAVED' : ''}`, frac: sp.defuseProg / ROUND.defuse };
    else if (sp?.state === 'carried' && sp.carrier && sp.carrier !== p && sp.carrier.team === p.team && sp.plantProg > 0) ch = { text: `${sp.carrier.name.toUpperCase()} PLANTING`, frac: sp.plantProg / ROUND.plant };
    const orb = m.orbs?.find(o => !o.taken && o.by === p && o.prog > 0);
    if (orb) ch = { text: 'TAKING ULTIMATE ORB', frac: orb.prog / ROUND.orb };
    $('rchannel').hidden = !ch;
    if (ch) { $('rchtext').textContent = ch.text; $('rchbar').style.width = (ch.frac * 100).toFixed(1) + '%'; }
    // Hints
    let hint = '';
    if (p.alive) {
      const nearSpike = sp?.state === 'dropped' && m.side(p) === 'atk';
      if (nearSpike && m.phase === 'buy') hint = 'Press B to buy · walk over the spike to pick it up';
      else if (m.phase === 'buy') hint = sp?.carrier === p ? 'Press B to buy · you have the spike' : 'Press B to buy';
      else if (nearSpike) hint = 'The spike is on the ground — walk over it to pick it up';
      else if (sp?.state === 'carried' && sp.carrier === p) hint = m.inSite(p.pos) ? 'Hold F to plant the spike' : 'You have the spike — plant it on A or B';
      else if (sp?.state === 'planted' && m.side(p) === 'def' && Math.hypot(p.pos[0] - sp.pos[0], p.pos[2] - sp.pos[2]) < 1.8) hint = 'Hold F to defuse';
      else if (m.orbNear?.(p)) hint = p.kit && p.kit.ultPoints >= p.kit.ultCost ? 'Ultimate orb · your ultimate is already full' : 'Hold F to take the ultimate orb (+1 ultimate point)';
    } else {
      const s = this.spectating && this.spectating.alive ? this.spectating : null;
      hint = s ? `Spectating ${s.name}${s.kit ? ' (' + s.kit.agent.name + ')' : ''} · ${s.gun?.def.name || ''} · click to switch` : (sp ? 'Your team is down · watching the spike' : 'Waiting for the next round');
    }
    if ($('rhint').textContent !== hint) $('rhint').textContent = hint;
    $('rcredits').hidden = m.phase !== 'buy' || this.shopOpen;
    this.set('rcredits', `¤ ${p.credits.toLocaleString()}`);
    if (!p.alive) $('respawn').textContent = 'Waiting for the next round';
    if (this.shopOpen) this.renderShop();
  }

  // ---------- spectating ----------
  spectateTarget() {
    const g = this.game, p = g.player;
    if (!g.mode || p.alive) return null;
    const allies = g.combatants.filter(c => c.alive && c.team === p.team && c !== p);
    if (!allies.includes(this.spectating)) this.spectating = allies[0] || null;
    return this.spectating;
  }
  nextSpectate() {
    const g = this.game, p = g.player;
    const allies = g.combatants.filter(c => c.alive && c.team === p.team && c !== p);
    if (!allies.length) return;
    const i = allies.indexOf(this.spectating);
    this.spectating = allies[(i + 1) % allies.length];
  }

  // ---------- buy screen ----------
  // Laid out like Valorant's: credits and the economy across the top, guns in columns (sidearms, SMGs and
  // shotguns, rifles, snipers and machine guns), shields and abilities underneath, and the team on the
  // right with each teammate's credits, loadout and weapon request. Click a gun you can't afford to request
  // it; click a teammate's request to buy it for them.
  toggleShop(open = !this.shopOpen) {
    this.shopOpen = open;
    $('shop').hidden = !open;
    $('shop').classList.toggle('dm', !this.game.mode);
    $('shop-h').textContent = this.game.mode ? 'Shop' : 'Loadout';
    this.shopKey = '';
    this.shopHtml = {};
    this.hovered = null;
    if (open) { this.icons = gunIcons(SHOP_GUNS); this.game.mode ? this.renderShop() : this.renderLoadout(); }
  }

  // Deathmatch: the same screen, but every gun is free, as in Valorant. Picking one puts it in your hands now
  // and on every respawn; the side panel shows the loadout instead of the team.
  renderLoadout() {
    const p = this.game.player, l = p.loadout || {};
    const key = [l.primary, l.secondary].join('|');
    if (key === this.shopKey) return;
    this.shopKey = key;
    const icon = (id) => this.icons?.[id] ? `<img src="${this.icons[id]}" alt="">` : '';
    const card = (item, inner, state) => `<button class="scard ${state}" data-item='${JSON.stringify(item)}'>${inner}</button>`;
    const gun = (id) => {
      const on = l.primary === id || l.secondary === id;
      return card({ type: 'weapon', id }, `<span class="pr">FREE</span>${icon(id)}<span class="n">${esc(WEAPONS[id].name)}</span>${on ? '<span class="tag">EQUIPPED</span>' : ''}`, `gun${on ? ' owned' : ''}`);
    };
    const groups = Object.fromEntries(BUY_GROUPS);
    const col = (...names) => `<div class="scol">${names.map(n => `<section><h3>${SHOP_TITLES[n] || n}</h3>${groups[n].map(gun).join('')}</section>`).join('')}</div>`;
    this.put('shop-phase', 'DEATHMATCH', true);
    this.put('shop-time', '', true);
    this.put('shop-note', 'Every gun is free · left click to equip it now and on every respawn', true);
    if (p.kit) $('shop').style.setProperty('--agent', p.kit.agent.color);
    const rebuilt = this.put('shop-grid', col('Sidearms') + col('SMGs', 'Shotguns') + col('Rifles') + col('Snipers', 'Heavies'))
      | this.put('shop-gear', `<section class="sgear"><h3>Shields</h3><div>${card({ type: 'none', sh: 'heavy' }, `<span class="pr">FREE</span>${SHIELD_ICON.heavy}<span class="n">Heavy Shields</span><span class="tag">EVERY SPAWN</span>`, 'gear owned')}</div></section>`);
    const slot = (label, id) => `<div class="lslot"><small>${label}</small>${id ? `${icon(id)}<b>${esc(WEAPONS[id].name)}</b>` : '<b class="none">None</b>'}</div>`;
    this.put('shop-team', `<h3>Your loadout</h3>${slot('Primary', l.primary)}${slot('Sidearm', l.secondary)}<div class="lslot"><small>Shield</small>${SHIELD_ICON.heavy}<b>Heavy</b></div><p class="lnote">Kept for every respawn and your next deathmatch.</p>`);
    if (this.hovered && rebuilt) this.hover(this.hovered.dataset.item, true);
  }

  renderShop() {
    const g = this.game, m = g.mode, p = g.player;
    if (!m) return;
    const bought = m.boughtThisRound?.get(p) || [];
    const canBuy = m.canBuy(p);
    const team = g.combatants.filter(c => c.team === p.team);
    const myReq = m.requests?.get(p)?.id || null;
    const teamKey = team.map(c => [c.credits, this.primaryOf(c), this.shieldOf(c), m.requests?.get(c)?.id || ''].join(':')).join(',');
    // The clock ticks on its own: rebuilding the cards every second just for it made the menu stutter.
    this.put('shop-time', canBuy ? clock(m.phaseEnd - g.time) : '', true);
    const key = [p.credits, p.inv.primary?.def.id, p.inv.secondary?.def.id, p.armor > 0 && p.armorKind, p.kit && JSON.stringify(p.kit.charges), p.kit?.ultPoints, canBuy, bought.length, teamKey, m.lossStreak?.join()].join('|');
    if (key === this.shopKey) return;
    this.shopKey = key;
    const owned = (id) => p.inv.primary?.def.id === id || p.inv.secondary?.def.id === id;
    const icon = (id) => this.icons?.[id] ? `<img src="${this.icons[id]}" alt="">` : '';
    const card = (item, inner, state) => `<button class="scard ${state}" data-item='${JSON.stringify(item)}'>${inner}</button>`;
    const gun = (id) => {
      const w = WEAPONS[id];
      const isOwned = owned(id), poor = !isOwned && p.credits < w.cost, req = myReq === id;
      const tag = isOwned ? 'OWNED' : req ? 'REQUESTED' : poor && canBuy && w.cost ? 'REQUEST' : '';
      // Can't afford it: the click asks the team instead.
      const item = poor && w.cost ? { type: 'request', id } : { type: 'weapon', id };
      return card(item, `<span class="pr">${w.cost ? CR + w.cost.toLocaleString() : 'FREE'}</span>${icon(id)}<span class="n">${esc(w.name)}</span>${tag ? `<span class="tag">${tag}</span>` : ''}`,
        `gun${isOwned ? ' owned' : ''}${poor ? ' poor' : ''}${req ? ' req' : ''}`);
    };
    const groups = Object.fromEntries(BUY_GROUPS);
    const col = (...names) => `<div class="scol">${names.map(n => `<section><h3>${SHOP_TITLES[n] || n}</h3>${groups[n].map(gun).join('')}</section>`).join('')}</div>`;
    const grid = col('Sidearms') + col('SMGs', 'Shotguns') + col('Rifles') + col('Snipers', 'Heavies');
    const shields = `<section class="sgear"><h3>Shields</h3><div>${Object.entries(SHIELDS).map(([id, s]) => {
      const have = p.armor >= s.armor && (p.armorKind || 'light') === id;
      return card({ type: 'shield', id }, `<span class="pr">${CR}${s.cost}</span>${SHIELD_ICON[id]}<span class="n">${esc(s.name)}</span>${have ? '<span class="tag">OWNED</span>' : ''}`, `gear${have ? ' owned' : p.credits < s.cost ? ' poor' : ''}`);
    }).join('')}</div></section>`;
    let abil = '';
    if (p.kit) {
      const ab = p.kit.agent.abilities;
      const pips = (have, max) => max > 4 ? `<em>${have}/${max}</em>` : `<span class="pips">${'<i class="on"></i>'.repeat(have)}${'<i></i>'.repeat(Math.max(0, max - have))}</span>`;
      abil = `<section class="sgear"><h3>Abilities · ${esc(p.kit.agent.name)}</h3><div>${['c', 'q', 'e'].map(k => {
        const a = ab[k], have = p.kit.charges[k], pr = abilityPrice(p, k);
        if (pr.cost === null) return card({ type: 'none', ab: k }, `<span class="pr">FREE</span><b class="key">${k.toUpperCase()}</b><span class="n">${esc(a.name)}</span><span class="tag">SIGNATURE</span>`, 'gear ab owned');
        return card({ type: 'ability', key: k }, `<span class="pr">${CR}${pr.cost}</span><b class="key">${k.toUpperCase()}</b><span class="n">${esc(a.name)}</span>${pips(have, pr.max)}`, `gear ab${have >= pr.max ? ' owned' : p.credits < pr.cost ? ' poor' : ''}`);
      }).join('')}${card({ type: 'none', ab: 'x' }, `<span class="pr">${p.kit.ultPoints}/${p.kit.ultCost}</span><b class="key">X</b><span class="n">${esc(ab.x.name)}</span><span class="pips ult">${'<i class="on"></i>'.repeat(Math.min(p.kit.ultPoints, p.kit.ultCost))}${'<i></i>'.repeat(Math.max(0, p.kit.ultCost - p.kit.ultPoints))}</span>`, `gear ab ult${p.kit.ultPoints >= p.kit.ultCost ? ' owned' : ''}`)}</div></section>`;
    }
    // Economy strip: credits, the least you'll have next round, and the loss bonus ladder.
    const streak = m.lossStreak?.[p.team] || 0, min = m.minNextRound?.(p);
    this.put('shop-credits', `${CR}${p.credits.toLocaleString()}`);
    this.put('shop-min', min == null ? '—' : `${CR}${min.toLocaleString()}`);
    this.put('shop-loss', ECON.loss.map((v, i) => `<i class="${i < streak ? 'on' : ''}${i === Math.min(2, streak) ? ' next' : ''}" title="${v}"><span>${(v / 1000).toFixed(1)}k</span></i>`).join(''));
    this.put('shop-phase', canBuy ? 'BUY PHASE' : 'BUY PHASE OVER', true);
    this.put('shop-note', canBuy ? 'Left click to buy · right click to sell back · click a gun you can\'t afford to request it · click a teammate\'s request to buy it for them' : 'The buy phase is over', true);
    if (p.kit) $('shop').style.setProperty('--agent', p.kit.agent.color);
    // Only the parts whose markup changed are rebuilt: a bot spending credits redraws the team list, not the guns.
    const rebuilt = this.put('shop-grid', grid) | this.put('shop-gear', shields + abil);
    // Team: you first, then teammates by credits.
    const total = team.reduce((a, c) => a + (c.credits || 0), 0);
    const rows = [p, ...team.filter(c => c !== p).sort((a, b) => b.credits - a.credits)].map(c => {
      const a = c.kit?.agent || AGENTS[c.agentId];
      const w = this.primaryOf(c), sh = this.shieldOf(c), rq = m.requests?.get(c)?.id;
      let req = '';
      if (rq) {
        const def = WEAPONS[rq];
        req = c === p
          ? card({ type: 'request', id: rq }, `<span class="rl">YOUR REQUEST</span>${icon(rq)}<span class="rp">${esc(def.name)} · click to cancel</span>`, 'treq mine')
          : card({ type: 'gift', to: m.refOf(c) }, `<span class="rl">REQUESTING</span>${icon(rq)}<span class="rp">${esc(def.name)} · BUY ${CR}${def.cost.toLocaleString()}</span>`, `treq${p.credits < def.cost || !canBuy ? ' poor' : ''}`);
      }
      return `<div class="tmate${c === p ? ' me' : ''}${c.alive ? '' : ' dead'}${rq ? ' asking' : ''}">
        <div class="tport" style="--ag:${a?.color || '#8a96a3'}">${a ? emblem(a.emblem, a.color) : ''}</div>
        <div class="tinfo"><b>${esc(c === p ? 'You' : c.name)}</b><small>${esc(a?.name || '')}</small></div>
        <div class="tload">${w ? icon(w) : `<span class="none">${c.inv.secondary ? esc(c.inv.secondary.def.name) : ''}</span>`}${sh ? `<span class="tsh">${SHIELD_ICON[sh]}</span>` : ''}</div>
        <div class="tcr">${CR}${(c.credits || 0).toLocaleString()}</div>${req}</div>`;
    }).join('');
    const teamRebuilt = this.put('shop-team', `<h3>Team <span>${CR}${total.toLocaleString()}</span></h3>${rows}`);
    if (this.hovered && (rebuilt || teamRebuilt)) this.hover(this.hovered.dataset.item, true);
  }

  // Sets an element's markup (or text) only when it differs from what this shop last put there. Returns
  // whether it changed. toggleShop clears the record, so opening the shop always draws everything.
  put(id, html, text = false) {
    if (this.shopHtml[id] === html) return false;
    this.shopHtml[id] = html;
    if (text) $(id).textContent = html; else $(id).innerHTML = html;
    return true;
  }

  // A teammate's primary and shield, from their inventory (the host and offline) or the host's buy-phase
  // report of it (online, for players this browser doesn't simulate).
  primaryOf(c) { return c === this.game.player || !this.game.mode?.mirror ? c.inv.primary?.def.id || null : c.netPrimary || null; }
  shieldOf(c) { return c === this.game.player || !this.game.mode?.mirror ? (c.armor > 0 ? c.armorKind || 'light' : null) : c.netShield || null; }

  // The card under the virtual cursor gets the hover outline, and its details fill the panel.
  updateHover(cursor) {
    if (!this.shopOpen || !cursor) return;
    const el = document.elementFromPoint(cursor.x, cursor.y)?.closest('#shop .scard') || null;
    const item = el?.dataset.item || null;
    if (item === this.hoverItem && el === this.hovered) return;
    this.hovered?.classList.remove('hover');
    el?.classList.add('hover');
    this.hovered = el;
    this.hover(item);
  }
  hover(itemJson, force = false) {
    if (itemJson === this.hoverItem && !force) return;
    this.hoverItem = itemJson;
    // Re-find the element after a rebuild so the outline survives it.
    if (force && itemJson) { const el = [...document.querySelectorAll('#shop .scard')].find(e => e.dataset.item === itemJson); this.hovered = el || null; el?.classList.add('hover'); }
    const item = itemJson ? JSON.parse(itemJson) : null, p = this.game.player;
    let html = '';
    if (item && (item.type === 'weapon' || item.type === 'request') && WEAPONS[item.id]) {
      const w = WEAPONS[item.id];
      const n = w.dmg.length; // the last bracket covers anything farther
      const ranges = w.dmg.map((b, i) => [n === 1 ? 'Any' : i === n - 1 ? `${w.dmg[i - 1][0]}m+` : `${i ? w.dmg[i - 1][0] : 0}–${b[0]}m`, b]);
      html = `<div class="dh"><b>${esc(w.name)}</b><small>${esc(w.cat)}</small><span>${w.cost && this.game.mode ? CR + w.cost.toLocaleString() : 'FREE'}</span></div>
        ${this.icons?.[item.id] ? `<img class="dimg" src="${this.icons[item.id]}" alt="">` : ''}
        <table class="dtab"><tr><th>Range</th><th>Head</th><th>Body</th><th>Leg</th></tr>${ranges.map(([r, b]) => `<tr><td>${r}</td><td>${b[1]}</td><td>${b[2]}</td><td>${b[3]}</td></tr>`).join('')}</table>
        <div class="dstats"><span>Fire rate<b>${w.spin ? `${w.rate}→${w.spin.to}` : w.rate}/s</b></span><span>Magazine<b>${w.mag}${w.pellets ? ` · ×${w.pellets}` : ''}</b></span><span>Wall pen<b>${esc(w.pen || '—')}</b></span><span>Reload<b>${w.reload}s</b></span></div>`;
    } else if (item?.sh) {
      html = `<div class="dh"><b>Heavy Shields</b><small>Shield</small><span>FREE</span></div><p>Every spawn comes with ${SHIELDS.heavy.armor} shield. It absorbs damage before health.</p>`;
    } else if (item?.type === 'shield' && SHIELDS[item.id]) {
      const s = SHIELDS[item.id];
      html = `<div class="dh"><b>${esc(s.name)}</b><small>Shield</small><span>${CR}${s.cost}</span></div><p>${s.pool ? `${s.armor} shield that refills from a ${s.pool}-point reserve after a moment out of combat.` : `Absorbs damage for ${s.armor} points before health.`}</p>`;
    } else if (p.kit && (item?.type === 'ability' || item?.ab)) {
      const k = item.key || item.ab, a = p.kit.agent.abilities[k];
      html = `<div class="dh"><b>${esc(a.name)}</b><small>${k === 'x' ? `Ultimate · ${p.kit.ultCost} points` : k === 'e' ? 'Signature' : 'Ability'}</small></div><p>${esc(a.desc || '')}</p>`;
    } else if (item?.type === 'gift') {
      const c = this.game.mode?.byRef(item.to), rq = c && this.game.mode.requests.get(c);
      if (rq) html = `<div class="dh"><b>Buy for ${esc(c.name)}</b><small>Request</small><span>${CR}${WEAPONS[rq.id].cost.toLocaleString()}</span></div><p>It drops at ${esc(c.name)}'s feet with your skin.</p>`;
    }
    $('shop-detail').innerHTML = html || '<p class="dim">Hover an item to see its details.</p>';
  }

  // Called with the element under the virtual cursor; button 0 = buy, 2 = sell.
  shopClick(el, button) {
    const g = this.game, m = g.mode;
    if (!el || !m) return null;
    const item = JSON.parse(el.dataset.item || '{}');
    if (!item.type || item.type === 'none') return null;
    if (button === 2 && (item.type === 'request' || item.type === 'gift')) return null;
    const err = button === 2 ? m.sell(g.player, item) : m.buy(g.player, item);
    this.shopKey = '';
    this.renderShop();
    return err;
  }
}
