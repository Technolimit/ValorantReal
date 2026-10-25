// Synthesized sound: gunshots, footsteps, hit confirmations. Other players' sounds are positional.

// Firing sounds, one recipe per weapon, built from synthesized layers (no recorded or game audio):
//   crack  bright muzzle snap: highpassed noise   { hp, lp, decay, gain }
//   body   the blast itself: lowpassed noise, or bandpassed when `bp` is set (suppressed guns)
//   bark   the gun's mid-range "voice", a bandpassed noise formant that tells guns apart { bp, q, decay, gain }
//   thump  low-end punch: a sine dropping from f0 to f1 Hz
//   ring   metallic resonance of the frame: [[Hz, share], ...] sines, ringing for ringDecay s
//   mech   action noise right after the blast (slide, bolt carrier, cylinder): [[delay s, band Hz, decay s, gain], ...]
//   after  a follow-up action per shot: { kind: 'bolt' | 'pump', at: s }
//   spin   motor whir under each shot that rises with the spin-up (Ares, Odin): { f0, f1, gain }
//   verb   send to the room reverb, i.e. how long the shot hangs in the air
//   gain   overall loudness
// Character follows how the guns sound in Valorant and the real guns they're modelled on: Vandal (AK, 7.62x39)
// is a hard, bright crack with a chunky mid bark; Phantom is suppressed, a deep compressed thud with a clacky
// action; Spectre (suppressed MPX) and Ghost are soft ticks with a crisp slide; Sheriff is a .44 Magnum boom that
// rings; Guardian (7.62x51 semi) is heavy and deep; Bulldog (Tavor) sits mid and boxy; Stinger and Frenzy are
// light, buzzy and fast; Operator (.50 BMG) is the loudest thing in the game with a long tail and a bolt; Marshal
// cracks then cycles its bolt; Outlaw is a heavy double-barrel boom; Bucky booms then pumps; Judge is a short
// auto-shotgun punch; Shorty a small double-barrel pop; Ares rattles and Odin booms, both over a spin-up whir.
const GUN_SOUNDS = {
  classic: {
    gain: 0.75, verb: 0.18,
    crack: { hp: 3500, lp: 11000, decay: 0.035, gain: 0.7 },
    body: { lp: 3800, hp: 250, decay: 0.09, gain: 0.6 },
    bark: { bp: 1500, q: 1.6, decay: 0.06, gain: 0.35 },
    thump: { f0: 260, f1: 110, decay: 0.06, gain: 0.45 },
    mech: [[0.012, 3200, 0.02, 0.25], [0.05, 2400, 0.02, 0.2]],
  },
  shorty: {
    gain: 0.95, verb: 0.35,
    crack: { hp: 2000, lp: 7000, decay: 0.05, gain: 0.8 },
    body: { lp: 2000, hp: 80, decay: 0.3, gain: 1.0 },
    bark: { bp: 800, q: 1.2, decay: 0.12, gain: 0.4 },
    thump: { f0: 140, f1: 45, decay: 0.2, gain: 0.7 },
    mech: [[0.03, 1500, 0.04, 0.2]],
  },
  frenzy: {
    gain: 0.75, verb: 0.15,
    crack: { hp: 4000, lp: 12000, decay: 0.025, gain: 0.5 },
    body: { lp: 4500, hp: 400, decay: 0.06, gain: 0.5 },
    bark: { bp: 1800, q: 2, decay: 0.04, gain: 0.35 },
    thump: { f0: 300, f1: 140, decay: 0.04, gain: 0.3 },
    mech: [[0.01, 3800, 0.015, 0.3]],
  },
  ghost: {
    gain: 0.7, verb: 0.06,
    crack: { hp: 5000, lp: 9000, decay: 0.015, gain: 0.15 },
    body: { bp: 1200, q: 1.2, decay: 0.07, gain: 0.6 },
    thump: { f0: 180, f1: 80, decay: 0.05, gain: 0.35 },
    mech: [[0.008, 3000, 0.02, 0.45], [0.035, 2200, 0.025, 0.35]],
  },
  sheriff: {
    gain: 1.0, verb: 0.45,
    crack: { hp: 2500, lp: 10000, decay: 0.05, gain: 1.0 },
    body: { lp: 2600, hp: 60, decay: 0.32, gain: 1.0 },
    bark: { bp: 380, q: 1.3, decay: 0.15, gain: 0.45 },
    thump: { f0: 120, f1: 38, decay: 0.25, gain: 0.75 },
    ring: [[1850, 0.5], [2730, 0.3], [4100, 0.2]], ringDecay: 0.4, ringGain: 0.12,
    mech: [[0.09, 2600, 0.03, 0.25]],
  },
  stinger: {
    gain: 0.7, verb: 0.12,
    crack: { hp: 4500, lp: 12000, decay: 0.02, gain: 0.45 },
    body: { lp: 5000, hp: 500, decay: 0.05, gain: 0.45 },
    bark: { bp: 2000, q: 2, decay: 0.035, gain: 0.35 },
    thump: { f0: 340, f1: 160, decay: 0.035, gain: 0.25 },
    mech: [[0.008, 4200, 0.012, 0.25]],
  },
  spectre: {
    gain: 0.7, verb: 0.05,
    crack: { hp: 6000, lp: 10000, decay: 0.012, gain: 0.12 },
    body: { bp: 1600, q: 1.0, decay: 0.06, gain: 0.5 },
    thump: { f0: 220, f1: 100, decay: 0.04, gain: 0.3 },
    mech: [[0.006, 3600, 0.015, 0.35], [0.03, 2800, 0.015, 0.25]],
  },
  bucky: {
    gain: 1.0, verb: 0.5,
    crack: { hp: 1800, lp: 6500, decay: 0.06, gain: 0.85 },
    body: { lp: 1700, hp: 60, decay: 0.4, gain: 1.1 },
    bark: { bp: 600, q: 1.1, decay: 0.18, gain: 0.4 },
    thump: { f0: 110, f1: 35, decay: 0.28, gain: 0.75 },
    after: { kind: 'pump', at: 0.42 },
  },
  judge: {
    gain: 0.9, verb: 0.35,
    crack: { hp: 2200, lp: 8000, decay: 0.04, gain: 0.8 },
    body: { lp: 2100, hp: 80, decay: 0.24, gain: 0.95 },
    bark: { bp: 750, q: 1.2, decay: 0.1, gain: 0.4 },
    thump: { f0: 130, f1: 45, decay: 0.16, gain: 0.65 },
    mech: [[0.04, 1800, 0.03, 0.3]],
  },
  bulldog: {
    gain: 0.75, verb: 0.25,
    crack: { hp: 3000, lp: 9500, decay: 0.03, gain: 0.75 },
    body: { lp: 3200, hp: 180, decay: 0.14, gain: 0.75 },
    bark: { bp: 1100, q: 1.8, decay: 0.08, gain: 0.45 },
    thump: { f0: 190, f1: 70, decay: 0.09, gain: 0.6 },
    mech: [[0.02, 2600, 0.02, 0.25]],
  },
  guardian: {
    gain: 0.95, verb: 0.45,
    crack: { hp: 2600, lp: 10000, decay: 0.045, gain: 1.0 },
    body: { lp: 2400, hp: 70, decay: 0.28, gain: 0.95 },
    bark: { bp: 1000, q: 1.6, decay: 0.12, gain: 0.5 },
    thump: { f0: 120, f1: 40, decay: 0.18, gain: 0.75 },
    ring: [[2600, 0.6], [3900, 0.4]], ringDecay: 0.12, ringGain: 0.05,
    mech: [[0.06, 2000, 0.035, 0.3]],
  },
  phantom: {
    gain: 0.75, verb: 0.1,
    crack: { hp: 4500, lp: 9000, decay: 0.015, gain: 0.3 },
    body: { bp: 1200, q: 0.9, decay: 0.1, gain: 0.75 },
    thump: { f0: 150, f1: 55, decay: 0.09, gain: 0.6 },
    mech: [[0.01, 2600, 0.02, 0.4], [0.045, 1900, 0.025, 0.3]],
  },
  vandal: {
    gain: 0.9, verb: 0.38,
    crack: { hp: 2800, lp: 11000, decay: 0.04, gain: 1.05 },
    body: { lp: 3000, hp: 90, decay: 0.2, gain: 0.9 },
    bark: { bp: 700, q: 1.4, decay: 0.1, gain: 0.55 },
    thump: { f0: 150, f1: 50, decay: 0.12, gain: 0.7 },
    mech: [[0.025, 2300, 0.025, 0.28]],
  },
  warden: {
    gain: 0.9, verb: 0.38,
    crack: { hp: 2700, lp: 10000, decay: 0.04, gain: 0.95 },
    body: { lp: 2700, hp: 80, decay: 0.22, gain: 0.9 },
    bark: { bp: 850, q: 1.5, decay: 0.1, gain: 0.45 },
    thump: { f0: 135, f1: 45, decay: 0.14, gain: 0.7 },
    mech: [[0.035, 2100, 0.03, 0.28]],
  },
  marshal: {
    gain: 0.95, verb: 0.5,
    crack: { hp: 3200, lp: 12000, decay: 0.05, gain: 1.1 },
    body: { lp: 3000, hp: 90, decay: 0.3, gain: 0.9 },
    bark: { bp: 900, q: 1.4, decay: 0.12, gain: 0.4 },
    thump: { f0: 140, f1: 45, decay: 0.18, gain: 0.65 },
    after: { kind: 'bolt', at: 0.3 },
  },
  outlaw: {
    gain: 1.05, verb: 0.6,
    crack: { hp: 2500, lp: 10000, decay: 0.06, gain: 1.1 },
    body: { lp: 2200, hp: 50, decay: 0.45, gain: 1.1 },
    bark: { bp: 600, q: 1.2, decay: 0.18, gain: 0.45 },
    thump: { f0: 95, f1: 32, decay: 0.3, gain: 0.8 },
    ring: [[900, 0.6], [1350, 0.4]], ringDecay: 0.25, ringGain: 0.05,
    mech: [[0.07, 1600, 0.05, 0.35]],
  },
  operator: {
    gain: 1.15, verb: 0.75,
    crack: { hp: 2200, lp: 11000, decay: 0.08, gain: 1.15 },
    body: { lp: 2000, hp: 40, decay: 0.6, gain: 1.2 },
    bark: { bp: 320, q: 1.1, decay: 0.25, gain: 0.5 },
    thump: { f0: 85, f1: 26, decay: 0.45, gain: 0.9 },
    after: { kind: 'bolt', at: 0.55 },
  },
  ares: {
    gain: 0.8, verb: 0.3,
    crack: { hp: 3200, lp: 9500, decay: 0.03, gain: 0.75 },
    body: { lp: 2800, hp: 120, decay: 0.13, gain: 0.8 },
    bark: { bp: 650, q: 1.6, decay: 0.07, gain: 0.45 },
    thump: { f0: 160, f1: 60, decay: 0.08, gain: 0.55 },
    mech: [[0.015, 2000, 0.03, 0.35]],
    spin: { f0: 70, f1: 140, gain: 0.05 },
  },
  odin: {
    gain: 0.9, verb: 0.4,
    crack: { hp: 2600, lp: 9000, decay: 0.035, gain: 0.85 },
    body: { lp: 2200, hp: 70, decay: 0.17, gain: 0.95 },
    bark: { bp: 380, q: 1.3, decay: 0.1, gain: 0.5 },
    thump: { f0: 115, f1: 38, decay: 0.12, gain: 0.8 },
    mech: [[0.02, 1700, 0.03, 0.35]],
    spin: { f0: 55, f1: 110, gain: 0.06 },
  },
};
const FALLOFF = {
  gun: { model: 'inverse', ref: 5, roll: 1.0, max: 150 },
  suppressed: { model: 'inverse', ref: 3, roll: 1.8, max: 80 },
  step: { model: 'linear', ref: 2, max: 35 },
  other: { model: 'inverse', ref: 4, roll: 1.1, max: 120 },
};
GUN_SOUNDS.headhunter = GUN_SOUNDS.sheriff;
GUN_SOUNDS.tourdeforce = GUN_SOUNDS.operator;
// Anything not listed sounds like the stock gun of its model.
const MODEL_SOUND = { pistol: 'classic', revolver: 'sheriff', smg: 'stinger', rifle: 'vandal', dmr: 'guardian', sniper: 'marshal', shotgun: 'judge', heavy: 'ares' };

export class Sound {
  constructor() {
    this.ctx = null;
    this.volume = 0.6;
    this.clips = new Map(); // your own uploaded sounds, 'vandal:fire' -> AudioBuffer (see customsounds.js)
    this.clipData = new Map(); // ...and their file bytes, kept until there's an AudioContext to decode them
  }

  // ctx: an AudioContext to use instead of a new one (tools/render-guns.mjs passes an OfflineAudioContext).
  init(given) {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC && !given) return;
    const ctx = given || new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    // Everyone else's sounds go through here, so a deafen can muffle them without touching your own.
    this.world = ctx.createGain();
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 22000;
    this.world.connect(this.muffle).connect(this.master);
    this.deaf = false;
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // Gunshot tails: a synthetic room reverb, one for your own shots and one (deafenable) for everyone else's.
    const ir = this.impulse(1.4);
    this.verbOwn = ctx.createConvolver(); this.verbOwn.buffer = ir; this.verbOwn.connect(this.master);
    this.verbWorld = ctx.createConvolver(); this.verbWorld.buffer = ir; this.verbWorld.connect(this.world);
    this.listenerPos = [0, 0, 0];
    for (const [key, data] of this.clipData) this.decodeClip(key, data).catch(() => {});
  }

  // Your own sound for one gun slot ('vandal:fire', 'vandal:reload', 'vandal:equip'). null puts the default back.
  setClip(key, data) {
    this.clips.delete(key);
    this.clipData.delete(key);
    if (!data) return Promise.resolve();
    this.clipData.set(key, data);
    return this.ctx ? this.decodeClip(key, data) : Promise.resolve();
  }

  decodeClip(key, data) {
    // decodeAudioData detaches the buffer it is given, so keep the original for later contexts.
    return this.ctx.decodeAudioData(data.slice(0)).then((buf) => {
      if (this.clipData.get(key) === data) this.clips.set(key, buf);
      return buf;
    });
  }

  playClip(buf, dest, at = 0) {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(dest);
    src.start(this.ctx.currentTime + at);
    return src;
  }

  // Stereo decaying noise that darkens as it fades (highs die first, like a real room).
  impulse(secs) {
    const c = this.ctx, n = Math.floor(c.sampleRate * secs);
    const buf = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const x = i / n;
        const k = 0.9 - 0.85 * x; // one-pole lowpass that closes over the tail
        lp += k * ((Math.random() * 2 - 1) - lp);
        d[i] = lp * Math.pow(1 - x, 3.5) * (i < c.sampleRate * 0.008 ? i / (c.sampleRate * 0.008) : 1);
      }
    }
    return buf;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  setListener(pos, yaw) {
    if (!this.ctx) return;
    this.listenerPos = pos;
    const l = this.ctx.listener, t = this.ctx.currentTime;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    if (l.positionX) {
      l.positionX.setValueAtTime(pos[0], t); l.positionY.setValueAtTime(pos[1], t); l.positionZ.setValueAtTime(pos[2], t);
      l.forwardX.setValueAtTime(fx, t); l.forwardY.setValueAtTime(0, t); l.forwardZ.setValueAtTime(fz, t);
      l.upX.setValueAtTime(0, t); l.upY.setValueAtTime(1, t); l.upZ.setValueAtTime(0, t);
    } else {
      l.setPosition(pos[0], pos[1], pos[2]);
      l.setOrientation(fx, 0, fz, 0, 1, 0);
    }
  }

  // Deafened (Paranoia, Seize, Nightfall): other people's sounds drop to a dull murmur.
  setDeaf(on) {
    if (!this.ctx || on === this.deaf) return;
    this.deaf = on;
    const t = this.ctx.currentTime;
    this.world.gain.setTargetAtTime(on ? 0.12 : 1, t, on ? 0.05 : 0.3);
    this.muffle.frequency.setTargetAtTime(on ? 350 : 22000, t, on ? 0.05 : 0.3);
  }

  // How loudness falls off with distance, per kind of sound. Inverse: full volume out to `ref` metres, then
  // ref / (ref + roll * (d - ref)). Linear: fades to silence at `max` metres. Gunshots carry across the map,
  // suppressed ones die out much sooner, footsteps are gone past ~35 m.
  // Output node: straight to master for your own sounds, through a panner for everyone else's.
  out(pos, kind = 'other') {
    if (!pos) return this.master;
    const f = FALLOFF[kind] || FALLOFF.other;
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = f.model;
    p.refDistance = f.ref;
    p.rolloffFactor = f.model === 'linear' ? 1 : f.roll;
    p.maxDistance = f.max;
    if (p.positionX) { p.positionX.value = pos[0]; p.positionY.value = pos[1]; p.positionZ.value = pos[2]; }
    else p.setPosition(pos[0], pos[1], pos[2]);
    p.connect(this.world);
    return p;
  }

  // bp: bandpass around this frequency (with q) instead of the lowpass.
  noiseHit({ dest, at = 0, lp = 2000, hp = 0, bp = 0, q = 1, decay = 0.1, gain = 0.5, attack = 0.002 }) {
    const c = this.ctx, t = c.currentTime + at;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    let node = src;
    if (hp) { const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; node.connect(f); node = f; }
    const f = c.createBiquadFilter();
    if (bp) { f.type = 'bandpass'; f.frequency.value = bp; f.Q.value = q; } else { f.type = 'lowpass'; f.frequency.value = lp; }
    node.connect(f);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    f.connect(g).connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(t + decay + 0.05);
  }

  tone({ dest, at = 0, freq = 440, end = null, type = 'sine', decay = 0.1, gain = 0.3 }) {
    const c = this.ctx, t = c.currentTime + at;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (end) o.frequency.exponentialRampToValueAtTime(end, t + decay);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + decay + 0.05);
  }

  // Distance gain for a kind of sound, the same curve the panner applies (used for the reverb send, which
  // bypasses the panner).
  distGain(pos, kind) {
    const f = FALLOFF[kind] || FALLOFF.other, l = this.listenerPos;
    const d = Math.max(f.ref, Math.hypot(pos[0] - l[0], pos[1] - l[1], pos[2] - l[2]));
    if (f.model === 'linear') return Math.max(0, 1 - (d - f.ref) / (f.max - f.ref));
    return f.ref / (f.ref + f.roll * (d - f.ref));
  }

  // gun (optional): the Gun firing, which keys the Ares / Odin spin-up whir per gun.
  gunshot(def, pos, gun) {
    if (!this.ctx) return;
    const s = GUN_SOUNDS[def.id] || GUN_SOUNDS[MODEL_SOUND[def.model]];
    const clip = this.clips.get(`${def.id}:fire`);
    if (!s && !clip) return;
    const c = this.ctx;
    const kind = def.suppressed ? 'suppressed' : 'gun';
    let dest = this.out(pos, kind), verb = this.verbOwn, wet = s ? s.verb : 0.15;
    if (pos) {
      // Far shots lose their top end and sit further back in the reverb: the tail fades with distance too,
      // only more slowly than the direct sound (it used to stay full volume at any range).
      const l = this.listenerPos, dist = Math.hypot(pos[0] - l[0], pos[1] - l[1], pos[2] - l[2]);
      const far = c.createBiquadFilter();
      far.type = 'lowpass';
      far.frequency.value = 20000 / (1 + dist / 12);
      far.connect(dest);
      dest = far;
      verb = this.verbWorld;
      wet *= 1.6 * Math.sqrt(this.distGain(pos, kind));
    }
    const send = c.createGain();
    send.gain.value = wet;
    send.connect(verb);
    const mix = c.createGain();
    mix.connect(dest);
    mix.connect(send);
    if (clip) {
      mix.gain.value = pos ? 1.2 : 0.6;
      this.playClip(clip, mix);
      return;
    }
    const v = 1 + (Math.random() - 0.5) * 0.06; // a little variation per shot so sprays don't sound looped
    const g = s.gain * (pos ? 1.6 : 0.55);
    const L = (o) => this.noiseHit({ dest: mix, ...o, gain: o.gain * g });
    if (s.crack) L({ ...s.crack, hp: s.crack.hp * v, lp: s.crack.lp });
    if (s.body) L({ ...s.body, lp: (s.body.lp || 0) * v, bp: (s.body.bp || 0) * v, attack: 0.003 });
    if (s.bark) L({ ...s.bark, bp: s.bark.bp * v, attack: 0.003 });
    if (s.thump) this.tone({ dest: mix, freq: s.thump.f0 * v, end: s.thump.f1 * v, decay: s.thump.decay, gain: s.thump.gain * g });
    if (s.ring) for (const [f, share] of s.ring) this.tone({ dest: mix, at: 0.002, freq: f * v, decay: s.ringDecay, gain: s.ringGain * share * g, type: 'sine' });
    if (s.mech) for (const [at, band, decay, gain] of s.mech) L({ at, bp: band * v, q: 4, decay, gain });
    if (s.spin) {
      // Spin-up is read from the shot cadence (works the same for remote players, whose guns don't tick here).
      this.spins ??= new WeakMap();
      const now = c.currentTime, key = gun || def, run = this.spins.get(key);
      const start = run && now - run.last < 0.3 ? run.start : now;
      this.spins.set(key, { start, last: now });
      const t = def.spin ? Math.min(1, (now - start) / def.spin.time) : 0;
      const f = s.spin.f0 + (s.spin.f1 - s.spin.f0) * t;
      this.tone({ dest: mix, freq: f, end: f * 1.04, decay: 0.12, gain: s.spin.gain * g, type: 'sawtooth' });
    }
    if (s.after?.kind === 'bolt') this.bolt(mix, s.after.at, g);
    else if (s.after?.kind === 'pump') this.pump(mix, s.after.at, g);
  }

  // Sniper bolt cycle: lift, pull back, push forward, lock down.
  bolt(dest, at, g) {
    const k = (o) => this.noiseHit({ dest, q: 5, ...o, gain: o.gain * g });
    k({ at, bp: 2800, decay: 0.025, gain: 0.3 });
    k({ at: at + 0.06, bp: 1500, q: 2, decay: 0.08, gain: 0.25, attack: 0.02 });
    k({ at: at + 0.2, bp: 1700, q: 2, decay: 0.07, gain: 0.25, attack: 0.015 });
    k({ at: at + 0.28, bp: 3200, decay: 0.03, gain: 0.35 });
  }

  // Shotgun pump: "chk" back, "chk" forward.
  pump(dest, at, g) {
    const k = (o) => this.noiseHit({ dest, q: 3, ...o, gain: o.gain * g });
    k({ at, bp: 1100, decay: 0.07, gain: 0.4, attack: 0.008 });
    k({ at: at + 0.02, bp: 2600, decay: 0.03, gain: 0.25 });
    k({ at: at + 0.16, bp: 900, decay: 0.08, gain: 0.45, attack: 0.008 });
    k({ at: at + 0.18, bp: 2400, decay: 0.035, gain: 0.3 });
  }

  footstep(pos, own) {
    if (!this.ctx) return;
    const dest = this.out(pos, 'step');
    this.noiseHit({ dest, lp: 700 + Math.random() * 300, hp: 120, decay: 0.07, gain: own ? 0.12 : 0.55 });
    this.tone({ dest, freq: 90, end: 50, decay: 0.05, gain: own ? 0.05 : 0.25 });
  }

  land(pos, own) {
    if (!this.ctx) return;
    const dest = this.out(pos, 'step');
    this.noiseHit({ dest, lp: 600, decay: 0.12, gain: own ? 0.18 : 0.6 });
  }

  hitConfirm(part, killed) {
    if (!this.ctx) return;
    const d = this.master;
    if (part === 'head') {
      this.tone({ dest: d, freq: 2600, decay: 0.12, gain: 0.22 });
      this.tone({ dest: d, freq: 3900, decay: 0.08, gain: 0.12 });
    } else {
      this.noiseHit({ dest: d, lp: 1100, hp: 300, decay: 0.05, gain: 0.35 });
      this.tone({ dest: d, freq: 320, end: 200, decay: 0.05, gain: 0.15 });
    }
    if (killed) {
      this.tone({ dest: d, at: 0.04, freq: 880, decay: 0.18, gain: 0.18, type: 'triangle' });
      this.tone({ dest: d, at: 0.11, freq: 1320, decay: 0.25, gain: 0.16, type: 'triangle' });
    }
  }

  hurt(head) {
    if (!this.ctx) return;
    this.noiseHit({ dest: this.master, lp: 500, decay: 0.14, gain: 0.5 });
    this.tone({ dest: this.master, freq: head ? 160 : 100, end: 50, decay: 0.12, gain: 0.35 });
  }

  click(at = 0, gain = 0.25) {
    if (!this.ctx) return;
    this.noiseHit({ dest: this.master, at, hp: 2500, lp: 8000, decay: 0.025, gain });
  }

  // steps: [[share of duration, 'click' | 'thunk'], ...] from reloadanim.js
  // id: the gun, for your own uploaded reload sound (played once at the start instead of the clicks).
  reload(duration, steps = [[0.1, 'click'], [0.5, 'thunk'], [0.85, 'click']], id) {
    const clip = this.ctx && this.clips.get(`${id}:reload`);
    if (clip) { const g = this.ctx.createGain(); g.gain.value = 0.6; g.connect(this.master); this.playClip(clip, g); return; }
    for (const [f, kind] of steps) {
      const at = duration * f;
      if (kind === 'thunk') this.thunk(at);
      else this.click(at, 0.28);
    }
  }

  thunk(at = 0) {
    if (!this.ctx) return;
    this.noiseHit({ dest: this.master, at, lp: 900, hp: 80, decay: 0.09, gain: 0.35 });
    this.tone({ dest: this.master, at, freq: 140, end: 70, decay: 0.08, gain: 0.25 });
  }

  equip(id) {
    if (!this.ctx) return;
    const clip = this.clips.get(`${id}:equip`);
    if (clip) { const g = this.ctx.createGain(); g.gain.value = 0.6; g.connect(this.master); this.playClip(clip, g); return; }
    this.noiseHit({ dest: this.master, lp: 1500, hp: 400, decay: 0.08, gain: 0.12 });
    this.click(0.1, 0.18);
  }

  ability(type) {
    if (!this.ctx) return;
    const d = this.master;
    if (type === 'dash') {
      this.noiseHit({ dest: d, lp: 3000, hp: 600, decay: 0.28, gain: 0.35, attack: 0.02 });
      this.tone({ dest: d, freq: 300, end: 900, decay: 0.2, gain: 0.08 });
    } else if (type === 'lift') {
      this.noiseHit({ dest: d, lp: 1800, hp: 200, decay: 0.45, gain: 0.35, attack: 0.05 });
      this.tone({ dest: d, freq: 180, end: 520, decay: 0.35, gain: 0.1 });
    } else if (type === 'windup') {
      this.noiseHit({ dest: d, lp: 2200, hp: 400, decay: 0.5, gain: 0.18, attack: 0.25 });
    } else if (type === 'rebirth' || type === 'rekindled') {
      this.tone({ dest: d, freq: 300, end: 900, decay: 0.5, gain: 0.15, type: 'triangle' });
      this.noiseHit({ dest: d, lp: 1600, decay: 0.5, gain: 0.3, attack: 0.05 });
    } else if (type === 'step' || type === 'swarm') {
      this.noiseHit({ dest: d, lp: 1000, hp: 120, decay: 0.6, gain: 0.3, attack: 0.1 });
    } else if (type === 'fire') {
      this.noiseHit({ dest: d, lp: 1400, hp: 100, decay: 0.6, gain: 0.4, attack: 0.05 });
    } else if (type === 'heal') {
      this.tone({ dest: d, freq: 520, end: 780, decay: 0.4, gain: 0.12, type: 'triangle' });
    } else if (type === 'ult') {
      this.tone({ dest: d, freq: 660, end: 1320, decay: 0.3, gain: 0.15, type: 'triangle' });
      this.tone({ dest: d, at: 0.08, freq: 990, end: 1760, decay: 0.3, gain: 0.12, type: 'triangle' });
    }
  }

  flashbang(pos) {
    if (!this.ctx) return;
    const d = this.out(pos);
    this.noiseHit({ dest: d, lp: 6000, hp: 800, decay: 0.25, gain: 0.7 });
    this.tone({ dest: d, freq: 2400, end: 1800, decay: 0.4, gain: 0.08 });
  }

  pulse(pos, type) {
    if (!this.ctx) return;
    const d = pos ? this.out(pos) : this.master;
    const f = { reveal: [900, 1400], stun: [180, 90], near: [300, 120], trap: [1200, 700], lockdown: [220, 440] }[type] || [600, 900];
    this.tone({ dest: d, freq: f[0], end: f[1], decay: 0.35, gain: 0.18, type: type === 'stun' ? 'sawtooth' : 'sine' });
    if (type === 'stun' || type === 'lockdown') this.noiseHit({ dest: d, lp: 1200, decay: 0.3, gain: 0.35 });
  }

  // Round-mode cues: spike beep, plant / defuse stingers, round results.
  beep(pos, urgent) {
    if (!this.ctx) return;
    this.tone({ dest: pos ? this.out(pos) : this.master, freq: urgent ? 1900 : 1500, decay: 0.09, gain: 0.16, type: 'square' });
  }
  sting(kind) {
    if (!this.ctx) return;
    const d = this.master;
    const seq = { planted: [[660, 0], [520, 0.18], [660, 0.36]], defused: [[520, 0], [780, 0.15]], win: [[523, 0], [659, 0.12], [784, 0.24]], loss: [[392, 0], [330, 0.16], [262, 0.32]], start: [[880, 0]] }[kind] || [];
    for (const [f, at] of seq) this.tone({ dest: d, at, freq: f, decay: 0.28, gain: 0.2, type: 'triangle' });
    if (kind === 'detonate') { this.noiseHit({ dest: d, lp: 600, decay: 1.6, gain: 0.9, attack: 0.01 }); this.tone({ dest: d, freq: 90, end: 30, decay: 1.4, gain: 0.5, type: 'sawtooth' }); }
  }

  smoke(pos) {
    if (!this.ctx) return;
    this.noiseHit({ dest: this.out(pos), lp: 1200, hp: 150, decay: 0.7, gain: 0.5, attack: 0.08 });
  }

  swing(heavy) {
    if (!this.ctx) return;
    this.noiseHit({ dest: this.master, lp: heavy ? 1200 : 1800, hp: 500, decay: heavy ? 0.22 : 0.14, gain: 0.2, attack: 0.03 });
  }
}
