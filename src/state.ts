/* View state for the blink viewer, mirrored to the URL so any view can be linked or embedded. */
import { useCallback, useEffect, useState } from 'react';
import { TARGETS, fieldCentre } from './data/targets';
import { matchTarget, parseCoords, resolveName } from './lib/coords';
import type { SkyMode } from './lib/hips';
import { fieldFor, listCustomTargets, registerPack, type Pack, type SeqMode } from './lib/packs';
import type { Cmap, Op, Ref, StretchFn } from './lib/render';

export interface Overlays {
  track: boolean;
  gaia: boolean;
  wise: boolean;
  flags: boolean;
  reticle: boolean;
}

export type Mode = 'guided' | 'research';
export type FluxUnit = 'mJy' | 'ujy';

export interface View {
  mode: Mode;
  units: FluxUnit;
  aperture: number;
  annulus: [number, number];
  apCorr: boolean;
  stretchFn: StretchFn;
  bias: number;
  moverSn: number;
  tools: { grid: boolean; measure: boolean; movers: boolean };
  source: 'l2' | 'sky';
  liveRequested: boolean;
  targetId: string | null;
  /** requested coordinates: field centre in all-sky mode, a marker inside a snapshot field */
  ra: number;
  dec: number;
  label: string;
  fovL2: number;
  fovSky: number;
  seq: SeqMode;
  skyMode: SkyMode;
  dets: number[];
  surveys: string[];
  channel: number;
  op: Op;
  ref: Ref;
  cmap: Cmap;
  hi: number | null;
  smooth: boolean;
  ov: Overlays;
  fps: number;
}

const ALL = [1, 2, 3, 4, 5, 6];
/** Detectors that show each target best (others stay one click away). */
const TARGET_DETS: Record<string, number[]> = { barnard: [5, 6], w0855: [6] };
export const FOV_L2 = [2, 3, 4, 5.7];
export const FOV_SKY = [6, 12, 24, 48];

function targetView(id: string): Partial<View> {
  const t = [...listCustomTargets(), ...TARGETS].find((x) => x.id === id) ?? TARGETS[0];
  const [ra, dec] = fieldCentre(t);
  return { source: 'l2', targetId: t.id, ra, dec, label: t.name, dets: TARGET_DETS[t.id] ?? ALL, seq: 'epoch', op: 'image', hi: null, liveRequested: false };
}

function coordView(ra: number, dec: number, label?: string): Partial<View> {
  const t = fieldFor(ra, dec);
  if (t) return { ...targetView(t.id), ra, dec };
  return { source: 'sky', targetId: null, ra, dec, label: label ?? 'Custom field', op: 'image', hi: null };
}

const DEFAULT: View = {
  source: 'l2',
  liveRequested: false,
  targetId: 'barnard',
  ra: 0,
  dec: 0,
  label: '',
  dets: ALL,
  seq: 'epoch',
  op: 'image',
  ...targetView('barnard'),
  fovL2: 5.7,
  fovSky: 12,
  skyMode: 'legacy',
  surveys: ['2mk', 'w1', 'spx'],
  channel: 63,
  ref: 'prev',
  cmap: 'ironbow',
  hi: null,
  smooth: true,
  mode: 'guided',
  units: 'mJy',
  aperture: 1.8,
  annulus: [4, 6.5],
  apCorr: true,
  stretchFn: 'asinh',
  bias: 0,
  moverSn: 5,
  tools: { grid: false, measure: false, movers: false },
  ov: { track: true, gaia: false, wise: false, flags: false, reticle: true },
  fps: 2,
};

const pick = <T extends string>(v: string | null, allowed: readonly T[]): T | null => (v && (allowed as readonly string[]).includes(v) ? (v as T) : null);

function params(): URLSearchParams {
  try {
    return new URLSearchParams(window.location.search || window.location.hash.replace(/^#/, ''));
  } catch {
    return new URLSearchParams();
  }
}

function fromUrl(): View {
  let v: View = { ...DEFAULT };
  const q = params();
const t = q.get('target') ?? q.get('t');
if (t && TARGETS.some((x) => x.id === t)) v = { ...v, ...targetView(t) };
  const ra = Number(q.get('ra'));
  const dec = Number(q.get('dec'));
  if (q.has('ra') && q.has('dec') && Number.isFinite(ra) && Number.isFinite(dec) && ra >= 0 && ra < 360 && Math.abs(dec) <= 90) v = { ...v, ...coordView(ra, dec, q.get('name') ?? undefined) };
  if (q.get('src') === 'sky') v = { ...v, source: 'sky', targetId: v.targetId };
v.liveRequested = q.get('live') !== '0';
if (q.get('live') === '1') v = { ...v, source: v.source };
  const fov = Number(q.get('fov'));
  if (fov > 0) {
    if (v.source === 'l2') v.fovL2 = FOV_L2.reduce((a, b) => (Math.abs(b - fov) < Math.abs(a - fov) ? b : a));
    else v.fovSky = FOV_SKY.reduce((a, b) => (Math.abs(b - fov) < Math.abs(a - fov) ? b : a));
  }
  v.seq = pick(q.get('seq'), ['epoch', 'sweep', 'frames'] as const) ?? v.seq;
  v.skyMode = pick(q.get('seq'), ['legacy', 'sweep'] as const) ?? v.skyMode;
  const det = (q.get('det') ?? '').split('').map(Number).filter((d) => d >= 1 && d <= 6);
  if (det.length) v.dets = [...new Set(det)].sort();
  v.op = pick(q.get('op'), ['image', 'diff', 'stack'] as const) ?? v.op;
  v.ref = pick(q.get('ref'), ['prev', 'first', 'mean'] as const) ?? v.ref;
  v.cmap = pick(q.get('cmap'), ['gray', 'ember', 'invert', 'ironbow', 'ice'] as const) ?? v.cmap;
  const fps = Number(q.get('fps'));
  if (fps >= 0.5 && fps <= 12) v.fps = fps;
  const ch = Number(q.get('ch'));
  if (q.has('ch') && ch >= 1 && ch <= 102) v.channel = Math.round(ch) - 1;
  v.mode = pick(q.get('mode'), ['guided', 'research'] as const) ?? v.mode;
  v.units = pick(q.get('units'), ['mJy', 'ujy'] as const) ?? v.units;
  v.stretchFn = pick(q.get('st'), ['asinh', 'linear', 'log'] as const) ?? v.stretchFn;
  const ap = Number(q.get('ap'));
  if (ap >= 1 && ap <= 4) v.aperture = ap;
  if (q.has('apcorr')) v.apCorr = q.get('apcorr') !== '0';
  const bias = Number(q.get('bias'));
  if (Number.isFinite(bias) && Math.abs(bias) <= 0.4) v.bias = bias;
  const sn = Number(q.get('sn'));
  if (sn >= 3 && sn <= 9) v.moverSn = sn;
  if (q.has('grid')) v.tools = { ...v.tools, grid: q.get('grid') === '1' };
  if (q.has('movers')) v.tools = { ...v.tools, movers: q.get('movers') === '1' };
  if (q.has('ov')) {
    const on = (q.get('ov') ?? '').split(',');
    v.ov = { track: on.includes('track'), gaia: on.includes('gaia'), wise: on.includes('wise'), flags: on.includes('flags'), reticle: !on.includes('noreticle') };
  }
  return v;
}

export function toQuery(v: View): string {
  const q = new URLSearchParams();
  q.set('ra', v.ra.toFixed(5));
  q.set('dec', v.dec.toFixed(5));
  q.set('fov', String(v.source === 'l2' ? v.fovL2 : v.fovSky));
  if (v.source === 'sky') {
    q.set('src', 'sky');
    q.set('seq', v.skyMode);
    if (v.channel !== DEFAULT.channel) q.set('ch', String(v.channel + 1));
    if (v.label && v.label !== 'Custom field') q.set('name', v.label);
  } else {
    q.set('seq', v.seq);
    q.set('det', v.dets.join(''));
  }
  if (v.op !== 'image') q.set('op', v.op);
  if (v.op === 'diff' && v.ref !== 'prev') q.set('ref', v.ref);
  if (v.cmap !== DEFAULT.cmap) q.set('cmap', v.cmap);
  if (v.fps !== DEFAULT.fps) q.set('fps', String(v.fps));
  if (v.mode !== DEFAULT.mode) q.set('mode', v.mode);
  if (v.units !== 'mJy') q.set('units', v.units);
  if (v.stretchFn !== 'asinh') q.set('st', v.stretchFn);
  if (Math.abs(v.bias) > 0.001) q.set('bias', v.bias.toFixed(2));
  if (v.aperture !== DEFAULT.aperture) q.set('ap', String(v.aperture));
  if (!v.apCorr) q.set('apcorr', '0');
  if (v.moverSn !== DEFAULT.moverSn) q.set('sn', String(v.moverSn));
  if (v.tools.grid) q.set('grid', '1');
  if (v.tools.movers) q.set('movers', '1');
  const ov = [v.ov.track && 'track', v.ov.gaia && 'gaia', v.ov.wise && 'wise', v.ov.flags && 'flags', !v.ov.reticle && 'noreticle'].filter(Boolean).join(',');
  if (ov !== 'track') q.set('ov', ov);
  if (v.source === 'l2' && v.targetId) q.set('target', v.targetId);
if (v.targetId?.startsWith('live-')) q.set('live', '1');
q.set('live', v.liveRequested ? '1' : '0');
return q.toString();
}

export const isEmbed = () => params().get('embed') === '1';

export function useView() {
  const [view, setView] = useState<View>(fromUrl);
  const set = useCallback((patch: Partial<View>) => setView((v) => ({ ...v, ...patch })), []);

  useEffect(() => {
    const id = setTimeout(() => {
      try {
        const q = toQuery(view) + (isEmbed() ? '&embed=1' : '');
        window.history.replaceState(null, '', `${window.location.pathname}?${q}`);
      } catch {
        /* sandboxed frames may forbid history access — the view still works */
      }
    }, 250);
    return () => clearTimeout(id);
  }, [view]);

  const selectTarget = useCallback((id: string) => set(targetView(id)), [set]);

  /** Coordinates → mission-target alias → CDS name resolver. */
  const acquire = useCallback(
    async (text: string): Promise<{ ok: boolean; msg: string }> => {
      const input = text.trim();
      if (!input) return { ok: false, msg: 'Enter coordinates or an object name.' };
const c = parseCoords(input);
if (c) {
  const bundled = !!fieldFor(c.ra, c.dec);
  set({ ...coordView(c.ra, c.dec), liveRequested: !bundled });
  return { ok: true, msg: '' };
}
const id = matchTarget(input);
if (id) {
  set({ ...targetView(id), liveRequested: false });
  return { ok: true, msg: '' };
}
const r = await resolveName(input);
if (r) {
  const bundled = !!fieldFor(r.ra, r.dec);
  set({ ...coordView(r.ra, r.dec, input), liveRequested: !bundled });
  return { ok: true, msg: '' };
}
      return { ok: false, msg: `Could not resolve “${input}”. The name service may be unreachable. Try coordinates, like 17h57m47s +04d46m05s.` };
    },
    [set],
  );

  const toSky = useCallback(() => set({ source: 'sky', op: 'image', hi: null }), [set]);
  const toL2 = useCallback(() => setView((v) => (v.targetId?.startsWith('live-') ? { ...v, source: 'l2' } : { ...v, ...coordView(v.ra, v.dec, v.label) })), []);
  const loadCustomPack = useCallback(
    (pack: Pack) => {
      registerPack(pack);
      const presentDets = [...new Set(pack.frames.map((f) => f.det))].sort();
      set({
        source: 'l2',
        targetId: pack.id,
        ra: pack.grid.ra,
        dec: pack.grid.dec,
        label: pack.target.name,
        dets: presentDets.length ? presentDets : ALL,
        seq: pack.epochs.length > 1 ? 'epoch' : 'frames',
        op: 'image',
        hi: null,
      });
    },
    [set],
  );

  return { view, set, acquire, selectTarget, toL2, toSky, loadCustomPack };
}
