/* All-sky engine: reprojects HiPS tiles (HEALPix) served by IRSA with CORS
 * enabled onto a north-up grid — any coordinates, straight from the browser.
 * Tile orientation (column = iy, row = ix) verified against real stars. */
import { ALLWISE_EPOCH } from './epochs';
import { CHANNELS, type Shot } from './packs';
import { IRSA, gridToSky, type Grid } from './spherex';

export interface Survey {
  id: string;
  label: string;
  base: string;
  maxOrder: number;
  ext: 'jpg' | 'png';
  epoch: string;
  year: number;
  lam: number;
}

const H = `${IRSA}/data/hips`;

export const SURVEYS: Survey[] = [
  { id: 'dss', label: 'DSS2 Red', base: `${H}/CDS/DSS2/red`, maxOrder: 9, ext: 'jpg', epoch: '1984–1999', year: 1992, lam: 0.66 },
  { id: '2mj', label: '2MASS J', base: `${H}/CDS/2MASS/J`, maxOrder: 9, ext: 'jpg', epoch: '1997–2001', year: 1999, lam: 1.23 },
  { id: '2mk', label: '2MASS Ks', base: `${H}/CDS/2MASS/K`, maxOrder: 9, ext: 'jpg', epoch: '1997–2001', year: 1999.1, lam: 2.16 },
  { id: 'w1', label: 'AllWISE W1', base: `${H}/CDS/AllWISE/W1`, maxOrder: 8, ext: 'jpg', epoch: '2010', year: ALLWISE_EPOCH, lam: 3.4 },
  { id: 'w2', label: 'AllWISE W2', base: `${H}/CDS/AllWISE/W2`, maxOrder: 8, ext: 'jpg', epoch: '2010', year: ALLWISE_EPOCH, lam: 4.6 },
  { id: 'spx', label: 'SPHEREx', base: `${H}/SPHEREx/spherex_allsky_cube`, maxOrder: 5, ext: 'png', epoch: '2025–2026', year: 2025.9, lam: 0 },
];

const TILE = 512;

/** HEALPix nested scheme: (ra, dec) → base face and in-face integer coordinates. */
function ang2xyf(nside: number, ra: number, dec: number): [number, number, number] {
  const z = Math.sin((dec * Math.PI) / 180);
  const za = Math.abs(z);
  const tt = (((ra / 90) % 4) + 4) % 4;
  if (za <= 2 / 3) {
    const t1 = nside * (0.5 + tt);
    const t2 = nside * z * 0.75;
    const jp = Math.floor(t1 - t2);
    const jm = Math.floor(t1 + t2);
    const ifp = Math.floor(jp / nside);
    const ifm = Math.floor(jm / nside);
    const face = ifp === ifm ? (ifp & 3) + 4 : ifp < ifm ? ifp : ifm + 8;
    return [face, jm & (nside - 1), nside - (jp & (nside - 1)) - 1];
  }
  const ntt = Math.min(3, Math.floor(tt));
  const tp = tt - ntt;
  const tmp = nside * Math.sqrt(3 * (1 - za));
  const jp = Math.min(nside - 1, Math.floor(tp * tmp));
  const jm = Math.min(nside - 1, Math.floor((1 - tp) * tmp));
  return z >= 0 ? [ntt, nside - jm - 1, nside - jp - 1] : [ntt + 8, jp, jm];
}

function interleave(x: number, y: number): number {
  let r = 0;
  for (let b = 0; b < 12; b++) r += (((x >> b) & 1) + 2 * ((y >> b) & 1)) * 4 ** b;
  return r;
}

const tiles = new Map<string, Promise<Uint8Array | null>>();

function loadTile(url: string): Promise<Uint8Array | null> {
  let p = tiles.get(url);
  if (!p) {
    p = new Promise<Uint8Array | null>((resolve) => {
      const img = new Image();
      const to = setTimeout(() => resolve(null), 25000);
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        clearTimeout(to);
        try {
          const c = document.createElement('canvas');
          c.width = c.height = TILE;
          const ctx = c.getContext('2d', { willReadFrequently: true });
          if (!ctx) return resolve(null);
          ctx.drawImage(img, 0, 0, TILE, TILE);
          const d = ctx.getImageData(0, 0, TILE, TILE).data;
          const g = new Uint8Array(TILE * TILE);
          for (let i = 0; i < g.length; i++) g[i] = d[i * 4];
          resolve(g);
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => {
        clearTimeout(to);
        resolve(null);
      };
      img.src = url;
    });
    tiles.set(url, p);
    if (tiles.size > 90) tiles.delete(tiles.keys().next().value as string);
  }
  return p;
}

/** North-up cutout of a HiPS survey on `grid`. Values are the survey's 8-bit preview scale (0–255); NaN = no tile. */
export async function hipsCutout(s: Survey, grid: Grid, channel = 0): Promise<Float32Array> {
  const want = Math.round(Math.log2((58.63 * 3600) / (TILE * grid.scale)));
  const order = Math.max(3, Math.min(s.maxOrder, want));
  const nside = 2 ** order * TILE;
  const n = grid.n;
  const tileOf = new Int32Array(n * n);
  const offset = new Int32Array(n * n);
  const need = new Set<number>();
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const [ra, dec] = gridToSky(grid, i, j);
      const [f, ix, iy] = ang2xyf(nside, ra, dec);
      const npix = f * 4 ** order + interleave(ix >> 9, iy >> 9);
      tileOf[j * n + i] = npix;
      offset[j * n + i] = (ix & 511) * TILE + (iy & 511);
      need.add(npix);
    }
  }
  const loaded = new Map<number, Uint8Array | null>();
  await Promise.all(
    [...need].map(async (npix) => {
      const url = `${s.base}/Norder${order}/Dir${Math.floor(npix / 10000) * 10000}/Npix${npix}${channel > 0 ? `_${channel}` : ''}.${s.ext}`;
      loaded.set(npix, await loadTile(url));
    }),
  );
  const out = new Float32Array(n * n);
  for (let k = 0; k < out.length; k++) {
    const t = loaded.get(tileOf[k]);
    out[k] = t ? t[offset[k]] : NaN;
  }
  return out;
}

/** Mean raw value of the central 3 × 3 pixels (before auto-levelling). */
function centreValue(a: Float32Array, holes: boolean): number {
  const n = Math.round(Math.sqrt(a.length));
  const c = Math.floor(n / 2);
  let sum = 0;
  let cnt = 0;
  for (let j = c - 1; j <= c + 1; j++)
    for (let i = c - 1; i <= c + 1; i++) {
      const v = a[j * n + i];
      if (v === v && !(holes && v === 0)) {
        sum += v;
        cnt++;
      }
    }
  return cnt ? sum / cnt : NaN;
}

/** Auto-level a preview cutout in place: 5th percentile → 0, 99.8th → 255.
 *  Survey previews ship with very different pedestals; this makes them blink cleanly.
 *  In the SPHEREx cube a value of exactly 0 marks masked pixels (saturated stars) → no data. */
function autoLevel(a: Float32Array, holes: boolean) {
  const vals: number[] = [];
  for (let i = 0; i < a.length; i++) {
    if (holes && a[i] === 0) a[i] = NaN;
    if (a[i] === a[i]) vals.push(a[i]);
  }
  if (vals.length < 16) return;
  vals.sort((x, y) => x - y);
  const lo = vals[Math.floor(vals.length * 0.05)];
  const hi = vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.998))];
  if (!(hi > lo)) return;
  for (let i = 0; i < a.length; i++) if (a[i] === a[i]) a[i] = 255 * Math.min(1, Math.max(0, (a[i] - lo) / (hi - lo)));
}

const hasData = (a: Float32Array) => {
  for (let i = 0; i < a.length; i++) if (a[i] === a[i]) return true;
  return false;
};

export type SkyMode = 'legacy' | 'sweep';

/** Build an all-sky sequence: a multi-mission blink across decades, or a sweep through the SPHEREx cube. */
export async function buildSkyShots(
  grid: Grid,
  mode: SkyMode,
  surveys: string[],
  channel: number,
  onProgress: (done: number, total: number) => void,
  alive: () => boolean,
): Promise<Shot[]> {
  const spx = SURVEYS.find((s) => s.id === 'spx')!;
  const jobs: { s: Survey; ch: number }[] =
    mode === 'legacy'
      ? SURVEYS.filter((s) => surveys.includes(s.id)).map((s) => ({ s, ch: s.id === 'spx' ? channel : 0 }))
      : CHANNELS.map((_, c) => ({ s: spx, ch: c })).filter((j) => j.ch % 3 === 1);
  const shots: Shot[] = [];
  let done = 0;
  onProgress(0, jobs.length);
  const run = async ({ s, ch }: { s: Survey; ch: number }) => {
    if (!alive()) return;
    const data = await hipsCutout(s, grid, ch);
    onProgress(++done, jobs.length);
    const isSpx = s.id === 'spx';
    const probe = centreValue(data, isSpx);
    const raw = Float32Array.from(data);
    if (isSpx) for (let i = 0; i < raw.length; i++) if (raw[i] === 0) raw[i] = NaN;
    autoLevel(data, isSpx);
    if (!hasData(data)) return;
    const lam = isSpx ? CHANNELS[ch] : s.lam;
    shots.push({
      key: `${s.id}-${ch}`,
      title: mode === 'sweep' ? `${lam.toFixed(3)} µm` : isSpx ? `SPHEREx ${lam.toFixed(2)} µm` : s.label,
      sub: isSpx ? `SPHEREx DR1 all-sky cube · channel ${ch + 1} of 102 · observed ${s.epoch}` : `${s.label} · ${s.lam} µm · observed ${s.epoch}`,
      year: s.year,
      mjd: null,
      lam,
      dets: isSpx ? [Math.floor(ch / 17) + 1] : [],
      members: [],
      data,
      badFrac: null,
      sigma: 1,
      unit: 'display',
      origin: isSpx ? 'SPHEREx DR1 cube · IRSA HiPS' : `${s.label} · IRSA HiPS`,
      probe,
      raw,
    });
  };
  // modest parallelism keeps the archive happy
  const queue = [...jobs];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (queue.length) await run(queue.shift()!);
    }),
  );
  return shots.sort((a, b) => (mode === 'sweep' ? (a.lam ?? 0) - (b.lam ?? 0) : a.year - b.year));
}
