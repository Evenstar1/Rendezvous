import { useEffect, useMemo, useRef, useState } from 'react';
import { positionAt } from '../../data/targets';
import { fmtDec, fmtRA, sepArcsec } from '../../lib/coords';
import { CATWISE_EPOCH, GAIA_EPOCH } from '../../lib/epochs';
import { targetAt, type GaiaSrc, type Pack, type Shot } from '../../lib/packs';
import type { Mover } from '../../lib/science';
import { paint, type Plane, type Stretch } from '../../lib/render';
import { gridToSky, skyToGrid, type Grid } from '../../lib/spherex';
import type { Overlays } from '../../state';
import { cn } from '../../utils/cn';
import { useWidth } from '../ui';

interface Props {
  plane: Plane | null;
  shot: Shot | null;
  grid: Grid;
  fovPx: number;
  stretch: Stretch;
  smooth: boolean;
  pack: Pack | null;
  ov: Overlays;
  query: { ra: number; dec: number };
  probe: { i: number; j: number } | null;
  onProbe: ((p: { i: number; j: number }) => void) | null;
  onKey: (k: 'toggle' | 'next' | 'prev') => void;
  status: 'ready' | 'loading' | 'error';
  statusText: string;
  progress: number;
  opLabel: string;
  showGrid: boolean;
  measure: boolean;
  movers: Mover[];
  showMovers: boolean;
  aperturePx?: number;
  skyGaia?: GaiaSrc[];
  onDropFiles?: (files: FileList) => void;
  targetLabel: string;
  bandLabel: string;
  frameNo: number;
  frameTotal: number;
}

const BARS = [5, 10, 20, 30, 60, 120, 300, 600, 1200];

export function Viewport({
  plane,
  shot,
  grid,
  fovPx,
  stretch,
  smooth,
  pack,
  ov,
  query,
  probe,
  onProbe,
  onKey,
  status,
  statusText,
  progress,
  opLabel,
  showGrid,
  measure,
  movers,
  showMovers,
  aperturePx = 1.8,
  skyGaia,
  onDropFiles,
  targetLabel,
  bandLabel,
  frameNo,
  frameTotal,
}: Props) {
  const [boxRef, box] = useWidth<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offRef = useRef<HTMLCanvasElement | null>(null);
  const [hover, setHover] = useState<{ ra: number; dec: number; value: number; flagged: boolean; offset: string } | null>(null);
  const [m0, setM0] = useState<{ i: number; j: number } | null>(null);
  const [seg, setSeg] = useState<{ a: { i: number; j: number }; b: { i: number; j: number }; dist: number; pa: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const n = grid.n;
  const s0 = n / 2 - fovPx / 2;
  const px = (i: number) => ((i + 0.5 - s0) / fovPx) * box;

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !plane || !box) return;
    const size = Math.max(64, Math.round(box * Math.min(2, window.devicePixelRatio || 1)));
    if (cv.width !== size) {
      cv.width = size;
      cv.height = size;
    }
    const off = offRef.current ?? (offRef.current = document.createElement('canvas'));
    if (off.width !== n) {
      off.width = n;
      off.height = n;
    }
    const octx = off.getContext('2d');
    const ctx = cv.getContext('2d');
    if (!octx || !ctx) return;
    octx.putImageData(paint(plane, n, stretch), 0, 0);
    ctx.imageSmoothingEnabled = smooth;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(off, s0, s0, fovPx, fovPx, 0, 0, size, size);
  }, [plane, n, s0, fovPx, stretch, smooth, box]);

  // Catalog overlays — recomputed per shot so Gaia / SIMBAD markers follow proper motion.
  const marks = useMemo(() => {
    if (!shot || !box) return null;
    const year = shot.year;
    if (!pack) {
      const gaia =
        ov.gaia && skyGaia
          ? skyGaia.map((g) => {
              const [ra, dec] = positionAt({ ...g, epoch: 2000, ref: '' }, year);
              const [i, j] = skyToGrid(grid, ra, dec);
              return { x: px(i), y: px(j), bright: g.g < 14, id: g.id };
            })
          : [];
      return { gaia, wise: [] as { x: number; y: number; k: number }[], track: null as [number, number][] | null, years: [] as { x: number; y: number; label: string }[], start: null as { x: number; y: number; label: string } | null, target: { x: box / 2, y: box / 2 }, query: null as { x: number; y: number } | null };
    }
    const gaia = ov.gaia
      ? pack.gaia.map((g) => {
          const [ra, dec] = positionAt({ ...g, epoch: GAIA_EPOCH, ref: '' }, year);
          const [i, j] = skyToGrid(grid, ra, dec);
          return { x: px(i), y: px(j), bright: g.g < 14, id: g.id };
        })
      : [];
    const wise = ov.wise
      ? pack.wise.map((w, k) => {
          /* CatWISE2020 positions are at 2015.4; carry them to this frame's epoch
             with the catalogue proper motion instead of plotting a stale position. */
          const [ra, dec] = positionAt({ ra: w.ra, dec: w.dec, pmra: w.pmra ?? 0, pmdec: w.pmdec ?? 0, plx: 0, epoch: CATWISE_EPOCH, ref: '' }, year);
          const [i, j] = skyToGrid(grid, ra, dec);
          return { x: px(i), y: px(j), k };
        })
      : [];
    const a = pack.target.astrom;
    const hasMotion = Math.hypot(a.pmra, a.pmdec) > 5;
    const pts: [number, number][] = [];
    const years: { x: number; y: number; label: string }[] = [];
    if (hasMotion) {
      for (let y = a.epoch; y <= Math.max(2027, year) + 0.01; y += 0.25) {
        const [i, j] = targetAt(pack, y);
        pts.push([px(i), px(j)]);
      }
      for (let y = Math.ceil(a.epoch); y <= 2027; y++) {
        const [i, j] = targetAt(pack, y);
        years.push({ x: px(i), y: px(j), label: String(y) });
      }
    }
    const [ti, tj] = targetAt(pack, year);
    const [qi, qj] = skyToGrid(grid, query.ra, query.dec);
    const [tra, tdec] = positionAt(a, year);
    return {
      gaia,
      wise,
      track: pts.length > 1 ? pts : null,
      years,
      start: pts.length > 1 ? { x: pts[0][0], y: pts[0][1], label: a.epoch.toFixed(1) } : null,
      target: { x: px(ti), y: px(tj) },
      query: sepArcsec(query.ra, query.dec, tra, tdec) > 9 ? { x: px(qi), y: px(qj) } : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pack, skyGaia, shot, box, fovPx, ov.gaia, ov.wise, query.ra, query.dec, grid]);

  const fovArcsec = fovPx * grid.scale;
  const bar = BARS.filter((b) => b <= fovArcsec * 0.28).pop() ?? 5;
  const barPx = (bar / fovArcsec) * box;
  const centre = marks ? marks.target : { x: box / 2, y: box / 2 };
  const R = Math.max(14, box * 0.035);

  const locate = (e: { clientX: number; clientY: number }) => {
    const r = boxRef.current!.getBoundingClientRect();
    return { i: s0 + ((e.clientX - r.left) / r.width) * fovPx - 0.5, j: s0 + ((e.clientY - r.top) / r.height) * fovPx - 0.5 };
  };

  return (
    <div className="w-full max-w-full flex flex-col">
      {/* Top Header Bar outside spectrum frame: Target & Detector Bands */}
      {shot && status === 'ready' && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded border border-line bg-surface/85 px-3 py-2 text-xs shadow-sm">
          <div className="flex items-center gap-2 min-w-0">
            <span className="blip inline-block h-2 w-2 shrink-0 bg-cyan shadow-[0_0_8px_rgba(0,255,255,0.7)]" />
            <span className="font-semibold text-ink truncate text-[0.8125rem]">{targetLabel}</span>
            <span className="text-ink/30">|</span>
            <span className="text-[0.6875rem] uppercase tracking-wider text-ink/70 truncate">{shot.origin}</span>
            <span className="text-ink/30">|</span>
            <span className="text-[0.6875rem] uppercase tracking-wider text-cyan/90 font-medium truncate">{opLabel}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[0.6875rem] uppercase tracking-wider text-ink/60 font-mono">Detector / Band:</span>
            <span className="num rounded bg-cyan/15 px-2 py-0.5 text-[0.75rem] font-semibold text-cyan border border-cyan/40">
              {bandLabel}
            </span>
          </div>
        </div>
      )}

      {/* Main Spectrum Frame / Viewport: Clean canvas & Reticle */}
      <div
        ref={boxRef}
        tabIndex={0}
        role="group"
        aria-label={`Sky viewport${shot ? `: ${shot.title}` : ''}. Space plays or pauses, left and right arrows step through frames.${onProbe ? ' Click a source to measure its spectrum.' : ''}`}
        className={cn('hud-corners relative aspect-square w-full select-none border bg-black outline-offset-4 transition-colors', dragging ? 'border-signal' : 'border-line', onProbe && 'cursor-crosshair')}
        onDragOver={(e) => {
          if (!onDropFiles) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          if (!onDropFiles) return;
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files?.length) onDropFiles(e.dataTransfer.files);
        }}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'k') {
            e.preventDefault();
            onKey('toggle');
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            onKey('next');
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            onKey('prev');
          }
        }}
        onPointerMove={(e) => {
          if (!plane) return;
          const { i, j } = locate(e);
          const ii = Math.round(i);
          const jj = Math.round(j);
          if (ii < 0 || jj < 0 || ii >= n || jj >= n) return setHover(null);
          const [ra, dec] = gridToSky(grid, i, j);
          const idx = jj * n + ii;
          const dE = (ra - grid.ra) * Math.cos((dec * Math.PI) / 180) * 3600;
          const dN = (dec - grid.dec) * 3600;
          const off = `Δ ${dE >= 0 ? 'E' : 'W'}${Math.abs(dE).toFixed(1)}″ ${dN >= 0 ? 'N' : 'S'}${Math.abs(dN).toFixed(1)}″ · PA ${((Math.atan2(dE, dN) * 180) / Math.PI + 360) % 360 < 1 ? '0' : (((Math.atan2(dE, dN) * 180) / Math.PI + 360) % 360).toFixed(0)}°`;
          setHover({ ra, dec, value: plane.data[idx], flagged: !!(plane.badFrac && plane.badFrac[idx] > 0.5), offset: off });
        }}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => {
          if (!plane) return;
          const p = locate(e);
          if (!(p.i >= 0 && p.j >= 0 && p.i <= n - 1 && p.j <= n - 1)) return;
          if (measure) {
            if (!m0) setM0(p);
            else {
              const [ra1, dec1] = gridToSky(grid, p.i, p.j);
              const [ra2, dec2] = gridToSky(grid, m0.i, m0.j);
              const dE = (ra1 - ra2) * Math.cos((dec1 * Math.PI) / 180) * 3600;
              const dN = (dec1 - dec2) * 3600;
              setSeg({ a: m0, b: p, dist: sepArcsec(ra1, dec1, ra2, dec2), pa: ((Math.atan2(dE, dN) * 180) / Math.PI + 360) % 360 });
              setM0(null);
            }
            return;
          }
          if (onProbe) onProbe(p);
        }}
      >
        <canvas ref={canvasRef} className={cn('absolute inset-0 h-full w-full transition-opacity duration-300', status === 'ready' ? 'opacity-100' : 'opacity-25')} />

        {box > 0 && status === 'ready' && (
          <svg viewBox={`0 0 ${box} ${box}`} className="pointer-events-none absolute inset-0 h-full w-full overflow-hidden" aria-hidden="true">
            {marks?.wise.map((w) => (
              <rect key={w.k} x={w.x - 5} y={w.y - 5} width="10" height="10" transform={`rotate(45 ${w.x} ${w.y})`} fill="none" stroke="var(--color-wise)" strokeWidth="1.25" />
            ))}
            {marks?.gaia.map((g) => (
              <circle key={g.id} cx={g.x} cy={g.y} r={g.bright ? 9 : 6} fill="none" stroke="var(--color-gaia)" strokeWidth="1.25" />
            ))}
            {marks?.track && marks.start && ov.track && (
              <g>
                <polyline points={marks.track.map((p) => p.join(',')).join(' ')} fill="none" stroke="var(--color-signal)" strokeWidth="1.25" strokeDasharray="5 5" />
                {marks.years.map((y) => (
                  <circle key={y.label} cx={y.x} cy={y.y} r="2.2" fill="var(--color-signal)" />
                ))}
                <rect x={marks.start.x - 4} y={marks.start.y - 4} width="8" height="8" fill="#000" stroke="var(--color-signal)" strokeWidth="1.5" />
                <text x={marks.start.x + 10} y={marks.start.y + 4} fill="var(--color-signal)" fontSize="11" fontWeight="600" letterSpacing="1.2">
                  {marks.start.label}
                </text>
              </g>
            )}
            {marks?.query && (
              <g stroke="var(--color-ink)" strokeWidth="1.25">
                <path d={`M${marks.query.x - 8} ${marks.query.y}h16M${marks.query.x} ${marks.query.y - 8}v16`} />
                <text x={marks.query.x + 11} y={marks.query.y - 7} fill="var(--color-ink)" stroke="none" fontSize="10" fontWeight="600" letterSpacing="1.4">
                  QUERY
                </text>
              </g>
            )}
            {showGrid && [1, 2, 3].map((k) => {
              const x = (k / 4) * box;
              const y = (k / 4) * box;
              const [raT] = gridToSky(grid, s0 + (fovPx * k) / 4, s0 + fovPx * 0.02);
              const [, decL] = gridToSky(grid, s0 + fovPx * 0.02, s0 + (fovPx * k) / 4);
              return (
                <g key={'g' + k}>
                  <line x1={x} x2={x} y1={0} y2={box} stroke="var(--color-ink)" strokeOpacity="0.2" strokeDasharray="2 5" />
                  <line x1={0} x2={box} y1={y} y2={y} stroke="var(--color-ink)" strokeOpacity="0.2" strokeDasharray="2 5" />
                  <text x={x + 4} y={12} fill="var(--color-ink)" fillOpacity="0.65" fontSize="10" className="num">
                    {fmtRA(raT, 0)}
                  </text>
                  <text x={4} y={y - 4} fill="var(--color-ink)" fillOpacity="0.65" fontSize="10" className="num">
                    {fmtDec(decL, 0)}
                  </text>
                </g>
              );
            })}
            {showMovers && movers.map((m) => {
              const mx = px(m.x);
              const my = px(m.y);
              if (mx < -20 || my < -20 || mx > box + 20 || my > box + 20) return null;
              return (
                <g key={m.id} className="pointer-events-auto">
                  <rect x={mx - 6} y={my - 6} width="12" height="12" transform={`rotate(45 ${mx} ${my})`} fill="none" stroke="var(--color-signal)" strokeWidth="1.5" />
                  <text x={mx + 10} y={my - 8} fill="var(--color-signal)" fontSize="10" fontWeight="700">
                    {m.id}
                  </text>
                  <title>{`${m.id} · ${m.sn.toFixed(0)}σ · ${m.sep.toFixed(1)}″ at PA ${m.pa.toFixed(0)}°`}</title>
                </g>
              );
            })}
            {(seg || m0) && (
              <g stroke="var(--color-ink)" strokeWidth="1.5" fill="none">
                {seg && (
                  <>
                    <line x1={px(seg.a.i)} y1={px(seg.a.j)} x2={px(seg.b.i)} y2={px(seg.b.j)} />
                    <line x1={px(seg.a.i) - 5} y1={px(seg.a.j)} x2={px(seg.a.i) + 5} y2={px(seg.a.j)} />
                    <line x1={px(seg.a.i)} y1={px(seg.a.j) - 5} x2={px(seg.a.i)} y2={px(seg.a.j) + 5} />
                    <line x1={px(seg.b.i) - 5} y1={px(seg.b.j)} x2={px(seg.b.i) + 5} y2={px(seg.b.j)} />
                    <line x1={px(seg.b.i)} y1={px(seg.b.j) - 5} x2={px(seg.b.i)} y2={px(seg.b.j) + 5} />
                    <text x={(px(seg.a.i) + px(seg.b.i)) / 2 + 8} y={(px(seg.a.j) + px(seg.b.j)) / 2 - 8} fill="var(--color-ink)" stroke="none" fontSize="11" fontWeight="600">
                      {seg.dist.toFixed(1)}″ · PA {seg.pa.toFixed(0)}°
                    </text>
                  </>
                )}
                {m0 && !seg && <circle cx={px(m0.i)} cy={px(m0.j)} r="5" />}
              </g>
            )}
            {ov.reticle && (
              <g stroke="var(--color-signal)" strokeWidth="1.5">
                <path
                  d={`M${centre.x - R * 2.1} ${centre.y}h${R * 1.1}M${centre.x + R} ${centre.y}h${R * 1.1}M${centre.x} ${centre.y - R * 2.1}v${R * 1.1}M${centre.x} ${centre.y + R}v${R * 1.1}`}
                />
              </g>
            )}
            {probe && (
              <g>
                <circle cx={px(probe.i)} cy={px(probe.j)} r={(aperturePx / fovPx) * box} fill="none" stroke="var(--color-ink)" strokeWidth="1.5" />
                <circle cx={px(probe.i)} cy={px(probe.j)} r={(5.25 / fovPx) * box} fill="none" stroke="var(--color-ink)" strokeOpacity="0.45" strokeWidth="1" strokeDasharray="3 4" />
              </g>
            )}
          </svg>
        )}

        {/* Minimal Orientation Indicator in corner (transparent background) */}
        {shot && status === 'ready' && (
          <div className="pointer-events-none absolute right-2 top-2 p-1 text-right sm:right-3 sm:top-3 opacity-60 hover:opacity-100 transition-opacity">
            <svg viewBox="0 0 48 48" className="ml-auto h-7 w-7 sm:h-8 sm:w-8" fill="none" stroke="var(--color-ink)" strokeWidth="1.25" aria-hidden="true">
              <path d="M34 37V14M30 20l4-7 4 7M34 37H12M18 33l-7 4 7 4" />
              <text x="34" y="9.5" textAnchor="middle" fill="var(--color-ink)" stroke="none" fontSize="9" fontWeight="700">
                N
              </text>
              <text x="5.5" y="40" textAnchor="middle" fill="var(--color-ink)" stroke="none" fontSize="9" fontWeight="700">
                E
              </text>
            </svg>
          </div>
        )}

        {measure && (
          <div className="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 bg-signal px-2.5 py-1.5 shadow-md">
            <p className="micro text-black font-semibold">{m0 ? 'Click the second point' : 'Measure: click two points'}</p>
          </div>
        )}

        {/* Minimal Scale bar in corner (transparent background) */}
        {shot && status === 'ready' && (
          <div className="pointer-events-none absolute bottom-2 left-2 px-2 pb-1 pt-0.5 sm:bottom-3 sm:left-3 opacity-70">
            <p className="num text-center text-[0.625rem] font-semibold leading-none tracking-wider text-ink">{bar < 60 ? `${bar}"` : `${bar / 60}'`}</p>
            <div className="mt-1 h-1 border-x border-b border-ink" style={{ width: Math.max(8, barPx) }} />
          </div>
        )}

        {status !== 'ready' && (
          <div className="absolute inset-0 grid place-items-center p-8 text-center">
            <div className="max-w-sm">
              <p className={cn('eyebrow', status === 'error' ? 'text-signal' : 'text-ink')}>{status === 'error' ? 'No signal' : 'Acquiring'}</p>
              <p className="mt-3 text-sm leading-relaxed text-ink/75">{statusText}</p>
              {status === 'loading' && (
                <div className="mx-auto mt-5 h-px w-40 bg-ink/20">
                  <div className="h-px bg-ink transition-[width] duration-300" style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Frame Bar outside spectrum frame: Epoch / Frame & Date of frame */}
      {shot && status === 'ready' && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 rounded border border-line bg-surface/85 px-3 py-2 text-xs shadow-sm">
          <div className="flex items-baseline gap-2.5 min-w-0">
            <span className="num font-semibold text-cyan uppercase tracking-wider text-[0.75rem] shrink-0">
              Frame {frameNo} / {frameTotal}
            </span>
            <span className="text-ink/30">|</span>
            <span className="num text-ink font-semibold tracking-wide text-sm truncate">
              {shot.title}
            </span>
            {shot.sub && (
              <>
                <span className="text-ink/30 hidden md:inline">|</span>
                <span className="text-ink/65 text-[0.75rem] truncate hidden md:inline">{shot.sub}</span>
              </>
            )}
          </div>
          {shot.mjd && (
            <div className="text-[0.6875rem] text-ink/60 num shrink-0">
              MJD {shot.mjd[0] === shot.mjd[1] ? shot.mjd[0].toFixed(3) : `${shot.mjd[0].toFixed(3)}–${shot.mjd[1].toFixed(3)}`}
            </div>
          )}
        </div>
      )}

      <div className="num mt-3 grid grid-cols-1 gap-y-1 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-x-4 min-h-[1.75rem] w-full overflow-hidden text-[0.8125rem] text-ink/80">
        {hover ? (
          <>
            <span className="whitespace-nowrap shrink-0">
              <span className="text-ink/70">RA</span> <span className="text-ink">{fmtRA(hover.ra)}</span>
              <span className="ml-3 text-ink/70">DEC</span> <span className="text-ink">{fmtDec(hover.dec)}</span>
            </span>
            <span className="text-ink truncate text-left sm:text-right min-w-0">
              {hover.value === hover.value
                ? stretch.unit === 'display'
                  ? `${(hover.value / 255).toFixed(2)} preview`
                  : `${hover.value.toPrecision(3)} MJy/sr · ${(hover.value / (plane?.sigma || 1)).toFixed(1)}σ ${hover.flagged ? '· flagged' : ''}`
                : 'no data'}
              <span className="ml-3 hidden text-ink/70 md:inline">{hover.offset}</span>
            </span>
          </>
        ) : (
          <span className="truncate col-span-2 text-ink/70">{onProbe ? 'Hover for coordinates. Click any source to pull its spectrum.' : 'Hover for coordinates.'}</span>
        )}
      </div>
    </div>
  );
}
