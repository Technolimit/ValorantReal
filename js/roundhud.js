// HUD for the 5v5 round mode: score bar with alive markers, round / spike timers, phase banners,
// plant & defuse progress, credits, spectating, and the buy screen.
import { WEAPONS, BUY_GROUPS } from './weapons.js';
import { ROUND, SHIELDS, abilityPrice } from './rounds.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clock = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const SIDE = { atk: 'ATTACK', def: 'DEFENSE' };
const REASON = { eliminated: 'Team eliminated', time: 'Time ran out', detonated: 'Spike detonated', defused: 'Spike defused' };

export class RoundHud {
  constructor(game) {
    this.game = game;
    this.cache = {};
    this.bannerUntil = 0;
    this.shopOpen = false;
    this.spectating = null;
    const g = game;
    g.on('round', ({ mode }) => this.banner(`<b>ROUND ${mode.round}</b><small>${mode.round === ROUND.half + 1 ? 'SIDES SWAPPED · ' : ''}${SIDE[mode.sideOf(0)]} · BUY PHASE</small>`, 3));
    g.on('live', () => this.banner('<b>ROUND START</b>', 1.6));
    g.on('planted', ({ site, who }) => this.banner(`<b class="warn">SPIKE PLANTED</b><small>SITE ${site}${who === g.player ? ' · YOU' : ''}</small>`, 2.5));
    g.on('defuseHalf', () => {});
    g.on('roundEnd', (r) => {
      const won = r.winTeam === 0;
      this.banner(`<b class="${won ? 'good' : 'warn'}">${won ? 'ROUND WON' : 'ROUND LOST'}</b><small>${REASON[r.reason] || ''}</small>`, ROUND.end - 0.5);
    });
    g.on('start', () => { this.spectating = null; this.shopKey = ''; this.cache = {}; });
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
    $('rbar').hidden = !on;
    $('top').hidden = on;
    if (!on) { $('rchannel').hidden = true; $('rcredits').hidden = true; $('rhint').textContent = ''; $('shop').hidden = true; return; }
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
    } else {
      const s = this.spectating && this.spectating.alive ? this.spectating : null;
      hint = s ? `Spectating ${s.name}${s.kit ? ' (' + s.kit.agent.name + ')' : ''} · ${s.gun?.def.name || ''} · click to switch` : (sp ? 'Your team is down · watching the spike' : 'Waiting for the next round');
    }
    if ($('rhint').textContent !== hint) $('rhint').textContent = hint;
    $('rcredits').hidden = !(m.phase === 'buy' || this.shopOpen);
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
  toggleShop(open = !this.shopOpen) {
    this.shopOpen = open;
    $('shop').hidden = !open;
    this.shopKey = '';
    if (open) this.renderShop();
  }

  renderShop() {
    const g = this.game, m = g.mode, p = g.player;
    if (!m) return;
    const bought = m.boughtThisRound?.get(p) || [];
    const canBuy = m.canBuy(p);
    const key = [p.credits, p.inv.primary?.def.id, p.inv.secondary?.def.id, p.armor, p.kit && JSON.stringify(p.kit.charges), canBuy, bought.length, Math.ceil(m.phaseEnd - g.time)].join('|');
    if (key === this.shopKey) return;
    this.shopKey = key;
    const owned = (id) => p.inv.primary?.def.id === id || p.inv.secondary?.def.id === id;
    const card = (item, name, cost, sub, state) =>
      `<button class="scard ${state}" data-item='${JSON.stringify(item)}'><span class="n">${esc(name)}</span><span class="c">${cost ? '¤' + cost : 'FREE'}</span><span class="s">${sub}</span></button>`;
    const weaponCols = BUY_GROUPS.map(([title, ids]) => `<section><h3>${title}</h3>${ids.map(id => {
      const w = WEAPONS[id], b = w.dmg[0];
      const st = owned(id) ? 'owned' : p.credits < w.cost ? 'poor' : '';
      return card({ type: 'weapon', id }, w.name, w.cost, `${b[1]}/${b[2]}/${b[3]} · ${w.mag} rds`, st);
    }).join('')}</section>`).join('');
    const shieldCol = `<section><h3>Shields</h3>${Object.entries(SHIELDS).map(([id, s]) =>
      card({ type: 'shield', id }, s.name, s.cost, s.pool ? `${s.armor} · regen ${s.pool}` : `+${s.armor} armor`, p.armor >= s.armor && (p.armorKind || 'light') === id ? 'owned' : p.credits < s.cost ? 'poor' : '')).join('')}</section>`;
    let abilCol = '';
    if (p.kit) {
      const ab = p.kit.agent.abilities;
      const pips = (have, max) => max > 4 ? `${have}/${max}` : `${'■'.repeat(have)}${'□'.repeat(Math.max(0, max - have))} ${have}/${max}`;
      abilCol = `<section><h3>Abilities · ${esc(p.kit.agent.name)}</h3>${['c', 'q', 'e'].map(k => {
        const a = ab[k], have = p.kit.charges[k], pr = abilityPrice(p, k);
        if (pr.cost === null) return card({ type: 'none' }, `E · ${a.name}`, 0, 'Signature · free every round', 'owned');
        const sub = `${pips(have, pr.max)}${pr.free ? ` · ${pr.free} free` : ''}${pr.max > 4 ? ' · per bullet' : ''}`;
        return card({ type: 'ability', key: k }, `${k.toUpperCase()} · ${a.name}`, pr.cost, sub, have >= pr.max ? 'owned' : p.credits < pr.cost ? 'poor' : '');
      }).join('')}${card({ type: 'none' }, `X · ${ab.x.name}`, 0, `${p.kit.ultPoints}/${p.kit.ultCost} points`, p.kit.ultPoints >= p.kit.ultCost ? 'owned' : 'poor')}</section>`;
    }
    $('shop-credits').textContent = `¤ ${p.credits.toLocaleString()}`;
    $('shop-note').textContent = canBuy ? `Left click to buy · right click to sell back this round's purchases · ${clock(m.phaseEnd - g.time)} left` : 'The buy phase is over';
    $('shop-grid').innerHTML = weaponCols + shieldCol + abilCol;
    // team credits
    $('shop-team').innerHTML = g.combatants.filter(c => c.team === p.team).map(c =>
      `<span${c === p ? ' class="me"' : ''}>${esc(c.name)} <b>¤${c.credits.toLocaleString()}</b>${c.inv.primary ? ' · ' + esc(c.inv.primary.def.name) : ''}</span>`).join('');
  }

  // Called with the element under the virtual cursor; button 0 = buy, 2 = sell.
  shopClick(el, button) {
    const g = this.game, m = g.mode;
    if (!el || !m) return null;
    const item = JSON.parse(el.dataset.item || '{}');
    if (!item.type || item.type === 'none') return null;
    const err = button === 2 ? m.sell(g.player, item) : m.buy(g.player, item);
    this.shopKey = '';
    this.renderShop();
    return err;
  }
}
