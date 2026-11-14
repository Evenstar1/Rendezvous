/* Live SPHEREx IRSA fetcher — browser-side, via pass-through CORS proxy. */
import { framesAdql, tapUrl, cutoutUrl, parseFramesCsv, fetchPrefix, processCutout, type ProcessedFrame, type Grid } from './spherex';
import { mjdToYear } from '../data/targets';
import { groupEpochs, type Frame, type Pack } from './packs';
import type { Target } from '../data/targets';

const PROXY = (import.meta.env.VITE_IRSA_PROXY_URL ?? '/.netlify/functions/irsa-proxy').trim();
const USE_PROXY = (import.meta.env.VITE_USE_IRSA_PROXY ?? 'true').toLowerCase() !== 'false';
const CAP = 48;
const CONC = 5;
import specWcsRaw from '../data/specwcs.json';
const SPEC_WCS = specWcsRaw as Record<number, any>;

export interface LiveProgress {
  done: number;
  total: number;
  pack: Pack | null;
}

export interface LiveResult {
  pack: Pack;
  framesFound: number;
  epochs: number;
}

export function irsaFetch(url: string, init?: RequestInit): Promise<Response> {
  if (!USE_PROXY || !PROXY) return fetch(url, init);
  return fetch(`${PROXY}?url=${encodeURIComponent(url)}`, init);
}

function stratified<T>(list: T[], cap: number, det: (t: T) => number): T[] {
  const out: T[] = [];
  const q = Math.ceil(cap / 6);
  for (let d = 1; d <= 6; d++) {
    const l = list.filter((x) => det(x) === d);
    if (l.length <= q) out.push(...l);
    else {
      const seen = new Set<number>();
      for (let k = 0; k < q; k++) seen.add(Math.round((k * (l.length - 1)) / Math.max(1, q - 1)));
      for (const i of seen) out.push(l[i]);
    }
  }
  return out;
}

function makeTarget(id: string, ra: number, dec: number, label?: string): Target {
  return {
    id,
    name: label && label !== 'Custom field' ? label : `Live SPHEREx field (${ra.toFixed(4)}, ${dec.toFixed(4)})`,
    code: 'LIVE',
    kind: 'SPHEREx live field',
    tagline: 'Fetched live from IRSA',
    blurb: 'Real SPHEREx Level-2 frames fetched live from NASA/IPAC IRSA for this position.',
    look: 'Use the same blink, difference, spectrum and photometry tools as the bundled fields.',
    astrom: { ra, dec, epoch: 2025.9, pmra: 0, pmdec: 0, plx: 0, ref: 'IRSA live' },
    stats: [],
  };
}

function releaseFromUri(uri: string): string {
  const m = /spherex\/([^/]+)\/level2/.exec(uri);
  return m ? m[1].toUpperCase() : 'SPHEREx L2';
}

function buildPack(id: string, ra: number, dec: number, n: number, scale: number, label: string | undefined, frames: { r: any; f: ProcessedFrame }[]): Pack {
  const px = n * n;
  const stride = Math.ceil(px / 8);
  const bits = new Uint8Array(frames.length * stride);
  const outFrames: Frame[] = frames.map(({ f }, k) => {
    for (let i = 0; i < px; i++) if (f.bad[i]) bits[k * stride + (i >> 3)] |= 1 << (i & 7);
    return {
      k,
      mjd: f.mjd,
      year: mjdToYear(f.mjd),
      det: f.det,
      lam: f.lam,
      dlam: f.dlam,
      bg: f.bg,
      sigma: f.sigma,
      cflags: f.cflags,
      fwhm: f.fwhm,
      obsid: f.obsid,
      proc: 'live',
      data: f.img,
    };
  });
  const flagNames = frames[0]?.f.flagNames ?? {};
  return {
    id,
    target: makeTarget(id, ra, dec, label),
    grid: { ra, dec, n, scale },
    n,
    release: releaseFromUri(frames[0]?.r?.uri ?? ''),
    built: new Date().toISOString().slice(0, 10),
    available: frames.length,
    flagNames,
    frames: outFrames,
    bad: bits,
    stride,
    gaia: [],
    wise: [],
    epochs: groupEpochs(outFrames),
  };
}

const cache = new Map<string, Promise<LiveResult>>();

export async function countLiveFrames(ra: number, dec: number, signal?: AbortSignal): Promise<number> {
  const adql = framesAdql(ra, dec);
  const res = await irsaFetch(tapUrl(adql, 'csv'), { signal });
  if (!res.ok) throw new Error(`IRSA TAP returned HTTP ${res.status}.`);
  const text = await res.text();
  return parseFramesCsv(text).length;
}

export function loadLivePack(
  ra: number,
  dec: number,
  fovDeg: number,
  opts: { signal?: AbortSignal; onProgress?: (done: number, total: number, pack: Pack | null) => void; label?: string } = {},
): Promise<LiveResult> {
  const key = `${ra.toFixed(6)}|${dec.toFixed(6)}|${fovDeg.toFixed(3)}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const run = (async (): Promise<LiveResult> => {
    const signal = opts.signal;
    const n = Math.max(32, Math.min(64, Math.round((fovDeg * 60) / 6.15)));
    const scale = 6.15;
    const grid: Grid = { ra, dec, n, scale };
    const cutPx = Math.ceil(n * 1.42) + 4;

    const adql = framesAdql(ra, dec);
    const tapRes = await irsaFetch(tapUrl(adql, 'csv'), { signal });
    if (!tapRes.ok) throw new Error(`IRSA TAP returned HTTP ${tapRes.status}.`);
    const text = await tapRes.text();
    let refs = parseFramesCsv(text);
    if (!refs.length) throw new Error('No SPHEREx coverage for this position in the current IRSA release.');

    if (refs.length > CAP) refs = stratified(refs, CAP, (r) => r.det);

    const good: { r: any; f: ProcessedFrame }[] = [];
    let done = 0;
    const total = refs.length;

    let next = 0;
    const workers = Array.from({ length: CONC }, async () => {
      while (next < refs.length) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        const i = next++;
        const r = refs[i];
        try {
          const u8 = await fetchPrefix(cutoutUrl(r.uri, ra, dec, cutPx), 200000, { signal });
          const f = processCutout(u8, grid, SPEC_WCS);
          if (f && f.cover >= 0.9 && Number.isFinite(f.lam)) {
            good.push({ r, f });
            good.sort((a, b) => a.f.mjd - b.f.mjd);
            const pack = buildPack(`live-${ra.toFixed(5)}-${dec.toFixed(5)}-${n}`, ra, dec, n, scale, opts.label, good);
            opts.onProgress?.(good.length, total, pack);
          }
        } catch (e) {
          if (signal?.aborted) throw e;
        } finally {
          done++;
          if (!signal?.aborted) opts.onProgress?.(Math.min(done, total), total, null);
        }
      }
    });
    await Promise.all(workers);
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    if (!good.length) throw new Error('SPHEREx frames were found, but none could be processed into a usable cutout for this position.');

    good.sort((a, b) => a.f.mjd - b.f.mjd);
    const pack = buildPack(`live-${ra.toFixed(5)}-${dec.toFixed(5)}-${n}`, ra, dec, n, scale, opts.label, good);
    return { pack, framesFound: refs.length, epochs: pack.epochs.length };
  })();
  cache.set(key, run);
  run.catch(() => cache.delete(key));
  return run;
}

