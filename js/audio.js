// Synthesized sound: gunshots, footsteps, hit confirmations. Other players' sounds are positional.

const SHOT = {
  knife: null,
  pistol: { lp: 4200, decay: 0.12, thump: 150, gain: 0.7 },
  revolver: { lp: 3000, decay: 0.28, thump: 90, gain: 1.0 },
  smg: { lp: 4800, decay: 0.08, thump: 170, gain: 0.55 },
  rifle: { lp: 3600, decay: 0.17, thump: 110, gain: 0.8 },
  dmr: { lp: 3300, decay: 0.22, thump: 100, gain: 0.85 },
  sniper: { lp: 2500, decay: 0.5, thump: 70, gain: 1.0 },
  shotgun: { lp: 2200, decay: 0.32, thump: 80, gain: 1.0 },
  heavy: { lp: 3000, decay: 0.13, thump: 100, gain: 0.75 },
};

export class Sound {
  constructor() {
    this.ctx = null;
    this.volume = 0.6;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
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
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  setListener(pos, yaw) {
    if (!this.ctx) return;
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

  // Output node: straight to master for your own sounds, through a panner for everyone else's.
  out(pos) {
    if (!pos) return this.master;
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 4;
    p.rolloffFactor = 1.1;
    p.maxDistance = 120;
    if (p.positionX) { p.positionX.value = pos[0]; p.positionY.value = pos[1]; p.positionZ.value = pos[2]; }
    else p.setPosition(pos[0], pos[1], pos[2]);
    p.connect(this.world);
    return p;
  }

  noiseHit({ dest, at = 0, lp = 2000, hp = 0, decay = 0.1, gain = 0.5, attack = 0.002 }) {
    const c = this.ctx, t = c.currentTime + at;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    let node = src;
    if (hp) { const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; node.connect(f); node = f; }
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; node.connect(f);
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

  gunshot(def, pos) {
    if (!this.ctx) return;
    const s = SHOT[def.model];
    if (!s) return;
    const dest = this.out(pos);
    const sup = def.suppressed;
    const gain = s.gain * (sup ? 0.4 : 1) * (pos ? 1.6 : 0.55);
    this.noiseHit({ dest, lp: sup ? 1400 : s.lp, decay: s.decay * (sup ? 0.6 : 1), gain });
    this.tone({ dest, freq: s.thump * 1.6, end: s.thump * 0.5, decay: Math.min(0.15, s.decay), gain: gain * 0.8 });
    if (!sup) this.noiseHit({ dest, hp: 3000, lp: 9000, decay: 0.03, gain: gain * 0.5 });
  }

  footstep(pos, own) {
    if (!this.ctx) return;
    const dest = this.out(pos);
    this.noiseHit({ dest, lp: 700 + Math.random() * 300, hp: 120, decay: 0.07, gain: own ? 0.12 : 0.55 });
    this.tone({ dest, freq: 90, end: 50, decay: 0.05, gain: own ? 0.05 : 0.25 });
  }

  land(pos, own) {
    if (!this.ctx) return;
    const dest = this.out(pos);
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
  reload(duration, steps = [[0.1, 'click'], [0.5, 'thunk'], [0.85, 'click']]) {
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

  equip() {
    if (!this.ctx) return;
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
