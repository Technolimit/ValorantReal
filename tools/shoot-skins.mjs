// First-person pictures of the model skins and knives, at rest and mid-inspect, for comparing how they look.
//   node tools/shoot-skins.mjs <out-dir> [--only <text>]     (needs playwright)
// Each picture is the game's own view (HUD hidden) in a frozen deathmatch on Arena, with the weapon held still.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const OUT = resolve(process.argv[2] || 'skin-shots');
const ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : '';
const YAW = Number(process.env.YAW ?? 3.1);

let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  console.error('Playwright is missing: npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}
await mkdir(OUT, { recursive: true });
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  try { const body = await readFile(join(ROOT, path || 'index.html')); res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, r));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.addInitScript(() => { try { localStorage.setItem('tapfire-settings-v1', JSON.stringify({ shadows: false, renderScale: 1 })); } catch { /* storage blocked */ } });
await page.goto(`http://localhost:${server.address().port}/index.html`);
await page.waitForFunction(() => window.__game);
await page.evaluate(async () => {
  const h = window.__game; h.frozen = true;
  Object.assign(h.settings, { mode: 'dm', botCount: 0, agent: 'cinder', map: 'arena', botMode: 'static', difficulty: 'normal', side: 'atk' });
  await h.startMatch({}); h.frozen = true;
  const st = document.createElement('style'); // menus and HUD out of the picture
  st.textContent = '.overlay, #hud, #inspecthint { display: none !important; }';
  document.head.appendChild(st);
});

// [file name, weapon, skin, melee type or null, inspect index or null, inspect time, sheen sweep progress 0..1]
const SHOTS = [
  ['orbital-vandal', 'vandal', 'orbital', null, null],
  ['orbital-vandal-inspect', 'vandal', 'orbital', null, 0, 1.2],
  ['orbital-vandal-sweep', 'vandal', 'orbital', null, null, 0, 0.45],
  ['orbital-solar-vandal', 'vandal', 'orbital~1', null, null],
  ['starspur-sheriff', 'sheriff', 'starspur', null, null],
  ['starspur-sheriff-inspect', 'sheriff', 'starspur', null, 0, 1.0],
  ['oathblade-vandal', 'vandal', 'oathblade', null, null],
  ['oathblade-sheriff', 'sheriff', 'oathblade', null, null],
  ['oathblade-vandal-sweep', 'vandal', 'oathblade', null, null, 0, 0.55],
  ['knife-karambit', 'knife', null, 'karambit', null],
  ['knife-tanto', 'knife', null, 'tanto', null],
  ['knife-katana-inspect', 'knife', null, 'katana', 0, 0.9],
  ['glacier-vandal', 'vandal', 'glacier', null, null],
];
for (const [name, weapon, skin, melee, insIdx, insT, sweep] of SHOTS) {
  if (ONLY && !name.includes(ONLY)) continue;
  await page.evaluate(([weapon, skin, melee, insIdx, insT, YAW, sweep]) => {
    const h = window.__game, g = h.game, p = g.player, r = h.renderer;
    if (skin) h.settings.skins = { ...h.settings.skins, [weapon]: skin };
    if (melee) h.settings.melee = melee;
    p.pos = [31, 0, 3]; p.prevPos = [...p.pos]; p.yaw = YAW; p.pitch = 0.02; // the same spot every time
    p.give(weapon);
    const slot = weapon === 'knife' ? 'melee' : ['sheriff', 'classic', 'ghost'].includes(weapon) ? 'secondary' : 'primary';
    p.equip(slot, g.time, true);
    r.vm.key = null; r.vm.equipStart = -1e9; r.vm.sweepStart = -1e9; // drawn already, no pullout or sheen
    r.inspecting = null;
    r.vm.sweepFixed = sweep;
    if (insIdx !== null) { r.inspect(); r.inspecting.fixedT = insT; r.inspecting.held = false; }
  }, [weapon, skin, melee, insIdx, insT ?? 0, YAW, sweep ?? null]);
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(OUT, name + '.png') });
  console.log('saved', name);
}
console.log(errors.length ? 'page errors: ' + errors.slice(0, 3).join(' | ') : 'no page errors');
await browser.close();
server.close();
