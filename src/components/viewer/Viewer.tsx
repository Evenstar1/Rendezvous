import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fmtDec, fmtRA } from '../../lib/coords';
import { buildSkyShots } from '../../lib/hips';
import { countLiveFrames, loadLivePack } from '../../lib/liveIrsa';
import { fetchSimbadField, ingestLocalFiles } from '../../lib/fitsWorkbench';
import { DETECTORS, buildShots, fieldFor, loadPack, photometry, registerPack, targetAt, type GaiaSrc, type Pack, type Phot, type Shot } from '../../lib/packs';
import { findMovers } from '../../lib/science';
import { applyOp, autoHi, type Stretch } from '../../lib/render';
import type { Grid } from '../../lib/spherex';
import type { View } from '../../state';
import { cn } from '../../utils/cn';
import { AcquireBar, Seg } from '../ui';
import { Meta } from './Charts';
import { Research } from './Research';
import { Controls } from './Controls';
import { Dossier } from './Dossier';
import { Filmstrip } from './Filmstrip';
import { Viewport } from './Viewport';

const SKY_N = 144;
const NO_SHOTS: Shot[] = [];
const NO_PHOT: Phot[] = [];
const SPEEDS = [0.5, 1, 2, 4, 8, 12];

interface Props {
  view: View;
  set: (p: Partial<View>) => void;
  acquire: (text: string) => Promise<{ ok: boolean; msg: string }>;
  toL2: () => void;
  toSky: () => void;
  onLoadPack: (p: Pack) => void;
  onGuide: () => void;
  embed?: boolean;
}

interface SkyState {
  shots: Shot[];
  status: 'loading' | 'ready' | 'error';
  done: number;
  total: number;
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function Transport({ shots, i, playing, onToggle, onSeek, fps, onFps }: { shots: Shot[]; i: number; playing: boolean; onToggle: () => void; onSeek: (i: number) => void; fps: number; onFps: (f: number) => void }) {
  const n = shots.length;
  const seekAt = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onSeek(Math.min(n - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * n))));
  };
  const speed = SPEEDS.indexOf(fps);
  const btn = 'grid h-11 w-11 shrink-0 place-items-center text-ink/75 transition-colors hover:bg-ink hover:text-black disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink/75';
  return (
    <div className="mt-3 border border-ink/20">
      <div className="flex items-stretch">
        <button type="button" className={btn} onClick={() => onSeek((i - 1 + n) % n)} disabled={n < 2} aria-label="Previous frame">
          <Icon d="M3 2h2v12H3zM14 2v12L6 8z" />
        </button>
        <button type="button" className={cn(btn, 'w-14 border-x border-ink/20 bg-ink text-black hover:bg-ink/80')} onClick={onToggle} disabled={n < 2} aria-label={playing ? 'Pause' : 'Play'} aria-pressed={playing}>
          <Icon d={playing ? 'M3 2h4v12H3zM9 2h4v12H9z' : 'M4 2l10 6-10 6z'} />
        </button>
        <button type="button" className={btn} onClick={() => onSeek((i + 1) % n)} disabled={n < 2} aria-label="Next frame">
          <Icon d="M11 2h2v12h-2zM2 2l8 6-8 6z" />
        </button>
        <div
          role="slider"
          tabIndex={0}
          aria-label="Frame"
          aria-valuemin={1}
          aria-valuemax={Math.max(1, n)}
          aria-valuenow={i + 1}
          aria-valuetext={shots[i]?.title ?? ''}
          className="flex min-w-0 flex-1 cursor-pointer touch-none items-end border-l border-ink/20 px-2 py-2 outline-offset-[-3px]"
          style={{ gap: n > 70 ? 0 : n > 30 ? 1 : 3 }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            seekAt(e);
          }}
          onPointerMove={(e) => {
            if (e.buttons & 1) seekAt(e);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
              e.preventDefault();
              onSeek((i + 1) % n);
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
              e.preventDefault();
              onSeek((i - 1 + n) % n);
            }
          }}
        >
          {shots.map((s, k) => (
            <span
              key={s.key}
              className="min-w-0 flex-1 transition-[height,opacity] duration-150"
              style={{ height: k === i ? '100%' : '45%', opacity: k === i ? 1 : 0.38, background: s.dets.length === 1 ? DETECTORS[s.dets[0] - 1].color : 'var(--color-ink)' }}
            />
          ))}
        </div>
        <div className="num grid w-[4.5rem] shrink-0 place-items-center border-l border-ink/20 text-sm">
          <span>
            {String(n ? i + 1 : 0).padStart(2, '0')}
            <span className="text-ink/70"> / {String(n).padStart(2, '0')}</span>
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-ink/20 pl-3">
        <p className="min-w-0 truncate py-2 text-[0.8125rem] text-ink/65">{shots[i]?.sub ?? ' '}</p>
        <div className="flex shrink-0 items-center border-l border-ink/20">
          <button type="button" className={cn(btn, 'h-10 w-10')} onClick={() => onFps(SPEEDS[Math.max(0, speed - 1)])} disabled={speed <= 0} aria-label="Slower">
            <Icon d="M3 7h10v2H3z" />
          </button>
          <span className="num w-14 text-center text-[0.8125rem]" aria-live="polite">
            {fps} fps
          </span>
          <button type="button" className={cn(btn, 'h-10 w-10')} onClick={() => onFps(SPEEDS[Math.min(SPEEDS.length - 1, speed + 1)])} disabled={speed >= SPEEDS.length - 1} aria-label="Faster">
            <Icon d="M3 7h4V3h2v4h4v2H9v4H7V9H3z" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function Viewer({ view, set, acquire, toL2, toSky, onLoadPack, onGuide, embed }: Props) {
  const sectionRef = useRef<HTMLElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const reduced = useMemo(() => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const [pack, setPack] = useState<Pack | null>(null);
  const [packErr, setPackErr] = useState(false);
const [sky, setSky] = useState<SkyState>({ shots: NO_SHOTS, status: 'loading', done: 0, total: 0 });
const [skyGaia, setSkyGaia] = useState<GaiaSrc[]>([]);
const [fitsMsg, setFitsMsg] = useState('');
const [livePack, setLivePack] = useState<Pack | null>(null);
const [liveLoading, setLiveLoading] = useState(false);
const [liveDone, setLiveDone] = useState(0);
const [liveTotal, setLiveTotal] = useState(0);
const [liveError, setLiveError] = useState<string | null>(null);
const [liveCancel, setLiveCancel] = useState<AbortController | null>(null);
const [livePrompt, setLivePrompt] = useState<{ count: number; mb: number } | null>(null);
const liveStartedRef = useRef<string | null>(null);
const liveFovRef = useRef(view.fovL2);
const liveRunIdRef = useRef(0);
const liveAbortRef = useRef<AbortController | null>(null);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(!reduced);
  const [visible, setVisible] = useState(true);
  const [probe, setProbe] = useState<{ i: number; j: number } | null>(null);
  const l2 = view.source === 'l2';
  const hasSnapshot = useMemo(() => !!fieldFor(view.ra, view.dec) || (!!livePack && livePack.id === view.targetId), [view.ra, view.dec, view.targetId, livePack]);

  const handleFiles = async (fileList: FileList | File[]) => {
    const arr = Array.from(fileList);
    if (!arr.length) return;
    setFitsMsg(`Processing ${arr.length} file${arr.length > 1 ? 's' : ''} in-browser…`);
    try {
      const inputs = await Promise.all(arr.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
      const { pack: imported, warnings } = await ingestLocalFiles(inputs);
      setPack(imported);
      onLoadPack(imported);
      setFitsMsg(warnings.length ? `Loaded ${imported.frames.length} exposure(s) (${warnings[0]})` : `Loaded ${imported.frames.length} exposure${imported.frames.length > 1 ? 's' : ''} (${imported.n}×${imported.n}, ${imported.grid.scale}"/px).`);
      setTimeout(() => setFitsMsg(''), 5000);
    } catch (err) {
      setFitsMsg(err instanceof Error ? err.message : 'Could not parse FITS file.');
    }
  };

  useEffect(() => {
    const openPicker = () => fileRef.current?.click();
    window.addEventListener('rv:import-fits', openPicker);
    return () => window.removeEventListener('rv:import-fits', openPicker);
  }, []);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((e) => setVisible(e[e.length - 1].isIntersecting), { threshold: 0.02 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Level-2 snapshot
  useEffect(() => {
    setProbe(null);
    if (!l2 || !view.targetId || view.targetId.startsWith('live-')) return;
    let alive = true;
    setPackErr(false);
    setPack((p) => (p && p.id === view.targetId ? p : null));
    loadPack(view.targetId)
      .then((p) => alive && setPack(p))
      .catch(() => alive && setPackErr(true));
    return () => {
      alive = false;
    };
  }, [l2, view.targetId]);

  // All-sky HiPS
const runLive = useCallback(async (fov = view.fovL2, force = false) => {
    liveAbortRef.current?.abort();
    const ac = new AbortController();
    liveAbortRef.current = ac;
    const runId = ++liveRunIdRef.current;
    setLiveCancel(ac);
    setLiveLoading(true);
    setLiveError(null);
    setLiveDone(0);
    setLiveTotal(0);
    setLivePrompt(null);
    liveFovRef.current = fov;
    let loadedAny = false;
    try {
      if (!force) {
        const count = await countLiveFrames(view.ra, view.dec, ac.signal);
        if (runId !== liveRunIdRef.current) return;
        if (count > 48) {
          setLivePrompt({ count, mb: Math.round(count * 4.1) });
          setLiveLoading(false);
          setLiveCancel(null);
          return;
        }
      }
      const { pack } = await loadLivePack(view.ra, view.dec, fov, {
        signal: ac.signal,
        label: view.label,
        onProgress: (done, total, p) => {
          if (runId !== liveRunIdRef.current) return;
          setLiveDone(done);
          setLiveTotal(total);
          if (p) {
            loadedAny = true;
            setLivePack(p);
            setPack(p);
            if (view.source !== 'l2') set({ source: 'l2', targetId: p.id, ra: view.ra, dec: view.dec, label: p.target.name, fovL2: fov, hi: null });
          }
        },
      });
      if (runId !== liveRunIdRef.current || ac.signal.aborted) return;
      setLivePack(pack);
      setPack(pack);
      registerPack(pack);
      onLoadPack(pack);
      set({ source: 'l2', targetId: pack.id, ra: view.ra, dec: view.dec, label: pack.target.name, fovL2: fov, hi: null });
    } catch (err) {
      if (runId !== liveRunIdRef.current || ac.signal.aborted) return;
      const msg = err instanceof Error ? err.message : 'Live SPHEREx fetch failed.';
      if (/TAP returned HTTP/i.test(msg)) setLiveError('IRSA is unreachable or returned an error. HiPS preview remains available.');
      else if (/No SPHEREx coverage/i.test(msg)) setLiveError('No SPHEREx coverage at this position in the current release.');
      else if (/none could be processed/i.test(msg)) setLiveError('SPHEREx frames were found, but the FITS cutouts could not be read (malformed or partial download).');
      else setLiveError(msg);
      if (!loadedAny) set({ source: 'sky' });
    } finally {
      if (runId === liveRunIdRef.current) {
        setLiveLoading(false);
        setLiveCancel(null);
      }
    }
  }, [view.ra, view.dec, view.fovL2, view.label, view.source, set, onLoadPack]);

  const skyGrid = useMemo<Grid>(() => ({ ra: view.ra, dec: view.dec, n: SKY_N, scale: (view.fovSky * 60) / SKY_N }), [view.ra, view.dec, view.fovSky]);
  useEffect(() => {
    setProbe(null);
  }, [view.ra, view.dec, view.source]);
  useEffect(() => {
    if (l2 || !view.ov.gaia) return;
    let alive = true;
    fetchSimbadField(skyGrid).then((rows) => alive && setSkyGaia(rows));
    return () => {
      alive = false;
    };
  }, [l2, view.ov.gaia, skyGrid]);
  useEffect(() => {
    if (l2) return;
    let alive = true;
    setSky({ shots: NO_SHOTS, status: 'loading', done: 0, total: 0 });
    const t = setTimeout(() => {
      buildSkyShots(
        skyGrid,
        view.skyMode,
        view.surveys,
        view.channel,
        (done, total) => alive && setSky((s) => ({ ...s, done, total })),
        () => alive,
      )
        .then((shots) => alive && setSky({ shots, status: shots.length ? 'ready' : 'error', done: 1, total: 1 }))
        .catch(() => alive && setSky({ shots: NO_SHOTS, status: 'error', done: 0, total: 0 }));
    }, 220);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [l2, skyGrid, view.skyMode, view.surveys, view.channel]);

  useEffect(() => {
    const blind = new URLSearchParams(window.location.search || window.location.hash.replace(/^#/, '')).get('blind') === '1';
    if (blind && view.label === 'Blind Mission' && playing) {
      const name = window.sessionStorage.getItem('rv-blind-name');
      if (name) set({ label: name });
    }
  }, [playing, view.label, set]);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search || window.location.hash.replace(/^#/, ''));
    const key = `${view.ra.toFixed(5)}|${view.dec.toFixed(5)}|${view.fovL2}`;
    if ((view.liveRequested || q.get('live') === '1') && !liveLoading && liveStartedRef.current !== key) {
      liveStartedRef.current = key;
      void runLive(view.fovL2);
    }
  }, [view.ra, view.dec, view.fovL2, liveLoading, runLive]);

  useEffect(() => {
    if (livePack && view.fovL2 !== liveFovRef.current && !liveLoading) {
      liveFovRef.current = view.fovL2;
      void runLive(view.fovL2);
    }
  }, [view.fovL2, livePack, liveLoading, runLive]);

  const activePack = l2 && pack && pack.id === view.targetId
    ? pack
    : l2 && livePack && livePack.id === view.targetId
      ? livePack
      : null;
  const l2Shots = useMemo(() => (activePack ? buildShots(activePack, view.seq, view.dets) : NO_SHOTS), [activePack, view.seq, view.dets]);
  const shots = l2 ? l2Shots : sky.shots;
  const grid = l2 ? activePack?.grid : skyGrid;
  const fovPx = l2 && activePack ? Math.min(activePack.n, (view.fovL2 * 60) / activePack.grid.scale) : SKY_N;

  const seekRef = useRef<number | null>(null);
  useEffect(() => {
    const target = seekRef.current;
    seekRef.current = null;
    setIdx(target === null ? 0 : Math.max(0, Math.min(target, shots.length - 1)));
  }, [shots]);
  const gotoEpoch = (e: number) => {
    seekRef.current = e;
    if (view.seq !== 'epoch') set({ seq: 'epoch', op: 'image' });
    else setIdx(Math.max(0, Math.min(e, shots.length - 1)));
  };
  const i = shots.length ? Math.min(idx, shots.length - 1) : 0;
  const shot = shots[i] ?? null;

  useEffect(() => {
    if (!playing || !visible || shots.length < 2) return;
    const id = setInterval(() => setIdx((v) => (v + 1) % shots.length), 1000 / view.fps);
    return () => clearInterval(id);
  }, [playing, visible, shots.length, view.fps]);

  const plane = useMemo(() => (shots.length ? applyOp(shots, i, view.op, view.ref) : null), [shots, i, view.op, view.ref]);
  const auto = useMemo(() => {
    if (!shots.length || shots[0].unit === 'display') return 60;
    if (view.op === 'diff') return 40;
    return autoHi(shots[shots.length > 2 ? 1 : 0], 'MJy/sr');
  }, [shots, view.op]);
  const hi = view.hi ?? auto;
  const sigma = useMemo(() => {
    if (!plane || !shot || shot.unit === 'display') return 1;
    if (view.op === 'image' && view.seq === 'epoch') {
      const s = shots.map((x) => x.sigma).sort((a, b) => a - b);
      return s[s.length >> 1];
    }
    return plane.sigma;
  }, [plane, shot, shots, view.op, view.seq]);
  const stretch = useMemo<Stretch>(
    () => ({ cmap: view.cmap, hi, sigma, diff: view.op === 'diff', unit: shot?.unit ?? 'MJy/sr', flags: view.ov.flags && l2, fn: view.stretchFn, bias: view.bias }),
    [view.cmap, hi, sigma, view.op, shot?.unit, view.ov.flags, l2, view.stretchFn, view.bias],
  );

  const phot = useMemo(
    () => (activePack ? photometry(activePack, probe ? () => [probe.i, probe.j] : (y) => targetAt(activePack, y), { ap: view.aperture, ann: view.annulus, apCorr: view.apCorr }) : NO_PHOT),
    [activePack, probe, view.aperture, view.annulus, view.apCorr],
  );
  const movers = useMemo(() => (activePack ? findMovers(activePack, view.dets, view.moverSn) : []), [activePack, view.dets, view.moverSn]);

  useEffect(() => {
    const h = () => {
      const cv = sectionRef.current?.querySelector('canvas');
      if (!cv) return;
      const a = document.createElement('a');
      a.href = (cv as HTMLCanvasElement).toDataURL('image/png');
      a.download = `rendezvous-${activePack?.id ?? 'sky'}-${(shot?.title ?? 'frame').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
      a.click();
    };
    window.addEventListener('rv:png', h);
    return () => window.removeEventListener('rv:png', h);
  }, [activePack, shot?.title]);

  const status: 'ready' | 'loading' | 'error' = l2
    ? activePack
      ? shots.length
        ? 'ready'
        : 'error'
      : liveLoading
        ? 'loading'
        : liveError || packErr
          ? 'error'
          : 'loading'
    : sky.status;
  const statusText = l2
    ? activePack
      ? (livePack && livePack.id === activePack.id ? 'SPHEREx live' : 'No exposures in the selected detector bands. Enable more bands.')
      : liveLoading
        ? `HiPS preview while SPHEREx loads: ${liveDone} / ${liveTotal || '?'}`
        : liveError
          ? `${liveError} HiPS preview remains visible.`
          : packErr
            ? 'The bundled snapshot could not be unpacked in this browser.'
            : 'Unpacking SPHEREx Level-2 exposures.'
    : sky.status === 'error'
      ? 'Could not pull HiPS tiles for this position from IRSA. Check your connection, or load one of the five mission targets: their data is on board and needs no network.'
      : `Pulling HiPS tiles from IRSA${sky.total ? `: layer ${Math.min(sky.total, sky.done + 1)} of ${sky.total}` : ''}.`;
  const opLabel =
    view.op === 'diff'
      ? `Difference · minus ${view.ref === 'prev' ? 'previous frame' : view.ref === 'first' ? 'first frame' : 'mean of the rest'}`
      : view.op === 'stack'
        ? `Running stack · ${i + 1} frame${i ? 's' : ''}`
        : l2
          ? view.seq === 'epoch'
            ? 'Epoch co-add'
            : view.seq === 'sweep'
              ? 'Spectral channel'
              : 'Single exposure'
          : view.skyMode === 'legacy'
            ? 'Mission blink'
            : 'Cube channel';

  const centre = grid ?? skyGrid;
  const target = activePack?.target ?? null;
  const targetLabel = target?.name ?? (view.label || 'All-sky field');
  const bandLabel = shot
    ? [shot.dets.map((d) => `D${d}`).join(' '), shot.lam ? `${shot.lam.toFixed(3)} µm` : ''].filter(Boolean).join(' · ')
    : 'BAND —';
  const firstFrame = activePack && shot?.members.length ? activePack.frames[shot.members[0]] : null;
  const obsid = firstFrame?.obsid ?? null;
  const mjdText = shot?.mjd
    ? shot.mjd[0] === shot.mjd[1]
      ? shot.mjd[0].toFixed(3)
      : `${shot.mjd[0].toFixed(3)}–${shot.mjd[1].toFixed(3)}`
    : null;
  const statusItems: [string, string][] = [
    obsid ? ['OBSID', obsid] : shot ? ['FRAME ID', shot.key.toUpperCase()] : ['FRAME ID', '—'],
    ...(mjdText ? ([['MJD', mjdText]] as [string, string][]) : []),
    ['BAND', bandLabel],
    ['FOV', `${l2 ? view.fovL2 : view.fovSky}′`],
    ['FRAME', shots.length ? `${i + 1} / ${shots.length}` : '—'],
  ];

  return (
    <section id="viewer" ref={sectionRef} className={cn('bg-black', embed ? 'py-6' : 'border-t border-ink/10 pb-20 pt-24 lg:pb-28 lg:pt-32')}>
      <div className="wrap">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:items-end">
          <div className="min-w-0">
            <p className="eyebrow text-ink/80">
              <span className="num text-ink">01</span>
              <span className="mx-3 inline-block h-px w-8 bg-ink/40 align-middle" />
              Blink viewer
            </p>
            <h2 className="display mt-5 text-[clamp(2.1rem,5vw,4.25rem)]">{view.label}</h2>
            <p className="num mt-4 flex flex-wrap gap-x-6 gap-y-1 text-[0.9375rem] text-ink/70">
              <span>
                <span className="text-ink/70">RA</span> {fmtRA(centre.ra)}
              </span>
              <span>
                <span className="text-ink/70">DEC</span> {fmtDec(centre.dec)}
              </span>
              <span className="text-ink/70">ICRS · {target ? `${target.kind}` : 'all-sky field'}</span>
            </p>
          </div>
          <div>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".fits,.fit,.fts,.json"
              className="sr-only"
              onChange={(e) => {
                if (e.target.files?.length) handleFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <AcquireBar onAcquire={acquire} compact />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Seg
                className="w-52"
                label="Interface mode"
                value={view.mode}
                onChange={(mode) => set({ mode })}
                options={[
                  { value: 'guided', label: 'Guided' },
                  { value: 'research', label: 'Research' },
                ]}
              />
              <button type="button" onClick={onGuide} className="micro min-h-10 border border-ink/25 px-3 text-ink/75 transition-colors hover:border-ink hover:bg-ink hover:text-black">
                Science guide
              </button>
              <span className="micro hidden text-ink/65 sm:inline">⌘K actions</span>
            </div>
            {fitsMsg && <p role="status" className="mt-2 text-xs text-signal">{fitsMsg}</p>}
            {(!hasSnapshot || liveLoading || livePrompt || liveError) && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {livePrompt && (
                  <span className="text-xs text-ink/75">
                    {livePrompt.count} images found, about {livePrompt.mb} MB. Load anyway?
                  </span>
                )}
                {(livePrompt || (!hasSnapshot && !liveLoading)) && (
                  <button type="button" onClick={() => { setLivePrompt(null); void runLive(view.fovL2, true); }} disabled={liveLoading} className="micro min-h-10 border border-ink/25 px-3 text-ink/75 transition-colors hover:border-ink hover:bg-ink hover:text-black disabled:opacity-50">
                    {livePrompt ? 'Load anyway' : 'Load SPHEREx data (live)'}
                  </button>
                )}
                {liveLoading && (
                  <button type="button" onClick={() => liveCancel?.abort()} className="micro min-h-10 border border-ink/25 px-3 text-ink/75 transition-colors hover:border-ink hover:bg-ink hover:text-black">
                    Cancel
                  </button>
                )}
                {liveError && (
                  <button type="button" onClick={() => void runLive(view.fovL2, true)} className="micro min-h-10 border border-ink/25 px-3 text-ink/75 transition-colors hover:border-ink hover:bg-ink hover:text-black">
                    Retry
                  </button>
                )}
                {liveError && <p role="status" className="text-xs text-signal">{liveError}</p>}
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-5 xl:grid-cols-12 xl:items-start">
          <aside className="order-2 min-w-0 xl:order-1 xl:col-span-3">
            <Dossier pack={activePack} target={target} label={targetLabel} ra={centre.ra} dec={centre.dec} loading={status === 'loading'} />
          </aside>

          <div className="order-1 flex min-w-0 flex-col xl:order-2 xl:col-span-6">
            <div className="statusbar" aria-label="Frame status">
              {statusItems.map(([k, v], n) => (
                <span key={k} className="flex items-baseline gap-2 whitespace-nowrap">
                  {n > 0 && <span aria-hidden="true" className="status-sep" />}
                  <span className="status-key">{k}</span>
                  <b>{v}</b>
                </span>
              ))}
            </div>

            <div className="mt-2 flex min-h-0 flex-1 items-center justify-center w-full xl:min-h-[70svh]">
              {grid ? (
                <div className="w-full max-w-[min(100%,70svh)] mx-auto">
                  <Viewport
                    plane={status === 'ready' ? plane : null}
                    shot={shot}
                    grid={grid}
                    fovPx={fovPx}
                    stretch={stretch}
                    smooth={view.smooth}
                    pack={activePack}
                    ov={view.ov}
                    query={view}
                    probe={probe}
                    onProbe={status === 'ready' ? setProbe : null}
                    onKey={(k) => (k === 'toggle' ? setPlaying((p) => !p) : shots.length && setIdx((i + (k === 'next' ? 1 : shots.length - 1)) % shots.length))}
                    status={status}
                    statusText={statusText}
                    progress={liveLoading ? (liveTotal ? liveDone / liveTotal : 0) : sky.total ? sky.done / sky.total : 0}
                    opLabel={opLabel}
                    showGrid={view.tools.grid}
                    measure={view.tools.measure}
                    movers={movers}
                    showMovers={view.tools.movers && l2}
                    aperturePx={view.aperture}
                    skyGaia={skyGaia}
                    onDropFiles={handleFiles}
                    targetLabel={targetLabel}
                    bandLabel={bandLabel}
                    frameNo={shots.length ? i + 1 : 0}
                    frameTotal={shots.length}
                  />
                </div>
              ) : (
                <div className="hud-corners relative grid aspect-square w-full place-items-center border border-line">
                  <p className={cn('eyebrow', packErr && 'text-signal')}>{packErr ? 'No signal' : 'Acquiring'}</p>
                </div>
              )}
            </div>
            <Filmstrip shots={shots} index={i} onSeek={(k) => setIdx(k)} />
            <Transport shots={shots} i={i} playing={playing && shots.length > 1} onToggle={() => setPlaying((p) => !p)} onSeek={(k) => setIdx(k)} fps={view.fps} onFps={(fps) => set({ fps })} />
          </div>

          <aside className="order-3 min-w-0 xl:col-span-3 xl:sticky xl:top-24">
            <div className="panel deck max-h-[calc(100vh-7rem)] overflow-y-auto thin-scroll p-4">
              <Controls view={view} set={set} pack={activePack} hasSnapshot={hasSnapshot} toL2={toL2} toSky={toSky} hi={hi} onGuide={onGuide} onImportFits={() => fileRef.current?.click()} />
            </div>
          </aside>
        </div>

        <div className="mt-14 grid gap-12 border-t border-ink/12 pt-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] xl:gap-14">
          <Research
            pack={activePack}
            phot={phot}
            shot={shot}
            shots={shots}
            plane={plane}
            grid={centre}
            onGotoEpoch={gotoEpoch}
            onInspect={(m) => {
              seekRef.current = m.e1;
              setProbe({ i: m.x, j: m.y });
              set({ seq: 'epoch', op: 'image' });
              setIdx(Math.max(0, m.e1));
              sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            onResetProbe={() => setProbe(null)}
            probe={probe}
            view={view}
            set={set}
            sky={l2 ? null : view.skyMode}
            onGuide={onGuide}
          />
          <Meta shot={shot} plane={plane} grid={grid} pack={activePack} label={view.label} />
        </div>
      </div>
    </section>
  );
}
