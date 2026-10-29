// Checks that a gun shows as soon as it's pulled out (before any shot), with the weapon glow on.
//   node tools/check-pullout.mjs [out-dir]     (needs playwright)
// Takes the game's view mid-pullout and after it, without firing, and checks the gun covers the same pixels as with
// the glow off (which draws the viewmodel directly).
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const OUT = process.argv[2] ? resolve(process.argv[2]) : null;

let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  console.error('Playwright is missing: npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}
if (OUT) await mkdir(OUT, { recursive: true });
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  try { const body = await readFile(join(ROOT, path || 'index.html')); res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, r));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.addInitScript(() => { try { localStorage.setItem('tapfire-settings-v1', JSON.stringify({ shadows: false, renderScale: 1 })); } catch { /* storage blocked */ } });
await page.goto(`http://localhost:${server.address().port}/index.html`);
await page.waitForFunction(() => window.__game);
await page.evaluate(async () => {
  const h = window.__game;
  Object.assign(h.settings, { mode: 'dm', botCount: 0, agent: 'cinder', map: 'arena', botMode: 'static', difficulty: 'normal', side: 'atk' });
  await h.startMatch({});
  const st = document.createElement('style');
  st.textContent = '.overlay, #hud, #inspecthint, #fps { display: none !important; }';
  document.head.appendChild(st);
});

// Of the gun's pixels in `off` (where it differs from the empty view `bg`), the share that `on` also covers. The glow
// changes colours, so this asks only whether the gun is there, not whether it looks the same. Bottom right quarter.
async function coverage(on, off, bg) {
  return page.evaluate(async (shots) => {
    const load = (s) => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + s; });
    const px = async (s) => { const i = await load(s), c = new OffscreenCanvas(i.width, i.height), x = c.getContext('2d'); x.drawImage(i, 0, 0); return x.getImageData(i.width / 2, i.height / 2, i.width / 2, i.height / 2).data; };
    const [a, b, z] = await Promise.all(shots.map(px));
    const d = (p, q, i) => Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]) > 60;
    let gun = 0, seen = 0;
    for (let i = 0; i < z.length; i += 4) if (d(b, z, i)) { gun++; if (d(a, z, i)) seen++; }
    return gun ? seen / gun : 1;
  }, [on, off, bg]);
}

// One frozen frame of `weapon` (with `skin`) at `k` seconds into its pullout, with the glow on or off.
async function shot(weapon, skin, k, fx, hide = false) {
  await page.evaluate(([weapon, skin, k, fx, hide]) => {
    const h = window.__game, g = h.game, p = g.player, r = h.renderer;
    h.frozen = false;
    r.vmScene.visible = !hide;
    h.settings.weaponFx = fx;
    h.settings.skins = { ...h.settings.skins, [weapon]: skin };
    p.pos = [31, 0, 3]; p.prevPos = [...p.pos]; p.yaw = 3.1; p.pitch = 0.02;
    p.equip('melee', g.time, true); // switch away and back, as a player would
    p.give(weapon);
    p.equip(['sheriff', 'classic', 'ghost'].includes(weapon) ? 'secondary' : 'primary', g.time, true);
  }, [weapon, skin, k, fx, hide]);
  // Let the game draw a few frames on its own (that's when the bug bites), then freeze mid pullout.
  await page.waitForTimeout(Math.max(80, k * 1000));
  await page.evaluate(() => { window.__game.frozen = true; });
  await page.waitForTimeout(150);
  return (await page.screenshot()).toString('base64');
}

let failed = 0;
for (const [weapon, skin] of [['vandal', null], ['vandal', 'orbital'], ['bulldog', null], ['bulldog', 'orbital'], ['sheriff', 'starspur'], ['phantom', null], ['vandal', 'apogee'], ['guardian', 'apogee'], ['spectre', 'apogee'], ['classic', 'apogee']]) {
  for (const k of [0.15, 1.2]) {
    const on = await shot(weapon, skin, k, true);
    const off = await shot(weapon, skin, k, false);
    const bg = await shot(weapon, skin, k, false, true);
    const d = await coverage(on, off, bg);
    const name = `${weapon}-${skin || 'default'}-${k}s`;
    if (OUT) { const { writeFile } = await import('node:fs/promises'); await writeFile(join(OUT, name + '-glow.png'), Buffer.from(on, 'base64')); await writeFile(join(OUT, name + '-noglow.png'), Buffer.from(off, 'base64')); }
    const ok = d > 0.9;
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${(d * 100).toFixed(0)}% of the gun drawn`);
  }
}
console.log(errors.length ? 'page errors: ' + errors.slice(0, 3).join(' | ') : 'no page errors');
await page.evaluate(() => { window.__game.renderer.vmScene.visible = true; });
await browser.close(); server.close();
process.exit(failed ? 1 : 0);
