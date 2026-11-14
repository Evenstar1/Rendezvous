/* Image operations (difference / cumulative stack) and stretch → pixels. */
import type { Shot } from './packs';

export type Cmap = 'gray' | 'ember' | 'invert' | 'ironbow' | 'ice';
export type StretchFn = 'asinh' | 'linear' | 'log';
export type Op = 'image' | 'diff' | 'stack';
export type Ref = 'prev' | 'first' | 'mean';

function ramp(stops: [number, number, number, number][]): Uint8Array {
  const lut = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let s = 0;
    while (s < stops.length - 2 && t > stops[s + 1][0]) s++;
    const a = stops[s];
    const b = stops[s + 1];
    const f = Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0])));
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = Math.round(a[c + 1] + (b[c + 1] - a[c + 1]) * f);
  }
  return lut;
}

export const LUT: Record<Cmap, Uint8Array> = {
  gray: ramp([
    [0, 0, 0, 0],
    [1, 255, 255, 255],
  ]),
  ember: ramp([
    [0, 0, 0, 0],
    [0.22, 52, 6, 10],
    [0.48, 170, 30, 16],
    [0.72, 255, 108, 40],
    [0.9, 255, 214, 150],
    [1, 255, 255, 255],
  ]),
  invert: ramp([
    [0, 244, 244, 250],
    [1, 0, 0, 0],
  ]),
  /* Seven evenly spaced stops at t = 0, 1/6 … 1. */
  ironbow: ramp([
    [0, 0, 0, 6],
    [1 / 6, 40, 8, 60],
    [2 / 6, 110, 20, 110],
    [3 / 6, 190, 60, 70],
    [4 / 6, 240, 130, 20],
    [5 / 6, 255, 210, 90],
    [1, 255, 255, 245],
  ]),
  ice: ramp([
    [0, 2, 6, 12],
    [1 / 6, 8, 24, 60],
    [2 / 6, 16, 60, 130],
    [3 / 6, 30, 130, 190],
    [4 / 6, 80, 210, 225],
    [5 / 6, 180, 250, 250],
    [1, 255, 255, 255],
  ]),
};

export interface Plane {
  data: Float32Array;
  badFrac: Float32Array | null;
  sigma: number;
}

const stackCache = new WeakMap<Shot[], Map<number, Plane>>();

function meanOf(shots: Shot[], pick: (i: number) => boolean): Plane {
  const px = shots[0].data.length;
  const sum = new Float64Array(px);
  const wsum = new Float64Array(px);
  const bad = new Float32Array(px);
  let wtot = 0;
  let count = 0;
  shots.forEach((s, i) => {
    if (!pick(i)) return;
    const w = 1 / (s.sigma * s.sigma);
    wtot += w;
    count++;
    for (let p = 0; p < px; p++) {
      const v = s.data[p];
      if (v === v) {
        sum[p] += w * v;
        wsum[p] += w;
      }
      if (s.badFrac) bad[p] += s.badFrac[p];
    }
  });
  const data = new Float32Array(px);
  for (let p = 0; p < px; p++) {
    data[p] = wsum[p] > 0 ? sum[p] / wsum[p] : NaN;
    bad[p] /= count || 1;
  }
  return { data, badFrac: shots[0].badFrac ? bad : null, sigma: wtot > 0 ? 1 / Math.sqrt(wtot) : 1 };
}

/** image → the shot itself; diff → shot − reference; stack → running mean of shots 0…idx. */
export function applyOp(shots: Shot[], idx: number, op: Op, ref: Ref): Plane {
  const a = shots[idx];
  if (op === 'image' || shots.length < 2) return a;
  if (op === 'stack') {
    let m = stackCache.get(shots);
    if (!m) stackCache.set(shots, (m = new Map()));
    let p = m.get(idx);
    if (!p) m.set(idx, (p = meanOf(shots, (i) => i <= idx)));
    return p;
  }
  const b: Plane = ref === 'first' ? shots[0] : ref === 'prev' ? shots[(idx - 1 + shots.length) % shots.length] : meanOf(shots, (i) => i !== idx);
  const px = a.data.length;
  const data = new Float32Array(px);
  let badFrac: Float32Array | null = null;
  if (a.badFrac && b.badFrac) {
    badFrac = new Float32Array(px);
    for (let p = 0; p < px; p++) badFrac[p] = Math.max(a.badFrac[p], b.badFrac[p]);
  }
  for (let p = 0; p < px; p++) data[p] = a.data[p] - b.data[p];
  return { data, badFrac, sigma: Math.hypot(a.sigma, b.sigma) };
}

export interface Stretch {
  cmap: Cmap;
  /** white point in σ (science frames) — also drives gain for 8-bit survey previews */
  hi: number;
  sigma: number;
  diff: boolean;
  unit: 'MJy/sr' | 'display';
  flags: boolean;
  fn?: StretchFn;
  bias?: number;
}

const SOFT = 4;

/** Map a plane to RGBA. asinh stretch from −1.5σ to `hi`σ; difference images are symmetric about zero. */
export function paint(plane: Plane, n: number, s: Stretch): ImageData {
  const img = new ImageData(n, n);
  const out = img.data;
  const lut = LUT[s.cmap];
  const { data, badFrac } = plane;
  const gain = Math.sqrt(60 / s.hi);
  const norm = Math.asinh((s.hi + 1.5) / SOFT);
  const dnorm = Math.asinh(s.hi / 2 / SOFT);
  const fn = s.fn ?? 'asinh';
  const bias = s.bias ?? 0;
  const lin = (q: number) => Math.max(0, Math.min(1, q));
  const mapped = (q: number, diff: boolean) => {
    if (diff) {
      const n = q / s.sigma;
      if (fn === 'linear') return 0.5 + n / (2 * Math.max(1, s.hi));
      if (fn === 'log') return 0.5 + (0.5 * Math.sign(n) * Math.log10(1 + Math.abs(n) / 2)) / Math.log10(1 + s.hi / 2);
      return 0.5 + (0.5 * Math.asinh(n / SOFT)) / dnorm;
    }
    const n = Math.max(0, q / s.sigma + 1.5);
    if (fn === 'linear') return n / (s.hi + 1.5);
    if (fn === 'log') return Math.log10(1 + n) / Math.log10(1 + s.hi + 1.5);
    return Math.asinh(n / SOFT) / norm;
  };
  for (let p = 0; p < data.length; p++) {
    const v = data[p];
    const o = p * 4;
    out[o + 3] = 255;
    if (v !== v) {
      out[o] = s.cmap === 'invert' ? 222 : 13;
      out[o + 1] = s.cmap === 'invert' ? 222 : 13;
      out[o + 2] = s.cmap === 'invert' ? 230 : 18;
      continue;
    }
    let y: number;
    if (s.unit === 'display') y = s.diff ? 0.5 + (v / 160) * gain : (v / 255) * gain;
    else y = mapped(v, s.diff);
    y = lin(y + bias);
    const c = (y <= 0 ? 0 : y >= 1 ? 255 : Math.round(y * 255)) * 3;
    let r = lut[c];
    let g = lut[c + 1];
    let b = lut[c + 2];
    if (s.flags && badFrac && badFrac[p] > 0.5) {
      r = Math.round(r * 0.3 + 255 * 0.7);
      g = Math.round(g * 0.3 + 85 * 0.7);
      b = Math.round(b * 0.3 + 51 * 0.7);
    }
    out[o] = r;
    out[o + 1] = g;
    out[o + 2] = b;
  }
  return img;
}

/** Sensible default white point: bright enough that the 99.7th-percentile pixel is near white. */
export function autoHi(plane: Plane, unit: 'MJy/sr' | 'display'): number {
  if (unit === 'display') return 60;
  const a: number[] = [];
  for (let i = 0; i < plane.data.length; i++) if (plane.data[i] === plane.data[i]) a.push(plane.data[i] / plane.sigma);
  if (!a.length) return 60;
  a.sort((x, y) => x - y);
  return Math.min(1200, Math.max(25, a[Math.floor(a.length * 0.997)]));
}
