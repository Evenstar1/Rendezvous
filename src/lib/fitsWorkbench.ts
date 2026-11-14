/* ---------------------------------------------------------------------------
 * In-site FITS & Catalogue Workbench — 100% browser-resident.
 *   · Standards-compliant FITS writer (BITPIX=-32, ICRS TAN WCS + FLAGS HDU)
 *   · Multi-file FITS / snapshot reader (SPHEREx L2 or generic WCS FITS)
 *   · CORS-safe SIMBAD/Gaia astrometric source lookup for arbitrary sky fields
 * ------------------------------------------------------------------------- */
import { FIELD_EPOCH, mjdToYear, type Target } from '../data/targets';
import specWcsRaw from '../data/specwcs.json';
import {
  compand,
  expand,
  flagNamesFromHeader,
  gridAffine,
  lambdaAt,
  median,
  parseFits,
  parseSpecWcs,
  pix2sky,
  readFloat,
  readInt,
  resampleBilinear,
  resampleNearest,
  sky2pix,
  skyToGrid,
  wcsFromHeader,
  type Grid,
  type Header,
  type SpecWcs,
} from './spherex';
import type { Frame, GaiaSrc, Pack, WiseSrc } from './packs';
import type { Plane } from './render';

const BLOCK = 2880;
const SPEC_WCS = specWcsRaw as unknown as Record<number, SpecWcs>;

/* ---------------------------- FITS writer ------------------------------- */

function cardStr(key: string, val: string | number | boolean | null, comment = ''): string {
  const k = key.padEnd(8, ' ').slice(0, 8);
  if (val === null) return (k + (comment ? '  ' + comment : '')).padEnd(80, ' ').slice(0, 80);
  let v: string;
  if (typeof val === 'boolean') v = val ? 'T'.padStart(20, ' ') : 'F'.padStart(20, ' ');
  else if (typeof val === 'number') {
    const s = Number.isInteger(val) ? String(val) : Math.abs(val) >= 1e-3 && Math.abs(val) < 1e6 ? Number(val.toPrecision(10)).toString() : val.toExponential(8).toUpperCase();
    v = s.padStart(20, ' ');
  } else {
    const clean = val.replace(/[^\x20-\x7e]/g, '').replace(/'/g, "''").slice(0, 66);
    v = `'${clean.padEnd(8, ' ')}'`.padEnd(20, ' ');
  }
  const full = comment ? `${k}= ${v} / ${comment}` : `${k}= ${v}`;
  return full.padEnd(80, ' ').slice(0, 80);
}

function encodeHeader(cards: [string, string | number | boolean | null, string?][]): Uint8Array {
  const lines = cards.map(([k, v, c]) => cardStr(k, v, c ?? ''));
  lines.push('END'.padEnd(80, ' '));
  const totalCards = Math.ceil(lines.length / 36) * 36;
  while (lines.length < totalCards) lines.push(' '.repeat(80));
  const u8 = new Uint8Array(totalCards * 80);
  for (let c = 0; c < totalCards; c++) {
    const s = lines[c];
    for (let i = 0; i < 80; i++) u8[c * 80 + i] = s.charCodeAt(i);
  }
  return u8;
}

export interface FitsExportMeta {
  object: string;
  bunit: string;
  origin?: string;
  mjdObs?: number;
  dateObs?: string;
  lamUm?: number | null;
  exposures?: number;
  sigma?: number;
}

/** Build a standards-compliant 32-bit float FITS file (north-up, east-left TAN WCS).
 *  Grid row j=0 is North; FITS row Y=1 is South, so rows are flipped so CD2_2 > 0, CD1_1 < 0. */
export function buildFitsBytes(plane: Plane, grid: Grid, meta: FitsExportMeta): Uint8Array {
  const n = grid.n;
  const degPerPx = grid.scale / 3600;
  const crpix = (n + 1) / 2;
  const primaryCards: [string, string | number | boolean | null, string?][] = [
    ['SIMPLE', true, 'Standard FITS format'],
    ['BITPIX', -32, 'IEEE single-precision floating point'],
    ['NAXIS', 2, '2D celestial image'],
    ['NAXIS1', n, 'Axis 1 pixels (East-West)'],
    ['NAXIS2', n, 'Axis 2 pixels (South-North)'],
    ['EXTEND', Boolean(plane.badFrac), 'Extensions may follow'],
    ['OBJECT', meta.object.slice(0, 60), 'Target or field identifier'],
    ['ORIGIN', meta.origin ?? 'Rendezvous', 'Produced in-browser by Rendezvous'],
    ['BUNIT', meta.bunit, 'Physical unit of pixel values'],
    ['RADESYS', 'ICRS', 'Celestial reference frame'],
    ['EQUINOX', 2000.0, 'Equinox of celestial coordinate system'],
    ['WCSAXES', 2, 'Number of WCS axes'],
    ['CTYPE1', 'RA---TAN', 'Gnomonic tangent projection'],
    ['CTYPE2', 'DEC--TAN', 'Gnomonic tangent projection'],
    ['CUNIT1', 'deg', 'Coordinate unit'],
    ['CUNIT2', 'deg', 'Coordinate unit'],
    ['CRPIX1', crpix, 'Reference pixel X (1-based)'],
    ['CRPIX2', crpix, 'Reference pixel Y (1-based)'],
    ['CRVAL1', grid.ra, '[deg] Right Ascension at reference point'],
    ['CRVAL2', grid.dec, '[deg] Declination at reference point'],
    ['CD1_1', -degPerPx, '[deg/px] East is left'],
    ['CD1_2', 0.0, '[deg/px] North-up alignment'],
    ['CD2_1', 0.0, '[deg/px] North-up alignment'],
    ['CD2_2', degPerPx, '[deg/px] North is up'],
  ];
  if (meta.mjdObs !== undefined && Number.isFinite(meta.mjdObs)) primaryCards.push(['MJD-OBS', meta.mjdObs, '[d] Modified Julian Date']);
  if (meta.dateObs) primaryCards.push(['DATE-OBS', meta.dateObs, 'Observation date']);
  if (meta.lamUm) primaryCards.push(['WAVELENG', meta.lamUm, '[um] Effective wavelength']);
  if (meta.exposures) primaryCards.push(['NCOMBINE', meta.exposures, 'Exposures combined']);
  if (meta.sigma !== undefined && Number.isFinite(meta.sigma)) primaryCards.push(['NOISERMS', meta.sigma, 'Formal 1-sigma background RMS']);

  const hdr0 = encodeHeader(primaryCards);
  const imgBytes = Math.ceil((n * n * 4) / BLOCK) * BLOCK;
  const imgBuf = new Uint8Array(imgBytes);
  const dv0 = new DataView(imgBuf.buffer);
  for (let j = 0; j < n; j++) {
    const srcRow = n - 1 - j;
    for (let i = 0; i < n; i++) dv0.setFloat32((j * n + i) * 4, plane.data[srcRow * n + i], false);
  }

  if (!plane.badFrac) {
    const out = new Uint8Array(hdr0.length + imgBuf.length);
    out.set(hdr0, 0);
    out.set(imgBuf, hdr0.length);
    return out;
  }

  const flagCards: [string, string | number | boolean | null, string?][] = [
    ['XTENSION', 'IMAGE', 'Flag fraction extension'],
    ['BITPIX', 32, '32-bit integer mask (1 = >50% flagged)'],
    ['NAXIS', 2, '2D mask'],
    ['NAXIS1', n, 'Axis 1 pixels'],
    ['NAXIS2', n, 'Axis 2 pixels'],
    ['PCOUNT', 0, 'Required keyword'],
    ['GCOUNT', 1, 'Required keyword'],
    ['EXTNAME', 'FLAGS', 'Pipeline contamination mask'],
  ];
  const hdr1 = encodeHeader(flagCards);
  const flgBuf = new Uint8Array(imgBytes);
  const dv1 = new DataView(flgBuf.buffer);
  for (let j = 0; j < n; j++) {
    const srcRow = n - 1 - j;
    for (let i = 0; i < n; i++) dv1.setInt32((j * n + i) * 4, plane.badFrac[srcRow * n + i] > 0.5 ? 2 : 0, false);
  }
  const out = new Uint8Array(hdr0.length + imgBuf.length + hdr1.length + flgBuf.length);
  let o = 0;
  for (const part of [hdr0, imgBuf, hdr1, flgBuf]) {
    out.set(part, o);
    o += part.length;
  }
  return out;
}

export function downloadBytes(name: string, bytes: Uint8Array, mime = 'application/fits'): void {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const url = URL.createObjectURL(new Blob([copy], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/* ------------------------ In-browser FITS ingest ------------------------ */

function parseMjdFromHeader(h: Header, fallbackIdx: number): number {
  for (const k of ['MJD-AVG', 'MJD-OBS', 'MJD-BEG', 'MJD', 'OBSMJD']) {
    if (typeof h[k] === 'number' && Number.isFinite(h[k] as number)) return h[k] as number;
  }
  for (const k of ['DATE-AVG', 'DATE-OBS', 'DATE-BEG', 'DATE']) {
    if (typeof h[k] === 'string') {
      const t = Date.parse(h[k] as string);
      if (Number.isFinite(t)) return t / 86400000 + 40587;
    }
  }
  if (typeof h.EPOCH === 'number' && (h.EPOCH as number) > 1900) return 51544.5 + ((h.EPOCH as number) - 2000) * 365.25;
  return 60800 + fallbackIdx * 30;
}

function parseWavelengthUm(h: Header, det: number): [number, number] {
  for (const k of ['WAVELENG', 'EFFWAVE', 'LAMBDA', 'CENWAVE', 'WAVELEN']) {
    if (typeof h[k] === 'number' && (h[k] as number) > 0) {
      let v = h[k] as number;
      const u = String(h.WAVEUNIT ?? '').toLowerCase();
      if (u.includes('ang') || v > 500) v *= 1e-4;
      else if (u.includes('nm') || (v > 50 && v <= 500)) v *= 1e-3;
      else if (v < 1e-4) v *= 1e6;
      return [v, v * 0.025];
    }
  }
  const mid = [0.93, 1.37, 2.03, 3.12, 4.12, 4.71][Math.min(5, Math.max(0, det - 1))];
  return [mid, mid * 0.03];
}

function bandForLam(lam: number, rawDet: number): number {
  if (rawDet >= 1 && rawDet <= 6) return rawDet;
  if (lam < 1.11) return 1;
  if (lam < 1.64) return 2;
  if (lam < 2.42) return 3;
  if (lam < 3.82) return 4;
  if (lam < 4.42) return 5;
  return 6;
}

const INFO_FLAGS = ['SOURCE', 'FULLSAMPLE'];

interface ParsedExposure {
  name: string;
  u8: Uint8Array;
  imgIdx: number;
  raCen: number;
  decCen: number;
  scaleArcsec: number;
  nx: number;
  ny: number;
}

/** Parse one or more local `.fits` files (or a Rendezvous `.json` snapshot) in-browser into a `Pack`. */
export async function ingestLocalFiles(files: { name: string; bytes: Uint8Array }[], label?: string): Promise<{ pack: Pack; warnings: string[] }> {
  const warnings: string[] = [];
  // Check if user dropped an exported Rendezvous JSON pack
  const jsonFile = files.find((f) => f.name.toLowerCase().endsWith('.json'));
  if (jsonFile && files.length === 1) {
    const text = new TextDecoder().decode(jsonFile.bytes);
    const j = JSON.parse(text);
    if (Array.isArray(j.frames) && typeof j.img === 'string' && typeof j.ra === 'number') {
      const inflate = async (b64: string) => {
        const bin = atob(b64);
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate'));
        return new Uint8Array(await new Response(stream).arrayBuffer());
      };
      const [codes, bad] = await Promise.all([inflate(j.img), inflate(j.bad ?? '')]);
      const px = j.n * j.n;
      const frames: Frame[] = j.frames.map((r: [number, number, number, number, number, number, number, number, string, string], k: number) => ({
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
      const id = `local-${Date.now().toString(36)}`;
      const target: Target = {
        id,
        name: label || String(j.name ?? j.id ?? jsonFile.name.replace(/\.json$/i, '')),
        code: 'LOCAL',
        kind: 'Imported Level-2 snapshot',
        tagline: 'Imported snapshot',
        blurb: 'Loaded directly in-browser.',
        look: 'Blink visits, run difference mode, or click any source to measure its spectrum and astrometry.',
        astrom: { ra: j.ra, dec: j.dec, epoch: FIELD_EPOCH, pmra: 0, pmdec: 0, plx: 0, ref: 'Field centre' },
        stats: [['Exposures', String(frames.length), ''], ['Scale', String(j.scale), '"/px'], ['Grid', `${j.n}×${j.n}`, '']],
      };
      const flagNames: Record<number, string> = {};
      for (const [b, nm] of Object.entries(j.flagNames ?? {})) flagNames[Number(b)] = String(nm);
      return {
        pack: {
          id,
          target,
          grid: { ra: j.ra, dec: j.dec, n: j.n, scale: j.scale },
          n: j.n,
          release: String(j.release || 'LOCAL'),
          built: String(j.built || new Date().toISOString().slice(0, 10)),
          available: frames.length,
          flagNames,
          frames,
          bad: bad.length ? bad : new Uint8Array(frames.length * Math.ceil(px / 8)),
          stride: Math.ceil(px / 8),
          gaia: (j.gaia ?? []).map((g: [number, number, number, number, number, number, string]) => ({ ra: g[0], dec: g[1], pmra: g[2], pmdec: g[3], plx: g[4], g: g[5], id: g[6] })),
          wise: (j.wise ?? []).map((w: [number, number, number, number, number?, number?]) => ({ ra: w[0], dec: w[1], w1: w[2], w2: w[3], pmra: w[4] ?? 0, pmdec: w[5] ?? 0 })),
          epochs: groupFrames(frames),
        },
        warnings,
      };
    }
  }

  // Otherwise parse 1+ FITS files directly
  const parsed: ParsedExposure[] = [];
  for (const f of files) {
    const hdus = parseFits(f.bytes);
    const imgIdx = hdus.findIndex((h) => h.complete && Number(h.header.NAXIS) >= 2 && Number(h.header.NAXIS1) >= 8 && Number(h.header.NAXIS2) >= 8 && (h.name === 'IMAGE' || h.name === 'SCI' || h.name === 'PRIMARY' || h.header.XTENSION === 'IMAGE'));
    if (imgIdx < 0) {
      warnings.push(`${f.name}: no complete 2D image HDU found.`);
      continue;
    }
    const h = hdus[imgIdx].header;
    const nx = Number(h.NAXIS1);
    const ny = Number(h.NAXIS2);
    const hasWcs = typeof h.CRVAL1 === 'number' && typeof h.CRVAL2 === 'number';
    if (!hasWcs) {
      warnings.push(`${f.name}: missing CRVAL1/CRVAL2 WCS keywords; using tangent synthetic frame.`);
    }
    const wcs = hasWcs
      ? wcsFromHeader(h)
      : wcsFromHeader({ CRPIX1: (nx + 1) / 2, CRPIX2: (ny + 1) / 2, CRVAL1: 0, CRVAL2: 0, CD1_1: -6.15 / 3600, CD1_2: 0, CD2_1: 0, CD2_2: 6.15 / 3600 });
    const [raCen, decCen] = pix2sky(wcs, (nx + 1) / 2, (ny + 1) / 2);
    const det = Math.abs(wcs.cd[0] * wcs.cd[3] - wcs.cd[1] * wcs.cd[2]);
    const scaleArcsec = det > 0 ? Math.sqrt(det) * 3600 : 6.15;
    parsed.push({ name: f.name, u8: f.bytes, imgIdx, raCen, decCen, scaleArcsec, nx, ny });
  }

  if (!parsed.length) throw new Error('No readable 2D FITS images found in the selected files.');

  const ra0 = median(parsed.map((p) => p.raCen));
  const dec0 = median(parsed.map((p) => p.decCen));
  const medScale = Math.max(0.5, Math.min(30, Number(median(parsed.map((p) => p.scaleArcsec)).toFixed(3))));
  const medDim = Math.round(median(parsed.map((p) => Math.min(p.nx, p.ny))));
  const n = Math.max(32, Math.min(96, medDim % 2 === 0 ? medDim : medDim - 1));
  const grid: Grid = { ra: ra0, dec: dec0, n, scale: medScale };
  const px = n * n;
  const stride = Math.ceil(px / 8);

  const rawFrames: { f: Omit<Frame, 'k'>; bad: Uint8Array; flags: Record<number, string> }[] = [];
  parsed.forEach((p, idx) => {
    const hdus = parseFits(p.u8);
    const hImg = hdus[p.imgIdx];
    const h = hImg.header;
    const hFlag = hdus.find((x) => x.complete && x.name === 'FLAGS' && Number(x.header.NAXIS1) === p.nx);
    const hZodi = hdus.find((x) => x.complete && x.name === 'ZODI' && Number(x.header.NAXIS1) === p.nx);
    const hWave = hdus.find((x) => x.complete && x.name === 'WCS-WAVE');
    const wcs = typeof h.CRVAL1 === 'number'
      ? wcsFromHeader(h)
      : wcsFromHeader({ CRPIX1: (p.nx + 1) / 2, CRPIX2: (p.ny + 1) / 2, CRVAL1: 0, CRVAL2: 0, CD1_1: -medScale / 3600, CD1_2: 0, CD2_1: 0, CD2_2: medScale / 3600 });
    const aff = gridAffine(wcs, grid);
    const img = resampleBilinear(readFloat(p.u8, hImg), p.nx, p.ny, aff, n);
    if (hZodi) {
      const z = resampleBilinear(readFloat(p.u8, hZodi), p.nx, p.ny, aff, n);
      for (let i = 0; i < img.length; i++) img[i] -= z[i];
    }
    const flagNames = hFlag ? flagNamesFromHeader(hFlag.header) : {};
    const flags = hFlag ? resampleNearest(readInt(p.u8, hFlag), p.nx, p.ny, aff, n) : new Int32Array(px);
    let info = 0;
    let srcBit = 0;
    for (const [bit, nm] of Object.entries(flagNames)) {
      if (INFO_FLAGS.includes(nm)) info |= 1 << Number(bit);
      if (nm === 'SOURCE') srcBit = 1 << Number(bit);
    }
    const bad = new Uint8Array(px);
    const sky: number[] = [];
    const all: number[] = [];
    for (let i = 0; i < px; i++) {
      if (!Number.isFinite(img[i])) continue;
      if (flags[i] & ~info) bad[i] = 1;
      else {
        all.push(img[i]);
        if (!(flags[i] & srcBit)) sky.push(img[i]);
      }
    }
    const sample = sky.length > 50 ? sky : all;
    if (sample.length < 16) {
      warnings.push(`${p.name}: does not overlap the common tangent grid.`);
      return;
    }
    const alreadySubtracted = typeof h.ORIGIN === 'string' && h.ORIGIN.includes('Rendezvous');
    const bg = alreadySubtracted ? 0 : median(sample);
    const sigma = typeof h.NOISERMS === 'number' && (h.NOISERMS as number) > 0
      ? (h.NOISERMS as number)
      : Math.max(1e-6, 1.4826 * median(sample.map((v) => Math.abs(v - bg))));
    for (let i = 0; i < px; i++) img[i] -= bg;

    let cflags = 0;
    const c = Math.floor(n / 2);
    for (let j = Math.max(0, c - 2); j <= Math.min(n - 1, c + 2); j++)
      for (let i = Math.max(0, c - 2); i <= Math.min(n - 1, c + 2); i++) cflags |= flags[j * n + i];

    const rawDet = typeof h.DETECTOR === 'number' ? (h.DETECTOR as number) : Number(String(h.DETECTOR ?? '').replace(/\D/g, '')) || 0;
    let lam = NaN;
    let dlam = NaN;
    const specTab = hWave ? parseSpecWcs(p.u8, hWave) : SPEC_WCS[rawDet];
    if (specTab && (typeof h.CRPIX1W === 'number' || rawDet >= 1)) {
      const [px0, py0] = sky2pix(wcs, grid.ra, grid.dec);
      const X = Number(h.CRVAL1W ?? 1) + (px0 - Number(h.CRPIX1W ?? 1));
      const Y = Number(h.CRVAL2W ?? 1) + (py0 - Number(h.CRPIX2W ?? 1));
      if (X >= 1 && X <= 2048 && Y >= 1 && Y <= 2048) [lam, dlam] = lambdaAt(specTab, X, Y);
    }
    if (!Number.isFinite(lam)) [lam, dlam] = parseWavelengthUm(h, rawDet || 1);
    const det = bandForLam(lam, rawDet);
    const mjd = parseMjdFromHeader(h, idx);
    const fwhm = typeof h.PSF_FWHM === 'number' ? (h.PSF_FWHM as number) : Math.max(2 * medScale, [7.5, 7.5, 7.5, 8.6, 8.6, 9.0][det - 1]);
    // Compand & expand only if we want identical dynamic range handling; here keep full float32 precision in RAM!
    void compand;
    rawFrames.push({
      f: {
        mjd,
        year: mjdToYear(mjd),
        det,
        lam,
        dlam,
        bg,
        sigma,
        cflags,
        fwhm,
        obsid: String(h.OBSID ?? p.name.replace(/\.(fits|fit|fts)$/i, '')),
        proc: String(h.VERSION ?? 'FITS'),
        data: img,
      },
      bad,
      flags: flagNames,
    });
  });

  if (!rawFrames.length) throw new Error('None of the FITS images overlapped the field grid.');
  rawFrames.sort((a, b) => a.f.mjd - b.f.mjd);

  const frames: Frame[] = rawFrames.map((r, k) => ({ ...r.f, k }));
  const badBits = new Uint8Array(frames.length * stride);
  let mergedFlags: Record<number, string> = { 1: 'FLAGGED' };
  rawFrames.forEach((r, k) => {
    if (Object.keys(r.flags).length) mergedFlags = { ...mergedFlags, ...r.flags };
    for (let i = 0; i < px; i++) if (r.bad[i]) badBits[k * stride + (i >> 3)] |= 1 << (i & 7);
  });

  const objHeader = parseFits(parsed[0].u8)[parsed[0].imgIdx].header.OBJECT;
  const fieldName = label || (typeof objHeader === 'string' && objHeader.trim() ? objHeader.trim() : parsed[0].name.replace(/\.(fits|fit|fts)$/i, ''));
  const id = `local-${Date.now().toString(36)}`;

  // Attempt live astrometric source lookup via CORS-enabled SIMBAD TAP (silent fallback when offline)
  const gaia = await fetchSimbadField(grid).catch(() => [] as GaiaSrc[]);

  const target: Target = {
    id,
    name: fieldName,
    code: 'FITS',
    kind: `${frames.length} local FITS exposure${frames.length > 1 ? 's' : ''}`,
    tagline: 'Processed in-browser',
    blurb: 'Reprojected onto a common north-up tangent grid directly in the browser.',
    look: frames.length > 1 ? 'Blink exposures or visits, switch to Difference for dipoles, or click any source for photometry, radial PSF profile and astrometry.' : 'Single FITS frame loaded: click any source for radial PSF profile and aperture photometry, or load additional epochs to blink.',
    astrom: { ra: grid.ra, dec: grid.dec, epoch: frames[0].year, pmra: 0, pmdec: 0, plx: 0, ref: 'WCS field centre' },
    stats: [
      ['Exposures', String(frames.length), ''],
      ['Scale', medScale.toFixed(2), '"/px'],
      ['Field', (((n - 1) * medScale) / 60).toFixed(1), 'arcmin'],
    ],
  };

  return {
    pack: {
      id,
      target,
      grid,
      n,
      release: 'LOCAL FITS',
      built: new Date().toISOString().slice(0, 10),
      available: frames.length,
      flagNames: mergedFlags,
      frames,
      bad: badBits,
      stride,
      gaia,
      wise: [] as WiseSrc[],
      epochs: groupFrames(frames),
    },
    warnings,
  };
}

function groupFrames(frames: Frame[]): number[][] {
  if (frames.length <= 1) return frames.length ? [[0]] : [];
  const groups: number[][] = [];
  let cur: number[] = [];
  frames.forEach((f, i) => {
    if (i > 0 && f.mjd - frames[i - 1].mjd > 15) {
      groups.push(cur);
      cur = [];
    }
    cur.push(i);
  });
  if (cur.length) groups.push(cur);
  // If all exposures came from a single visit/night, split into individual exposures so blinking works immediately
  if (groups.length === 1 && frames.length <= 16) return frames.map((_, i) => [i]);
  return groups;
}

/* --------------------- Live field astrometry lookup --------------------- */

const simbadCache = new Map<string, Promise<GaiaSrc[]>>();

/** CORS-enabled SIMBAD TAP query (CfA mirror) for astrometric reference stars in any sky field. */
export function fetchSimbadField(grid: Grid): Promise<GaiaSrc[]> {
  const radDeg = Math.min(0.45, Math.max(0.05, ((grid.n * grid.scale) / 3600) * 0.72));
  const key = `${grid.ra.toFixed(3)},${grid.dec.toFixed(3)},${radDeg.toFixed(3)}`;
  let p = simbadCache.get(key);
  if (!p) {
    p = (async () => {
      const adql = `SELECT TOP 120 main_id, otype, ra, dec, pmra, pmdec, plx_value FROM basic WHERE 1=CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',${grid.ra.toFixed(5)},${grid.dec.toFixed(5)},${radDeg.toFixed(4)}))`;
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 8000);
      try {
        const res = await fetch(`https://simbad.cfa.harvard.edu/simbad/sim-tap/sync?request=doQuery&lang=adql&format=json&query=${encodeURIComponent(adql)}`, { signal: ctl.signal });
        if (!res.ok) return [];
        const j = (await res.json()) as { data?: [string, string, number, number, number | null, number | null, number | null][] };
        if (!Array.isArray(j.data)) return [];
        return j.data
          .filter((r) => typeof r[2] === 'number' && typeof r[3] === 'number')
          .filter((r) => {
            const [gi, gj] = skyToGrid(grid, r[2], r[3]);
            return gi >= -1 && gj >= -1 && gi <= grid.n && gj <= grid.n;
          })
          .map((r) => ({
            id: `${r[0]}${r[1] ? ` (${r[1]})` : ''}`,
            ra: r[2],
            dec: r[3],
            pmra: r[4] ?? 0,
            pmdec: r[5] ?? 0,
            plx: r[6] ?? 0,
            g: (Math.hypot(r[4] ?? 0, r[5] ?? 0) > 100 ? 11 : 15),
          }));
      } catch {
        return [];
      } finally {
        clearTimeout(to);
      }
    })();
    simbadCache.set(key, p);
  }
  return p;
}
