// Renders every gun's firing sound to WAV in headless Chromium, so they can be listened to and compared
// without playing the game. Uses the real js/audio.js through an OfflineAudioContext.
//   node tools/render-guns.mjs [out-dir]       (default: ./gun-sounds; needs playwright)
// Per gun: <id>.wav (a single shot, or a short spray for automatics; Operator / Marshal / Bucky include the
// bolt or pump), plus a printed table of peak, loudness and brightness.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = resolve(process.argv[2] || 'gun-sounds');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };

let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  console.error('Playwright is missing: npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  if (!path) { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>render</title>'); return; }
  try { const body = await readFile(join(ROOT, path)); res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, r));
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`http://localhost:${server.address().port}/`);

const renders = await page.evaluate(async () => {
  const { Sound } = await import('/js/audio.js');
  const { WEAPONS } = await import('/js/weapons.js');
  // The master compressor starts out fully clamped and takes a moment to settle, as it has long before the
  // first shot in a real match, so render after a silent lead-in and cut it off.
  const rate = 44100, out = {}, LEAD = 0.6;
  for (const [id, def] of Object.entries(WEAPONS)) {
    if (def.melee || def.ability) continue;
    // Automatics: a 1.2 s spray (heavies get 1.6 s so the spin-up is audible). Others: one shot.
    const spray = def.auto ? (def.spin ? 1.6 : 1.2) : 0;
    const secs = LEAD + spray + (def.model === 'sniper' ? 2.4 : 1.6);
    const ctx = new OfflineAudioContext(2, Math.ceil(rate * secs), rate);
    const s = new Sound();
    s.init(ctx);
    const gun = {};
    // Shot times; heavies speed up along their spin-up like the real gun.
    const times = [];
    for (let t = 0; t < (spray || 0.01);) {
      times.push(t);
      const f = def.spin ? Math.min(1, t / def.spin.time) : 0;
      t += 1 / (def.spin ? def.rate + (def.spin.to - def.rate) * f : def.rate);
    }
    for (const t of times) {
      const q = Math.round((LEAD + t) * rate / 128) * 128 / rate; // suspend() lands on 128-frame blocks
      ctx.suspend(q).then(() => { s.gunshot(def, null, gun); ctx.resume(); });
    }
    const buf = await ctx.startRendering();
    const skip = Math.round(LEAD * rate) - 64;
    out[id] = { shots: times.length, l: Array.from(buf.getChannelData(0).subarray(skip)), r: Array.from(buf.getChannelData(1).subarray(skip)) };
  }
  return out;
});
await browser.close();
server.close();

function wav(l, r, rate = 44100) {
  const n = l.length, b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    b.writeInt16LE(Math.max(-1, Math.min(1, l[i])) * 32767 | 0, 44 + i * 4);
    b.writeInt16LE(Math.max(-1, Math.min(1, r[i])) * 32767 | 0, 46 + i * 4);
  }
  return b;
}

await mkdir(OUT, { recursive: true });
console.log('gun        shots  peak   rms dB  bright Hz  length s');
for (const [id, { shots, l, r }] of Object.entries(renders)) {
  await writeFile(join(OUT, `${id}.wav`), wav(l, r));
  let peak = 0, sum = 0, n = 0, zc = 0, last = 0, end = 0;
  for (let i = 0; i < l.length; i++) {
    const x = l[i], a = Math.abs(x);
    if (a > peak) peak = a;
    if (a > 0.003) { end = i; sum += x * x; n++; }
    if ((x > 0) !== (last > 0) && a > 0.003) zc++;
    last = x;
  }
  const rms = 10 * Math.log10(sum / Math.max(1, n));
  // Zero-crossing rate as a rough brightness measure (higher = brighter / thinner).
  const bright = zc / 2 / (Math.max(1, n) / 44100);
  console.log(`${id.padEnd(10)} ${String(shots).padStart(5)}  ${peak.toFixed(2)}  ${rms.toFixed(1).padStart(6)}  ${Math.round(bright).toString().padStart(9)}  ${(end / 44100).toFixed(2).padStart(8)}`);
}
console.log(`\nWrote ${Object.keys(renders).length} files to ${OUT}`);
