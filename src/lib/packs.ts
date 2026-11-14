/* Snapshot engine: decodes the bundled SPHEREx Level-2 packs (built by
 * scripts/ingest.ts) and turns them into display sequences and photometry. */
import { TARGETS, fieldCentre, mjdToYear, positionAt, type Target } from '../data/targets';
import { fmtDate, fmtDateRange, fmtTime } from './coords';
import { combine, expand, median, skyToGrid, type Grid } from './spherex';
import barnard from '../data/packs/barnard.json?raw';
import epsindb from '../data/packs/epsindb.json?raw';
import rdra from '../data/packs/rdra.json?raw';
import rwaur from '../data/packs/rwaur.json?raw';
import w0855 from '../data/packs/w0855.json?raw';

const RAW: Record<string, string> = { barnard, epsindb, w0855, rwaur, rdra };

export const DETECTORS = [
  { det: 1, lo: 0.75, hi: 1.11, color: '#7aa8ff' },
  { det: 2, lo: 1.1, hi: 1.65, color: '#56d6e8' },
  { det: 3, lo: 1.63, hi: 2.43, color: '#7fe3a1' },
  { det: 4, lo: 2.42, hi: 3.82, color: '#f2d660' },
  { det: 5, lo: 3.81, hi: 4.43, color: '#ff9f4a' },
  { det: 6, lo: 4.41, hi: 5.01, color: '#ff5c4d' },
];

/** Nominal centres of the 102 SPHEREx spectral channels (µm), 17 per detector. */
export const CHANNELS = [
  0.753, 0.771, 0.79, 0.809, 0.828, 0.848, 0.868, 0.889, 0.91, 0.932, 0.955, 0.978, 1.001, 1.025, 1.05, 1.075, 1.102, 1.113, 1.139, 1.167, 1.195, 1.224, 1.254, 1.284, 1.315, 1.346,
  1.378, 1.412, 1.446, 1.481, 1.517, 1.554, 1.592, 1.631, 1.656, 1.695, 1.735, 1.775, 1.818, 1.861, 1.905, 1.949, 1.995, 2.041, 2.089, 2.139, 2.189, 2.24, 2.292, 2.345, 2.399, 2.445,
  2.506, 2.575, 2.646, 2.719, 2.794, 2.871, 2.951, 3.033, 3.118, 3.204, 3.293, 3.383, 3.476, 3.57, 3.667, 3.768, 3.833, 3.867, 3.901, 3.935, 3.97, 4.005, 4.04, 4.076, 4.112, 4.148,
  4.184, 4.22, 4.257, 4.294, 4.331, 4.368, 4.405, 4.435, 4.467, 4.5, 4.533, 4.566, 4.6, 4.635, 4.669, 4.704, 4.739, 4.773, 4.808, 4.843, 4.879, 4.915, 4.951, 4.988,
];

/** Exact mJy per (MJy/sr) for one pixel of side `scaleArcsec` (0.888855 at 6.15″). */
export const pixMjy = (scaleArcsec: number) => (scaleArcsec / 206264.80624709636) ** 2 * 1e9;
export const PIX_MJY = pixMjy(6.15);

export interface Frame {
  k: number;
  mjd: number;
  year: number;
  det: number;
  lam: number;
  dlam: number;
  bg: number;
  sigma: number;
  cflags: number;
  fwhm: number;
  obsid: string;
  proc: string;
  data: Float32Array;
}
export interface GaiaSrc {
  ra: number;
  dec: number;
  pmra: number;
  pmdec: number;
  plx: number;
  g: number;
  id: string;
}
export interface WiseSrc {
  ra: number;
  dec: number;
  w1: number;
  w2: number;
  /* CatWISE2020 proper motion, mas/yr (positions are at epoch 2015.4). */
  pmra?: number;
  pmdec?: number;
}
export interface Pack {
  id: string;
  target: Target;
  grid: Grid;
  n: number;
  release: string;
  built: string;
  available: number;
  flagNames: Record<number, string>;
  frames: Frame[];
  bad: Uint8Array;
  stride: number;
  gaia: GaiaSrc[];
  wise: WiseSrc[];
  epochs: number[][];
}

/** One displayable image in a sequence — an epoch co-add, a spectral channel, a single exposure or a survey cutout. */
export interface Shot {
  key: string;
  title: string;
  sub: string;
  year: number;
  mjd: [number, number] | null;
  lam: number | null;
  dets: number[];
  members: number[];
  data: Float32Array;
  badFrac: Float32Array | null;
  sigma: number;
  unit: 'MJy/sr' | 'display';
  origin: string;
  /** raw preview brightness at field centre (all-sky cube shots only) */
  probe?: number;
  /** un-levelled preview values for arbitrary-pixel probing in all-sky mode */
  raw?: Float32Array;
}

interface RawPack {
  id: string;
  ra: number;
  dec: number;
  n: number;
  scale: number;
  release: string;
  built: string;
  available: number;
  flagNames: Record<string, string>;
  frames: [number, number, number, number, number, number, number, number, string, string][];
  img: string;
  bad: string;
  gaia: [number, number, number, number, number, number, string][];
  wise: [number, number, number, number, number?, number?][];
}

async function inflate(b64: string): Promise<Uint8Array> {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export function groupEpochs(frames: Frame[]): number[][] {
  const groups: number[][] = [];
  let cur: number[] = [];
  frames.forEach((f, i) => {
    if (i > 0 && f.mjd - frames[i - 1].mjd > 20) {
      groups.push(cur);
      cur = [];
    }
    cur.push(i);
  });
  if (cur.length) groups.push(cur);
  // fold stray mini-visits (a handful of exposures) into the nearest full visit
  const mid = (g: number[]) => (frames[g[0]].mjd + frames[g[g.length - 1]].mjd) / 2;
  for (let i = 0; i < groups.length && groups.length > 1; ) {
    if (groups[i].length >= 15) {
      i++;
      continue;
    }
    const near = [i - 1, i + 1].filter((q) => q >= 0 && q < groups.length).sort((a, b) => Math.abs(mid(groups[a]) - mid(groups[i])) - Math.abs(mid(groups[b]) - mid(groups[i])))[0];
    if (Math.abs(mid(groups[near]) - mid(groups[i])) > 75) {
      i++;
      continue;
    }
    groups[near] = [...groups[near], ...groups[i]].sort((a, b) => a - b);
    groups.splice(i, 1);
    i = 0;
  }
  const out: number[][] = [];
  for (const g of groups) {
    const t0 = frames[g[0]].mjd;
    const span = frames[g[g.length - 1]].mjd - t0;
    if (span <= 90) {
      out.push(g);
      continue;
    }
    const nb = Math.ceil(span / 30);
    const bins: number[][] = Array.from({ length: nb }, () => []);
    for (const i of g) bins[Math.min(nb - 1, Math.floor(((frames[i].mjd - t0) / span) * nb))].push(i);
    out.push(...bins.filter((b) => b.length));
  }
  return out;
}

const cache = new Map<string, Promise<Pack>>();
const customTargets: Target[] = [];

/** Register a user-loaded FITS or snapshot pack in browser memory. */
export function registerPack(pack: Pack): void {
  cache.set(pack.id, Promise.resolve(pack));
  const idx = customTargets.findIndex((t) => t.id === pack.id);
  if (idx >= 0) customTargets[idx] = pack.target;
  else customTargets.unshift(pack.target);
}

export function listCustomTargets(): Target[] {
  return customTargets;
}

async function build(id: string): Promise<Pack> {
  const target = TARGETS.find((t) => t.id === id);
  if (!target || !RAW[id]) throw new Error(`No snapshot for ${id}`);
  const j = JSON.parse(RAW[id]) as RawPack;
  const [codes, bad] = await Promise.all([inflate(j.img), inflate(j.bad)]);
  const px = j.n * j.n;
  const frames: Frame[] = j.frames.map((r, k) => ({
    k,
    mjd: r[0],
    year: mjdToYear(r[0]),
    det: r[1],
    lam: r[2],
    dlam: r[3],
    bg: r[4],
    sigma: r[5],
    cflags: r[6],
    fwhm: r[7],
    obsid: r[8],
    proc: r[9],
    data: expand(codes.subarray(k * px, (k + 1) * px), r[5]),
  }));
  const flagNames: Record<number, string> = {};
  for (const [b, name] of Object.entries(j.flagNames)) flagNames[Number(b)] = name;
  return {
    id,
    target,
    grid: { ra: j.ra, dec: j.dec, n: j.n, scale: j.scale },
    n: j.n,
    release: j.release,
    built: j.built,
    available: j.available,
    flagNames,
    frames,
    bad,
    stride: Math.ceil(px / 8),
    gaia: j.gaia.map((g) => ({ ra: g[0], dec: g[1], pmra: g[2], pmdec: g[3], plx: g[4], g: g[5], id: g[6] })),
    wise: j.wise.map((w) => ({ ra: w[0], dec: w[1], w1: w[2], w2: w[3], pmra: w[4] ?? 0, pmdec: w[5] ?? 0 })),
    epochs: groupEpochs(frames),
  };
}

export function loadPack(id: string): Promise<Pack> {
  let p = cache.get(id);
  if (!p) {
    p = build(id);
    cache.set(id, p);
  }
  return p;
}

/** Snapshot or user-loaded field (if any) that contains the given coordinates. */
export function fieldFor(ra: number, dec: number, n = 56, scale = 6.15): Target | null {
  for (const t of [...customTargets, ...TARGETS]) {
    const [cra, cdec] = fieldCentre(t);
    const [i, j] = skyToGrid({ ra: cra, dec: cdec, n, scale }, ra, dec);
    if (i >= 0 && j >= 0 && i <= n - 1 && j <= n - 1) return t;
  }
  return null;
}

/** Catalog-predicted grid position of the pack's target at a given epoch. */
export function targetAt(pack: Pack, year: number): [number, number] {
  const [ra, dec] = positionAt(pack.target.astrom, year);
  return skyToGrid(pack.grid, ra, dec);
}

export const isBad = (pack: Pack, k: number, i: number) => (pack.bad[k * pack.stride + (i >> 3)] >> (i & 7)) & 1;

/** Outlier-rejected inverse-variance co-add of pack frames (see `combine`). */
export function coadd(pack: Pack, members: number[]): { data: Float32Array; badFrac: Float32Array; sigma: number } {
  return combine(
    members.map((k) => {
      const f = pack.frames[k];
      const off = k * pack.stride;
      return { data: f.data, sigma: f.sigma, bad: (i: number) => (pack.bad[off + (i >> 3)] >> (i & 7)) & 1 };
    }),
    pack.n * pack.n,
  );
}

export type SeqMode = 'epoch' | 'sweep' | 'frames';

const detLabel = (dets: number[]) => (dets.length === 6 ? 'D1–D6' : dets.map((d) => `D${d}`).join(' '));

export function buildShots(pack: Pack, mode: SeqMode, dets: number[]): Shot[] {
  const use = new Set(dets);
  const shots: Shot[] = [];
  const base = { unit: 'MJy/sr' as const, origin: `SPHEREx L2 · ${pack.release}` };
  if (mode === 'epoch') {
    pack.epochs.forEach((g, e) => {
      const members = g.filter((k) => use.has(pack.frames[k].det));
      if (!members.length) return;
      const a = pack.frames[members[0]].mjd;
      const b = pack.frames[members[members.length - 1]].mjd;
      shots.push({
        key: `e${e}`,
        title: fmtDateRange(a, b),
        sub: `Epoch ${e + 1} of ${pack.epochs.length} · ${members.length} exposures · ${detLabel(dets)}`,
        year: mjdToYear((a + b) / 2),
        mjd: [a, b],
        lam: null,
        dets,
        members,
        ...coadd(pack, members),
        ...base,
      });
    });
  } else if (mode === 'sweep') {
    const bins = new Map<number, number[]>();
    pack.frames.forEach((f) => {
      if (!use.has(f.det)) return;
      let best = (f.det - 1) * 17;
      for (let c = best; c < f.det * 17; c++) if (Math.abs(CHANNELS[c] - f.lam) < Math.abs(CHANNELS[best] - f.lam)) best = c;
      bins.set(best, [...(bins.get(best) ?? []), f.k]);
    });
    [...bins.keys()]
      .sort((a, b) => a - b)
      .forEach((c) => {
        const members = bins.get(c)!;
        const lam = members.reduce((s, k) => s + pack.frames[k].lam, 0) / members.length;
        shots.push({
          key: `c${c}`,
          title: `${lam.toFixed(3)} µm`,
          sub: `Channel ${c + 1} of 102 · D${Math.floor(c / 17) + 1} · ${members.length} exposure${members.length > 1 ? 's' : ''}, all epochs`,
          year: mjdToYear(pack.frames[members[Math.floor(members.length / 2)]].mjd),
          mjd: [pack.frames[members[0]].mjd, pack.frames[members[members.length - 1]].mjd],
          lam,
          dets: [Math.floor(c / 17) + 1],
          members,
          ...coadd(pack, members),
          ...base,
        });
      });
  } else {
    pack.frames.forEach((f) => {
      if (!use.has(f.det)) return;
      shots.push({
        key: `f${f.k}`,
        title: `${fmtDate(f.mjd)} · ${fmtTime(f.mjd)}`,
        sub: `Single exposure · D${f.det} · ${f.lam.toFixed(3)} µm · ${f.obsid}`,
        year: f.year,
        mjd: [f.mjd, f.mjd],
        lam: f.lam,
        dets: [f.det],
        members: [f.k],
        ...coadd(pack, [f.k]),
        ...base,
      });
    });
  }
  return shots;
}

export interface Phot {
  k: number;
  lam: number;
  dlam: number;
  det: number;
  mjd: number;
  flux: number; // mJy
  err: number;
  flagged: boolean;
  /** Gaussian PSF encircled-energy fraction inside the aperture (0–1). */
  ee: number;
}

/** Exact 5×5 sub-pixel fractional overlap of pixel (i, j) with a circle of radius `apR` at (ci, cj). */
function pixelApertureWeight(i: number, j: number, ci: number, cj: number, apR: number): number {
  const dx = i - ci;
  const dy = j - cj;
  const r = Math.hypot(dx, dy);
  if (r <= apR - 0.71) return 1;
  if (r >= apR + 0.71) return 0;
  const r2 = apR * apR;
  let hit = 0;
  for (let sy = -2; sy <= 2; sy++) {
    const yy = dy + sy * 0.2;
    for (let sx = -2; sx <= 2; sx++) {
      const xx = dx + sx * 0.2;
      if (xx * xx + yy * yy <= r2) hit++;
    }
  }
  return hit / 25;
}

/** Gaussian PSF encircled-energy fraction EE(R) = 1 − 2^(−4·(R / FWHM)²) inside aperture radius R (arcsec). */
export function psfEncircledEnergy(apArcsec: number, fwhmArcsec: number): number {
  if (!(fwhmArcsec > 0) || !(apArcsec > 0)) return 1;
  const ee = 1 - 2 ** (-4 * (apArcsec / fwhmArcsec) ** 2);
  return Math.min(1, Math.max(0.15, ee));
}

/** Sub-pixel circular aperture photometry in every exposure with Merline & Howell (1995) error propagation
 *  and optional wavelength-dependent PSF encircled-energy aperture correction. */
export function photometry(pack: Pack, at: (year: number) => [number, number], opts?: { ap?: number; ann?: [number, number]; apCorr?: boolean }): Phot[] {
  const apR = opts?.ap ?? 1.8;
  const [annIn, annOut] = opts?.ann ?? [4, 6.5];
  const doCorr = opts?.apCorr ?? true;
  const n = pack.n;
  const reach = Math.ceil(annOut) + 1;
  const solidMjy = pixMjy(pack.grid.scale);
  const apArcsec = apR * pack.grid.scale;
  const out: Phot[] = [];
  for (const f of pack.frames) {
    const [ci, cj] = at(f.year);
    if (!(ci >= apR + 1.5 && cj >= apR + 1.5 && ci <= n - apR - 2.5 && cj <= n - apR - 2.5)) continue;
    const i0 = Math.round(ci);
    const j0 = Math.round(cj);
    let sum = 0;
    let wsum = 0;
    let w2sum = 0;
    let flagged = false;
    const ann: number[] = [];
    for (let j = Math.max(0, j0 - reach); j <= Math.min(n - 1, j0 + reach); j++) {
      for (let i = Math.max(0, i0 - reach); i <= Math.min(n - 1, i0 + reach); i++) {
        const idx = j * n + i;
        const v = f.data[idx];
        const bad = isBad(pack, f.k, idx);
        const w = pixelApertureWeight(i, j, ci, cj, apR);
        if (w > 0) {
          if (v !== v) {
            flagged = true;
            continue;
          }
          if (bad) flagged = true;
          sum += w * v;
          wsum += w;
          w2sum += w * w;
        } else {
          const r = Math.hypot(i - ci, j - cj);
          if (r >= annIn && r <= annOut && v === v && !bad) ann.push(v);
        }
      }
    }
    if (wsum < Math.min(2.5, Math.PI * apR * apR * 0.65) || ann.length < 14) continue;
    const sky = median(ann);
    const annMad = 1.4826 * median(ann.map((v) => Math.abs(v - sky)));
    const sigPix = Math.max(f.sigma, Number.isFinite(annMad) ? annMad : 0);
    // Merline & Howell (1995): σ² = Σ(w_i²)·σ_pix² + (π/2)·(Σ w_i)²/N_sky · σ_sky²
    const varDn = w2sum * sigPix * sigPix + (Math.PI / 2) * ((wsum * wsum) / ann.length) * sigPix * sigPix;
    const ee = psfEncircledEnergy(apArcsec, Number.isFinite(f.fwhm) ? f.fwhm : 8.0);
    const corr = doCorr ? 1 / ee : 1;
    out.push({
      k: f.k,
      lam: f.lam,
      dlam: f.dlam,
      det: f.det,
      mjd: f.mjd,
      flux: (sum - wsum * sky) * solidMjy * corr,
      err: Math.sqrt(varDn) * solidMjy * corr,
      flagged,
      ee,
    });
  }
  return out;
}

/** Names of the flag bits set in a Level-2 FLAGS value. */
export function flagList(pack: Pack, value: number): string[] {
  const out: string[] = [];
  for (const [bit, name] of Object.entries(pack.flagNames)) if (value & (1 << Number(bit))) out.push(name);
  return out;
}
