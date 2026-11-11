// Cutest cat, drawn procedurally with Node 22 standard library only.
// Writes one 768x768 PNG to $MAKEFUN_OUTPUT_DIR/entry.png (default /output).
// No network, no randomness, no Date: two runs write byte-identical output.
//
// The cat (iteration 2): a grey tabby loaf sitting up, one paw raised
// reaching for a butterfly, green eyes looking up in wonder, little
// tongue out, curled tail. Soft sky-blue background so the cat is the
// clear subject at any size.
//
// Iteration 2 (2026-11-11): this revision replaces the first submission's
// ginger kitten with the grey tabby loaf reaching for a butterfly.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const W = 768;
const H = 768;
const px = new Uint8Array(W * H * 4);

// ---------------------------------------------------------------- colours
// [r, g, b, a] with a in 0..1.
type RGBA = [number, number, number, number];
const CREAM: RGBA = [255, 247, 234, 1];
const HALO: RGBA = [255, 231, 210, 1];
const HALO2: RGBA = [255, 222, 196, 1];
const FUR: RGBA = [246, 168, 92, 1];
const FUR_DARK: RGBA = [224, 138, 60, 1];
const FUR_LIGHT: RGBA = [255, 227, 188, 1];
const PINK: RGBA = [247, 168, 184, 1];
const BLUSH: RGBA = [244, 154, 168, 0.55];
const NOSE: RGBA = [232, 106, 122, 1];
const LINE: RGBA = [107, 66, 38, 1];
const WHISKER: RGBA = [138, 106, 82, 0.85];
const IRIS: RGBA = [168, 106, 36, 1];
const PUPIL: RGBA = [36, 22, 18, 1];
const WHITE: RGBA = [255, 255, 255, 1];
const YARN: RGBA = [232, 93, 93, 1];
const YARN_DARK: RGBA = [199, 67, 67, 1];
const SHADOW: RGBA = [120, 70, 30, 0.16];

// ------------------------------------------------------- pixel primitives
function blend(x: number, y: number, r: number, g: number, b: number, a: number): void {
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  const i = (y * W + x) * 4;
  const ia = 1 - a;
  px[i] = Math.round(r * a + px[i] * ia);
  px[i + 1] = Math.round(g * a + px[i + 1] * ia);
  px[i + 2] = Math.round(b * a + px[i + 2] * ia);
  px[i + 3] = 255;
}

// Coverage from a signed distance (negative inside the shape): 1 inside,
// fading to 0 over ~1.6 px outside the edge.
function cov(d: number): number {
  const t = 0.5 - d / 1.6;
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

function circle(cx: number, cy: number, r: number, c: RGBA, alpha = 1): void {
  const x0 = Math.max(0, Math.floor(cx - r - 2));
  const x1 = Math.min(W - 1, Math.ceil(cx + r + 2));
  const y0 = Math.max(0, Math.floor(cy - r - 2));
  const y1 = Math.min(H - 1, Math.ceil(cy + r + 2));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - r;
      const a = cov(d) * alpha * c[3];
      if (a > 0) blend(x, y, c[0], c[1], c[2], a);
    }
  }
}

function ellipse(cx: number, cy: number, rx: number, ry: number, c: RGBA, alpha = 1): void {
  const x0 = Math.max(0, Math.floor(cx - rx - 2));
  const x1 = Math.min(W - 1, Math.ceil(cx + rx + 2));
  const y0 = Math.max(0, Math.floor(cy - ry - 2));
  const y1 = Math.min(H - 1, Math.ceil(cy + ry + 2));
  const m = Math.min(rx, ry);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      const d = (Math.hypot(nx, ny) - 1) * m;
      const a = cov(d) * alpha * c[3];
      if (a > 0) blend(x, y, c[0], c[1], c[2], a);
    }
  }
}

function distSeg(pxx: number, pyy: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((pxx - ax) * dx + (pyy - ay) * dy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(pxx - (ax + t * dx), pyy - (ay + t * dy));
}

// Signed distance to a triangle (negative inside).
function sdTriangle(x: number, y: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  const d1 = distSeg(x, y, ax, ay, bx, by);
  const d2 = distSeg(x, y, bx, by, cx, cy);
  const d3 = distSeg(x, y, cx, cy, ax, ay);
  const d = Math.min(d1, d2, d3);
  const s1 = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
  const s2 = (cx - bx) * (y - by) - (cy - by) * (x - bx);
  const s3 = (ax - cx) * (y - cy) - (ay - cy) * (x - cx);
  const inside = (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
  return inside ? -d : d;
}

function triangle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, c: RGBA, alpha = 1): void {
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx) - 2));
  const x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx) + 2));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy) - 2));
  const y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy) + 2));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = sdTriangle(x + 0.5, y + 0.5, ax, ay, bx, by, cx, cy);
      const a = cov(d) * alpha * c[3];
      if (a > 0) blend(x, y, c[0], c[1], c[2], a);
    }
  }
}

// A thick line with round caps.
function line(x1: number, y1: number, x2: number, y2: number, w: number, c: RGBA, alpha = 1): void {
  const r = w / 2;
  const x0 = Math.max(0, Math.floor(Math.min(x1, x2) - r - 2));
  const x1b = Math.min(W - 1, Math.ceil(Math.max(x1, x2) + r + 2));
  const y0 = Math.max(0, Math.floor(Math.min(y1, y2) - r - 2));
  const y1b = Math.min(H - 1, Math.ceil(Math.max(y1, y2) + r + 2));
  for (let y = y0; y <= y1b; y++) {
    for (let x = x0; x <= x1b; x++) {
      const d = distSeg(x + 0.5, y + 0.5, x1, y1, x2, y2) - r;
      const a = cov(d) * alpha * c[3];
      if (a > 0) blend(x, y, c[0], c[1], c[2], a);
    }
  }
}

// A thick quadratic bezier stroke, drawn as overlapping discs.
function bezier(x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, w: number, c: RGBA, alpha = 1): void {
  const steps = 48;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const x = mt * mt * x1 + 2 * mt * t * cx + t * t * x2;
    const y = mt * mt * y1 + 2 * mt * t * cy + t * t * y2;
    circle(x, y, w / 2, c, alpha);
  }
}

// A small heart from two circles and a triangle.
function heart(cx: number, cy: number, s: number, c: RGBA, alpha = 1): void {
  circle(cx - s * 0.32, cy - s * 0.18, s * 0.36, c, alpha);
  circle(cx + s * 0.32, cy - s * 0.18, s * 0.36, c, alpha);
  triangle(cx - s * 0.62, cy - s * 0.05, cx + s * 0.62, cy - s * 0.05, cx, cy + s * 0.62, c, alpha);
}

// ------------------------------------------------- head tilt (rotate about neck)
// Head-local points (origin = head centre) are rotated about the neck pivot.
const HC = [384, 330];
const PIV = [384, 470];
const ANG = (-13 * Math.PI) / 180;
const COS = Math.cos(ANG);
const SIN = Math.sin(ANG);
function hp(lx: number, ly: number): [number, number] {
  const gx = HC[0] + lx;
  const gy = HC[1] + ly;
  const dx = gx - PIV[0];
  const dy = gy - PIV[1];
  return [PIV[0] + dx * COS - dy * SIN, PIV[1] + dx * SIN + dy * COS];
}
function hCircle(lx: number, ly: number, r: number, c: RGBA, alpha = 1): void {
  const [gx, gy] = hp(lx, ly);
  circle(gx, gy, r, c, alpha);
}
function hEllipse(lx: number, ly: number, rx: number, ry: number, c: RGBA, alpha = 1): void {
  const [gx, gy] = hp(lx, ly);
  ellipse(gx, gy, rx, ry, c, alpha);
}
function hTriangle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, c: RGBA, alpha = 1): void {
  const [ax2, ay2] = hp(ax, ay);
  const [bx2, by2] = hp(bx, by);
  const [cx2, cy2] = hp(cx, cy);
  triangle(ax2, ay2, bx2, by2, cx2, cy2, c, alpha);
}
function hLine(x1: number, y1: number, x2: number, y2: number, w: number, c: RGBA, alpha = 1): void {
  const [ax, ay] = hp(x1, y1);
  const [bx, by] = hp(x2, y2);
  line(ax, ay, bx, by, w, c, alpha);
}
function hBezier(x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, w: number, c: RGBA, alpha = 1): void {
  const [ax, ay] = hp(x1, y1);
  const [bx, by] = hp(cx, cy);
  const [cx2, cy2] = hp(x2, y2);
  bezier(ax, ay, bx, by, cx2, cy2, w, c, alpha);
}

// Variant B: grey tabby loaf sitting up, one paw raised, reaching for a butterfly.
const BG_B: RGBA = [224, 238, 250, 1];
const HALO_B: RGBA = [205, 228, 245, 1];
const HALO2_B: RGBA = [190, 220, 240, 1];
const FURT: RGBA = [170, 180, 192, 1];
const FURTD: RGBA = [130, 142, 158, 1];
const FURTL: RGBA = [202, 210, 220, 1];
const BFLY: RGBA = [245, 170, 80, 1];
const IRIS_B: RGBA = [90, 140, 90, 1];

for (let i = 0; i < W * H; i++) {
  px[i * 4] = BG_B[0];
  px[i * 4 + 1] = BG_B[1];
  px[i * 4 + 2] = BG_B[2];
  px[i * 4 + 3] = 255;
}
circle(384, 360, 320, HALO_B);
circle(384, 360, 250, HALO2_B);
// Faint dots.
circle(92, 112, 18, [255, 255, 255, 0.8]);
circle(682, 92, 14, [255, 240, 184, 0.8]);
circle(700, 300, 12, [255, 255, 255, 0.7]);
circle(70, 310, 10, [255, 240, 184, 0.8]);
heart(648, 128, 28, [244, 170, 190, 0.8]);
heart(108, 168, 18, [244, 170, 190, 0.7]);

// Ground shadow.
ellipse(384, 668, 230, 28, SHADOW);

// Butterfly, top right — the thing the kitten reaches for.
ellipse(545, 232, 22, 32, BFLY);
ellipse(587, 232, 22, 32, BFLY);
circle(545, 222, 6, [255, 255, 255, 0.9]);
circle(587, 222, 6, [255, 255, 255, 0.9]);
circle(548, 246, 4, [255, 255, 255, 0.8]);
circle(584, 246, 4, [255, 255, 255, 0.8]);
line(566, 220, 566, 252, 5, [90, 70, 60, 1]);
line(566, 220, 552, 202, 3, [90, 70, 60, 1]);
line(566, 220, 580, 202, 3, [90, 70, 60, 1]);

// Tail curled around the loaf's left side, tip up.
bezier(205, 630, 115, 645, 92, 565, 40, FURT);
circle(90, 552, 20, FURT);
line(120, 620, 148, 640, 9, FURTD, 0.55);
line(100, 575, 122, 595, 9, FURTD, 0.55);

// Loaf body: wide, round, soft.
ellipse(384, 585, 195, 115, FURT);
ellipse(384, 600, 130, 80, FURTL);
// Tabby stripes across the top of the loaf.
line(300, 490, 330, 512, 10, FURTD, 0.5);
line(384, 478, 384, 506, 10, FURTD, 0.5);
line(468, 490, 438, 512, 10, FURTD, 0.5);

// Back paws at the sides.
ellipse(212, 668, 46, 22, FURT);
ellipse(556, 668, 46, 22, FURT);
line(202, 660, 202, 676, 4, FURTD, 0.5);
line(222, 660, 222, 676, 4, FURTD, 0.5);
line(546, 660, 546, 676, 4, FURTD, 0.5);
line(566, 660, 566, 676, 4, FURTD, 0.5);

// Left front paw on the ground, protruding below the body edge.
ellipse(292, 670, 36, 24, FURTL);
line(284, 662, 284, 678, 4, FURTD, 0.5);
line(292, 660, 292, 678, 4, FURTD, 0.5);
line(300, 662, 300, 678, 4, FURTD, 0.5);

// Right arm raised toward the butterfly, paw at the top.
line(498, 560, 522, 492, 46, FURT);
ellipse(526, 472, 32, 40, FURT);
line(516, 438, 516, 456, 4, FURTD, 0.5);
line(526, 434, 526, 454, 4, FURTD, 0.5);
line(536, 438, 536, 456, 4, FURTD, 0.5);

// -------------------------------------------------------------------- head
// Ears first so the head circle covers their bases.
hTriangle(-150, -95, -108, -198, -58, -112, FURT);
hTriangle(150, -95, 108, -198, 58, -112, FURT);
hTriangle(-128, -108, -106, -172, -76, -116, PINK);
hTriangle(128, -108, 106, -172, 76, -116, PINK);
// Big round head.
hCircle(0, 0, 140, FURT);
// Forehead stripes.
hLine(-36, -112, -25, -80, 10, FURTD, 0.55);
hLine(0, -118, 0, -82, 10, FURTD, 0.55);
hLine(36, -112, 25, -80, 10, FURTD, 0.55);
// Muzzle.
hEllipse(0, 58, 84, 56, FURTL);
// Blush cheeks.
hEllipse(-98, 44, 24, 14, BLUSH);
hEllipse(98, 44, 24, 14, BLUSH);

// Eyes looking UP at the butterfly: pupils shifted up.
for (const side of [-1, 1]) {
  const ex = side * 58;
  const ey = -22;
  hEllipse(ex, ey, 34, 42, WHITE);
  hCircle(ex, ey - 4, 26, IRIS_B);
  hCircle(ex, ey - 6, 14, PUPIL);
  hCircle(ex - 8, ey - 16, 8, WHITE);
  hCircle(ex + 9, ey + 8, 3.5, WHITE);
}

// Nose, philtrum and a little open smile of wonder.
hTriangle(-15, 18, 15, 18, 0, 40, NOSE);
hCircle(0, 28, 8, NOSE);
hLine(0, 40, 0, 50, 4.5, LINE);
hBezier(0, 50, -13, 62, -28, 44, 4.5, LINE);
hBezier(0, 50, 13, 62, 28, 44, 4.5, LINE);
hEllipse(0, 62, 10, 7, [232, 120, 120, 1]);

// Whiskers: three per side.
for (const side of [-1, 1]) {
  hLine(side * 64, 42, side * 140, 26, 3, WHISKER);
  hLine(side * 66, 54, side * 144, 54, 3, WHISKER);
  hLine(side * 64, 66, side * 138, 84, 3, WHISKER);
}

// ------------------------------------------------------------- PNG encode
const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // colour type RGBA
ihdr[10] = 0; // compression
ihdr[11] = 0; // filter
ihdr[12] = 0; // interlace

// Filter each scanline with the best of the five PNG filters (deterministic).
const stride = W * 4;
const raw = Buffer.alloc(H * (stride + 1));
for (let y = 0; y < H; y++) {
  const row = px.subarray(y * stride, (y + 1) * stride);
  const prev = y === 0 ? null : px.subarray((y - 1) * stride, y * stride);
  let bestId = 0;
  let best: Buffer | null = null;
  let bestScore = Infinity;
  for (let f = 0; f <= 4; f++) {
    const cand = Buffer.alloc(stride);
    let score = 0;
    for (let i = 0; i < stride; i++) {
      const v = row[i];
      const a = i >= 4 ? row[i - 4] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= 4 ? prev[i - 4] : 0;
      let fv: number;
      if (f === 0) fv = v;
      else if (f === 1) fv = (v - a) & 0xff;
      else if (f === 2) fv = (v - b) & 0xff;
      else if (f === 3) fv = (v - ((a + b) >> 1)) & 0xff;
      else fv = (v - paeth(a, b, c)) & 0xff;
      cand[i] = fv;
      score += Math.abs(fv < 128 ? fv : fv - 256);
    }
    if (score < bestScore) {
      bestScore = score;
      bestId = f;
      best = cand;
    }
  }
  raw[y * (stride + 1)] = bestId;
  raw.set(best as Buffer, y * (stride + 1) + 1);
}

const idat = deflateSync(raw, { level: 9 });
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', idat),
  chunk('IEND', Buffer.alloc(0)),
]);

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'entry.png'), png);
