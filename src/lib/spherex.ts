/* ---------------------------------------------------------------------------
 * SPHEREx Level-2 toolkit — pure TypeScript, zero dependencies, no DOM.
 * Shared by the browser viewer and the Node ingest script (scripts/ingest.ts):
 *   · FITS reader (multi-extension, streaming-prefix tolerant)
 *   · TAN-SIP celestial WCS (forward + inverse)
 *   · WAVE-TAB spectral WCS (per-pixel wavelength lookup)
 *   · north-up reprojection onto a common grid
 *   · asinh companding used by the bundled data packs
 * ------------------------------------------------------------------------- */

export type Header = Record<string, string | number | boolean>;
export interface Hdu {
  name: string;
  header: Header;
  dataOffset: number;
  dataBytes: number;
  complete: boolean;
}

const BLOCK = 2880;
const D2R = Math.PI / 180;

/* ------------------------------- FITS ---------------------------------- */

function parseCard(card: string, h: Header) {
  let key: string;
  let rest: string;
  if (card.startsWith('HIERARCH')) {
    const eq = card.indexOf('=');
    if (eq < 0) return;
    key = card.slice(9, eq).trim();
    rest = card.slice(eq + 1);
  } else if (card[8] === '=') {
    key = card.slice(0, 8).trim();
    rest = card.slice(9);
  } else return;
  rest = rest.trim();
  if (rest.startsWith("'")) {
    let s = '';
    let i = 1;
    while (i < rest.length) {
      if (rest[i] === "'") {
        if (rest[i + 1] === "'") {
          s += "'";
          i += 2;
          continue;
        }
        break;
      }
      s += rest[i++];
    }
    h[key] = s.trimEnd();
  } else {
    const v = rest.split('/')[0].trim();
    if (v === 'T') h[key] = true;
    else if (v === 'F') h[key] = false;
    else {
      const num = Number(v);
      h[key] = v === '' || Number.isNaN(num) ? v : num;
    }
  }
}

/** Parse every HDU whose header is fully inside the buffer. Data may be truncated (see `complete`). */
export function parseFits(u8: Uint8Array): Hdu[] {
  const hdus: Hdu[] = [];
  let o = 0;
  while (o + BLOCK <= u8.length) {
    const header: Header = {};
    let end = false;
    while (!end) {
      if (o + BLOCK > u8.length) return hdus;
      for (let i = 0; i < 36; i++) {
        let card = '';
        const s = o + i * 80;
        for (let k = 0; k < 80; k++) card += String.fromCharCode(u8[s + k]);
        if (card.startsWith('END') && card.slice(3).trim() === '') {
          end = true;
          break;
        }
        parseCard(card, header);
      }
      o += BLOCK;
    }
    const bitpix = Number(header.BITPIX ?? 8);
    const naxis = Number(header.NAXIS ?? 0);
    let n = naxis ? 1 : 0;
    for (let i = 1; i <= naxis; i++) n *= Number(header['NAXIS' + i]);
    const bytes = (Math.abs(bitpix) / 8) * (n + Number(header.PCOUNT ?? 0)) * Number(header.GCOUNT ?? 1);
    hdus.push({
      name: String(header.EXTNAME ?? (hdus.length === 0 ? 'PRIMARY' : '')),
      header,
      dataOffset: o,
      dataBytes: bytes,
      complete: o + bytes <= u8.length,
    });
    o += Math.ceil(bytes / BLOCK) * BLOCK;
  }
  return hdus;
}

export function readFloat(u8: Uint8Array, hdu: Hdu): Float32Array {
  const bitpix = Number(hdu.header.BITPIX);
  const n = hdu.dataBytes / (Math.abs(bitpix) / 8);
  const dv = new DataView(u8.buffer, u8.byteOffset + hdu.dataOffset, hdu.dataBytes);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] =
      bitpix === -32 ? dv.getFloat32(i * 4) : bitpix === -64 ? dv.getFloat64(i * 8) : bitpix === 32 ? dv.getInt32(i * 4) : bitpix === 16 ? dv.getInt16(i * 2) : dv.getUint8(i);
  }
  return out;
}

export function readInt(u8: Uint8Array, hdu: Hdu): Int32Array {
  const n = hdu.dataBytes / 4;
  const dv = new DataView(u8.buffer, u8.byteOffset + hdu.dataOffset, hdu.dataBytes);
  const out = new Int32Array(n);
  for (let i = 0; i < n; i++) out[i] = dv.getInt32(i * 4);
  return out;
}

/* ------------------------- Tangent-plane maths -------------------------- */

/** Gnomonic projection. Returns (xi, eta) in degrees — xi east, eta north. */
export function tanProject(ra: number, dec: number, ra0: number, dec0: number): [number, number] {
  const d = dec * D2R;
  const d0 = dec0 * D2R;
  const da = (ra - ra0) * D2R;
  const cosc = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(da);
  return [
    (Math.cos(d) * Math.sin(da)) / cosc / D2R,
    (Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(da)) / cosc / D2R,
  ];
}

export function tanDeproject(xiDeg: number, etaDeg: number, ra0: number, dec0: number): [number, number] {
  const xi = xiDeg * D2R;
  const eta = etaDeg * D2R;
  const d0 = dec0 * D2R;
  const den = Math.cos(d0) - eta * Math.sin(d0);
  let ra = ra0 + Math.atan2(xi, den) / D2R;
  const dec = Math.atan2(Math.sin(d0) + eta * Math.cos(d0), Math.hypot(den, xi)) / D2R;
  ra = ((ra % 360) + 360) % 360;
  return [ra, dec];
}

/* ------------------------------ TAN-SIP -------------------------------- */

export interface Wcs {
  crpix: [number, number];
  crval: [number, number];
  cd: [number, number, number, number];
  cdi: [number, number, number, number];
  a: number[][] | null;
  b: number[][] | null;
  ap: number[][] | null;
  bp: number[][] | null;
}

function sipMatrix(h: Header, p: string): number[][] | null {
  const order = Number(h[p + '_ORDER'] ?? 0);
  if (!order) return null;
  const m: number[][] = [];
  for (let i = 0; i <= order; i++) {
    m[i] = [];
    for (let j = 0; j <= order - i; j++) m[i][j] = Number(h[`${p}_${i}_${j}`] ?? 0);
  }
  return m;
}

function sipEval(m: number[][], u: number, v: number): number {
  let s = 0;
  let ui = 1;
  for (let i = 0; i < m.length; i++) {
    let vj = 1;
    for (let j = 0; j < m[i].length; j++) {
      s += m[i][j] * ui * vj;
      vj *= v;
    }
    ui *= u;
  }
  return s;
}

export function wcsFromHeader(h: Header): Wcs {
  const num = (k: string, d = 0) => (typeof h[k] === 'number' ? (h[k] as number) : d);
  let cd: [number, number, number, number];
  if (typeof h.CD1_1 === 'number') cd = [num('CD1_1'), num('CD1_2'), num('CD2_1'), num('CD2_2')];
  else {
    const c1 = num('CDELT1', 1);
    const c2 = num('CDELT2', 1);
    cd = [c1 * num('PC1_1', 1), c1 * num('PC1_2'), c2 * num('PC2_1'), c2 * num('PC2_2', 1)];
  }
  const det = cd[0] * cd[3] - cd[1] * cd[2];
  return {
    crpix: [num('CRPIX1'), num('CRPIX2')],
    crval: [num('CRVAL1'), num('CRVAL2')],
    cd,
    cdi: [cd[3] / det, -cd[1] / det, -cd[2] / det, cd[0] / det],
    a: sipMatrix(h, 'A'),
    b: sipMatrix(h, 'B'),
    ap: sipMatrix(h, 'AP'),
    bp: sipMatrix(h, 'BP'),
  };
}

/** FITS 1-based pixel → ICRS degrees. */
export function pix2sky(w: Wcs, x: number, y: number): [number, number] {
  let u = x - w.crpix[0];
  let v = y - w.crpix[1];
  if (w.a && w.b) {
    const f = sipEval(w.a, u, v);
    const g = sipEval(w.b, u, v);
    u += f;
    v += g;
  }
  return tanDeproject(w.cd[0] * u + w.cd[1] * v, w.cd[2] * u + w.cd[3] * v, w.crval[0], w.crval[1]);
}

/** ICRS degrees → FITS 1-based pixel (inverse SIP seed + Newton refinement on the forward model). */
export function sky2pix(w: Wcs, ra: number, dec: number): [number, number] {
  const [xi, eta] = tanProject(ra, dec, w.crval[0], w.crval[1]);
  const U = w.cdi[0] * xi + w.cdi[1] * eta;
  const V = w.cdi[2] * xi + w.cdi[3] * eta;
  let x = U + (w.ap ? sipEval(w.ap, U, V) : 0) + w.crpix[0];
  let y = V + (w.bp ? sipEval(w.bp, U, V) : 0) + w.crpix[1];
  for (let it = 0; it < 3; it++) {
    const [r2, d2] = pix2sky(w, x, y);
    const [xi2, eta2] = tanProject(r2, d2, w.crval[0], w.crval[1]);
    const dx = xi - xi2;
    const dy = eta - eta2;
    x += w.cdi[0] * dx + w.cdi[1] * dy;
    y += w.cdi[2] * dx + w.cdi[3] * dy;
  }
  return [x, y];
}

/* --------------------------- Output sky grid ---------------------------- */

/** n×n north-up, east-left tangent-plane grid. `scale` in arcsec / pixel. */
export interface Grid {
  ra: number;
  dec: number;
  n: number;
  scale: number;
}

export function gridToSky(g: Grid, i: number, j: number): [number, number] {
  const c = (g.n - 1) / 2;
  return tanDeproject((-(i - c) * g.scale) / 3600, (-(j - c) * g.scale) / 3600, g.ra, g.dec);
}

export function skyToGrid(g: Grid, ra: number, dec: number): [number, number] {
  const [xi, eta] = tanProject(ra, dec, g.ra, g.dec);
  const c = (g.n - 1) / 2;
  return [c - (xi * 3600) / g.scale, c - (eta * 3600) / g.scale];
}

type Affine = [number, number, number, number, number, number];

/** Affine map grid (i,j) → source FITS pixel. Exact at three corners; error ≪ 0.01 px over a few arcmin. */
export function gridAffine(w: Wcs, g: Grid): Affine {
  const m = g.n - 1;
  const p00 = sky2pix(w, ...gridToSky(g, 0, 0));
  const p10 = sky2pix(w, ...gridToSky(g, m, 0));
  const p01 = sky2pix(w, ...gridToSky(g, 0, m));
  return [(p10[0] - p00[0]) / m, (p01[0] - p00[0]) / m, p00[0], (p10[1] - p00[1]) / m, (p01[1] - p00[1]) / m, p00[1]];
}

export function resampleBilinear(src: Float32Array, nx: number, ny: number, a: Affine, n: number): Float32Array {
  const out = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = a[0] * i + a[1] * j + a[2] - 1;
      const y = a[3] * i + a[4] * j + a[5] - 1;
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      if (x0 < 0 || y0 < 0 || x0 >= nx - 1 || y0 >= ny - 1) {
        out[j * n + i] = NaN;
        continue;
      }
      const fx = x - x0;
      const fy = y - y0;
      const k = y0 * nx + x0;
      out[j * n + i] = src[k] * (1 - fx) * (1 - fy) + src[k + 1] * fx * (1 - fy) + src[k + nx] * (1 - fx) * fy + src[k + nx + 1] * fx * fy;
    }
  }
  return out;
}

export function resampleNearest(src: Int32Array, nx: number, ny: number, a: Affine, n: number): Int32Array {
  const out = new Int32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = Math.round(a[0] * i + a[1] * j + a[2] - 1);
      const y = Math.round(a[3] * i + a[4] * j + a[5] - 1);
      out[j * n + i] = x < 0 || y < 0 || x >= nx || y >= ny ? 0 : src[y * nx + x];
    }
  }
  return out;
}

/* --------------------------- Spectral WCS ------------------------------- */

/** WAVE-TAB control grid for one detector: v is flat [k + 2·(ix + nx·iy)], k=0 wavelength, k=1 bandwidth (µm). */
export interface SpecWcs {
  x: number[];
  y: number[];
  v: number[];
}

export function parseSpecWcs(u8: Uint8Array, hdu: Hdu): SpecWcs {
  const dv = new DataView(u8.buffer, u8.byteOffset + hdu.dataOffset, hdu.dataBytes);
  const cols: number[][] = [];
  let o = 0;
  const nf = Number(hdu.header.TFIELDS);
  for (let c = 1; c <= nf; c++) {
    const m = /^(\d*)([JED])/.exec(String(hdu.header['TFORM' + c]).trim());
    if (!m) throw new Error('Unsupported TFORM');
    const rep = Number(m[1] || 1);
    const arr: number[] = [];
    for (let i = 0; i < rep; i++) {
      if (m[2] === 'J') {
        arr.push(dv.getInt32(o));
        o += 4;
      } else if (m[2] === 'E') {
        arr.push(dv.getFloat32(o));
        o += 4;
      } else {
        arr.push(dv.getFloat64(o));
        o += 8;
      }
    }
    cols.push(arr);
  }
  return { x: cols[0], y: cols[1], v: cols[2].map((q) => Math.round(q * 1e5) / 1e5) };
}

function bracket(a: number[], q: number): [number, number] {
  let i = 0;
  while (i < a.length - 2 && q > a[i + 1]) i++;
  const f = (q - a[i]) / (a[i + 1] - a[i]);
  return [i, Math.min(1, Math.max(0, f))];
}

/** Central wavelength and bandwidth (µm) at raw 1-based detector coordinates. */
export function lambdaAt(t: SpecWcs, X: number, Y: number): [number, number] {
  const nx = t.x.length;
  const [ix, fx] = bracket(t.x, X);
  const [iy, fy] = bracket(t.y, Y);
  const at = (k: number, i: number, j: number) => t.v[k + 2 * (i + nx * j)];
  const lerp = (k: number) =>
    at(k, ix, iy) * (1 - fx) * (1 - fy) + at(k, ix + 1, iy) * fx * (1 - fy) + at(k, ix, iy + 1) * (1 - fx) * fy + at(k, ix + 1, iy + 1) * fx * fy;
  return [lerp(0), lerp(1)];
}

/* ----------------------------- Companding ------------------------------- */
/* 8-bit asinh code: ≈4 levels per σ near the sky, ≈5 % per level for bright
 * sources, 0 reserved for "no data". Dynamic range ≈ −7σ … +2.6×10⁵σ.     */

const CA = 20;
const CS = 5;
const COFF = 24;

export function compand(v: number, sigma: number): number {
  if (!Number.isFinite(v)) return 0;
  const c = Math.round(COFF + CA * Math.asinh(v / sigma / CS));
  return c < 1 ? 1 : c > 255 ? 255 : c;
}

const EXPAND_LUT = (() => {
  const l = new Float32Array(256);
  l[0] = NaN;
  for (let c = 1; c < 256; c++) l[c] = CS * Math.sinh((c - COFF) / CA);
  return l;
})();

/** Decode companded bytes back to background-subtracted surface brightness (same unit as sigma). */
export function expand(codes: Uint8Array, sigma: number, out: Float32Array = new Float32Array(codes.length)): Float32Array {
  for (let i = 0; i < codes.length; i++) out[i] = EXPAND_LUT[codes[i]] * sigma;
  return out;
}

/* ------------------------------ Statistics ------------------------------ */

export function median(values: Float32Array | number[]): number {
  const a = Float32Array.from(values).sort();
  const n = a.length;
  if (!n) return NaN;
  return n % 2 ? a[(n - 1) / 2] : 0.5 * (a[n / 2 - 1] + a[n / 2]);
}

export interface Aligned {
  data: Float32Array;
  sigma: number;
  bad?: (i: number) => number;
}

/** Outlier-rejected inverse-variance mean of aligned frames.
 *  Flagged pixels are left out unless nothing else exists; with ≥ 4 samples a value is
 *  clipped when it sits > 5·max(σ, MAD) + 30 % from the median — this removes cosmic rays,
 *  snowballs and passing satellites that the pipeline flags missed. */
export function combine(frames: Aligned[], px: number): { data: Float32Array; badFrac: Float32Array; sigma: number } {
  const m = frames.length;
  const w = frames.map((f) => 1 / (f.sigma * f.sigma));
  const vals = new Float32Array(m);
  const wts = new Float32Array(m);
  const sgs = new Float32Array(m);
  const tmp = new Float32Array(m);
  const data = new Float32Array(px);
  const badFrac = new Float32Array(px);
  const med = (n: number) => {
    const s = tmp.subarray(0, n).sort();
    return n % 2 ? s[(n - 1) / 2] : 0.5 * (s[n / 2 - 1] + s[n / 2]);
  };
  for (let i = 0; i < px; i++) {
    let n = 0;
    let nbad = 0;
    let sumAll = 0;
    let wAll = 0;
    for (let k = 0; k < m; k++) {
      const v = frames[k].data[i];
      if (v !== v) {
        nbad++;
        continue;
      }
      sumAll += w[k] * v;
      wAll += w[k];
      if (frames[k].bad && frames[k].bad!(i)) {
        nbad++;
        continue;
      }
      vals[n] = v;
      wts[n] = w[k];
      sgs[n] = frames[k].sigma;
      n++;
    }
    badFrac[i] = m ? nbad / m : 0;
    if (n === 0) {
      data[i] = wAll > 0 ? sumAll / wAll : NaN;
      continue;
    }
    let centre = 0;
    let mad = 0;
    const clip = n >= 4;
    if (clip) {
      tmp.set(vals.subarray(0, n));
      centre = med(n);
      for (let q = 0; q < n; q++) tmp[q] = Math.abs(vals[q] - centre);
      mad = 1.4826 * med(n);
    }
    let s = 0;
    let ws = 0;
    for (let q = 0; q < n; q++) {
      if (clip && Math.abs(vals[q] - centre) > 5 * Math.max(sgs[q], mad) + 0.3 * Math.abs(centre)) continue;
      s += wts[q] * vals[q];
      ws += wts[q];
    }
    data[i] = ws > 0 ? s / ws : centre;
  }
  const wtot = w.reduce((a, b) => a + b, 0);
  return { data, badFrac, sigma: wtot > 0 ? 1 / Math.sqrt(wtot) : 1 };
}

/* ------------------------------- IRSA ----------------------------------- */

export const IRSA = 'https://irsa.ipac.caltech.edu';

export function framesAdql(ra: number, dec: number): string {
  return (
    'SELECT a.uri, p.time_bounds_lower, p.energy_bandpassname, p.obsid ' +
    'FROM spherex.artifact a JOIN spherex.plane p ON a.planeid = p.planeid ' +
    `WHERE 1 = CONTAINS(POINT('ICRS', ${ra.toFixed(6)}, ${dec.toFixed(6)}), p.poly) ` +
    'ORDER BY p.time_bounds_lower'
  );
}

export function tapUrl(adql: string, format = 'csv'): string {
  return `${IRSA}/TAP/sync?QUERY=${encodeURIComponent(adql)}&FORMAT=${format}`;
}

export function cutoutUrl(uri: string, ra: number, dec: number, px: number): string {
  return `${IRSA}/${uri}?center=${ra.toFixed(6)},${dec.toFixed(6)}&size=${px}px`;
}

export interface FrameRef {
  uri: string;
  mjd: number;
  det: number;
  obsid: string;
}

export function parseFramesCsv(text: string): FrameRef[] {
  const rows = text.trim().split(/\r?\n/).slice(1);
  const out: FrameRef[] = [];
  for (const r of rows) {
    const c = r.split(',');
    if (c.length < 4 || !c[0].startsWith('ibe/')) continue;
    out.push({ uri: c[0], mjd: Number(c[1]), det: Number(String(c[2]).replace(/\D/g, '')), obsid: c[3] });
  }
  return out;
}

/** Stream the first `bytes` of a response, then hang up. Level-2 cutouts carry a
 *  3.9 MB PSF table after the image planes — we never need to download it. */
export async function fetchPrefix(url: string, bytes: number, init?: RequestInit): Promise<Uint8Array> {
  const res = await fetch(url, init);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  while (got < bytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
  }
  reader.cancel().catch(() => {});
  const out = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/* --------------------------- Cutout → frame ----------------------------- */

export interface ProcessedFrame {
  mjd: number;
  det: number;
  obsid: string;
  lam: number;
  dlam: number;
  bg: number;
  sigma: number;
  cover: number;
  cflags: number;
  fwhm: number;
  exp: number;
  img: Float32Array;
  bad: Uint8Array;
  flagNames: Record<number, string>;
}

const INFO_FLAGS = ['SOURCE', 'FULLSAMPLE'];

export function flagNamesFromHeader(h: Header): Record<number, string> {
  const out: Record<number, string> = {};
  for (const k of Object.keys(h)) {
    if (k.startsWith('MSKN')) out[Number(k.slice(4))] = String(h[k]).trim();
  }
  return out;
}

/** Reproject one Level-2 cutout (IMAGE, FLAGS, [VARIANCE], ZODI) onto the grid. */
export function processCutout(u8: Uint8Array, grid: Grid, spec?: Record<number, SpecWcs>): ProcessedFrame | null {
  const hdus = parseFits(u8);
  const by = (n: string) => hdus.find((h) => h.name === n && h.complete);
  const hImg = by('IMAGE');
  if (!hImg) return null;
  const hFlag = by('FLAGS');
  const hZodi = by('ZODI');
  const h = hImg.header;
  const nx = Number(h.NAXIS1);
  const ny = Number(h.NAXIS2);
  const wcs = wcsFromHeader(h);
  const aff = gridAffine(wcs, grid);
  const n = grid.n;

  const img = resampleBilinear(readFloat(u8, hImg), nx, ny, aff, n);
  if (hZodi) {
    const z = resampleBilinear(readFloat(u8, hZodi), nx, ny, aff, n);
    for (let i = 0; i < img.length; i++) img[i] -= z[i];
  }
  const flagNames = hFlag ? flagNamesFromHeader(hFlag.header) : {};
  const flags = hFlag ? resampleNearest(readInt(u8, hFlag), nx, ny, aff, n) : new Int32Array(n * n);
  let info = 0;
  let srcBit = 0;
  for (const [bit, name] of Object.entries(flagNames)) {
    if (INFO_FLAGS.includes(name)) info |= 1 << Number(bit);
    if (name === 'SOURCE') srcBit = 1 << Number(bit);
  }
  const bad = new Uint8Array(n * n);
  const sky: number[] = [];
  const all: number[] = [];
  let finite = 0;
  for (let i = 0; i < img.length; i++) {
    if (!Number.isFinite(img[i])) continue;
    finite++;
    if (flags[i] & ~info) bad[i] = 1;
    else {
      all.push(img[i]);
      if (!(flags[i] & srcBit)) sky.push(img[i]);
    }
  }
  const sample = sky.length > 80 ? sky : all;
  if (sample.length < 30) return null;
  const bg = median(sample);
  const sigma = Math.max(1e-6, 1.4826 * median(sample.map((v) => Math.abs(v - bg))));
  for (let i = 0; i < img.length; i++) img[i] -= bg;

  let cflags = 0;
  const c = Math.floor(n / 2);
  for (let j = c - 2; j <= c + 2; j++) for (let i = c - 2; i <= c + 2; i++) cflags |= flags[j * n + i];

  const det = Number(h.DETECTOR);
  let lam = NaN;
  let dlam = NaN;
  if (spec && spec[det]) {
    const [px, py] = sky2pix(wcs, grid.ra, grid.dec);
    const X = Number(h.CRVAL1W ?? 1) + (px - Number(h.CRPIX1W ?? 1));
    const Y = Number(h.CRVAL2W ?? 1) + (py - Number(h.CRPIX2W ?? 1));
    [lam, dlam] = lambdaAt(spec[det], X, Y);
  }
  return {
    mjd: Number(h['MJD-AVG'] ?? h['MJD-OBS']),
    det,
    obsid: String(h.OBSID ?? ''),
    lam,
    dlam,
    bg,
    sigma,
    cover: finite / (n * n),
    cflags,
    fwhm: Number(h.PSF_FWHM ?? NaN),
    exp: Number(h.XPOSURE ?? NaN),
    img,
    bad,
    flagNames,
  };
}
