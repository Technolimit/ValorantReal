// Plays bot-only 5v5 rounds on Divide headless and prints how the rounds went, to judge the bots' team play:
// who won and how, when and where the spike went down, how many defenders were on that site by then, and
// how the retakes went. You are swapped for a bot so it's a full ten.
//   node tools/sim-bots.mjs [rounds=12] [difficulty=hard] [--trace]     (needs playwright, like check-abilities.mjs)
// --trace prints every bot's goal every 3 s and the team's calls, to watch the plan play out.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const ROUNDS = +(args[0] || 12), DIFF = args[1] || 'hard', TRACE = process.argv.includes('--trace');

let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  console.error('Playwright is missing: npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  try { const body = await readFile(join(ROOT, path || 'index.html')); res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, r));
const url = `http://localhost:${server.address().port}/index.html`;

const browser = await chromium.launch();
const errors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
await page.addInitScript(() => { try { localStorage.setItem('tapfire-settings-v1', JSON.stringify({ shadows: false, renderScale: 0.5 })); } catch { /* storage blocked */ } });
page.on('pageerror', e => errors.push(String(e)));
await page.goto(url, { timeout: 90000 });
await page.waitForFunction(() => window.__game, null, { timeout: 90000 });
await page.evaluate((d) => { Object.assign(window.__game.settings, { mode: 'rounds', map: 'divide', side: 'def', difficulty: d }); document.getElementById('play').click(); }, DIFF);
await page.click('#select .sel-card[data-id="vex"]');
await page.click('#sel-lock');
await page.waitForFunction(() => window.__game.game.mode && window.__game.game.state === 'playing', null, { timeout: 20000 });
await page.evaluate(async (d) => {
  window.__game.frozen = true; // the rounds below are ticked here
  const { Bot } = await import('/js/bot.js');
  const g = window.__game.game, p = g.player;
  p.brain = new Bot(p, g, d, 'fight'); p.isBot = true; g.bots.push(p);
}, DIFF);

const rows = [];
for (let r = 0; r < ROUNDS; r++) {
  const row = await page.evaluate((TRACE) => {
    const g = window.__game.game, m = g.mode;
    m.score = [0, 0]; // never let the match end
    if (m.phase !== 'buy') m.startRound();
    const out = { round: m.round, call: m.plan?.site, style: m.plan?.style };
    let plantedSeen = false, firstKill = null;
    const kills = { atk: 0, def: 0 };
    const onKill = ({ killer, victim }) => { if (killer && killer !== victim) { kills[m.side(killer)]++; if (!firstKill) firstKill = m.side(killer); } };
    g.on('kill', onKill);
    const trace = [];
    let lastCall = null;
    for (let i = 0; i < 128 * 200 && m.phase !== 'end'; i++) {
      g.tick();
      if (TRACE && m.phase !== 'buy') {
        const call = JSON.stringify([m.plan.site, m.plan.defCall?.site, m.plan.retake?.go]);
        if (call !== lastCall) { lastCall = call; trace.push(`  t=${(g.time - m.liveAt).toFixed(1)} atk call ${m.plan.site}, def call ${m.plan.defCall?.site || '-'}${m.plan.defCall?.delay ? ' (delay)' : ''}, retake ${m.plan.retake ? (m.plan.retake.go ? 'go' : 'grouping') : '-'}`); }
        if (i % (128 * 3) === 0) trace.push(`  t=${(g.time - m.liveAt).toFixed(0).padStart(3)} ` + g.combatants.map(c => `${m.side(c)[0]}${c.alive ? '' : '✝'}:${c.alive ? (c.brain?.goal?.kind || '?') + (m.side(c) === 'def' ? '/' + (m.plan.defRoles.get(c) || '') : '') + '@' + m.zoneOf(c.pos) : ''}`).join(' '));
      }
      const sp = m.spike;
      if (!plantedSeen && sp.state === 'planted') {
        plantedSeen = true;
        const defs = m.alive('def');
        out.plantAt = +(g.time - m.liveAt).toFixed(1);
        out.site = sp.site;
        out.atkAlive = m.alive('atk').length;
        out.defAlive = defs.length;
        out.defNear = defs.filter(c => Math.hypot(c.pos[0] - sp.pos[0], c.pos[2] - sp.pos[2]) < 25).length;
      }
    }
    g.listeners.kill = g.listeners.kill.filter(f => f !== onKill);
    const res = m.lastResult || {};
    out.winner = res.winnerSide; out.reason = res.reason; out.firstKill = firstKill; out.kills = `${kills.atk}-${kills.def}`;
    out.callSwitched = out.call !== m.plan?.site ? m.plan?.site : undefined;
    out.calls = m.plan?.stats ? JSON.stringify(m.plan.stats) : undefined;
    for (let i = 0; i < 128 * 10 && m.phase === 'end'; i++) g.tick();
    if (TRACE) out.trace = trace;
    return out;
  }, TRACE);
  const { trace, ...rest } = row;
  rows.push(rest);
  console.log(JSON.stringify(rest));
  if (trace) console.log(trace.join('\n'));
}
const n = rows.length, cnt = (f) => rows.filter(f).length;
const planted = rows.filter(r => r.plantAt != null);
console.log('---');
console.log(`atk wins ${cnt(r => r.winner === 'atk')}/${n}  plants ${planted.length}/${n}  time-outs ${cnt(r => r.reason === 'time')}  defuses ${cnt(r => r.reason === 'defused')}`);
if (planted.length) {
  const avg = (k) => (planted.reduce((s, r) => s + r[k], 0) / planted.length).toFixed(1);
  console.log(`at plant: avg time ${avg('plantAt')} s, defenders alive ${avg('defAlive')}, of them near the spike ${avg('defNear')}, attackers alive ${avg('atkAlive')}`);
}
if (errors.length) console.log('Page errors:', errors.slice(0, 5));
await browser.close();
server.close();
