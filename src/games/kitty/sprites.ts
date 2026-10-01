/* Kitty Chomp sprites: every character and pickup is drawn with canvas paths. */
type Ctx = CanvasRenderingContext2D;
type Pt = [number, number];
export type Dir = 'up' | 'down' | 'left' | 'right';
export type Breed = 'bulldog' | 'poodle' | 'beagle' | 'husky';
export type DogMode = 'normal' | 'scared' | 'flash' | 'eyes';
export type BonusType = 'fish' | 'mouse' | 'yarn' | 'milk' | 'box' | 'tuna' | 'goldfish' | 'bell';

const TAU = Math.PI * 2;
const DV: Record<Dir, Pt> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

function ell(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU);
}
function circ(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.01, r), 0, TAU);
}
function tri(ctx: Ctx, a: Pt, b: Pt, c: Pt) {
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.lineTo(c[0], c[1]);
  ctx.closePath();
}

/* ---------------------------------------------------------------- cat */
export interface CatOpts {
  spin?: number;
  scale?: number;
  dead?: boolean;
}

/** Orange tabby, drawn facing right, then flipped/rotated. mouth: 0 (closed) .. 1 (open). */
export function cat(ctx: Ctx, cx: number, cy: number, r: number, dir: Dir, mouth: number, opt: CatOpts = {}) {
  ctx.save();
  ctx.translate(cx, cy);
  if (opt.spin) ctx.rotate(opt.spin);
  if (opt.scale != null) ctx.scale(opt.scale, opt.scale);
  if (dir === 'left') ctx.scale(-1, 1);
  else if (dir === 'up') ctx.rotate(-Math.PI / 2);
  else if (dir === 'down') {
    ctx.rotate(Math.PI / 2);
    ctx.scale(1, -1);
  }

  const fur = '#f39a3d';
  const stripe = '#c8641b';
  const line = '#6e330c';
  const pink = '#ff9fb8';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1, r * 0.09);
  ctx.strokeStyle = line;

  const ear = (outer: [Pt, Pt, Pt], inner: [Pt, Pt, Pt]) => {
    tri(ctx, ...outer);
    ctx.fillStyle = fur;
    ctx.fill();
    ctx.stroke();
    tri(ctx, ...inner);
    ctx.fillStyle = pink;
    ctx.fill();
  };
  ear(
    [[-0.8 * r, -0.4 * r], [-0.64 * r, -1.2 * r], [-0.12 * r, -0.88 * r]],
    [[-0.64 * r, -0.55 * r], [-0.58 * r, -1.0 * r], [-0.3 * r, -0.82 * r]],
  );
  ear(
    [[-0.14 * r, -0.92 * r], [0.3 * r, -1.24 * r], [0.52 * r, -0.72 * r]],
    [[0.02 * r, -0.88 * r], [0.27 * r, -1.06 * r], [0.38 * r, -0.78 * r]],
  );

  // Head with a chomping mouth (wedge aimed slightly downward)
  const axis = 0.18;
  const a = 0.03 + Math.max(0, Math.min(1, mouth)) * 0.6;
  const headPath = () => {
    ctx.beginPath();
    ctx.moveTo(0.05 * r, 0.06 * r);
    ctx.arc(0, 0, r, axis + a, axis - a + TAU);
    ctx.closePath();
  };
  headPath();
  ctx.fillStyle = fur;
  ctx.fill();

  ctx.save();
  ctx.clip();
  ctx.strokeStyle = stripe;
  ctx.lineWidth = r * 0.13;
  for (const th of [-2.45, -2.05, -1.65]) {
    ctx.beginPath();
    ctx.moveTo(Math.cos(th) * r * 1.05, Math.sin(th) * r * 1.05);
    ctx.lineTo(Math.cos(th) * r * 0.62, Math.sin(th) * r * 0.62);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(-r * 1.05, 0.05 * r);
  ctx.lineTo(-r * 0.62, 0.02 * r);
  ctx.stroke();
  circ(ctx, 0.36 * r, 0.62 * r, 0.36 * r);
  ctx.fillStyle = '#fff4e6';
  ctx.fill();
  ctx.restore();

  headPath();
  ctx.lineWidth = Math.max(1, r * 0.09);
  ctx.strokeStyle = line;
  ctx.stroke();

  // Eye
  const ex = 0.24 * r;
  const ey = -0.4 * r;
  if (opt.dead) {
    ctx.lineWidth = r * 0.09;
    ctx.beginPath();
    ctx.moveTo(ex - 0.13 * r, ey - 0.13 * r);
    ctx.lineTo(ex + 0.13 * r, ey + 0.13 * r);
    ctx.moveTo(ex + 0.13 * r, ey - 0.13 * r);
    ctx.lineTo(ex - 0.13 * r, ey + 0.13 * r);
    ctx.stroke();
  } else {
    ell(ctx, ex, ey, 0.17 * r, 0.21 * r);
    ctx.fillStyle = '#c6f26a';
    ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.05);
    ctx.stroke();
    ell(ctx, ex + 0.04 * r, ey, 0.055 * r, 0.16 * r);
    ctx.fillStyle = '#1a1208';
    ctx.fill();
    circ(ctx, ex - 0.04 * r, ey - 0.08 * r, 0.04 * r);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }

  // Nose on the muzzle edge
  const na = axis - 0.78;
  const nx = Math.cos(na) * r * 0.92;
  const ny = Math.sin(na) * r * 0.92;
  tri(ctx, [nx - 0.1 * r, ny - 0.06 * r], [nx + 0.08 * r, ny - 0.08 * r], [nx, ny + 0.07 * r]);
  ctx.fillStyle = pink;
  ctx.fill();

  // Whiskers
  ctx.strokeStyle = 'rgba(110,51,12,0.55)';
  ctx.lineWidth = Math.max(0.8, r * 0.045);
  ctx.beginPath();
  ctx.moveTo(0.55 * r, -0.28 * r);
  ctx.lineTo(1.28 * r, -0.62 * r);
  ctx.moveTo(0.58 * r, -0.22 * r);
  ctx.lineTo(1.34 * r, -0.36 * r);
  ctx.moveTo(-0.55 * r, 0.25 * r);
  ctx.lineTo(-1.2 * r, 0.32 * r);
  ctx.stroke();

  ctx.restore();
}

/* ---------------------------------------------------------------- dogs */
interface Coat {
  fur: string;
  fur2: string;
  ear: string;
  nose: string;
  detail: string;
  bow?: string;
  iris?: string;
  inner?: string;
}
const BREEDS: Record<Breed, Coat> = {
  bulldog: { fur: '#d9a066', fur2: '#f7ecdc', ear: '#8a5a33', nose: '#2a1a12', detail: '#a8743f' },
  poodle: { fur: '#f2e2d4', fur2: '#fffaf3', ear: '#e3c9b3', nose: '#3a2a2a', detail: '#d8bca4', bow: '#ff7ac8' },
  beagle: { fur: '#c97b3c', fur2: '#fff5e8', ear: '#5c3a21', nose: '#1e1410', detail: '#9b5a28' },
  husky: { fur: '#7d889c', fur2: '#f4f6fa', ear: '#626d82', nose: '#1b1b22', detail: '#5a6476', iris: '#6fd0ff', inner: '#f4a7b9' },
};
const SCARED: Coat = { fur: '#3d4fd6', fur2: '#6578f2', ear: '#2c3ab0', nose: '#16206b', detail: '#2c3ab0', bow: '#6578f2', iris: '#16206b', inner: '#2c3ab0' };
const FLASH: Coat = { fur: '#eef0ff', fur2: '#ffffff', ear: '#cfd3f2', nose: '#ff5a7a', detail: '#cfd3f2', bow: '#ffffff', iris: '#ff5a7a', inner: '#cfd3f2' };

function eyesPair(ctx: Ctx, r: number, ex: number, ey: number, er: number, look: Dir | null, mode: DogMode, iris?: string) {
  const lx = look ? DV[look][0] : 0;
  const ly = look ? DV[look][1] : 0;
  for (const s of [-1, 1]) {
    const x = s * ex;
    if (mode === 'scared' || mode === 'flash') {
      circ(ctx, x, ey + er * 0.2, er * 0.45);
      ctx.fillStyle = mode === 'flash' ? '#ff5a7a' : '#fff4e6';
      ctx.fill();
      ctx.strokeStyle = mode === 'flash' ? '#ff5a7a' : '#fff4e6';
      ctx.lineWidth = Math.max(1, r * 0.07);
      ctx.beginPath();
      ctx.moveTo(x - s * er * 0.9, ey - er * 0.6);
      ctx.lineTo(x + s * er * 0.6, ey - er * 1.2);
      ctx.stroke();
      continue;
    }
    circ(ctx, x, ey, er);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,15,30,0.45)';
    ctx.lineWidth = Math.max(0.8, r * 0.035);
    ctx.stroke();
    const px = x + lx * er * 0.38;
    const py = ey + ly * er * 0.38;
    if (iris) {
      circ(ctx, px, py, er * 0.62);
      ctx.fillStyle = iris;
      ctx.fill();
      circ(ctx, px, py, er * 0.3);
      ctx.fillStyle = '#111';
      ctx.fill();
    } else {
      circ(ctx, px, py, er * 0.56);
      ctx.fillStyle = '#1f1410';
      ctx.fill();
    }
    circ(ctx, px - er * 0.18, py - er * 0.22, er * 0.16);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }
}

function scaredMouth(ctx: Ctx, r: number, y: number, mode: DogMode) {
  ctx.strokeStyle = mode === 'flash' ? '#ff5a7a' : '#fff4e6';
  ctx.lineWidth = Math.max(1, r * 0.07);
  ctx.beginPath();
  const w = r * 0.42;
  ctx.moveTo(-w, y);
  for (let i = 1; i <= 4; i++) ctx.lineTo(-w + (2 * w * i) / 4, y + (i % 2 ? -r * 0.08 : 0));
  ctx.stroke();
}

function tongue(ctx: Ctx, r: number, x: number, y: number) {
  ell(ctx, x, y, r * 0.11, r * 0.16);
  ctx.fillStyle = '#ff6f8e';
  ctx.fill();
}

function collarBand(ctx: Ctx, r: number, color: string) {
  ctx.beginPath();
  ctx.moveTo(-r * 0.55, r * 0.8);
  ctx.quadraticCurveTo(0, r * 1.02, r * 0.55, r * 0.8);
  ctx.lineWidth = r * 0.2;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.stroke();
  circ(ctx, 0, r * 1.06, r * 0.12);
  ctx.fillStyle = '#ffd25e';
  ctx.fill();
}

export function dog(ctx: Ctx, cx: number, cy: number, r: number, breed: Breed, look: Dir | null, t: number, mode: DogMode, collar: string) {
  ctx.save();
  ctx.translate(cx, cy + Math.sin(t * 11) * r * 0.05);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (mode === 'eyes') {
    eyesPair(ctx, r, r * 0.3, -r * 0.1, r * 0.2, look, 'normal', '#3d4fd6');
    collarBand(ctx, r * 0.8, collar);
    ctx.restore();
    return;
  }

  const P = mode === 'scared' ? SCARED : mode === 'flash' ? FLASH : BREEDS[breed];
  const outline = 'rgba(25,12,30,0.5)';
  const lw = Math.max(1, r * 0.07);
  const fillStroke = (color: string) => {
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = lw;
    ctx.stroke();
  };
  const scared = mode !== 'normal';

  if (breed === 'bulldog') {
    ell(ctx, -0.82 * r, -0.62 * r, 0.26 * r, 0.18 * r, -0.6);
    fillStroke(P.ear);
    ell(ctx, 0.82 * r, -0.62 * r, 0.26 * r, 0.18 * r, 0.6);
    fillStroke(P.ear);
    ell(ctx, 0, 0, 1.0 * r, 0.86 * r);
    fillStroke(P.fur);
    ell(ctx, 0, -0.38 * r, 0.13 * r, 0.42 * r);
    ctx.fillStyle = P.fur2;
    ctx.fill();
    ctx.strokeStyle = P.detail;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(-0.5 * r, -0.5 * r);
    ctx.quadraticCurveTo(-0.3 * r, -0.6 * r, -0.2 * r, -0.48 * r);
    ctx.moveTo(0.5 * r, -0.5 * r);
    ctx.quadraticCurveTo(0.3 * r, -0.6 * r, 0.2 * r, -0.48 * r);
    ctx.stroke();
    circ(ctx, -0.3 * r, 0.42 * r, 0.34 * r);
    fillStroke(P.fur2);
    circ(ctx, 0.3 * r, 0.42 * r, 0.34 * r);
    fillStroke(P.fur2);
    ell(ctx, 0, 0.16 * r, 0.22 * r, 0.14 * r);
    ctx.fillStyle = P.nose;
    ctx.fill();
    if (!scared) {
      ctx.fillStyle = '#ffffff';
      tri(ctx, [-0.24 * r, 0.74 * r], [-0.14 * r, 0.74 * r], [-0.19 * r, 0.56 * r]);
      ctx.fill();
      tri(ctx, [0.14 * r, 0.74 * r], [0.24 * r, 0.74 * r], [0.19 * r, 0.56 * r]);
      ctx.fill();
    } else scaredMouth(ctx, r, 0.6 * r, mode);
    eyesPair(ctx, r, 0.4 * r, -0.12 * r, 0.16 * r, look, mode);
  } else if (breed === 'poodle') {
    for (const p of [[-0.78, 0.2], [0.78, 0.2]]) {
      const x = p[0] * r;
      const y = p[1] * r;
      circ(ctx, x, y - 0.2 * r, 0.26 * r);
      fillStroke(P.ear);
      circ(ctx, x, y + 0.15 * r, 0.3 * r);
      fillStroke(P.ear);
      circ(ctx, x * 0.92, y + 0.45 * r, 0.24 * r);
      fillStroke(P.ear);
    }
    ell(ctx, 0, 0.05 * r, 0.7 * r, 0.82 * r);
    fillStroke(P.fur);
    circ(ctx, -0.3 * r, -0.7 * r, 0.28 * r);
    fillStroke(P.fur);
    circ(ctx, 0.3 * r, -0.7 * r, 0.28 * r);
    fillStroke(P.fur);
    circ(ctx, 0, -0.88 * r, 0.34 * r);
    fillStroke(P.fur);
    ctx.fillStyle = P.bow!;
    tri(ctx, [0.32 * r, -1.0 * r], [0.12 * r, -1.14 * r], [0.12 * r, -0.86 * r]);
    ctx.fill();
    tri(ctx, [0.32 * r, -1.0 * r], [0.52 * r, -1.14 * r], [0.52 * r, -0.86 * r]);
    ctx.fill();
    circ(ctx, 0.32 * r, -1.0 * r, 0.07 * r);
    ctx.fill();
    ell(ctx, 0, 0.42 * r, 0.36 * r, 0.3 * r);
    ctx.fillStyle = P.fur2;
    ctx.fill();
    ell(ctx, 0, 0.28 * r, 0.13 * r, 0.1 * r);
    ctx.fillStyle = P.nose;
    ctx.fill();
    if (scared) scaredMouth(ctx, r, 0.56 * r, mode);
    else {
      ctx.strokeStyle = P.nose;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.arc(-0.08 * r, 0.44 * r, 0.08 * r, 0.2, Math.PI - 0.2);
      ctx.moveTo(0.16 * r, 0.44 * r);
      ctx.arc(0.08 * r, 0.44 * r, 0.08 * r, 0.2, Math.PI - 0.2);
      ctx.stroke();
    }
    eyesPair(ctx, r, 0.28 * r, -0.08 * r, 0.14 * r, look, mode);
  } else if (breed === 'beagle') {
    ell(ctx, 0, 0, 0.82 * r, 0.9 * r);
    fillStroke(P.fur);
    ell(ctx, 0, -0.32 * r, 0.12 * r, 0.46 * r);
    ctx.fillStyle = P.fur2;
    ctx.fill();
    ell(ctx, 0, 0.44 * r, 0.5 * r, 0.4 * r);
    ctx.fillStyle = P.fur2;
    ctx.fill();
    ell(ctx, -0.82 * r, 0.18 * r, 0.3 * r, 0.64 * r, 0.18);
    fillStroke(P.ear);
    ell(ctx, 0.82 * r, 0.18 * r, 0.3 * r, 0.64 * r, -0.18);
    fillStroke(P.ear);
    ell(ctx, 0, 0.28 * r, 0.2 * r, 0.13 * r);
    ctx.fillStyle = P.nose;
    ctx.fill();
    if (scared) scaredMouth(ctx, r, 0.6 * r, mode);
    else tongue(ctx, r, 0.06 * r, 0.62 * r);
    eyesPair(ctx, r, 0.32 * r, -0.14 * r, 0.15 * r, look, mode);
  } else {
    // husky
    for (const s of [-1, 1]) {
      tri(ctx, [s * 0.78 * r, -0.28 * r], [s * 0.56 * r, -1.18 * r], [s * 0.14 * r, -0.7 * r]);
      fillStroke(P.fur);
      tri(ctx, [s * 0.64 * r, -0.4 * r], [s * 0.54 * r, -0.96 * r], [s * 0.28 * r, -0.66 * r]);
      ctx.fillStyle = P.inner!;
      ctx.fill();
    }
    ell(ctx, 0, 0, 0.9 * r, 0.84 * r);
    fillStroke(P.fur);
    ell(ctx, 0, 0.32 * r, 0.62 * r, 0.52 * r);
    ctx.fillStyle = P.fur2;
    ctx.fill();
    tri(ctx, [0, -0.78 * r], [-0.13 * r, -0.05 * r], [0.13 * r, -0.05 * r]);
    ctx.fill();
    circ(ctx, -0.34 * r, -0.4 * r, 0.1 * r);
    ctx.fill();
    circ(ctx, 0.34 * r, -0.4 * r, 0.1 * r);
    ctx.fill();
    ell(ctx, 0, 0.22 * r, 0.19 * r, 0.13 * r);
    ctx.fillStyle = P.nose;
    ctx.fill();
    if (scared) scaredMouth(ctx, r, 0.56 * r, mode);
    else tongue(ctx, r, -0.05 * r, 0.56 * r);
    eyesPair(ctx, r, 0.33 * r, -0.12 * r, 0.15 * r, look, mode, P.iris);
  }

  collarBand(ctx, r, collar);
  ctx.restore();
}

/* ---------------------------------------------------------------- pickups */
export function treat(ctx: Ctx, x: number, y: number, T: number, color = '#f0b979') {
  ctx.fillStyle = color;
  ell(ctx, x - 0.04 * T, y, 0.13 * T, 0.085 * T);
  ctx.fill();
  tri(ctx, [x + 0.06 * T, y], [x + 0.17 * T, y - 0.08 * T], [x + 0.17 * T, y + 0.08 * T]);
  ctx.fill();
}

export function catnip(ctx: Ctx, x: number, y: number, T: number, t: number) {
  const s = T * (1 + 0.12 * Math.sin(t * 6));
  const g = ctx.createRadialGradient(x, y, 0, x, y, s * 0.62);
  g.addColorStop(0, 'rgba(123,224,138,0.45)');
  g.addColorStop(1, 'rgba(123,224,138,0)');
  ctx.fillStyle = g;
  circ(ctx, x, y, s * 0.62);
  ctx.fill();
  ctx.save();
  ctx.translate(x, y + s * 0.1);
  for (const rot of [-0.85, 0, 0.85]) {
    ctx.save();
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(s * 0.17, -s * 0.18, 0, -s * 0.4);
    ctx.quadraticCurveTo(-s * 0.17, -s * 0.18, 0, 0);
    ctx.fillStyle = '#5fd36d';
    ctx.fill();
    ctx.strokeStyle = '#2c8a3c';
    ctx.lineWidth = Math.max(0.8, s * 0.035);
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.03);
    ctx.lineTo(0, -s * 0.34);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function fishShape(ctx: Ctx, x: number, y: number, s: number, body: string, belly: string) {
  ctx.fillStyle = body;
  tri(ctx, [x - 0.35 * s, y], [x - 0.78 * s, y - 0.32 * s], [x - 0.78 * s, y + 0.32 * s]);
  ctx.fill();
  ell(ctx, x + 0.05 * s, y, 0.55 * s, 0.3 * s);
  ctx.fill();
  ell(ctx, x + 0.1 * s, y + 0.1 * s, 0.38 * s, 0.11 * s);
  ctx.fillStyle = belly;
  ctx.fill();
  circ(ctx, x + 0.38 * s, y - 0.06 * s, 0.07 * s);
  ctx.fillStyle = '#1a1a2a';
  ctx.fill();
}

export function bonus(ctx: Ctx, type: BonusType, x: number, y: number, s: number) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (type) {
    case 'fish':
      fishShape(ctx, x, y, s, '#8fc2ee', '#e6f3ff');
      break;
    case 'goldfish':
      fishShape(ctx, x, y, s, '#ffb83d', '#ffe6a3');
      break;
    case 'mouse':
      ctx.strokeStyle = '#ff9fb8';
      ctx.lineWidth = s * 0.08;
      ctx.beginPath();
      ctx.moveTo(x - 0.4 * s, y + 0.12 * s);
      ctx.bezierCurveTo(x - 0.8 * s, y + 0.1 * s, x - 0.7 * s, y - 0.4 * s, x - 0.95 * s, y - 0.3 * s);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 0.6 * s, y + 0.18 * s);
      ctx.quadraticCurveTo(x + 0.1 * s, y - 0.55 * s, x - 0.5 * s, y + 0.18 * s);
      ctx.closePath();
      ctx.fillStyle = '#b9b6c6';
      ctx.fill();
      circ(ctx, x + 0.18 * s, y - 0.22 * s, 0.16 * s);
      ctx.fillStyle = '#ff9fb8';
      ctx.fill();
      circ(ctx, x + 0.38 * s, y - 0.02 * s, 0.05 * s);
      ctx.fillStyle = '#1a1a2a';
      ctx.fill();
      circ(ctx, x + 0.62 * s, y + 0.15 * s, 0.05 * s);
      ctx.fillStyle = '#ff6f8e';
      ctx.fill();
      break;
    case 'yarn':
      ctx.strokeStyle = '#ff5d73';
      ctx.lineWidth = s * 0.07;
      ctx.beginPath();
      ctx.moveTo(x + 0.3 * s, y + 0.4 * s);
      ctx.quadraticCurveTo(x + 0.7 * s, y + 0.6 * s, x + 0.85 * s, y + 0.2 * s);
      ctx.stroke();
      circ(ctx, x, y, 0.5 * s);
      ctx.fillStyle = '#ff5d73';
      ctx.fill();
      ctx.strokeStyle = '#ffc1cb';
      ctx.lineWidth = s * 0.05;
      ctx.save();
      circ(ctx, x, y, 0.5 * s);
      ctx.clip();
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.ellipse(x + i * 0.18 * s, y, 0.18 * s, 0.6 * s, 0.6, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
      break;
    case 'milk':
      ell(ctx, x, y + 0.18 * s, 0.7 * s, 0.26 * s);
      ctx.fillStyle = '#7aa7ff';
      ctx.fill();
      ell(ctx, x, y + 0.08 * s, 0.62 * s, 0.2 * s);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      circ(ctx, x - 0.15 * s, y - 0.35 * s, 0.07 * s);
      ctx.fill();
      circ(ctx, x + 0.12 * s, y - 0.5 * s, 0.05 * s);
      ctx.fill();
      break;
    case 'box':
      ctx.fillStyle = '#c98c4d';
      ctx.fillRect(x - 0.55 * s, y - 0.2 * s, 1.1 * s, 0.7 * s);
      ctx.fillStyle = '#e0a865';
      tri(ctx, [x - 0.55 * s, y - 0.2 * s], [x - 0.15 * s, y - 0.2 * s], [x - 0.75 * s, y - 0.55 * s]);
      ctx.fill();
      tri(ctx, [x + 0.55 * s, y - 0.2 * s], [x + 0.15 * s, y - 0.2 * s], [x + 0.75 * s, y - 0.55 * s]);
      ctx.fill();
      ctx.fillStyle = '#8c5a2b';
      ctx.fillRect(x - 0.3 * s, y + 0.05 * s, 0.6 * s, 0.08 * s);
      break;
    case 'tuna':
      ctx.fillStyle = '#9aa3b5';
      ctx.fillRect(x - 0.55 * s, y - 0.2 * s, 1.1 * s, 0.5 * s);
      ell(ctx, x, y + 0.3 * s, 0.55 * s, 0.16 * s);
      ctx.fill();
      ctx.fillStyle = '#3f7de0';
      ctx.fillRect(x - 0.55 * s, y - 0.08 * s, 1.1 * s, 0.26 * s);
      ell(ctx, x, y - 0.2 * s, 0.55 * s, 0.16 * s);
      ctx.fillStyle = '#d4d9e4';
      ctx.fill();
      fishShape(ctx, x + 0.04 * s, y + 0.05 * s, 0.32 * s, '#ffffff', '#ffffff');
      break;
    case 'bell':
      ctx.fillStyle = '#ff5d73';
      ctx.fillRect(x - 0.6 * s, y - 0.62 * s, 1.2 * s, 0.16 * s);
      ctx.beginPath();
      ctx.moveTo(x - 0.5 * s, y + 0.3 * s);
      ctx.quadraticCurveTo(x - 0.5 * s, y - 0.5 * s, x, y - 0.5 * s);
      ctx.quadraticCurveTo(x + 0.5 * s, y - 0.5 * s, x + 0.5 * s, y + 0.3 * s);
      ctx.closePath();
      ctx.fillStyle = '#ffcf3d';
      ctx.fill();
      ctx.fillStyle = '#b8860b';
      ctx.fillRect(x - 0.5 * s, y + 0.02 * s, s, 0.08 * s);
      circ(ctx, x, y + 0.36 * s, 0.1 * s);
      ctx.fill();
      break;
  }
  ctx.restore();
}
