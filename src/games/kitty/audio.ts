/* Kitty Chomp sounds: every sound is synthesized live with the Web Audio API. */

export interface KittyAudio {
  unlock(): void;
  setMuted(m: boolean): void;
  isMuted(): boolean;
  chomp(): void;
  catnip(): void;
  yelp(): void;
  bark(): void;
  bonus(): void;
  extraLife(): void;
  /** Caught by a dog: a big "WOOF! woof!" in that dog's voice, then a sad meow. */
  death(pitch?: number): void;
  levelClear(): void;
  /** Opening tune. Returns its length in seconds. */
  jingle(): number;
  close(): void;
}

const VOL = 0.5;

function noteFreq(n: string) {
  const m = /^([A-G])(#?)(\d)$/.exec(n)!;
  const base: Record<string, number> = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
  const semis = base[m[1]] + (m[2] ? 1 : 0) + (parseInt(m[3], 10) - 4) * 12;
  return 440 * Math.pow(2, semis / 12);
}

export function createAudio(startMuted: boolean): KittyAudio {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let noiseBuf: AudioBuffer | null = null;
  let muted = startMuted;
  let lastChomp = 0;
  let flip = false;
  let gritCurve: Float32Array<ArrayBuffer> | null = null;

  const ready = (): boolean => !!ctx && !!master && !muted && ctx.state === 'running';

  const env = (g: GainNode, t0: number, vol: number, attack: number, dur: number) => {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  };

  const tone = (type: OscillatorType, f0: number, f1: number, t0: number, dur: number, vol: number) => {
    const c = ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    env(g, t0, vol, Math.min(0.01, dur / 4), dur);
    o.connect(g);
    g.connect(master!);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  };

  // A meow: sawtooth through a sweeping band-pass filter ("mi-a-ow").
  const meow = (t0: number, f: [number, number, number], dur: number, vol: number) => {
    const c = ctx!;
    const o = c.createOscillator();
    const bp = c.createBiquadFilter();
    const lp = c.createBiquadFilter();
    const g = c.createGain();
    const lfo = c.createOscillator();
    const lg = c.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f[0], t0);
    o.frequency.linearRampToValueAtTime(f[1], t0 + dur * 0.35);
    o.frequency.linearRampToValueAtTime(f[2], t0 + dur);
    lfo.frequency.value = 7;
    lg.gain.value = f[1] * 0.025;
    lfo.connect(lg);
    lg.connect(o.frequency);
    bp.type = 'bandpass';
    bp.Q.value = 3.5;
    bp.frequency.setValueAtTime(800, t0);
    bp.frequency.linearRampToValueAtTime(2100, t0 + dur * 0.35);
    bp.frequency.linearRampToValueAtTime(900, t0 + dur);
    lp.type = 'lowpass';
    lp.frequency.value = 3200;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.06);
    g.gain.setValueAtTime(vol, t0 + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(bp);
    bp.connect(lp);
    lp.connect(g);
    g.connect(master!);
    o.start(t0);
    lfo.start(t0);
    o.stop(t0 + dur + 0.05);
    lfo.stop(t0 + dur + 0.05);
  };

  const woof = (t0: number, pitch: number) => {
    const c = ctx!;
    const n = c.createBufferSource();
    const bp = c.createBiquadFilter();
    const g = c.createGain();
    n.buffer = noiseBuf;
    bp.type = 'bandpass';
    bp.frequency.value = 700 * pitch;
    bp.Q.value = 1.2;
    env(g, t0, 0.35, 0.005, 0.12);
    n.connect(bp);
    bp.connect(g);
    g.connect(master!);
    n.start(t0);
    n.stop(t0 + 0.15);
    const o = c.createOscillator();
    const lp = c.createBiquadFilter();
    const g2 = c.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(260 * pitch, t0);
    o.frequency.exponentialRampToValueAtTime(140 * pitch, t0 + 0.13);
    lp.type = 'lowpass';
    lp.frequency.value = 1100;
    env(g2, t0, 0.3, 0.006, 0.14);
    o.connect(lp);
    lp.connect(g2);
    g2.connect(master!);
    o.start(t0);
    o.stop(t0 + 0.16);
  };

  // A fuller bark for getting caught: pitch rises then drops ("w-OO-f").
  const bigWoof = (t0: number, pitch: number, vol: number) => {
    const c = ctx!;
    const dur = 0.24;
    if (!gritCurve) {
      gritCurve = new Float32Array(new ArrayBuffer(1024 * 4));
      for (let i = 0; i < 1024; i++) gritCurve[i] = Math.tanh((i / 511.5 - 1) * 3);
    }
    const o = c.createOscillator();
    const o2 = c.createOscillator();
    const shaper = c.createWaveShaper();
    const lp = c.createBiquadFilter();
    const g = c.createGain();
    o.type = 'sawtooth';
    o2.type = 'square';
    [o, o2].forEach((osc, k) => {
      const m = k ? 0.5 : 1;
      osc.frequency.setValueAtTime(170 * pitch * m, t0);
      osc.frequency.exponentialRampToValueAtTime(330 * pitch * m, t0 + 0.04);
      osc.frequency.exponentialRampToValueAtTime(120 * pitch * m, t0 + dur);
    });
    shaper.curve = gritCurve;
    lp.type = 'lowpass';
    lp.Q.value = 6;
    lp.frequency.setValueAtTime(500 * pitch, t0);
    lp.frequency.exponentialRampToValueAtTime(1700 * pitch, t0 + 0.05);
    lp.frequency.exponentialRampToValueAtTime(420 * pitch, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
    g.gain.setValueAtTime(vol, t0 + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(shaper);
    o2.connect(shaper);
    shaper.connect(lp);
    lp.connect(g);
    g.connect(master!);
    o.start(t0);
    o2.start(t0);
    o.stop(t0 + dur + 0.03);
    o2.stop(t0 + dur + 0.03);

    const n = c.createBufferSource();
    const bp = c.createBiquadFilter();
    const ng = c.createGain();
    n.buffer = noiseBuf;
    bp.type = 'bandpass';
    bp.frequency.value = 900 * pitch;
    bp.Q.value = 1;
    env(ng, t0, vol * 0.6, 0.004, 0.09);
    n.connect(bp);
    bp.connect(ng);
    ng.connect(master!);
    n.start(t0);
    n.stop(t0 + 0.12);
  };

  return {
    unlock() {
      try {
        if (!ctx) {
          ctx = new AudioContext();
          master = ctx.createGain();
          master.gain.value = muted ? 0 : VOL;
          master.connect(ctx.destination);
          noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
          const d = noiseBuf.getChannelData(0);
          for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        }
        if (ctx.state === 'suspended') ctx.resume();
      } catch {
        /* no audio available */
      }
    },
    setMuted(m) {
      muted = m;
      if (master && ctx) master.gain.setTargetAtTime(m ? 0 : VOL, ctx.currentTime, 0.02);
    },
    isMuted: () => muted,

    chomp() {
      if (!ready()) return;
      const t = ctx!.currentTime;
      if (t - lastChomp < 0.075) return;
      lastChomp = t;
      flip = !flip;
      tone('triangle', flip ? 330 : 520, flip ? 520 : 330, t, 0.07, 0.16);
    },

    catnip() {
      if (!ready()) return;
      const c = ctx!;
      const t = c.currentTime;
      // purr: a low buzz with a fast amplitude flutter
      const o = c.createOscillator();
      const lp = c.createBiquadFilter();
      const g = c.createGain();
      const am = c.createOscillator();
      const amg = c.createGain();
      o.type = 'sawtooth';
      o.frequency.value = 55;
      lp.type = 'lowpass';
      lp.frequency.value = 380;
      am.frequency.value = 24;
      amg.gain.value = 0.12;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      am.connect(amg);
      amg.connect(g.gain);
      o.connect(lp);
      lp.connect(g);
      g.connect(master!);
      o.start(t);
      am.start(t);
      o.stop(t + 0.75);
      am.stop(t + 0.75);
      meow(t + 0.08, [520, 900, 760], 0.38, 0.22);
    },

    yelp() {
      if (!ready()) return;
      const t = ctx!.currentTime;
      tone('square', 900, 1700, t, 0.07, 0.12);
      tone('square', 1700, 600, t + 0.07, 0.14, 0.1);
    },

    bark() {
      if (!ready()) return;
      const t = ctx!.currentTime;
      woof(t, 1);
      woof(t + 0.2, 1.08);
    },

    bonus() {
      if (!ready()) return;
      const t = ctx!.currentTime;
      ['C5', 'E5', 'G5', 'C6'].forEach((n, i) => tone('triangle', noteFreq(n), 0, t + i * 0.06, 0.12, 0.2));
    },

    extraLife() {
      if (!ready()) return;
      const t = ctx!.currentTime;
      for (let i = 0; i < 4; i++) tone('sine', noteFreq(i % 2 ? 'E6' : 'B5'), 0, t + i * 0.12, 0.25, 0.2);
    },

    death(pitch = 1) {
      if (!ready()) return;
      const t = ctx!.currentTime + 0.02;
      bigWoof(t, pitch, 0.55);
      bigWoof(t + 0.26, pitch * 1.06, 0.4);
      meow(t + 0.62, [700, 620, 260], 1.0, 0.26);
    },

    levelClear() {
      if (!ready()) return;
      const t = ctx!.currentTime;
      meow(t, [500, 820, 700], 0.45, 0.24);
      ['G5', 'C6', 'E6', 'G6'].forEach((n, i) => tone('triangle', noteFreq(n), 0, t + 0.45 + i * 0.09, 0.16, 0.16));
    },

    jingle() {
      const step = 0.13;
      const melody: Array<[string, number]> = [
        ['E5', 1], ['G5', 1], ['C6', 2], ['B5', 1], ['G5', 1], ['A5', 2],
        ['F5', 1], ['A5', 1], ['D6', 2], ['C6', 1], ['A5', 1], ['B5', 2],
        ['G5', 1], ['B5', 1], ['E6', 2], ['D6', 1], ['B5', 1], ['C6', 4],
      ];
      const bass: Array<[string, number]> = [['C3', 4], ['F3', 4], ['D3', 4], ['G3', 4], ['E3', 4], ['G2', 2], ['C3', 4]];
      const total = melody.reduce((s, n) => s + n[1], 0) * step;
      if (!ready()) return total;
      const t = ctx!.currentTime + 0.05;
      let at = t;
      for (const [n, len] of melody) {
        tone('square', noteFreq(n), 0, at, len * step * 0.9, 0.07);
        at += len * step;
      }
      at = t;
      for (const [n, len] of bass) {
        tone('triangle', noteFreq(n), 0, at, len * step * 0.85, 0.22);
        at += len * step;
      }
      return total;
    },

    close() {
      ctx?.close().catch(() => {});
      ctx = null;
      master = null;
    },
  };
}
