import { useId, useMemo, useState, type ReactNode } from 'react';
import { fmtDate } from '../../lib/coords';
import { buildFitsBytes, downloadBytes } from '../../lib/fitsWorkbench';
import { CHANNELS, DETECTORS, flagList, type Pack, type Phot, type Shot } from '../../lib/packs';
import type { Plane } from '../../lib/render';
import { FLAG_DOCS, INFO_FLAGS, type Periodogram, type PhasePoint, type ProperMotionSolution, type RadialReport, type Mover, type EpochStat } from '../../lib/science';
import type { Grid } from '../../lib/spherex';
import { cn } from '../../utils/cn';

const M = { l: 50, r: 14, t: 30, b: 38 };
const DIM = 'rgb(240 240 250 / 0.55)';
const GRID = 'rgb(240 240 250 / 0.1)';
const LINES: [string, number][] = [
  ['H₂O', 1.4],
  ['H₂O', 1.9],
  ['H₂O', 2.7],
  ['CH₄', 3.3],
  ['CO₂', 4.27],
  ['CO', 4.67],
];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const med = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : 0.5 * (s[s.length / 2 - 1] + s[s.length / 2])) : NaN;
};

function niceTicks(lo: number, hi: number, n = 4): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push(Number(v.toPrecision(10)));
  return out;
}

const fmtFlux = (v: number) =>
  Math.abs(v) >= 10000
    ? `${(v / 1000).toFixed(0)}k`
    : Math.abs(v) >= 1000
      ? `${(v / 1000).toFixed(1)}k`
      : Math.abs(v) >= 10
        ? v.toFixed(0)
        : Math.abs(v) >= 1
          ? v.toFixed(1)
          : v === 0
            ? '0'
            : v.toFixed(2);

function yScale(values: number[], height: number) {
  const s = values.filter((v) => v === v).sort((a, b) => a - b);
  const q = (f: number) => s[Math.min(s.length - 1, Math.max(0, Math.floor(f * s.length)))] ?? 0;
  const lo = Math.min(0, q(0.03));
  let hi = q(0.97);
  hi += (hi - lo) * 0.18;
  if (!(hi > lo)) hi = lo + 1;
  return { Y: (v: number) => height - M.b - ((v - lo) / (hi - lo)) * (height - M.t - M.b), ticks: niceTicks(lo, hi) };
}

const color = (det: number) => DETECTORS[det - 1]?.color ?? '#f0f0fa';

function YAxis({ ticks, Y, width, unit }: { ticks: number[]; Y: (v: number) => number; width: number; unit: string }) {
  return (
    <g>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={M.l} x2={width - M.r} y1={Y(t)} y2={Y(t)} stroke={GRID} />
          <text x={M.l - 8} y={Y(t) + 4} textAnchor="end" fontSize="11" fill={DIM} className="num">
            {fmtFlux(t)}
          </text>
        </g>
      ))}
      <text x={M.l - 8} y={M.t - 14} textAnchor="end" fontSize="10" fontWeight="600" letterSpacing="1" fill={DIM}>
        {unit}
      </text>
    </g>
  );
}

export function Spectrum({
  phot,
  lam,
  width,
  height,
  unit,
  errors = false,
  model,
}: {
  phot: Phot[];
  lam: number | null;
  width: number;
  height: number;
  unit: string;
  errors?: boolean;
  model?: [number, number][] | null;
}) {
  const rawId = useId();
  const clip = 'clip-spec-' + rawId.replace(/[^a-zA-Z0-9]/g, '');
  const w = Math.max(300, width || 600);
  const { Y, ticks, line } = useMemo(() => {
    const good = phot.filter((p) => !p.flagged);
    const base = good.length >= 12 ? good : phot;
    const bins = new Map<number, number[]>();
    for (const p of base) {
      let c = (p.det - 1) * 17;
      for (let q = c; q < p.det * 17; q++) if (Math.abs(CHANNELS[q] - p.lam) < Math.abs(CHANNELS[c] - p.lam)) c = q;
      bins.set(c, [...(bins.get(c) ?? []), p.flux]);
    }
    const line = [...bins.entries()].sort((a, b) => a[0] - b[0]).map(([c, v]) => [CHANNELS[c], med(v)] as [number, number]);
    return { ...yScale(base.map((p) => p.flux), height), line };
  }, [phot, height]);
  const X = (l: number) => M.l + ((l - 0.7) / 4.4) * (w - M.l - M.r);
  return (
    <svg width={w} height={height} role="img" aria-label="Spectrum: flux density against wavelength, one point per exposure">
      <defs>
        <clipPath id={clip}>
          <rect x={M.l} y={M.t - 8} width={Math.max(0, w - M.l - M.r)} height={height - M.t - M.b + 8} />
        </clipPath>
      </defs>
      <YAxis ticks={ticks} Y={Y} width={w} unit={unit} />
      {LINES.map(([name, l], k) => (
        <g key={k}>
          <line x1={X(l)} x2={X(l)} y1={M.t - 6} y2={height - M.b} stroke="rgb(240 240 250 / 0.18)" strokeDasharray="2 4" />
          <text x={X(l)} y={M.t - 14} textAnchor="middle" fontSize="10" fontWeight="600" fill={DIM}>
            {name}
          </text>
        </g>
      ))}
      {DETECTORS.map((d) => (
        <rect key={d.det} x={X(d.lo)} width={X(d.hi) - X(d.lo) - 1} y={height - M.b} height="3" fill={d.color} />
      ))}
      {[1, 2, 3, 4, 5].map((l) => (
        <text key={l} x={X(l)} y={height - M.b + 20} textAnchor="middle" fontSize="11" fill={DIM} className="num">
          {l}
        </text>
      ))}
      <text x={w - M.r} y={height - 3} textAnchor="end" fontSize="10" fontWeight="600" letterSpacing="1" fill={DIM}>
        WAVELENGTH · µm
      </text>
      <g clipPath={`url(#${clip})`}>
        {line.length > 1 && <polyline points={line.map(([l, v]) => `${X(l)},${Y(v)}`).join(' ')} fill="none" stroke="rgb(240 240 250 / 0.45)" strokeWidth="1" />}
        {model && model.length > 1 && (
          <polyline
            points={model.filter(([, v]) => Number.isFinite(v)).map(([l, v]) => `${X(l)},${Y(v)}`).join(' ')}
            fill="none"
            stroke="var(--color-signal)"
            strokeWidth="1.5"
            strokeDasharray="5 3"
          />
        )}
        {errors &&
          phot.map((p) =>
            p.err > 0 && Number.isFinite(Y(p.flux - p.err)) ? (
              <line key={'e' + p.k} x1={X(p.lam)} x2={X(p.lam)} y1={Y(p.flux - p.err)} y2={Y(p.flux + p.err)} stroke={color(p.det)} strokeOpacity="0.55" strokeWidth="1" />
            ) : null,
          )}
        {phot.map((p) => (
          <circle key={p.k} cx={X(p.lam)} cy={Y(p.flux)} r="2.7" fill={p.flagged ? 'none' : color(p.det)} stroke={color(p.det)} strokeOpacity={p.flagged ? 0.6 : 1} strokeWidth="1">
            <title>{`${p.lam.toFixed(3)} µm · ${fmtFlux(p.flux)} ± ${fmtFlux(p.err)} ${unit}${p.mjd ? ` · ${fmtDate(p.mjd)}` : ''}${p.flagged ? ' · flagged' : ''}`}</title>
          </circle>
        ))}
      </g>
      {lam !== null && <line x1={X(lam)} x2={X(lam)} y1={M.t - 6} y2={height - M.b} stroke="var(--color-ink)" strokeWidth="1" />}
    </svg>
  );
}

export function LightCurve({ phot, pack, span, width, height, unit = 'mJy' }: { phot: Phot[]; pack: Pack; span: [number, number] | null; width: number; height: number; unit?: string }) {
  const rawId = useId();
  const clip = 'clip-lc-' + rawId.replace(/[^a-zA-Z0-9]/g, '');
  const w = Math.max(300, width || 600);
  const { series, rawPoints, Y, ticks } = useMemo(() => {
    const epochOf = new Map<number, number>();
    pack.epochs.forEach((g, e) => g.forEach((k) => epochOf.set(k, e)));
    const series = DETECTORS.map((d) => {
      const pts: { t: number; v: number; err: number; flagged: boolean; n: number }[] = [];
      pack.epochs.forEach((_, e) => {
        const all = phot.filter((p) => p.det === d.det && epochOf.get(p.k) === e);
        if (!all.length) return;
        const good = all.filter((p) => !p.flagged);
        const use = good.length ? good : all;
        const madErr = use.length > 1 ? (1.253 * med(use.map((p) => p.err))) / Math.sqrt(use.length) : use[0].err;
        pts.push({ t: use.reduce((s, p) => s + p.mjd, 0) / use.length, v: med(use.map((p) => p.flux)), err: madErr, flagged: !good.length, n: use.length });
      });
      return { det: d.det, pts };
    });
    const epochVals = series.flatMap((s) => s.pts.map((p) => p.v));
    const allVals = epochVals.length ? epochVals : phot.map((p) => p.flux);
    return { series, rawPoints: phot, ...yScale(allVals, height) };
  }, [phot, pack, height]);

  const t0 = (pack.frames[0]?.mjd ?? 60000) - 12;
  const t1 = Math.max(t0 + 24, (pack.frames[pack.frames.length - 1]?.mjd ?? t0 + 100) + 12);
  const X = (t: number) => M.l + ((t - t0) / Math.max(1, t1 - t0)) * (w - M.l - M.r);
  const xt: { t: number; label: string }[] = [];
  const d0 = new Date((t0 - 40587) * 86400000);
  let y = d0.getUTCFullYear();
  let m = Math.ceil((d0.getUTCMonth() + 1) / 3) * 3;
  for (let k = 0; k < 16; k++) {
    if (m > 11) {
      m -= 12;
      y++;
    }
    const t = Date.UTC(y, m, 1) / 86400000 + 40587;
    if (t > t1) break;
    xt.push({ t, label: `${MONTHS[m]} ${String(y).slice(2)}` });
    m += 3;
  }
  const hasSeriesPoints = series.some((s) => s.pts.length > 0);

  return (
    <svg width={w} height={height} role="img" aria-label="Light curve: median flux density per epoch for each detector band">
      <defs>
        <clipPath id={clip}>
          <rect x={M.l} y={M.t - 8} width={Math.max(0, w - M.l - M.r)} height={height - M.t - M.b + 8} />
        </clipPath>
      </defs>
      <YAxis ticks={ticks} Y={Y} width={w} unit={unit} />
      {span && <rect x={X(span[0]) - 1} width={Math.max(2, X(span[1]) - X(span[0]) + 2)} y={M.t - 6} height={height - M.t - M.b + 6} fill="rgb(240 240 250 / 0.12)" />}
      {xt.map((q) => (
        <g key={q.t}>
          <line x1={X(q.t)} x2={X(q.t)} y1={height - M.b} y2={height - M.b + 5} stroke={DIM} />
          <text x={X(q.t)} y={height - M.b + 20} textAnchor="middle" fontSize="11" fill={DIM} className="num">
            {q.label}
          </text>
        </g>
      ))}
      <line x1={M.l} x2={w - M.r} y1={height - M.b} y2={height - M.b} stroke="rgb(240 240 250 / 0.3)" />
      <g clipPath={`url(#${clip})`}>
        {hasSeriesPoints ? (
          series.map((s) => (
            <g key={s.det}>
              {s.pts.length > 1 && <polyline points={s.pts.map((p) => `${X(p.t)},${Y(p.v)}`).join(' ')} fill="none" stroke={color(s.det)} strokeOpacity="0.55" strokeWidth="1.25" />}
              {s.pts.map((p, idx) => (
                <g key={idx}>
                  {p.err > 0 && <line x1={X(p.t)} x2={X(p.t)} y1={Y(p.v - p.err)} y2={Y(p.v + p.err)} stroke={color(s.det)} strokeOpacity="0.5" strokeWidth="1" />}
                  <circle cx={X(p.t)} cy={Y(p.v)} r="3.4" fill={p.flagged ? '#000' : color(s.det)} stroke={color(s.det)} strokeWidth="1.25">
                    <title>{`D${s.det} · ${fmtDate(p.t)} · median ${fmtFlux(p.v)} ± ${fmtFlux(p.err)} ${unit} over ${p.n} exposure${p.n > 1 ? 's' : ''}${p.flagged ? ' · all flagged' : ''}`}</title>
                  </circle>
                </g>
              ))}
            </g>
          ))
        ) : (
          rawPoints.map((p) => (
            <circle key={p.k} cx={X(p.mjd)} cy={Y(p.flux)} r="2.5" fill={color(p.det)} stroke="none" opacity="0.8">
              <title>{`D${p.det} · ${fmtDate(p.mjd)} · ${fmtFlux(p.flux)} ${unit}`}</title>
            </circle>
          ))
        )}
      </g>
    </svg>
  );
}

export function PeriodogramChart({ pg, width, height, onPickPeriod }: { pg: Periodogram; width: number; height: number; onPickPeriod?: (p: number) => void }) {
  const pMin = Math.min(...pg.periods);
  const pMax = Math.max(...pg.periods);
  const lMin = Math.log10(pMin);
  const lMax = Math.log10(pMax);
  const X = (p: number) => M.l + ((Math.log10(p) - lMin) / Math.max(1e-6, lMax - lMin)) * (width - M.l - M.r);
  const hi = Math.max(pg.bestPower * 1.18, pg.fap01Power * 1.15, 0.25);
  const Y = (pw: number) => height - M.b - (Math.max(0, Math.min(hi, pw)) / hi) * (height - M.t - M.b);
  const yTicks = niceTicks(0, hi, 4);
  const xCands = [2, 5, 10, 20, 50, 100, 200, 365, 600].filter((d) => d >= pMin && d <= pMax);
  const pts = pg.periods
    .map((p, k) => ({ p, pw: pg.powers[k] }))
    .sort((a, b) => a.p - b.p)
    .map((d) => `${X(d.p)},${Y(d.pw)}`)
    .join(' ');

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label={`Generalized Lomb–Scargle periodogram, peak at ${pg.bestPeriod.toFixed(1)} days`}
      className={onPickPeriod ? 'cursor-crosshair' : undefined}
      onClick={(e) => {
        if (!onPickPeriod) return;
        const r = e.currentTarget.getBoundingClientRect();
        const frac = (e.clientX - r.left - M.l) / Math.max(1, width - M.l - M.r);
        if (frac >= 0 && frac <= 1) onPickPeriod(10 ** (lMin + frac * (lMax - lMin)));
      }}
    >
      <YAxis ticks={yTicks} Y={Y} width={width} unit="GLS P" />
      <line x1={M.l} x2={width - M.r} y1={Y(pg.fap01Power)} y2={Y(pg.fap01Power)} stroke="var(--color-signal)" strokeOpacity="0.65" strokeDasharray="4 4" />
      <text x={width - M.r} y={Y(pg.fap01Power) - 5} textAnchor="end" fontSize="9.5" fontWeight="600" fill="var(--color-signal)">
        1% FAP
      </text>
      {xCands.map((d) => (
        <g key={d}>
          <line x1={X(d)} x2={X(d)} y1={height - M.b} y2={height - M.b + 5} stroke={DIM} />
          <text x={X(d)} y={height - M.b + 20} textAnchor="middle" fontSize="11" fill={DIM} className="num">
            {d}
          </text>
        </g>
      ))}
      <line x1={M.l} x2={width - M.r} y1={height - M.b} y2={height - M.b} stroke="rgb(240 240 250 / 0.3)" />
      <text x={width - M.r} y={height - 3} textAnchor="end" fontSize="10" fontWeight="600" letterSpacing="1" fill={DIM}>
        PERIOD · DAYS (LOG)
      </text>
      <polyline points={pts} fill="none" stroke="var(--color-ink)" strokeWidth="1.25" />
      <line x1={X(pg.bestPeriod)} x2={X(pg.bestPeriod)} y1={M.t - 6} y2={height - M.b} stroke="var(--color-signal)" strokeOpacity="0.5" strokeDasharray="2 3" />
      <circle cx={X(pg.bestPeriod)} cy={Y(pg.bestPower)} r="4" fill="var(--color-signal)" />
    </svg>
  );
}

export function PhaseCurveChart({ pts, period, width, height }: { pts: PhasePoint[]; period: number; width: number; height: number }) {
  const rawId = useId();
  const clip = 'clip-pc-' + rawId.replace(/[^a-zA-Z0-9]/g, '');
  const w = Math.max(300, width || 600);
  const vals = pts.map((p) => p.rel);
  const lo = Math.max(0, Math.min(...vals) - 0.15);
  const hi = Math.max(lo + 0.3, Math.max(...vals) + 0.15);
  const Y = (v: number) => height - M.b - ((v - lo) / (hi - lo)) * (height - M.t - M.b);
  const X = (ph: number) => M.l + (ph / 2) * (w - M.l - M.r);
  const ticks = niceTicks(lo, hi, 4);
  return (
    <svg width={w} height={height} role="img" aria-label={`Phase-folded light curve at period ${period.toFixed(2)} days`}>
      <defs>
        <clipPath id={clip}>
          <rect x={M.l} y={M.t - 8} width={Math.max(0, w - M.l - M.r)} height={height - M.t - M.b + 8} />
        </clipPath>
      </defs>
      <YAxis ticks={ticks} Y={Y} width={w} unit="F / ⟨F⟩" />
      <line x1={X(1)} x2={X(1)} y1={M.t - 6} y2={height - M.b} stroke="rgb(240 240 250 / 0.2)" strokeDasharray="3 4" />
      {[0, 0.5, 1, 1.5, 2].map((ph) => (
        <g key={ph}>
          <line x1={X(ph)} x2={X(ph)} y1={height - M.b} y2={height - M.b + 5} stroke={DIM} />
          <text x={X(ph)} y={height - M.b + 20} textAnchor="middle" fontSize="11" fill={DIM} className="num">
            {ph.toFixed(1)}
          </text>
        </g>
      ))}
      <line x1={M.l} x2={w - M.r} y1={height - M.b} y2={height - M.b} stroke="rgb(240 240 250 / 0.3)" />
      <text x={w - M.r} y={height - 3} textAnchor="end" fontSize="10" fontWeight="600" letterSpacing="1" fill={DIM}>
        PHASE · P = {period.toFixed(2)} d
      </text>
      <g clipPath={`url(#${clip})`}>
        <line x1={M.l} x2={w - M.r} y1={Y(1)} y2={Y(1)} stroke="rgb(240 240 250 / 0.25)" />
        {pts.map((p, k) => (
          <circle key={k} cx={X(p.phase)} cy={Y(p.rel)} r="2.8" fill={color(p.det)} fillOpacity={p.phase >= 1 ? 0.45 : 0.9}>
            <title>{`φ = ${p.phase.toFixed(3)} · F/⟨F⟩ = ${p.rel.toFixed(3)} ± ${p.err.toFixed(3)} · D${p.det}`}</title>
          </circle>
        ))}
      </g>
    </svg>
  );
}

export function RadialProfileChart({ rep, apArcsec, width, height }: { rep: RadialReport; apArcsec: number; width: number; height: number }) {
  const w = Math.max(300, width || 600);
  const rMax = Math.max(20, ...rep.bins.map((b) => b.rArcsec * 1.08));
  const X = (r: number) => M.l + (r / rMax) * (w - M.l - M.r);
  const Y = (v: number) => height - M.b - ((Math.max(-0.12, Math.min(1.15, v)) + 0.12) / 1.27) * (height - M.t - M.b);
  const psfPts: string[] = [];
  for (let r = 0; r <= rMax; r += rMax / 60) psfPts.push(`${X(r)},${Y(2 ** (-4 * (r / rep.fwhmNominal) ** 2))}`);
  const xTicks = niceTicks(0, rMax, 5);
  return (
    <svg width={w} height={height} role="img" aria-label="Radial surface-brightness profile compared with nominal Gaussian PSF">
      <YAxis ticks={[0, 0.25, 0.5, 0.75, 1]} Y={Y} width={w} unit="I / I₀" />
      <line x1={M.l} x2={w - M.r} y1={Y(0.5)} y2={Y(0.5)} stroke="rgb(240 240 250 / 0.16)" strokeDasharray="2 4" />
      {apArcsec <= rMax && (
        <g>
          <line x1={X(apArcsec)} x2={X(apArcsec)} y1={M.t - 6} y2={height - M.b} stroke="var(--color-ink)" strokeOpacity="0.45" strokeDasharray="4 3" />
          <text x={X(apArcsec) + 4} y={M.t + 6} fontSize="9.5" fontWeight="600" fill={DIM}>
            AP {apArcsec.toFixed(1)}"
          </text>
        </g>
      )}
      {xTicks.map((t) => (
        <g key={t}>
          <line x1={X(t)} x2={X(t)} y1={height - M.b} y2={height - M.b + 5} stroke={DIM} />
          <text x={X(t)} y={height - M.b + 20} textAnchor="middle" fontSize="11" fill={DIM} className="num">
            {t}
          </text>
        </g>
      ))}
      <line x1={M.l} x2={w - M.r} y1={height - M.b} y2={height - M.b} stroke="rgb(240 240 250 / 0.3)" />
      <text x={w - M.r} y={height - 3} textAnchor="end" fontSize="10" fontWeight="600" letterSpacing="1" fill={DIM}>
        RADIUS · ARCSEC
      </text>
      <polyline points={psfPts.join(' ')} fill="none" stroke="var(--color-signal)" strokeWidth="1.4" strokeDasharray="5 3" />
      <polyline points={rep.bins.map((b) => `${X(b.rArcsec)},${Y(b.fluxNorm)}`).join(' ')} fill="none" stroke="var(--color-ink)" strokeWidth="1.4" />
      {rep.bins.map((b, k) => (
        <g key={k}>
          <line x1={X(b.rArcsec)} x2={X(b.rArcsec)} y1={Y(b.fluxNorm - b.errNorm)} y2={Y(b.fluxNorm + b.errNorm)} stroke="var(--color-ink)" strokeOpacity="0.6" />
          <circle cx={X(b.rArcsec)} cy={Y(b.fluxNorm)} r="3" fill="var(--color-ink)">
            <title>{`r = ${b.rArcsec.toFixed(1)}" · I/I₀ = ${b.fluxNorm.toFixed(3)} ± ${b.errNorm.toFixed(3)} (PSF model ${b.psfModel.toFixed(3)})`}</title>
          </circle>
        </g>
      ))}
    </svg>
  );
}

export function AstrometryDriftChart({ sol, width, height }: { sol: ProperMotionSolution; width: number; height: number }) {
  const w = Math.max(260, width || 400);
  const e0 = sol.epochs[0];
  const rel = sol.epochs.map((e) => ({
    ...e,
    dx: e.dEastArcsec - e0.dEastArcsec,
    dy: e.dNorthArcsec - e0.dNorthArcsec,
  }));
  const maxSpan = Math.max(
    1.5,
    ...rel.flatMap((e) => [Math.abs(e.dx) + e.posErrArcsec, Math.abs(e.dy) + e.posErrArcsec]),
  ) * 1.25;
  // Astronomical convention: East is LEFT (+Δα* left), North is UP (+Δδ up)
  const plotW = Math.max(120, w - M.l - M.r);
  const plotH = Math.max(120, height - M.t - M.b);
  const side = Math.min(plotW, plotH);
  const ox = M.l + (plotW - side) / 2;
  const oy = M.t + (plotH - side) / 2;
  const X = (dEast: number) => ox + side / 2 - (dEast / (2 * maxSpan)) * side;
  const Y = (dNorth: number) => oy + side / 2 - (dNorth / (2 * maxSpan)) * side;
  const ticks = niceTicks(-maxSpan * 0.85, maxSpan * 0.85, 4);

  const dtEnd = sol.epochs[sol.epochs.length - 1].year - sol.epochs[0].year;
  const endE = (sol.pmRaMasYr / 1000) * dtEnd;
  const endN = (sol.pmDecMasYr / 1000) * dtEnd;

  return (
    <svg width={w} height={height} role="img" aria-label="Sky-plane astrometric drift (East left, North up)">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={ox} x2={ox + side} y1={Y(t)} y2={Y(t)} stroke={GRID} />
          <line x1={X(t)} x2={X(t)} y1={oy} y2={oy + side} stroke={GRID} />
          <text x={ox - 7} y={Y(t) + 4} textAnchor="end" fontSize="10.5" fill={DIM} className="num">
            {t.toFixed(Math.abs(maxSpan) < 5 ? 1 : 0)}"
          </text>
          <text x={X(t)} y={oy + side + 17} textAnchor="middle" fontSize="10.5" fill={DIM} className="num">
            {t.toFixed(Math.abs(maxSpan) < 5 ? 1 : 0)}"
          </text>
        </g>
      ))}
      <rect x={ox} y={oy} width={side} height={side} fill="none" stroke="rgb(240 240 250 / 0.25)" />
      <text x={ox + side} y={oy - 6} textAnchor="end" fontSize="9.5" fontWeight="600" letterSpacing="1" fill={DIM}>
        ← EAST Δα* · NORTH Δδ ↑
      </text>
      <line x1={X(0)} x2={X(endE)} y1={Y(0)} y2={Y(endN)} stroke="var(--color-signal)" strokeWidth="1.5" strokeDasharray="4 3" />
      {rel.map((e, k) => {
        const pxErr = (e.posErrArcsec / (2 * maxSpan)) * side;
        return (
          <g key={k}>
            <line x1={X(e.dx) - pxErr} x2={X(e.dx) + pxErr} y1={Y(e.dy)} y2={Y(e.dy)} stroke="var(--color-ink)" strokeOpacity="0.6" />
            <line x1={X(e.dx)} x2={X(e.dx)} y1={Y(e.dy) - pxErr} y2={Y(e.dy) + pxErr} stroke="var(--color-ink)" strokeOpacity="0.6" />
            <circle cx={X(e.dx)} cy={Y(e.dy)} r={k === rel.length - 1 ? 4 : 3.2} fill={k === 0 ? '#000' : 'var(--color-ink)'} stroke="var(--color-ink)" strokeWidth="1.4">
              <title>{`${e.title} (${e.year.toFixed(2)}) · Δα* = ${e.dx.toFixed(2)}", Δδ = ${e.dy.toFixed(2)}" ± ${e.posErrArcsec.toFixed(2)}" · S/N ${e.sn.toFixed(0)}`}</title>
            </circle>
            {(k === 0 || k === rel.length - 1) && (
              <text x={X(e.dx) + 7} y={Y(e.dy) - 6} fontSize="10" fontWeight="600" fill="var(--color-ink)" className="num">
                {e.year.toFixed(1)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Visual interactive chart for detected mover candidates: Motion Compass (polar vector drift) or S/N Scatter */
export function MoversChart({
  movers,
  onInspect,
  width,
}: {
  movers: Mover[];
  onInspect: (m: Mover) => void;
  width: number;
}) {
  const [mode, setMode] = useState<'polar' | 'scatter'>('polar');
  const [filter, setFilter] = useState<'all' | 'high_sn' | 'fast' | 'target'>('all');
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(movers[0]?.id ?? null);

  const filtered = useMemo(() => {
    return movers.filter((m) => {
      if (filter === 'high_sn') return m.sn >= 5.0;
      if (filter === 'fast') return m.rateArcsecYr >= 1.0;
      if (filter === 'target') return m.match === 'target';
      return true;
    });
  }, [movers, filter]);

  const activeMover = useMemo(() => {
    return movers.find((m) => m.id === (hoverId || selectedId)) ?? movers[0] ?? null;
  }, [movers, hoverId, selectedId]);

  const w = Math.max(320, width || 640);
  const chartH = 340;

  // Max motion rate for scaling
  const maxRate = useMemo(() => {
    const raw = Math.max(1.5, ...movers.map((m) => m.rateArcsecYr));
    return Math.ceil(raw * 1.15);
  }, [movers]);

  // Polar layout
  const cx = w > 600 ? w * 0.38 : w / 2;
  const cy = chartH / 2;
  const radius = Math.min(cx - 30, cy - 30);

  // Scatter layout
  const maxSn = useMemo(() => Math.max(10, ...movers.map((m) => m.sn)) * 1.15, [movers]);
  const sX = (r: number) => M.l + (Math.min(maxRate, r) / maxRate) * (w - M.l - M.r);
  const sY = (sn: number) => chartH - M.b - (Math.min(maxSn, sn) / maxSn) * (chartH - M.t - M.b);

  const ringTicks = niceTicks(maxRate * 0.25, maxRate, 4);

  return (
    <div className="border border-ink/15 bg-panel2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/15 pb-3">
        <div className="flex items-center gap-2">
          <span className="micro text-signal">Motion vector analysis</span>
          <span className="num text-xs text-ink/75">({filtered.length} of {movers.length} plotted)</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex border border-ink/20" role="group" aria-label="Movers view mode">
            <button
              type="button"
              onClick={() => setMode('polar')}
              className={cn('micro min-h-8 px-2.5', mode === 'polar' ? 'bg-ink text-black font-semibold' : 'text-ink/65 hover:text-ink')}
            >
              Drift compass
            </button>
            <button
              type="button"
              onClick={() => setMode('scatter')}
              className={cn('micro min-h-8 border-l border-ink/20 px-2.5', mode === 'scatter' ? 'bg-ink text-black font-semibold' : 'text-ink/65 hover:text-ink')}
            >
              S/N vs rate
            </button>
          </div>
          <div className="flex border border-ink/20 text-xs" role="group" aria-label="Movers filter">
            {([
              ['all', 'All'],
              ['high_sn', '≥5σ'],
              ['fast', '>1"/yr'],
              ['target', 'Target'],
            ] as const).map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={cn('micro min-h-8 border-l border-ink/20 px-2 first:border-l-0', filter === k ? 'bg-ink/20 text-cyan' : 'text-ink/65 hover:text-ink')}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_260px]">
        <div className="relative overflow-hidden">
          {mode === 'polar' ? (
            <svg width={w > 600 ? w - 280 : w} height={chartH} className="mx-auto block" role="img" aria-label="Movers polar compass: rate and position angle">
              {/* Concentric rings */}
              {ringTicks.map((rVal) => {
                const ringR = (rVal / maxRate) * radius;
                return (
                  <g key={rVal}>
                    <circle cx={cx} cy={cy} r={ringR} fill="none" stroke="rgb(240 240 250 / 0.12)" strokeDasharray="3 3" />
                    <text x={cx + ringR + 3} y={cy - 4} fontSize="9" fill={DIM} className="num">
                      {rVal.toFixed(1)}"
                    </text>
                  </g>
                );
              })}
              {/* Crosshairs */}
              <line x1={cx - radius} x2={cx + radius} y1={cy} y2={cy} stroke="rgb(240 240 250 / 0.18)" />
              <line x1={cx} x2={cx} y1={cy - radius} y2={cy + radius} stroke="rgb(240 240 250 / 0.18)" />
              <text x={cx} y={cy - radius - 8} textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--color-ink)">N (0°)</text>
              <text x={cx - radius - 16} y={cy + 4} textAnchor="end" fontSize="10" fontWeight="700" fill="var(--color-ink)">E (90°)</text>
              <text x={cx} y={cy + radius + 16} textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--color-ink)">S (180°)</text>
              <text x={cx + radius + 16} y={cy + 4} textAnchor="start" fontSize="10" fontWeight="700" fill="var(--color-ink)">W (270°)</text>

              {/* Mover vectors & markers */}
              {filtered.map((m) => {
                const r = (m.rateArcsecYr / maxRate) * radius;
                const rad = (m.pa * Math.PI) / 180;
                // East is left, North is up
                const mx = cx - r * Math.sin(rad);
                const my = cy - r * Math.cos(rad);
                const isHover = hoverId === m.id || selectedId === m.id;
                const dotColor = m.match === 'target' ? 'var(--color-cyan)' : m.consistent ? 'var(--color-gaia)' : 'var(--color-signal)';
                const dotR = Math.max(4, Math.min(9, Math.sqrt(m.sn) * 1.8));

                return (
                  <g
                    key={m.id}
                    className="cursor-pointer"
                    onPointerEnter={() => setHoverId(m.id)}
                    onPointerLeave={() => setHoverId(null)}
                    onClick={() => {
                      setSelectedId(m.id);
                      onInspect(m);
                    }}
                  >
                    {/* Velocity vector from center */}
                    <line x1={cx} y1={cy} x2={mx} y2={my} stroke={dotColor} strokeWidth={isHover ? 2 : 1} strokeOpacity={isHover ? 0.9 : 0.35} strokeDasharray={m.match ? undefined : '2 3'} />
                    {isHover && (
                      <circle cx={mx} cy={my} r={dotR + 5} fill="none" stroke={dotColor} strokeWidth="1.5" strokeOpacity="0.8">
                        <animate attributeName="r" values={`${dotR + 3};${dotR + 9};${dotR + 3}`} dur="1.2s" repeatCount="indefinite" />
                        <animate attributeName="stroke-opacity" values="0.8;0.2;0.8" dur="1.2s" repeatCount="indefinite" />
                      </circle>
                    )}
                    <circle cx={mx} cy={my} r={dotR} fill={dotColor} stroke="#000" strokeWidth="1.5" />
                    <text x={mx + 8} y={my + 4} fontSize="10" fontWeight="700" fill={dotColor} className="num">
                      {m.id}
                    </text>
                  </g>
                );
              })}
            </svg>
          ) : (
            <svg width={w > 600 ? w - 280 : w} height={chartH} className="mx-auto block" role="img" aria-label="Movers rate vs signal-to-noise">
              {/* Grid & Ticks */}
              {niceTicks(0, maxSn, 4).map((snVal) => (
                <g key={snVal}>
                  <line x1={M.l} x2={w > 600 ? w - 280 - M.r : w - M.r} y1={sY(snVal)} y2={sY(snVal)} stroke={GRID} />
                  <text x={M.l - 8} y={sY(snVal) + 4} textAnchor="end" fontSize="10" fill={DIM} className="num">{snVal}σ</text>
                </g>
              ))}
              {niceTicks(0, maxRate, 4).map((rVal) => (
                <g key={rVal}>
                  <line x1={sX(rVal)} x2={sX(rVal)} y1={chartH - M.b} y2={chartH - M.b + 5} stroke={DIM} />
                  <text x={sX(rVal)} y={chartH - M.b + 18} textAnchor="middle" fontSize="10" fill={DIM} className="num">{rVal.toFixed(1)}"</text>
                </g>
              ))}
              {/* 5σ Gold discovery threshold line */}
              <line x1={M.l} x2={w > 600 ? w - 280 - M.r : w - M.r} y1={sY(5)} y2={sY(5)} stroke="var(--color-signal)" strokeDasharray="4 4" strokeWidth="1.2" />
              <text x={w > 600 ? w - 280 - M.r : w - M.r} y={sY(5) - 6} textAnchor="end" fontSize="9.5" fontWeight="600" fill="var(--color-signal)">
                5σ DISCOVERY THRESHOLD
              </text>
              <line x1={M.l} x2={w > 600 ? w - 280 - M.r : w - M.r} y1={chartH - M.b} y2={chartH - M.b} stroke="rgb(240 240 250 / 0.3)" />
              <text x={w > 600 ? w - 280 - M.r : w - M.r} y={chartH - 4} textAnchor="end" fontSize="9.5" fontWeight="600" fill={DIM}>
                PROPER MOTION RATE · "/yr
              </text>

              {/* Data points */}
              {filtered.map((m) => {
                const px = sX(m.rateArcsecYr);
                const py = sY(m.sn);
                const isHover = hoverId === m.id || selectedId === m.id;
                const dotColor = m.match === 'target' ? 'var(--color-cyan)' : m.consistent ? 'var(--color-gaia)' : 'var(--color-signal)';
                const dotR = Math.max(4, Math.min(8, Math.sqrt(m.sn) * 1.5));
                return (
                  <g
                    key={m.id}
                    className="cursor-pointer"
                    onPointerEnter={() => setHoverId(m.id)}
                    onPointerLeave={() => setHoverId(null)}
                    onClick={() => {
                      setSelectedId(m.id);
                      onInspect(m);
                    }}
                  >
                    {isHover && <circle cx={px} cy={py} r={dotR + 4} fill="none" stroke={dotColor} strokeWidth="1.5" />}
                    <circle cx={px} cy={py} r={dotR} fill={dotColor} stroke="#000" strokeWidth="1.25" />
                    <text x={px + 7} y={py - 6} fontSize="10" fontWeight="700" fill={dotColor} className="num">{m.id}</text>
                  </g>
                );
              })}
            </svg>
          )}
        </div>

        {/* Selected Candidate HUD card */}
        <div className="flex flex-col justify-between border-t border-ink/15 pt-3 lg:border-l lg:border-t-0 lg:pl-3 lg:pt-0">
          {activeMover ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="num text-base font-bold text-signal">{activeMover.id}</span>
                <span className="border border-signal/40 bg-signal/10 px-1.5 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-signal">
                  {activeMover.sn.toFixed(1)}σ detection
                </span>
              </div>
              <div className="space-y-1.5 text-xs text-ink/80">
                <p className="flex justify-between">
                  <span className="text-ink/65">Proper motion:</span>
                  <span className="num font-semibold text-ink">{activeMover.rateArcsecYr.toFixed(2)} "/yr</span>
                </p>
                <p className="flex justify-between">
                  <span className="text-ink/65">Position angle:</span>
                  <span className="num font-semibold text-ink">{activeMover.pa.toFixed(0)}° (E of N)</span>
                </p>
                <p className="flex justify-between">
                  <span className="text-ink/65">Net shift:</span>
                  <span className="num font-semibold text-ink">{activeMover.sep.toFixed(2)}"</span>
                </p>
                <p className="flex justify-between">
                  <span className="text-ink/65">Epochs:</span>
                  <span className="text-ink/75 truncate">{activeMover.title0} → {activeMover.title1}</span>
                </p>
                <p className="flex justify-between">
                  <span className="text-ink/65">Classification:</span>
                  <span className="font-semibold text-cyan">
                    {activeMover.match === 'target' ? 'Target track' : activeMover.consistent ? 'Multi-visit dipole' : 'Candidate mover'}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => onInspect(activeMover)}
                className="btn btn-sm w-full mt-2"
              >
                Inspect in Viewport
              </button>
            </div>
          ) : (
            <p className="text-xs text-ink/60">Hover or click any mover point to inspect details.</p>
          )}

          <div className="mt-3 border-t border-ink/12 pt-2 text-[0.6875rem] text-ink/75">
            <span className="inline-block h-2 w-2 rounded-full bg-cyan mr-1" /> Target track &nbsp;
            <span className="inline-block h-2 w-2 rounded-full bg-signal mr-1" /> New candidate &nbsp;
            <span className="inline-block h-2 w-2 rounded-full bg-[#8fd3ff] mr-1" /> Verified dipole
          </div>
        </div>
      </div>
    </div>
  );
}

/** Visual interactive sensitivity depth timeline & wavelength matrix for Coverage */
export function CoverageChart({
  coverage,
  pack,
  onGotoEpoch,
  width,
}: {
  coverage: EpochStat[];
  pack: Pack | null;
  onGotoEpoch: (epoch: number) => void;
  width: number;
}) {
  const [metric, setMetric] = useState<'depth' | 'noise' | 'exposures'>('depth');
  const [hoverVisit, setHoverVisit] = useState<number | null>(null);

  const w = Math.max(320, width || 640);
  const chartH = 220;

  const vals = useMemo(() => {
    if (metric === 'depth') return coverage.map((c) => (Number.isFinite(c.lim5Mag) ? c.lim5Mag : 18));
    if (metric === 'noise') return coverage.map((c) => c.sigma);
    return coverage.map((c) => c.n);
  }, [coverage, metric]);

  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const lo = metric === 'depth' ? Math.floor(minV - 0.5) : 0;
  const hi = metric === 'depth' ? Math.ceil(maxV + 0.5) : maxV * 1.15;

  const colW = Math.max(16, (w - M.l - M.r) / Math.max(1, coverage.length));
  const bY = (v: number) => chartH - M.b - ((v - lo) / Math.max(1e-4, hi - lo)) * (chartH - M.t - M.b);

  const activeStat = hoverVisit !== null ? coverage[hoverVisit] : null;

  return (
    <div className="border border-ink/15 bg-panel2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/15 pb-3">
        <div className="flex items-center gap-2">
          <span className="micro text-cyan">Sensitivity & Coverage Timeline</span>
          <span className="num text-xs text-ink/75">({coverage.length} visits co-added{pack ? ` · ${pack.release}` : ''})</span>
        </div>
        <div className="flex border border-ink/20" role="group" aria-label="Coverage metric">
          {([
            ['depth', '5σ Depth (AB mag)'],
            ['noise', '1σ Noise (MJy/sr)'],
            ['exposures', 'Exposures count'],
          ] as const).map(([k, lbl]) => (
            <button
              key={k}
              type="button"
              onClick={() => setMetric(k)}
              className={cn('micro min-h-8 border-l border-ink/20 px-2.5 first:border-l-0', metric === k ? 'bg-ink text-black font-semibold' : 'text-ink/65 hover:text-ink')}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 relative">
        <svg width={w} height={chartH} role="img" aria-label="Coverage sensitivity timeline">
          {/* Y Axis */}
          {niceTicks(lo, hi, 4).map((tick) => (
            <g key={tick}>
              <line x1={M.l} x2={w - M.r} y1={bY(tick)} y2={bY(tick)} stroke={GRID} />
              <text x={M.l - 8} y={bY(tick) + 4} textAnchor="end" fontSize="10" fill={DIM} className="num">
                {metric === 'noise' ? tick.toExponential(1) : tick.toFixed(1)}
              </text>
            </g>
          ))}
          <line x1={M.l} x2={w - M.r} y1={chartH - M.b} y2={chartH - M.b} stroke="rgb(240 240 250 / 0.3)" />
          <text x={M.l - 8} y={M.t - 12} textAnchor="end" fontSize="9.5" fontWeight="600" fill={DIM}>
            {metric === 'depth' ? '5σ AB MAG ↑' : metric === 'noise' ? 'MJy/sr' : 'FRAMES'}
          </text>

          {/* Visit Bars */}
          {coverage.map((c, idx) => {
            const bx = M.l + idx * colW + colW * 0.15;
            const barWidth = colW * 0.7;
            const val = vals[idx];
            const by = bY(val);
            const bH = Math.max(3, chartH - M.b - by);
            const isHover = hoverVisit === idx;
            // Primary detector color
            const detCol = c.dets.length ? color(c.dets[0]) : 'var(--color-ink)';

            return (
              <g
                key={c.e}
                className="cursor-pointer transition-opacity"
                onPointerEnter={() => setHoverVisit(idx)}
                onPointerLeave={() => setHoverVisit(null)}
                onClick={() => onGotoEpoch(c.e)}
              >
                {/* Bar */}
                <rect
                  x={bx}
                  y={by}
                  width={barWidth}
                  height={bH}
                  fill={detCol}
                  fillOpacity={isHover ? 0.95 : 0.65}
                  stroke={isHover ? 'var(--color-ink)' : 'none'}
                  strokeWidth="1.5"
                />
                {/* Value label */}
                <text x={bx + barWidth / 2} y={by - 5} textAnchor="middle" fontSize="9.5" fontWeight="600" fill={isHover ? 'var(--color-ink)' : DIM} className="num">
                  {metric === 'depth' ? val.toFixed(1) : metric === 'noise' ? val.toExponential(1) : val}
                </text>
                {/* Flagged alert dot */}
                {c.flagged > 0.15 && (
                  <circle cx={bx + barWidth / 2} cy={by - 15} r="2.5" fill="var(--color-signal)">
                    <title>{`${Math.round(c.flagged * 100)}% pipeline flagged pixels`}</title>
                  </circle>
                )}
                {/* Visit label */}
                <text x={bx + barWidth / 2} y={chartH - M.b + 16} textAnchor="middle" fontSize="10" fill={isHover ? 'var(--color-ink)' : DIM} className="num">
                  V{c.e + 1}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Wavelength Coverage Strip */}
        <div className="mt-3 border-t border-ink/15 pt-3">
          <div className="flex items-center justify-between text-xs text-ink/70">
            <span className="micro text-ink/80">Wavelength coverage per visit (0.75 – 5.0 µm)</span>
            <span className="num">SPHEREx Linear Variable Filters</span>
          </div>
          <div className="mt-2 space-y-1.5">
            {coverage.map((c, idx) => {
              const leftPct = Math.max(0, Math.min(100, ((c.lamMin - 0.75) / (5.0 - 0.75)) * 100));
              const rightPct = Math.max(0, Math.min(100, ((c.lamMax - 0.75) / (5.0 - 0.75)) * 100));
              const widthPct = Math.max(2, rightPct - leftPct);
              const isHover = hoverVisit === idx;

              return (
                <div
                  key={c.e}
                  className={cn('flex items-center gap-3 px-2 py-1 cursor-pointer transition-colors text-xs', isHover ? 'bg-ink/10' : 'hover:bg-ink/5')}
                  onPointerEnter={() => setHoverVisit(idx)}
                  onPointerLeave={() => setHoverVisit(null)}
                  onClick={() => onGotoEpoch(c.e)}
                >
                  <span className="num w-14 shrink-0 font-semibold text-ink">Visit {c.e + 1}</span>
                  <div className="relative h-3 flex-1 bg-ink/10 rounded-sm overflow-hidden">
                    <div
                      className="absolute top-0 bottom-0 rounded-sm"
                      style={{
                        left: `${leftPct}%`,
                        width: `${widthPct}%`,
                        background: c.dets.length ? color(c.dets[0]) : 'var(--color-ink)',
                      }}
                    />
                  </div>
                  <span className="num w-24 shrink-0 text-right text-[0.75rem] text-ink/75">
                    {c.lamMin.toFixed(2)}–{c.lamMax.toFixed(2)} µm
                  </span>
                  <span className="micro w-12 shrink-0 text-right text-cyan underline">Show</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Active hover tooltip */}
        {activeStat && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border border-cyan/40 bg-black/80 px-3 py-2 text-xs">
            <div className="flex items-center gap-3">
              <span className="num font-bold text-cyan">Visit {activeStat.e + 1}</span>
              <span className="text-ink/80">{fmtDate(activeStat.mjd0)} → {fmtDate(activeStat.mjd1)}</span>
              <span className="text-ink/70">· {activeStat.n} exposures ({activeStat.dets.map((d) => `D${d}`).join(' ')})</span>
            </div>
            <div className="flex items-center gap-4 num">
              <span>5σ depth: <b className="text-ink">{activeStat.lim5Mjy.toPrecision(2)} mJy</b> ({activeStat.lim5Mag.toFixed(1)} mag)</span>
              <span>Noise: <b className="text-ink">{activeStat.sigma.toExponential(1)} MJy/sr</b></span>
              <button
                type="button"
                onClick={() => onGotoEpoch(activeStat.e)}
                className="micro border border-cyan px-2 py-1 text-cyan hover:bg-cyan hover:text-black"
              >
                Jump to epoch
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** 34-Year multi-mission historical light curve for All-Sky mode (DSS2 -> 2MASS -> AllWISE -> SPHEREx) */
export function MultiMissionLightCurve({
  shots,
  width,
  height = 280,
  onSwitchToL2,
}: {
  shots: Shot[];
  width: number;
  height?: number;
  onSwitchToL2?: () => void;
}) {
  const w = Math.max(300, width || 600);
  const usable = shots.filter((s) => Number.isFinite(s.year));

  const years = usable.map((s) => s.year);
  const minYr = Math.min(1990, ...years);
  const maxYr = Math.max(2027, ...years);

  const rawVals = usable.map((s) => (s.probe !== undefined && Number.isFinite(s.probe) ? s.probe : 50));
  const lo = Math.min(0, Math.min(...rawVals));
  const hi = Math.max(lo + 10, Math.max(...rawVals) * 1.25);

  const X = (yr: number) => M.l + ((yr - minYr) / Math.max(1, maxYr - minYr)) * (w - M.l - M.r);
  const Y = (v: number) => height - M.b - ((v - lo) / Math.max(1, hi - lo)) * (chartH - M.t - M.b);
  const chartH = height;

  const SURVEY_COLORS: Record<string, string> = {
    dss: '#ffffff',
    '2mass': '#8fd3ff',
    wise: '#ffd166',
    spx: '#35e6e0',
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-[0.8125rem] leading-relaxed text-ink/80">
          <span className="micro text-cyan mr-2">34-Year Survey Stack</span>
          Historical multi-mission photometry extracted at current coordinates across 34 years (DSS2 1990s → 2MASS 2000 → AllWISE 2010 → SPHEREx 2025).
        </p>
        {onSwitchToL2 && (
          <button
            type="button"
            onClick={onSwitchToL2}
            className="micro min-h-8 border border-signal px-3 text-signal hover:bg-signal hover:text-black transition-colors"
          >
            Switch to Level-2 time series
          </button>
        )}
      </div>

      <svg width={w} height={chartH} role="img" aria-label="Multi-mission historical time series across 34 years">
        {/* Y Axis */}
        {niceTicks(lo, hi, 4).map((tick) => (
          <g key={tick}>
            <line x1={M.l} x2={w - M.r} y1={Y(tick)} y2={Y(tick)} stroke={GRID} />
            <text x={M.l - 8} y={Y(tick) + 4} textAnchor="end" fontSize="10" fill={DIM} className="num">{tick.toFixed(0)}</text>
          </g>
        ))}
        {/* Year Ticks */}
        {[1990, 1995, 2000, 2005, 2010, 2015, 2020, 2025].map((yr) => (
          <g key={yr}>
            <line x1={X(yr)} x2={X(yr)} y1={chartH - M.b} y2={chartH - M.b + 5} stroke={DIM} />
            <text x={X(yr)} y={chartH - M.b + 18} textAnchor="middle" fontSize="10.5" fill={DIM} className="num">{yr}</text>
          </g>
        ))}
        <line x1={M.l} x2={w - M.r} y1={chartH - M.b} y2={chartH - M.b} stroke="rgb(240 240 250 / 0.3)" />
        <text x={w - M.r} y={chartH - 4} textAnchor="end" fontSize="9.5" fontWeight="600" fill={DIM}>
          OBSERVATION YEAR (1990–2026)
        </text>
        <text x={M.l - 8} y={M.t - 12} textAnchor="end" fontSize="9.5" fontWeight="600" fill={DIM}>
          PREVIEW DN
        </text>

        {/* Survey Points */}
        {usable.map((s, idx) => {
          const px = X(s.year);
          const py = Y(s.probe !== undefined && Number.isFinite(s.probe) ? s.probe : 50);
          const sKey = Object.keys(SURVEY_COLORS).find((k) => s.key.includes(k)) ?? 'spx';
          const col = SURVEY_COLORS[sKey] ?? 'var(--color-signal)';

          return (
            <g key={idx}>
              <line x1={px} x2={px} y1={M.t} y2={chartH - M.b} stroke={col} strokeOpacity="0.25" strokeDasharray="3 3" />
              <circle cx={px} cy={py} r="5" fill={col} stroke="#000" strokeWidth="1.5">
                <title>{`${s.title} (${s.year.toFixed(1)}) · ${s.sub}`}</title>
              </circle>
              <text x={px} y={py - 10} textAnchor="middle" fontSize="10" fontWeight="700" fill={col}>
                {s.title}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function Legend() {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
      {DETECTORS.map((d) => (
        <span key={d.det} className="num flex items-center gap-2 text-[0.75rem] text-ink/70">
          <span className="h-2 w-2" style={{ background: d.color }} />D{d.det} {d.lo}–{d.hi}
        </span>
      ))}
      <span className="flex items-center gap-2 text-[0.75rem] text-ink/70">
        <span className="h-2 w-2 rounded-full border border-ink/70" /> hollow = pipeline-flagged
      </span>
    </div>
  );
}

export function Meta({
  shot,
  plane,
  grid,
  pack,
  label,
}: {
  shot: Shot | null;
  plane: Plane | null;
  grid: Grid | undefined;
  pack: Pack | null;
  label: string;
}) {
  const [inspectOpen, setInspectOpen] = useState(false);
  const rows: [string, ReactNode][] = [];
  let flags: [string, number][] = [];
  let flagged = 0;
  let count = 0;

  const constituent = useMemo(() => (shot && pack && shot.members.length ? shot.members.map((k) => pack.frames[k]) : []), [shot, pack]);

  if (shot && pack && constituent.length) {
    count = constituent.length;
    const lams = constituent.map((f) => f.lam);
    const tally = new Map<string, number>();
    for (const f of constituent) {
      let any = false;
      for (const [bit, name] of Object.entries(pack.flagNames)) {
        if (INFO_FLAGS.has(name) || !(f.cflags & (1 << Number(bit)))) continue;
        any = true;
        tally.set(name, (tally.get(name) ?? 0) + 1);
      }
      if (any) flagged++;
    }
    flags = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    rows.push(['Product', `SPHEREx Level-2 · ${pack.release}`]);
    rows.push(['Observed', shot.mjd && shot.mjd[0] !== shot.mjd[1] ? `${fmtDate(shot.mjd[0])} → ${fmtDate(shot.mjd[1])}` : shot.title]);
    rows.push(['Exposures', count > 1 ? `${count}, outlier-rejected co-add` : '1']);
    rows.push(['Detectors', [...new Set(constituent.map((f) => f.det))].sort().map((d) => `D${d}`).join(' ')]);
    rows.push(['Wavelength', count > 1 ? `${Math.min(...lams).toFixed(2)}–${Math.max(...lams).toFixed(2)} µm` : `${constituent[0].lam.toFixed(3)} µm · Δλ ${constituent[0].dlam.toFixed(3)}`]);
    rows.push(['Noise RMS', `${(plane ?? shot).sigma.toPrecision(3)} MJy/sr`]);
    rows.push(['PSF FWHM', `${med(constituent.map((f) => f.fwhm)).toFixed(1)}"`]);
  } else if (shot) {
    rows.push(['Product', shot.origin]);
    rows.push(['Layer', shot.title]);
    rows.push(['Epoch', `${shot.year.toFixed(1)}`]);
    if (shot.lam) rows.push(['Wavelength', `${shot.lam.toFixed(shot.lam < 1 ? 2 : 3)} µm`]);
    rows.push(['Pixels', '8-bit HiPS preview, auto-levelled']);
  }

  const handleFitsExport = () => {
    if (!shot || !plane || !grid) return;
    const bytes = buildFitsBytes(plane, grid, {
      object: label || pack?.target.name || 'Field',
      bunit: shot.unit === 'MJy/sr' ? 'MJy / sr' : 'DN_PREVIEW',
      mjdObs: shot.mjd ? 0.5 * (shot.mjd[0] + shot.mjd[1]) : undefined,
      dateObs: shot.mjd ? fmtDate(shot.mjd[0]) : undefined,
      lamUm: shot.lam,
      exposures: constituent.length || 1,
      sigma: plane.sigma,
    });
    const slug = (label || 'field').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const tag = shot.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    downloadBytes(`rendezvous-${slug}-${tag}.fits`, bytes);
  };

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="eyebrow">Frame metadata</h3>
        {shot && plane && grid && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleFitsExport}
              className="micro min-h-9 border border-ink/25 px-2.5 text-ink/80 transition-colors hover:border-ink hover:bg-ink hover:text-black"
              title="Download this exact WCS-calibrated image plane (and flag mask) as a 32-bit FITS file"
            >
              Export .fits
            </button>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event('rv:png'))}
              className="micro min-h-9 border border-ink/25 px-2.5 text-ink/80 transition-colors hover:border-ink hover:bg-ink hover:text-black"
            >
              PNG
            </button>
          </div>
        )}
      </div>
      {shot ? (
        <>
          <p className="mt-3 text-sm leading-relaxed text-ink/65">{shot.sub}</p>
          <dl className="mt-5 border-t border-ink/12">
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-6 border-b border-ink/12 py-2.5">
                <dt className="micro shrink-0 text-ink/75">{k}</dt>
                <dd className="num min-w-0 break-words text-right text-sm text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          {count > 0 && (
            <div className="mt-5">
              <p className="micro text-ink/75">Contamination flags at target</p>
              {flagged === 0 ? (
                <p className="mt-2 text-sm text-ink/80">Clean in {count > 1 ? `all ${count} exposures` : 'this exposure'}.</p>
              ) : (
                <>
                  <p className="mt-2 text-sm text-ink/80">
                    <span className="num text-signal">{flagged}</span> of <span className="num">{count}</span> exposure{count > 1 ? 's' : ''} flagged within 15" of the field centre.
                  </p>
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {flags.map(([name, c]) => (
                      <li key={name} title={FLAG_DOCS[name] ?? name} className="num border border-signal/60 px-2 py-1 text-[0.6875rem] font-semibold tracking-wider text-signal">
                        {name} <span className="text-signal/70">×{c}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
          {constituent.length > 0 && pack && (
            <div className="mt-5">
              <div className="flex items-center justify-between gap-3">
                <p className="micro text-ink/75">Constituent exposures ({constituent.length})</p>
                <button
                  type="button"
                  onClick={() => setInspectOpen((o) => !o)}
                  className="micro py-1 text-ink/70 underline decoration-ink/30 underline-offset-4 hover:text-ink hover:decoration-ink"
                >
                  {inspectOpen ? 'Collapse' : 'Inspect headers'}
                </button>
              </div>
              {inspectOpen ? (
                <div className="thin-scroll mt-2 max-h-56 overflow-y-auto border border-ink/15">
                  <table className="w-full border-collapse text-left text-[0.75rem]">
                    <thead>
                      <tr className="border-b border-ink/20 bg-ink/[0.03]">
                        <th className="micro px-2.5 py-2 text-ink/75">OBSID</th>
                        <th className="micro px-2 py-2 text-ink/75">Det</th>
                        <th className="micro px-2 py-2 text-ink/75">λ (µm)</th>
                        <th className="micro px-2 py-2 text-ink/75">1σ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {constituent.map((f) => {
                        const fl = flagList(pack, f.cflags).filter((nm) => !INFO_FLAGS.has(nm));
                        return (
                          <tr key={f.k} className="border-b border-ink/10 last:border-0" title={fl.length ? `Flags: ${fl.join(', ')}` : 'Clean'}>
                            <td className="num px-2.5 py-1.5 text-ink/85">{f.obsid}</td>
                            <td className="num px-2 py-1.5 text-ink/70">D{f.det}</td>
                            <td className="num px-2 py-1.5 text-ink/85">{f.lam.toFixed(3)}</td>
                            <td className="num px-2 py-1.5 text-ink/70">
                              {f.sigma.toPrecision(2)}
                              {fl.length > 0 && <span className="ml-1 text-signal">●</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <ul className="mt-2 space-y-1 text-[0.8125rem] text-ink/75">
                  {constituent.slice(0, 3).map((f) => (
                    <li key={f.k} className="num flex items-center justify-between gap-3 py-0.5">
                      <span className="truncate">{f.obsid} · D{f.det}</span>
                      <span className="shrink-0 text-ink/75">{f.lam.toFixed(3)} µm · {f.proc}</span>
                    </li>
                  ))}
                  {count > 3 && <li className="num text-[0.75rem] text-ink/70">+ {count - 3} more in this stack — click Inspect headers</li>}
                </ul>
              )}
            </div>
          )}
        </>
      ) : (
        <p className="mt-3 text-sm text-ink/80">No frame loaded.</p>
      )}
    </div>
  );
}
