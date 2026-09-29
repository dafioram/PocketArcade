// Tower: an air traffic control game. Ported from a standalone page into the
// Pocket Arcade shell; the flight rules and tuning are unchanged.
import { palette, type Palette } from '../../core/theme';
import { defineGame } from '../../core/types';
import { roundRect, text } from '../../lib/draw';
import { gestures, type Point } from '../../lib/gestures';
import { keyboard } from '../../lib/keyboard';
import { loop } from '../../lib/loop';
import { createOverlay } from '../../lib/overlay';
import { createStage } from '../../lib/stage';

const W = 420;
const H = 560;
const TAU = Math.PI * 2;

type Kind = 'jet' | 'prop' | 'heli';
const TYPES: Record<Kind, { spd: number; r: number; turn: number }> = {
  jet: { spd: 60, r: 13, turn: 3.0 },
  prop: { spd: 46, r: 10, turn: 4.0 },
  heli: { spd: 34, r: 9, turn: 5.2 },
};
const colorOf = (pal: Palette, k: Kind) => ({ jet: pal.red, prop: pal.blue, heli: pal.yellow })[k];

interface Target {
  kind: 'rwy' | 'pad';
  x: number;
  y: number;
  ang: number;
  len: number;
  w: number;
  r: number;
  accept: Kind[];
  tag: string;
  dx: number;
  dy: number;
  ends: Point[];
}

const mk = (t: Omit<Target, 'ends'>): Target => ({
  ...t,
  ends:
    t.kind === 'rwy'
      ? [
          { x: t.x - (Math.cos(t.ang) * t.len) / 2, y: t.y - (Math.sin(t.ang) * t.len) / 2 },
          { x: t.x + (Math.cos(t.ang) * t.len) / 2, y: t.y + (Math.sin(t.ang) * t.len) / 2 },
        ]
      : [],
});

const TARGETS: Target[] = [
  mk({ kind: 'rwy', x: 210, y: 372, ang: 0, len: 190, w: 30, r: 0, accept: ['jet', 'prop'], tag: '27', dx: 0, dy: 34 }),
  mk({ kind: 'rwy', x: 96, y: 196, ang: Math.PI / 2, len: 128, w: 24, r: 0, accept: ['prop'], tag: '18', dx: 34, dy: 0 }),
  mk({ kind: 'pad', x: 322, y: 196, ang: 0, len: 0, w: 0, r: 30, accept: ['heli'], tag: 'H', dx: 0, dy: 0 }),
];

interface Landing {
  t: number;
  pts: Point[];
  wi: number;
  v0: number;
  legLen: number;
  cx: number;
  cy: number;
}

interface Plane {
  type: Kind;
  x: number;
  y: number;
  hd: number;
  path: Point[];
  wp: number;
  r: number;
  scl: number;
  landing?: Landing;
  dead?: boolean;
}

interface Warning {
  x: number;
  y: number;
  t: number;
  sx: number;
  sy: number;
  dead?: boolean;
}

interface Part {
  check?: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  c: string;
  r: number;
}

const turnTo = (h: number, w: number, m: number) => {
  let d = (w - h) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return h + Math.max(-m, Math.min(m, d));
};

export default defineGame((ctx) => {
  const { root, signal } = ctx;
  const stage = createStage(root, { width: W, height: H }, signal);
  const overlay = createOverlay(root, signal);

  type Phase = 'ready' | 'play' | 'paused' | 'dying' | 'over';
  let phase: Phase = 'ready';
  let planes: Plane[] = [];
  let parts: Part[] = [];
  let warnings: Warning[] = [];
  let score = 0;
  let spawnT = 0;
  let speedMul = 1;
  let overT = 0;
  let shake = 0;
  let sel: Plane | null = null;
  const stars = Array.from({ length: 70 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.4 + 0.4, a: Math.random() * 0.5 + 0.25 }));

  const best = () => ctx.storage.get<number>('best:score', 0);
  const stats = () =>
    ctx.setStats([
      { label: 'Landed', value: score },
      { label: 'Best', value: Math.max(best(), score) },
    ]);

  // ---------- Sound (starts after the first touch, as browsers require) ----------
  let ac: AudioContext | null = null;
  const beep = (f: number, d: number, type: OscillatorType = 'sine', g = 0.1) => {
    try {
      ac = ac ?? new AudioContext();
      const o = ac.createOscillator();
      const gn = ac.createGain();
      o.type = type;
      o.frequency.value = f;
      gn.gain.setValueAtTime(g, ac.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + d);
      o.connect(gn);
      gn.connect(ac.destination);
      o.start();
      o.stop(ac.currentTime + d);
    } catch {
      /* no audio */
    }
  };
  const sLand = () => {
    beep(660, 0.12);
    setTimeout(() => beep(880, 0.16), 90);
  };
  const sSel = () => beep(440, 0.06, 'square', 0.04);
  const sCrash = () => {
    beep(150, 0.5, 'sawtooth', 0.18);
    setTimeout(() => beep(85, 0.6, 'sawtooth', 0.18), 130);
  };
  signal.addEventListener('abort', () => ac?.close().catch(() => {}));

  // ---------- Rules ----------
  const queueSpawn = () => {
    const side = (Math.random() * 4) | 0;
    let x: number;
    let y: number;
    if (side === 0) { x = -20; y = 50 + Math.random() * (H - 100); }
    else if (side === 1) { x = W + 20; y = 50 + Math.random() * (H - 100); }
    else if (side === 2) { y = -20; x = 50 + Math.random() * (W - 100); }
    else { y = H + 20; x = 50 + Math.random() * (W - 100); }
    warnings.push({ x: Math.max(16, Math.min(W - 16, x)), y: Math.max(16, Math.min(H - 16, y)), t: 0.9, sx: x, sy: y });
  };

  const doSpawn = (w: Warning) => {
    const ang = Math.atan2(H / 2 - w.sy, W / 2 - w.sx) + (Math.random() - 0.5) * 0.9;
    const r = Math.random();
    const type: Kind = r < 0.38 ? 'jet' : r < 0.74 ? 'prop' : 'heli';
    planes.push({ type, x: w.sx, y: w.sy, hd: ang, path: [], wp: 0, r: TYPES[type].r, scl: 1 });
  };

  const tryLand = (p: Plane) => {
    for (const t of TARGETS) {
      if (!t.accept.includes(p.type)) continue;
      const v0 = TYPES[p.type].spd * speedMul;
      if (t.kind === 'pad') {
        if (Math.hypot(t.x - p.x, t.y - p.y) < t.r + 14) {
          p.landing = { t: 0, pts: [{ x: t.x, y: t.y }], wi: 0, v0, legLen: 90, cx: t.x, cy: t.y };
          p.path = [];
          return;
        }
      } else {
        for (const e of t.ends) {
          if (Math.hypot(e.x - p.x, e.y - p.y) < 30) {
            p.landing = { t: 0, pts: [e, { x: t.x, y: t.y }], wi: 0, v0, legLen: Math.hypot(t.x - e.x, t.y - e.y), cx: t.x, cy: t.y };
            p.path = [];
            return;
          }
        }
      }
    }
  };

  const burst = (x: number, y: number, c: string, n: number) => {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * TAU;
      const s = 40 + Math.random() * 130;
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.6, c, r: 2 + Math.random() * 3 });
    }
  };

  const landed = (x: number, y: number) => {
    score++;
    sLand();
    ctx.haptic(12);
    parts.push({ check: true, x, y, vx: 0, vy: 0, life: 1.3, c: '', r: 0 });
    if (score > best()) ctx.recordBest('score', score);
    stats();
  };

  const crash = (a: Plane, b: Plane) => {
    phase = 'dying';
    overT = 1.5;
    sCrash();
    ctx.haptic(90);
    shake = 1;
    a.dead = b.dead = true;
    sel = null;
    const pal = palette();
    burst((a.x + b.x) / 2, (a.y + b.y) / 2, pal.orange, 26);
    burst((a.x + b.x) / 2, (a.y + b.y) / 2, pal.red, 18);
  };

  const followPath = (p: Plane, dt: number) => {
    const pts = p.path;
    const n = pts.length;
    if (!n) return;
    const hx = Math.cos(p.hd);
    const hy = Math.sin(p.hd);
    while (p.wp < n - 1) {
      const w = pts[p.wp];
      const dx = w.x - p.x;
      const dy = w.y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 324 || (dx * hx + dy * hy < 0 && d2 < 2025)) p.wp++;
      else break;
    }
    const last = pts[n - 1];
    if (Math.hypot(last.x - p.x, last.y - p.y) < 16) {
      p.path = [];
      tryLand(p);
      return;
    }
    let tp = last;
    for (let i = p.wp; i < n; i++) {
      const q = pts[i];
      const qx = q.x - p.x;
      const qy = q.y - p.y;
      if (qx * qx + qy * qy >= 676) {
        tp = q;
        break;
      }
    }
    p.hd = turnTo(p.hd, Math.atan2(tp.y - p.y, tp.x - p.x), TYPES[p.type].turn * dt);
  };

  const stepParts = (dt: number) => {
    for (const q of parts) {
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.life -= dt;
    }
    parts = parts.filter((q) => q.life > 0);
    if (shake > 0) shake -= dt * 2.5;
  };

  const update = (dt: number) => {
    if (phase === 'dying') {
      overT -= dt;
      stepParts(dt);
      if (overT <= 0) gameOver();
      return;
    }
    if (phase !== 'play') return;

    speedMul = Math.min(1.8, 1 + score * 0.02);
    spawnT -= dt;
    if (spawnT <= 0 && planes.length < 12) {
      queueSpawn();
      spawnT = Math.max(1.05, 3.3 - score * 0.09);
    }
    for (const w of warnings) {
      w.t -= dt;
      if (w.t <= 0) {
        doSpawn(w);
        w.dead = true;
      }
    }
    warnings = warnings.filter((w) => !w.dead);

    for (const p of planes) {
      if (p.landing) {
        const L = p.landing;
        L.t += dt;
        const tp = L.pts[L.wi];
        p.hd = turnTo(p.hd, Math.atan2(tp.y - p.y, tp.x - p.x), 6 * dt);
        const vv = L.v0 * (L.wi === 0 ? 0.85 : 0.6);
        p.x += Math.cos(p.hd) * vv * dt;
        p.y += Math.sin(p.hd) * vv * dt;
        const pr = Math.max(0, Math.min(1, 1 - Math.hypot(L.cx - p.x, L.cy - p.y) / L.legLen));
        p.scl = 1 - 0.75 * pr;
        if (Math.hypot(tp.x - p.x, tp.y - p.y) < 12) {
          if (L.wi < L.pts.length - 1) L.wi++;
          else {
            p.dead = true;
            landed(L.cx, L.cy);
          }
        } else if (L.t > 6) {
          p.dead = true;
          landed(p.x, p.y);
        }
        continue;
      }
      if (p.path.length) followPath(p, dt);
      const spd = TYPES[p.type].spd * speedMul;
      p.x += Math.cos(p.hd) * spd * dt;
      p.y += Math.sin(p.hd) * spd * dt;
      if (p.x < -50 || p.x > W + 50 || p.y < -50 || p.y > H + 50) p.dead = true;
    }
    for (let a = 0; a < planes.length; a++)
      for (let b = a + 1; b < planes.length; b++) {
        const A = planes[a];
        const B = planes[b];
        if (A.landing || B.landing || A.dead || B.dead) continue;
        if (Math.hypot(A.x - B.x, A.y - B.y) < A.r + B.r - 3) return crash(A, B);
      }
    if (sel?.dead) sel = null;
    planes = planes.filter((p) => !p.dead);
    stepParts(dt);
  };

  // ---------- Drawing ----------
  const drawTarget = (c: CanvasRenderingContext2D, t: Target, pal: Palette) => {
    c.save();
    c.translate(t.x, t.y);
    if (t.kind === 'pad') {
      c.fillStyle = pal.surface2;
      c.beginPath();
      c.arc(0, 0, t.r, 0, TAU);
      c.fill();
      c.strokeStyle = pal.muted;
      c.lineWidth = 2;
      c.stroke();
      text(c, 'H', 0, 1, { size: 17, weight: 800, color: pal.muted });
      text(c, 'HELI', 0, t.r + 13, { size: 10, weight: 800, color: pal.yellow });
    } else {
      c.rotate(t.ang);
      c.fillStyle = pal.border;
      roundRect(c, -t.len / 2, -t.w / 2, t.len, t.w, 4);
      c.fill();
      c.strokeStyle = pal.muted;
      c.lineWidth = 2;
      c.setLineDash([10, 8]);
      c.beginPath();
      c.moveTo(-t.len / 2 + 9, 0);
      c.lineTo(t.len / 2 - 9, 0);
      c.stroke();
      c.setLineDash([]);
      text(c, t.tag, 0, -t.w / 2 - 12, { size: 11, weight: 800, color: pal.text });
    }
    c.restore();
    // Pulsing landing circles
    c.strokeStyle = pal.green;
    c.globalAlpha = 0.45 + 0.35 * Math.sin(performance.now() / 300);
    c.lineWidth = 2;
    c.setLineDash([6, 5]);
    if (t.kind === 'rwy') {
      for (const e of t.ends) {
        c.beginPath();
        c.arc(e.x, e.y, 13, 0, TAU);
        c.stroke();
      }
    } else {
      c.beginPath();
      c.arc(t.x, t.y, t.r + 8, 0, TAU);
      c.stroke();
    }
    c.setLineDash([]);
    c.globalAlpha = 1;
    if (t.kind === 'rwy') {
      t.accept.forEach((k, i) => {
        c.fillStyle = colorOf(pal, k);
        c.beginPath();
        c.arc(t.x + t.dx + (i - (t.accept.length - 1) / 2) * 16, t.y + t.dy, 4.5, 0, TAU);
        c.fill();
      });
    }
  };

  const drawPlane = (c: CanvasRenderingContext2D, p: Plane, pal: Palette) => {
    const col = colorOf(pal, p.type);
    const white = pal.surface;
    c.save();
    c.translate(p.x, p.y);
    c.scale(p.scl, p.scl);
    c.rotate(p.hd);
    // Contrail
    c.strokeStyle = col;
    c.globalAlpha = 0.28;
    c.lineWidth = 3;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(-p.r - 2, 0);
    c.lineTo(-p.r - 20, 0);
    c.stroke();
    c.globalAlpha = 1;
    if (p === sel) {
      c.strokeStyle = pal.text;
      c.lineWidth = 2;
      c.beginPath();
      c.arc(0, 0, p.r + 7, 0, TAU);
      c.stroke();
    }
    c.fillStyle = col;
    if (p.type === 'jet') {
      c.fillRect(-9, -3.5, 15, 7);
      c.beginPath();
      c.moveTo(17, 0);
      c.lineTo(6, -4);
      c.lineTo(6, 4);
      c.closePath();
      c.fill();
      c.fillRect(-3, -12, 7, 24);
      c.fillRect(-13, -6, 4, 12);
      c.fillStyle = white;
      c.beginPath();
      c.arc(9, 0, 2, 0, TAU);
      c.fill();
    } else if (p.type === 'prop') {
      c.beginPath();
      c.ellipse(0, 0, 10, 4, 0, 0, TAU);
      c.fill();
      c.beginPath();
      c.moveTo(18, 0);
      c.lineTo(8, -3.6);
      c.lineTo(8, 3.6);
      c.closePath();
      c.fill();
      c.fillRect(-2, -9, 5, 18);
      c.fillRect(-16, -5.5, 7, 11);
      c.fillStyle = white;
      c.beginPath();
      c.arc(6, 0, 2, 0, TAU);
      c.fill();
    } else {
      c.fillRect(-20, -1.6, 13, 3.2);
      c.fillRect(-22, -5, 3.5, 10);
      c.beginPath();
      c.ellipse(0, 0, 8, 5, 0, 0, TAU);
      c.fill();
      c.fillStyle = white;
      c.beginPath();
      c.arc(5, 0, 1.8, 0, TAU);
      c.fill();
      c.save();
      c.rotate((performance.now() / 45) % TAU);
      c.strokeStyle = pal.text;
      c.globalAlpha = 0.7;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(-14, 0);
      c.lineTo(14, 0);
      c.stroke();
      c.restore();
    }
    c.restore();
  };

  const render = () => {
    const c = stage.begin();
    const pal = palette();
    c.save();
    if (shake > 0) c.translate((Math.random() - 0.5) * 9 * shake, (Math.random() - 0.5) * 9 * shake);
    c.fillStyle = pal.surface;
    c.fillRect(-20, -20, W + 40, H + 40);
    c.fillStyle = pal.border;
    for (const s of stars) c.fillRect(s.x, s.y, s.r, s.r);

    for (const t of TARGETS) drawTarget(c, t, pal);

    if (phase === 'play' && Math.floor(performance.now() / 220) % 2 === 0) {
      for (const w of warnings) text(c, '!', w.x, w.y, { size: 24, weight: 800, color: pal.orange });
    }

    // Routes
    for (const p of planes) {
      if (p.landing || !p.path.length || p.dead) continue;
      const rem = p.path.slice(p.wp);
      if (!rem.length) continue;
      c.strokeStyle = colorOf(pal, p.type);
      c.globalAlpha = 0.9;
      c.lineWidth = 3;
      c.setLineDash([9, 7]);
      c.beginPath();
      c.moveTo(rem[0].x, rem[0].y);
      for (const q of rem) c.lineTo(q.x, q.y);
      c.stroke();
      c.setLineDash([]);
      c.globalAlpha = 1;
    }
    for (const p of planes) if (!p.dead) drawPlane(c, p, pal);

    // Near-miss warning rings
    if (phase === 'play' || phase === 'paused') {
      for (let a = 0; a < planes.length; a++)
        for (let b = a + 1; b < planes.length; b++) {
          const A = planes[a];
          const B = planes[b];
          if (A.landing || B.landing || A.dead || B.dead) continue;
          const d = Math.hypot(A.x - B.x, A.y - B.y);
          if (d < 66 && d >= A.r + B.r - 3) {
            c.strokeStyle = pal.red;
            c.globalAlpha = 0.45 + 0.4 * Math.sin(performance.now() / 90);
            c.lineWidth = 2;
            for (const P of [A, B]) {
              c.beginPath();
              c.arc(P.x, P.y, P.r + 8, 0, TAU);
              c.stroke();
            }
            c.globalAlpha = 1;
          }
        }
    }

    for (const q of parts) {
      if (q.check) {
        c.globalAlpha = Math.max(0, Math.min(1, q.life / 1.3));
        text(c, '✓', q.x, q.y - (1.3 - q.life) * 26, { size: 26, weight: 800, color: pal.green });
      } else {
        c.globalAlpha = Math.max(0, Math.min(1, q.life * 1.7));
        c.fillStyle = q.c;
        c.beginPath();
        c.arc(q.x, q.y, q.r, 0, TAU);
        c.fill();
      }
    }
    c.globalAlpha = 1;
    c.restore();
  };

  // ---------- Input: touch a plane and drag to draw its route ----------
  gestures(
    stage.canvas.parentElement!,
    {
      press: (pt) => {
        if (phase !== 'play') return;
        try {
          if (ac?.state === 'suspended') ac.resume();
        } catch {
          /* ignore */
        }
        let bp: Plane | null = null;
        let bd = 60;
        for (const p of planes) {
          if (p.landing || p.dead) continue;
          const d = Math.hypot(p.x - pt.x, p.y - pt.y);
          if (d < bd) {
            bd = d;
            bp = p;
          }
        }
        if (bp) {
          sel = bp;
          bp.path = [{ x: bp.x, y: bp.y }];
          bp.wp = 0;
          sSel();
          ctx.haptic(6);
        }
      },
      move: (pt) => {
        if (!sel || phase !== 'play') return;
        if (sel.dead || sel.landing) {
          sel = null;
          return;
        }
        const path = sel.path;
        if (!path.length) {
          path.push({ x: sel.x, y: sel.y });
          sel.wp = 0;
        }
        const lp = path[path.length - 1];
        if (Math.hypot(pt.x - lp.x, pt.y - lp.y) > 9) path.push({ x: pt.x, y: pt.y });
      },
      release: () => (sel = null),
    },
    { signal, toLocal: stage.toLocal, slop: 2 },
  );

  keyboard(signal, (e) => {
    if (e.key === 'p' || e.key === 'Escape') phase === 'paused' ? resume() : pause();
  });

  const gameOver = () => {
    phase = 'over';
    const { isNew } = ctx.recordBest('score', score);
    stats();
    overlay.show({
      title: 'Shift over',
      body: `You landed ${score} aircraft.${isNew && score > 0 ? '\nNew best shift!' : `\nBest shift: ${best()}`}`,
      actions: [{ label: 'Fly again', primary: true, onClick: startShift }],
    });
  };

  function startShift() {
    overlay.hide();
    planes = [];
    parts = [];
    warnings = [];
    score = 0;
    speedMul = 1;
    spawnT = 1.4;
    shake = 0;
    sel = null;
    phase = 'play';
    stats();
  }

  loop(update, render, signal);
  stats();
  // Test hook (development builds only).
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__tower = { planes: () => planes, score: () => score, phase: () => phase };
  overlay.show({
    title: 'Tower',
    body: 'You’re the air traffic controller. Touch a plane and drag to draw its route, then land it in a green circle at the end of a matching runway.\nOne collision ends your shift.',
    actions: [{ label: 'Start shift', primary: true, onClick: startShift }],
  });

  function pause() {
    if (phase !== 'play') return;
    phase = 'paused';
    sel = null;
    overlay.show({ title: 'Paused', body: 'The skies will wait.', actions: [{ label: 'Resume', primary: true, onClick: resume }] });
  }
  function resume() {
    if (phase !== 'paused') return;
    phase = 'play';
    overlay.hide();
  }
  return { pause, resume, isPaused: () => phase === 'paused' };
});
