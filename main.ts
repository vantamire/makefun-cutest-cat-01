// Cutest cat, drawn procedurally with Node 22 standard library only.
// Writes one 768x768 PNG to $MAKEFUN_OUTPUT_DIR/entry.png (default /output).
// No network, no randomness, no Date: two runs write byte-identical output.
//
// The cat: a ginger kitten sitting front-on, head tilted, big bright eyes,
// small smile, blush cheeks, whiskers, a curled tail, and a ball of yarn.
// Soft cream background so the cat is the clear subject at any size.

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

// ------------------------------------------------------------------- scene
// Background: warm cream with a soft peach halo behind the cat.
for (let i = 0; i < W * H; i++) {
  px[i * 4] = CREAM[0];
  px[i * 4 + 1] = CREAM[1];
  px[i * 4 + 2] = CREAM[2];
  px[i * 4 + 3] = 255;
}
circle(384, 360, 320, HALO);
circle(384, 360, 250, HALO2);
// Faint pastel confetti dots and two little hearts.
circle(92, 112, 18, [255, 217, 232, 0.7]);
circle(682, 92, 14, [216, 236, 255, 0.7]);
circle(700, 300, 12, [255, 240, 184, 0.8]);
circle(70, 310, 10, [216, 245, 227, 0.8]);
heart(648, 128, 30, PINK, 0.85);
heart(108, 168, 20, PINK, 0.7);

// Ground shadow.
ellipse(384, 648, 215, 30, SHADOW);

// Tail: curled around the cat's right side, clearly sticking out, tip up.
bezier(500, 600, 620, 655, 668, 600, 44, FUR);
bezier(668, 600, 692, 560, 656, 520, 36, FUR);
circle(652, 510, 18, FUR);
circle(652, 510, 18, FUR_LIGHT, 0.3);
line(616, 636, 652, 654, 9, FUR_DARK, 0.55);
line(668, 578, 690, 556, 9, FUR_DARK, 0.55);

// Body: sitting, round and soft.
ellipse(384, 545, 148, 128, FUR);
ellipse(384, 565, 92, 92, FUR_LIGHT);
// Side stripes on the body.
line(252, 512, 288, 534, 10, FUR_DARK, 0.5);
line(516, 512, 480, 534, 10, FUR_DARK, 0.5);

// Back paws at the sides, front paws together in front.
ellipse(272, 640, 58, 28, FUR);
ellipse(496, 640, 58, 28, FUR);
line(262, 632, 262, 652, 4, FUR_DARK, 0.5);
line(282, 632, 282, 652, 4, FUR_DARK, 0.5);
line(486, 632, 486, 652, 4, FUR_DARK, 0.5);
line(506, 632, 506, 652, 4, FUR_DARK, 0.5);
ellipse(352, 612, 33, 52, FUR_LIGHT);
ellipse(416, 612, 33, 52, FUR_LIGHT);
line(344, 640, 344, 658, 4, FUR_DARK, 0.5);
line(360, 640, 360, 658, 4, FUR_DARK, 0.5);
line(408, 640, 408, 658, 4, FUR_DARK, 0.5);
line(424, 640, 424, 658, 4, FUR_DARK, 0.5);
line(384, 578, 384, 656, 4, FUR_DARK, 0.35);
// Chest fluff.
ellipse(384, 472, 60, 46, FUR_LIGHT);

// -------------------------------------------------------------------- head
// Ears first so the head circle covers their bases.
hTriangle(-150, -95, -108, -198, -58, -112, FUR);
hTriangle(150, -95, 108, -198, 58, -112, FUR);
hTriangle(-128, -108, -106, -172, -76, -116, PINK);
hTriangle(128, -108, 106, -172, 76, -116, PINK);
// Big round head.
hCircle(0, 0, 158, FUR);
// Forehead stripes.
hLine(-40, -128, -28, -92, 10, FUR_DARK, 0.55);
hLine(0, -134, 0, -94, 10, FUR_DARK, 0.55);
hLine(40, -128, 28, -92, 10, FUR_DARK, 0.55);
// Muzzle.
hEllipse(0, 62, 92, 62, FUR_LIGHT);
// Blush cheeks.
hEllipse(-108, 48, 26, 15, BLUSH);
hEllipse(108, 48, 26, 15, BLUSH);

// Eyes: big, bright, with large highlights.
for (const side of [-1, 1]) {
  const ex = side * 62;
  const ey = -25;
  hEllipse(ex, ey, 36, 44, WHITE);
  hCircle(ex, ey + 4, 27, IRIS);
  hCircle(ex, ey + 4, 15, PUPIL);
  hCircle(ex - 9, ey - 8, 8, WHITE);
  hCircle(ex + 10, ey + 12, 3.5, WHITE);
}

// Nose, philtrum and smiling mouth.
hTriangle(-16, 20, 16, 20, 0, 44, NOSE);
hCircle(0, 30, 9, NOSE);
hLine(0, 44, 0, 56, 4.5, LINE);
hBezier(0, 56, -14, 66, -30, 48, 4.5, LINE);
hBezier(0, 56, 14, 66, 30, 48, 4.5, LINE);

// Whiskers: three per side.
for (const side of [-1, 1]) {
  hLine(side * 70, 45, side * 152, 28, 3, WHISKER);
  hLine(side * 72, 58, side * 156, 58, 3, WHISKER);
  hLine(side * 70, 72, side * 150, 90, 3, WHISKER);
}

// ------------------------------------------------- toy: ball of yarn, left
circle(150, 652, 32, YARN);
bezier(124, 636, 150, 652, 176, 668, 5, YARN_DARK);
bezier(126, 668, 150, 646, 174, 634, 5, YARN_DARK);
bezier(150, 622, 138, 652, 150, 682, 5, YARN_DARK);
bezier(176, 640, 200, 668, 236, 662, 5, YARN_DARK);
bezier(236, 662, 258, 656, 272, 646, 5, YARN_DARK);

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
