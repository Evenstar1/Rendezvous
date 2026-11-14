import { useCallback, useEffect, useMemo, useState } from 'react';
import { fmtDate, fmtDec, fmtRA } from '../../lib/coords';
import { buildShots, psfEncircledEnergy, targetAt, type Pack, type Phot, type Shot } from '../../lib/packs';
import type { Plane } from '../../lib/render';
import {
  copyText,
  coverageCsv,
  coverageStats,
  cubePhotometry,
  download,
  findMovers,
  fitBlackbody,
  foldLightCurve,
  framesCsv,
  kinematicAssessment,
  lombScargle,
  measureAstrometry,
  molecularBands,
  moversCsv,
  newNote,
  notesMarkdown,
  peakOf,
  photometryCsv,
  radialProfile,
  readNotes,
  spectralIndex,
  toMag,
  variabilityStats,
  writeNotes,
  type EpochStat,
  type Mover,
  type Note,
} from '../../lib/science';
import { gridToSky, type Grid } from '../../lib/spherex';
import type { View } from '../../state';
import { cn } from '../../utils/cn';
import { useWidth } from '../ui';
import {
  AstrometryDriftChart,
  CoverageChart,
  Legend,
  LightCurve,
  MoversChart,
  MultiMissionLightCurve,
  PeriodogramChart,
  PhaseCurveChart,
  RadialProfileChart,
  Spectrum,
} from './Charts';
import { FieldDiagram } from './FieldDiagram';

export type ResearchTab = 'spec' | 'curve' | 'astrom' | 'movers' | 'coverage' | 'field' | 'log';

const TABS: { id: ResearchTab; label: string; hint: string }[] = [
  { id: 'spec', label: 'Spectrum', hint: 'SED, blackbody & molecular bands' },
  { id: 'curve', label: 'Light curve', hint: 'Variability, periodogram & phase fold' },
  { id: 'astrom', label: 'Astrometry', hint: 'Proper motion, kinematics & PSF profile' },
  { id: 'movers', label: 'Movers', hint: 'Sub-pixel dipole candidate search' },
  { id: 'coverage', label: 'Coverage', hint: 'Visits, noise & 5σ depth limits' },
  { id: 'field', label: 'Field CMD', hint: 'Gaia–WISE colour–magnitude & reddest sources' },
  { id: 'log', label: 'Notebook', hint: 'Self-contained discovery dossier' },
];

const Action = ({ children, onClick, primary, active }: { children: React.ReactNode; onClick: () => void; primary?: boolean; active?: boolean }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={cn(
      'micro flex min-h-9 items-center gap-2 border px-2.5 transition-colors',
      primary || active ? 'border-ink bg-ink text-black hover:bg-ink/85' : 'border-ink/25 text-ink/75 hover:border-ink hover:bg-ink/10 hover:text-ink',
    )}
  >
    {children}
  </button>
);

const Stat = ({ label, value, unit, tone }: { label: string; value: string; unit?: string; tone?: 'signal' }) => (
  <div className="min-w-0 border-l border-ink/15 pl-3">
    <p className="micro text-ink/75">{label}</p>
    <p className={cn('num mt-1 truncate text-[0.95rem] font-semibold', tone === 'signal' ? 'text-signal' : 'text-ink')}>
      {value}
      {unit && <span className="ml-1 text-[0.75rem] font-medium text-ink/75">{unit}</span>}
    </p>
  </div>
);

interface Props {
  pack: Pack | null;
  phot: Phot[];
  shot: Shot | null;
  shots: Shot[];
  plane: Plane | null;
  grid: Grid;
  onGotoEpoch: (e: number) => void;
  onInspect: (m: Mover) => void;
  onResetProbe: () => void;
  probe: { i: number; j: number } | null;
  view: View;
  set: (p: Partial<View>) => void;
  sky: null | 'legacy' | 'sweep';
  onGuide: () => void;
}

export function Research({ pack, phot, shot, shots, plane, grid, onGotoEpoch, onInspect, onResetProbe, probe, view, set, sky, onGuide }: Props) {
  const [tab, setTab] = useState<ResearchTab>('spec');
  const [chartRef, width] = useWidth<HTMLDivElement>();
  const [errors, setErrors] = useState(false);
  const [sedModel, setSedModel] = useState<'none' | 'planck' | 'power'>('planck');
  const [lcMode, setLcMode] = useState<'time' | 'ls' | 'phase'>('time');
  const [trialPeriod, setTrialPeriod] = useState<number | null>(null);
  const [astMode, setAstMode] = useState<'pm' | 'psf'>('pm');
  const [previewMd, setPreviewMd] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState('');
  const [title, setTitle] = useState('');
  const [savedId, setSavedId] = useState('');
  const [msg, setMsg] = useState('');

  const guided = view.mode === 'guided';
  const targetId = pack?.id ?? `sky-${grid.ra.toFixed(2)}-${grid.dec.toFixed(2)}`;

  useEffect(() => {
    const on = (e: Event) => {
      const t = (e as CustomEvent<string>).detail as ResearchTab;
      if (TABS.some((x) => x.id === t)) setTab(t);
    };
    window.addEventListener('rv:tab', on);
    return () => window.removeEventListener('rv:tab', on);
  }, []);

  useEffect(() => {
    setNotes(readNotes().filter((n) => n.target === targetId));
  }, [targetId]);

  useEffect(() => {
    setTrialPeriod(null);
  }, [targetId, probe?.i, probe?.j]);

  useEffect(() => {
    setTitle(pack ? `${pack.target.name} · ${shot?.title ?? 'field'}` : `${view.label || 'Sky field'} · ${shot?.title ?? ''}`);
  }, [pack, shot?.title, view.label]);

  const movers = useMemo(() => (pack ? findMovers(pack, view.dets, view.moverSn) : []), [pack, view.dets, view.moverSn]);
  const coverage = useMemo<EpochStat[]>(() => (pack ? coverageStats(pack, view.aperture) : []), [pack, view.aperture]);

  // Photometry: calibrated L2 exposures or All-Sky SPHEREx 102-channel cube sweep
  const skyCubePhot = useMemo(() => (sky === 'sweep' ? cubePhotometry(shots, probe?.i, probe?.j) : []), [sky, shots, probe?.i, probe?.j]);
  const activePhot = pack ? phot : skyCubePhot;
  const allFlagged = activePhot.length > 0 && activePhot.every((p) => p.flagged);

  const spec = useMemo(() => (pack ? spectralIndex(phot, allFlagged) : null), [pack, phot, allFlagged]);
  const bb = useMemo(() => (pack ? fitBlackbody(phot, allFlagged) : null), [pack, phot, allFlagged]);
  const bands = useMemo(() => (pack ? molecularBands(phot, allFlagged) : []), [pack, phot, allFlagged]);
  const peak = useMemo(() => peakOf(activePhot), [activePhot]);
  const detPhot = useMemo(() => phot.filter((p) => view.dets.includes(p.det)), [phot, view.dets]);
  const detAllFlagged = detPhot.length > 0 && detPhot.every((p) => p.flagged);
  const varRep = useMemo(() => (pack ? variabilityStats(detPhot, detAllFlagged) : null), [pack, detPhot, detAllFlagged]);
  const pg = useMemo(() => (pack ? lombScargle(detPhot, detAllFlagged) : null), [pack, detPhot, detAllFlagged]);
  const foldPeriod = trialPeriod ?? pg?.bestPeriod ?? 10;
  const phasePts = useMemo(() => (pack && lcMode === 'phase' ? foldLightCurve(detPhot, foldPeriod, detAllFlagged) : []), [pack, lcMode, detPhot, foldPeriod, detAllFlagged]);

  // Multi-epoch astrometry: works on Level-2 visit co-adds AND on All-Sky multi-decade surveys!
  const epochSequence = useMemo(() => {
    if (pack) return buildShots(pack, 'epoch', view.dets);
    if (sky === 'legacy') return shots;
    return [];
  }, [pack, view.dets, sky, shots]);

  const probeCoords = useMemo(() => {
    if (probe) return gridToSky(grid, probe.i, probe.j);
    if (pack) {
      const [ti, tj] = targetAt(pack, shot?.year ?? 2025.9);
      return gridToSky(grid, ti, tj);
    }
    return [grid.ra, grid.dec] as [number, number];
  }, [probe, pack, grid, shot?.year]);

  const astSol = useMemo(() => {
    if (epochSequence.length < 2) return null;
    const seed = probe
      ? () => [probe.i, probe.j] as [number, number]
      : pack
        ? (yr: number) => targetAt(pack, yr)
        : () => [(grid.n - 1) / 2, (grid.n - 1) / 2] as [number, number];
    return measureAstrometry(epochSequence, grid, seed);
  }, [epochSequence, grid, probe, pack]);

  const kin = useMemo(() => {
    const mu = astSol ? astSol.pmTotArcsecYr : pack ? Math.hypot(pack.target.astrom.pmra, pack.target.astrom.pmdec) / 1000 : 0;
    const base = astSol?.baselineYr ?? 1.0;
    const plx = !probe && pack ? pack.target.astrom.plx : null;
    return kinematicAssessment(probeCoords[0], probeCoords[1], mu, base, plx, bb?.tempK ?? null);
  }, [astSol, pack, probe, probeCoords, bb?.tempK]);

  const psfRep = useMemo(() => {
    const [cx, cy] = probe ? [probe.i, probe.j] : pack ? targetAt(pack, shot?.year ?? 2025.9) : [(grid.n - 1) / 2, (grid.n - 1) / 2];
    const nom = pack ? 8.1 : Math.max(2.2 * grid.scale, 6.0);
    return radialProfile(plane, grid, cx, cy, nom);
  }, [plane, grid, probe, pack, shot?.year]);

  const scale = pack && view.units === 'ujy' ? 1000 : 1;
  const ulabel = !pack ? 'DN (cube)' : view.units === 'ujy' ? 'µJy' : 'mJy';
  const scaled = useMemo(() => activePhot.map((p) => ({ ...p, flux: p.flux * scale, err: p.err * scale })), [activePhot, scale]);
  const modelCurve = useMemo<[number, number][] | null>(() => {
    if (!pack || sedModel === 'none') return null;
    if (sedModel === 'planck' && bb) return bb.curve.map(([l, v]) => [l, v * scale]);
    if (sedModel === 'power' && spec && spec.curve.length) return spec.curve.map(([l, v]) => [l, v * scale]);
    return null;
  }, [pack, sedModel, bb, spec, scale]);

  const medianLimMag = useMemo(() => {
    const s = coverage.map((c) => c.lim5Mag).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
    return s.length ? s[s.length >> 1] : NaN;
  }, [coverage]);

  const eeNow = useMemo(() => psfEncircledEnergy(view.aperture * grid.scale, 8.1), [view.aperture, grid.scale]);

  const add = useCallback(
    (note: Omit<Note, 'id' | 'created'>) => {
      const all = [...readNotes(), newNote(note)];
      writeNotes(all);
      setNotes(all.filter((n) => n.target === targetId));
      setSavedId(note.title);
      setTimeout(() => setSavedId(''), 2400);
    },
    [targetId],
  );

  const del = (id: string) => {
    const all = readNotes().filter((n) => n.id !== id);
    writeNotes(all);
    setNotes(all.filter((n) => n.target === targetId));
  };

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(''), 2400);
  };

  const chartH = width < 520 ? 250 : 320;
  const whereLabel = probe
    ? `Probe at ${fmtRA(probeCoords[0], 1)} ${fmtDec(probeCoords[1], 0)}`
    : pack
      ? `Following ${pack.target.name} along its proper-motion track`
      : `Field centre ${fmtRA(grid.ra, 1)} ${fmtDec(grid.dec, 0)}`;

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h3 className="eyebrow">Scientific bench</h3>
          <button type="button" onClick={onGuide} className="micro py-1 text-ink/75 underline decoration-ink/20 underline-offset-4 transition-colors hover:text-ink hover:decoration-ink">
            methods & equations
          </button>
        </div>
        <div role="tablist" aria-label="Scientific instruments" className="flex flex-wrap border border-ink/20">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              aria-controls={'panel-' + t.id}
              onClick={() => setTab(t.id)}
              title={t.hint}
              className={cn('micro min-h-9 border-l border-ink/20 px-2.5 first:border-l-0 transition-colors sm:px-3', tab === t.id ? 'bg-ink text-black' : 'text-ink/65 hover:bg-ink/10 hover:text-ink')}
            >
              {t.label}
              {t.id === 'movers' && movers.length > 0 && <span className={cn('num ml-1.5 text-[0.6875rem]', tab === t.id ? 'text-black/60' : 'text-signal')}>{movers.length}</span>}
              {t.id === 'log' && notes.length > 0 && <span className={cn('num ml-1.5 text-[0.6875rem]', tab === t.id ? 'text-black/60' : 'text-ink/75')}>{notes.length}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[0.8125rem] text-ink/80">
        <span className="num">{whereLabel}</span>
        {probe && (
          <button type="button" onClick={onResetProbe} className="micro py-1 text-ink/75 underline decoration-ink/30 underline-offset-4 hover:text-ink hover:decoration-ink">
            Reset probe to field target
          </button>
        )}
      </div>

      {/* =============================== SPECTRUM =============================== */}
      {tab === 'spec' && (
        <div id="panel-spec" role="tabpanel" className="mt-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <p className="max-w-xl text-[0.8125rem] leading-relaxed text-ink/80">
              {!pack
                ? 'All-sky mode samples the 102-channel SPHEREx DR1 cube directly at the reticle or clicked probe. Switch to a Level-2 field (or drop local FITS files) for absolute mJy flux calibration.'
                : guided
                  ? 'Every point is one calibrated infrared colour. Dips mark molecules like water and methane absorbing starlight; the dashed curve fits a thermal blackbody.'
                  : `Sub-pixel circular aperture (r = ${(view.aperture * grid.scale).toFixed(1)}", ${view.apCorr ? `PSF EE = ${(eeNow * 100).toFixed(1)}% corrected` : 'uncorrected raw sum'}). Dashed curve shows weighted Planck B_ν(T_eff) or power-law F_ν ∝ λ^α.`}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {pack && (
                <>
                  <div className="flex border border-ink/20" role="group" aria-label="Spectral continuum model">
                    {([
                      ['planck', 'Planck'],
                      ['power', 'Power'],
                      ['none', 'Off'],
                    ] as const).map(([id, lbl]) => (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={sedModel === id}
                        onClick={() => setSedModel(id)}
                        className={cn('micro min-h-9 border-l border-ink/20 px-2.5 first:border-l-0', sedModel === id ? 'bg-ink text-black' : 'text-ink/65 hover:text-ink')}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                  <div className="flex border border-ink/20">
                    {(['mJy', 'ujy'] as const).map((u) => (
                      <button key={u} type="button" aria-pressed={view.units === u} onClick={() => set({ units: u })} className={cn('micro min-h-9 border-l border-ink/20 px-2.5 first:border-l-0', view.units === u ? 'bg-ink text-black' : 'text-ink/65 hover:text-ink')}>
                        {u === 'mJy' ? 'mJy' : 'µJy'}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <Action active={errors} onClick={() => setErrors((e) => !e)}>±1σ</Action>
              {activePhot.length > 0 && (
                <Action onClick={() => download(`rendezvous-spectrum-${targetId}.csv`, photometryCsv(activePhot, view.label))}>CSV</Action>
              )}
            </div>
          </div>

          {pack && activePhot.length > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat
                label="Planck T_eff"
                value={bb ? `${Math.round(bb.tempK)}` : '—'}
                unit={bb ? `±${Math.round(bb.errK)} K · χ²ν ${bb.chi2Red.toFixed(1)}` : ''}
              />
              <Stat
                label="Power-law α"
                value={spec && Number.isFinite(spec.alpha) ? spec.alpha.toFixed(2) : '—'}
                unit={spec && Number.isFinite(spec.err) ? `±${spec.err.toFixed(2)}` : ''}
              />
              <Stat
                label="Peak flux"
                value={peak ? `${(peak.flux * scale).toPrecision(3)}` : '—'}
                unit={peak ? `${ulabel} @ ${peak.lam.toFixed(2)} µm` : ''}
              />
              <Stat
                label="Peak AB mag"
                value={peak && Number.isFinite(toMag(peak.flux)) ? toMag(peak.flux).toFixed(2) : '—'}
                unit={bb ? `θd ${bb.angDiamMas < 0.01 ? bb.angDiamMas.toExponential(1) : bb.angDiamMas.toFixed(2)} mas` : ''}
              />
            </div>
          )}

          <div ref={chartRef} className="mt-4">
            {!pack && sky === 'legacy' ? (
              <div className="mt-4 grid min-h-48 place-items-center border border-ink/15 p-8 text-center">
                <div>
                  <p className="max-w-md text-sm leading-relaxed text-ink/65">Switch the all-sky sequence to Spectrum to sample the 102-channel SPHEREx cube at this position.</p>
                  <button type="button" onClick={() => set({ skyMode: 'sweep' })} className="btn btn-sm mt-4">
                    Sweep SPHEREx cube
                  </button>
                </div>
              </div>
            ) : activePhot.length === 0 ? (
              <Empty text="No usable aperture here. Move the probe away from the field boundary, or click a source whose core is not completely masked by saturation." />
            ) : width > 0 ? (
              <Spectrum phot={scaled} lam={shot?.lam ?? null} width={width} height={chartH} unit={ulabel} errors={errors} model={modelCurve} />
            ) : null}
          </div>

          {pack && bands.length > 0 && (
            <div className="mt-4 border border-ink/15 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="micro text-ink/75">Continuum-interpolated molecular band diagnostics</p>
                <p className="micro text-ink/70">Positive depth = absorption · EW in nm</p>
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
                {bands.map((b) => {
                  const strong = b.sn >= 3;
                  return (
                    <div key={b.species} className={cn('border px-2.5 py-2', strong ? 'border-signal/60 bg-signal/[0.05]' : 'border-ink/12')}>
                      <p className="micro truncate text-ink/70">{b.species}</p>
                      <p className={cn('num mt-1 text-sm font-semibold', strong ? 'text-signal' : 'text-ink/85')}>
                        {(b.depth * 100).toFixed(0)}% <span className="text-[0.7rem] font-normal text-ink/75">±{(b.errDepth * 100).toFixed(0)}%</span>
                      </p>
                      <p className="num text-[0.6875rem] text-ink/75">
                        EW {b.ewNm.toFixed(0)} nm · {b.sn.toFixed(1)}σ
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activePhot.length > 0 && <Legend />}
          {pack && activePhot.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[0.8125rem] leading-relaxed text-ink/75">
              <span>
                AB zero point 3631 Jy (m_AB = 23.90 − 2.5 log₁₀ F_mJy).
                {bb && ` Bolometric flux F_bol ≈ ${bb.fbolWm2.toExponential(2)} W m⁻².`}
                {allFlagged && ' Core exposures carry saturation flags — treat flux and T_eff as bounds.'}
              </span>
              <Action
                onClick={() =>
                  add({
                    target: targetId,
                    kind: 'measurement',
                    title: `Spectrum · ${whereLabel}`,
                    body: `T_eff = ${bb ? `${Math.round(bb.tempK)} ± ${Math.round(bb.errK)} K (χ²_ν = ${bb.chi2Red.toFixed(2)})` : 'n/a'}, power-law α = ${spec && Number.isFinite(spec.alpha) ? `${spec.alpha.toFixed(2)} ± ${spec.err.toFixed(2)}` : 'n/a'}, peak = ${peak ? `${peak.flux.toPrecision(3)} mJy @ ${peak.lam.toFixed(2)} µm` : 'n/a'}. Strongest bands: ${bands.filter((b) => b.sn >= 3).map((b) => `${b.species} (${(b.depth * 100).toFixed(0)}%, ${b.sn.toFixed(1)}σ)`).join('; ') || 'none >3σ'}.`,
                    ra: probeCoords[0],
                    dec: probeCoords[1],
                    frame: shot?.title,
                  })
                }
              >
                Log SED
              </Action>
            </div>
          )}
        </div>
      )}

      {/* ============================= LIGHT CURVE ============================= */}
      {tab === 'curve' && (
        <div id="panel-curve" role="tabpanel" className="mt-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <p className="max-w-xl text-[0.8125rem] leading-relaxed text-ink/80">
              {guided
                ? 'Tests whether the source stays steady or breathes over time. Use Periodogram to search for a repeating cycle, then Phase-fold to stack every cycle together.'
                : 'Time series per visit & band, Zechmeister–Kürster (2009) generalized floating-mean Lomb–Scargle periodogram on SED-normalized residuals, and two-cycle phase fold.'}
            </p>
            {pack && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex border border-ink/20" role="group" aria-label="Time-domain view">
                  {([
                    ['time', 'Time'],
                    ['ls', 'Periodogram'],
                    ['phase', 'Phase-fold'],
                  ] as const).map(([id, lbl]) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={lcMode === id}
                      onClick={() => setLcMode(id)}
                      className={cn('micro min-h-9 border-l border-ink/20 px-2.5 first:border-l-0', lcMode === id ? 'bg-ink text-black' : 'text-ink/65 hover:text-ink')}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
                <Action onClick={() => download(`rendezvous-lightcurve-${pack.id}.csv`, photometryCsv(phot, pack.target.name))}>CSV</Action>
              </div>
            )}
          </div>

          {pack && varRep && phot.length > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat
                label="Constant-flux χ²_ν"
                value={Number.isFinite(varRep.chi2Red) ? varRep.chi2Red.toFixed(2) : '—'}
                unit={varRep.variable ? 'VARIABLE' : `dof ${varRep.dof}`}
                tone={varRep.variable ? 'signal' : undefined}
              />
              <Stat
                label="Intrinsic RMS F_var"
                value={Number.isFinite(varRep.fvar) ? `${(varRep.fvar * 100).toFixed(1)}` : '—'}
                unit={Number.isFinite(varRep.fvarErr) ? `±${(varRep.fvarErr * 100).toFixed(1)}%` : '%'}
              />
              <Stat label="5–95% range Δm" value={Number.isFinite(varRep.ampMag) ? varRep.ampMag.toFixed(2) : '—'} unit="mag" />
              <Stat
                label="Peak GLS period"
                value={pg ? pg.bestPeriod.toFixed(1) : '—'}
                unit={pg ? `d · FAP ${pg.fap < 1e-3 ? pg.fap.toExponential(1) : (pg.fap * 100).toFixed(1) + '%'}` : ''}
              />
            </div>
          )}

          {lcMode === 'phase' && pack && pg && (
            <div className="mt-3 flex flex-wrap items-center gap-3 border border-ink/15 px-3 py-2 text-[0.8125rem]">
              <label htmlFor="fold-p" className="micro text-ink/75">
                Fold period (days)
              </label>
              <input
                id="fold-p"
                type="number"
                min={0.5}
                max={2000}
                step={0.1}
                value={Number(foldPeriod.toFixed(2))}
                onChange={(e) => setTrialPeriod(Math.max(0.5, Number(e.target.value) || pg.bestPeriod))}
                className="num w-28 border border-ink/30 bg-black px-2 py-1 text-sm text-ink"
              />
              <Action onClick={() => setTrialPeriod(pg.bestPeriod)}>GLS peak ({pg.bestPeriod.toFixed(1)}d)</Action>
              <Action onClick={() => setTrialPeriod(foldPeriod * 2)}>2×P</Action>
              <Action onClick={() => setTrialPeriod(Math.max(0.5, foldPeriod / 2))}>½×P</Action>
            </div>
          )}

          <div ref={tab === 'curve' ? chartRef : undefined} className="mt-4">
            {!pack ? (
              <div className="space-y-4">
                {shots.length > 0 && (
                  <MultiMissionLightCurve
                    shots={shots}
                    width={Math.max(300, width || 600)}
                    height={chartH}
                    onSwitchToL2={() => set({ source: 'l2', targetId: 'barnard' })}
                  />
                )}
                <div className="border border-line bg-panel2 p-5 text-left">
                  <p className="micro text-cyan">Calibrated Level-2 SPHEREx time series</p>
                  <p className="mt-2 text-sm leading-relaxed text-ink/75">
                    For multi-epoch Lomb–Scargle periodograms, phase folding, and high-cadence visit photometry, switch to one of the five bundled challenge fields:
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[
                      { id: 'barnard', name: "Barnard's Star", desc: 'High proper motion · Flare search' },
                      { id: 'w0855', name: 'WISE 0855', desc: 'Cold Y dwarf (250 K)' },
                      { id: 'epsindb', name: 'ε Indi B', desc: 'Binary T/Y brown dwarf' },
                      { id: 'rwaur', name: 'RW Aurigae', desc: 'Variable young T Tauri star' },
                      { id: 'rdra', name: 'R Draconis', desc: 'Mira pulsating variable' },
                    ].map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => set({ source: 'l2', targetId: t.id })}
                        className="micro border border-ink/25 px-3 py-2 text-left text-ink hover:border-ink hover:bg-ink hover:text-black transition-colors"
                      >
                        <span className="font-semibold">{t.name}</span>
                        <span className="ml-2 block text-[0.625rem] text-ink/65 hover:text-black">{t.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : phot.length === 0 ? (
              <div className="border border-line bg-panel2 p-6 text-center">
                <p className="micro text-signal">No unmasked aperture flux at current coordinates</p>
                <p className="mt-2 text-sm text-ink/70">
                  Click any bright source in the sky viewport to pull its multi-epoch light curve and periodogram.
                </p>
                <button
                  type="button"
                  onClick={onResetProbe}
                  className="btn btn-sm mt-3"
                >
                  Reset probe to field target
                </button>
              </div>
            ) : (
              lcMode === 'time' ? (
                <LightCurve phot={scaled} pack={pack} span={shot?.mjd ?? null} width={Math.max(300, width || 600)} height={chartH} unit={ulabel} />
              ) : lcMode === 'ls' ? (
                pg ? (
                  <PeriodogramChart
                    pg={pg}
                    width={Math.max(300, width || 600)}
                    height={chartH}
                    onPickPeriod={(p) => {
                      setTrialPeriod(p);
                      setLcMode('phase');
                    }}
                  />
                ) : (
                  <Empty text="Need at least 8 usable exposures across >5 days to compute a Lomb–Scargle periodogram." />
                )
              ) : phasePts.length > 0 ? (
                <PhaseCurveChart pts={phasePts} period={foldPeriod} width={Math.max(300, width || 600)} height={chartH} />
              ) : (
                <Empty text="Not enough unmasked points to fold." />
              )
            )}
          </div>

          {pack && phot.length > 0 && (
            <>
              <Legend />
              <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink/75">
                {lcMode === 'ls'
                  ? 'Click any peak in the periodogram to phase-fold at that period. Dashed red line marks the analytical 1% false-alarm threshold.'
                  : 'F_var is Vaughan et al. (2003) excess variance above measurement error. Shaded band marks the visit currently shown in the viewport.'}
              </p>
            </>
          )}
        </div>
      )}

      {/* ============================= ASTROMETRY ============================== */}
      {tab === 'astrom' && (
        <div id="panel-astrom" role="tabpanel" className="mt-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <p className="max-w-xl text-[0.8125rem] leading-relaxed text-ink/80">
              {astMode === 'pm'
                ? guided
                  ? 'Measures the exact sub-pixel centre of the source in every epoch, fits its speed and direction across the sky, and compares solar-system vs. nearby-star distances.'
                  : 'Gaussian-windowed sub-pixel centroids per epoch with King/Lindegren astrometric uncertainties, weighted linear proper-motion fit, and reflex-parallax vs. tangential-velocity kinematics.'
                : 'Azimuthally averaged radial surface-brightness profile compared with the nominal Gaussian PSF, testing whether a candidate is a true point source, an extended coma/galaxy, or a single-pixel artefact.'}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex border border-ink/20" role="group" aria-label="Astrometry mode">
                <button
                  type="button"
                  aria-pressed={astMode === 'pm'}
                  onClick={() => setAstMode('pm')}
                  className={cn('micro min-h-9 px-2.5', astMode === 'pm' ? 'bg-ink text-black' : 'text-ink/65 hover:text-ink')}
                >
                  Proper motion
                </button>
                <button
                  type="button"
                  aria-pressed={astMode === 'psf'}
                  onClick={() => setAstMode('psf')}
                  className={cn('micro min-h-9 border-l border-ink/20 px-2.5', astMode === 'psf' ? 'bg-ink text-black' : 'text-ink/65 hover:text-ink')}
                >
                  PSF & morphology
                </button>
              </div>
            </div>
          </div>

          {astMode === 'pm' ? (
            <>
              {astSol ? (
                <>
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Stat
                      label="Measured total μ"
                      value={astSol.pmTotArcsecYr >= 0.5 ? astSol.pmTotArcsecYr.toFixed(2) : (astSol.pmTotArcsecYr * 1000).toFixed(0)}
                      unit={astSol.pmTotArcsecYr >= 0.5 ? `±${(astSol.errMasYr / 1000).toFixed(2)} "/yr` : `±${astSol.errMasYr.toFixed(0)} mas/yr`}
                      tone={astSol.pmTotArcsecYr * 1000 > 3 * astSol.errMasYr ? 'signal' : undefined}
                    />
                    <Stat label="Position angle" value={`${astSol.paDeg.toFixed(1)}°`} unit={`±${astSol.errPaDeg.toFixed(0)}° E of N`} />
                    <Stat label="μα*, μδ" value={`${(astSol.pmRaMasYr / 1000).toFixed(2)}, ${(astSol.pmDecMasYr / 1000).toFixed(2)}`} unit='"/yr' />
                    <Stat
                      label="Baseline & χ²_ν"
                      value={`${astSol.baselineYr.toFixed(2)} yr`}
                      unit={Number.isFinite(astSol.chi2Red) ? `χ²ν ${astSol.chi2Red.toFixed(2)} (${astSol.epochs.length} ep)` : `${astSol.epochs.length} ep`}
                    />
                  </div>

                  <div ref={tab === 'astrom' ? chartRef : undefined} className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
                    <div className="min-w-0 border border-ink/15 p-2">
                      {width > 0 && <AstrometryDriftChart sol={astSol} width={Math.max(240, width > 680 ? Math.floor(width * 0.46) : width - 20)} height={260} />}
                    </div>
                    <div className="min-w-0 space-y-4">
                      <div className="border border-ink/15 p-3.5">
                        <p className="micro text-ink/75">Celestial reference frames</p>
                        <dl className="num mt-2.5 space-y-1.5 text-[0.8125rem]">
                          <div className="flex justify-between gap-3">
                            <dt className="text-ink/75">ICRS (α, δ)</dt>
                            <dd className="text-ink">{fmtRA(probeCoords[0], 2)} {fmtDec(probeCoords[1], 1)}</dd>
                          </div>
                          <div className="flex justify-between gap-3">
                            <dt className="text-ink/75">Ecliptic (λ, β)</dt>
                            <dd className="text-ink">{kin.eclLon.toFixed(3)}°, {kin.eclLat >= 0 ? '+' : ''}{kin.eclLat.toFixed(3)}°</dd>
                          </div>
                          <div className="flex justify-between gap-3">
                            <dt className="text-ink/75">Galactic (l, b)</dt>
                            <dd className="text-ink">{kin.galL.toFixed(3)}°, {kin.galB >= 0 ? '+' : ''}{kin.galB.toFixed(3)}°</dd>
                          </div>
                        </dl>
                      </div>

                      <div className="border border-ink/15 p-3.5">
                        <p className="micro text-signal">In-site kinematic & distance classifier</p>
                        <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink/80">{kin.regime}</p>
                        <dl className="num mt-3 grid grid-cols-2 gap-3 border-t border-ink/12 pt-3 text-[0.75rem]">
                          <div>
                            <dt className="micro text-ink/70">If bound solar-system body</dt>
                            <dd className="mt-1 text-ink/85">
                              r_reflex ≈ {kin.rReflexAu < 10000 ? kin.rReflexAu.toFixed(0) : kin.rReflexAu.toExponential(1)} au · r_Kep ≈ {kin.rKeplerAu < 10000 ? kin.rKeplerAu.toFixed(0) : kin.rKeplerAu.toExponential(1)} au (T_eq ≈ {kin.tEqK.toFixed(0)} K)
                            </dd>
                          </div>
                          <div>
                            <dt className="micro text-ink/70">If Galactic star / brown dwarf</dt>
                            <dd className="mt-1 text-ink/85">
                              {kin.distPcCatalog !== null
                                ? `d = ${kin.distPcCatalog.toFixed(2)} pc (${(kin.distPcCatalog * 3.26156).toFixed(2)} ly) · v_t = ${kin.vtCatalogKms!.toFixed(1)} km/s`
                                : `d ≈ ${kin.distPcDisk30.toFixed(1)} pc (v_t=30) – ${kin.distPcHalo150.toFixed(0)} pc (v_t=150 km/s)`}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <span className="text-[0.75rem] text-ink/75">
                      {!probe && pack
                        ? `Catalogue reference: μ = ${(Math.hypot(pack.target.astrom.pmra, pack.target.astrom.pmdec) / 1000).toFixed(2)}"/yr (${pack.target.astrom.ref}).`
                        : 'Click any star or mover in the viewport to solve its multi-epoch astrometry.'}
                    </span>
                    <Action
                      onClick={() =>
                        add({
                          target: targetId,
                          kind: 'measurement',
                          title: `Astrometry · ${fmtRA(probeCoords[0], 1)} ${fmtDec(probeCoords[1], 0)}`,
                          body: `Measured μ = ${astSol.pmTotArcsecYr.toFixed(3)} ± ${(astSol.errMasYr / 1000).toFixed(3)} "/yr at PA ${astSol.paDeg.toFixed(1)}° ± ${astSol.errPaDeg.toFixed(0)}° over ${astSol.baselineYr.toFixed(2)} yr (${astSol.epochs.length} epochs). ${kin.regime}`,
                          ra: probeCoords[0],
                          dec: probeCoords[1],
                          frame: shot?.title,
                        })
                      }
                    >
                      Log astrometry
                    </Action>
                  </div>
                </>
              ) : (
                <div className="border border-line bg-panel2 p-6 text-center mt-4">
                  <p className="micro text-signal">Astrometric proper motion fit requires detection</p>
                  <p className="mt-2 text-sm leading-relaxed text-ink/75 max-w-lg mx-auto">
                    {sky === 'sweep'
                      ? 'The all-sky view is currently set to spectral sweep. Switch to the 34-year multi-mission sequence (DSS2 · 2MASS · AllWISE · SPHEREx) to solve proper motion across decades.'
                      : 'At least two epochs with S/N ≥ 3.2 are needed at this position to fit a linear proper motion vector. Click a brighter source in the viewport, stack more detector bands, or reset to the field target.'}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                    {sky === 'sweep' && (
                      <button
                        type="button"
                        onClick={() => set({ skyMode: 'legacy' })}
                        className="btn btn-sm"
                      >
                        Switch to 34-Year Missions
                      </button>
                    )}
                    {probe && (
                      <button
                        type="button"
                        onClick={onResetProbe}
                        className="btn btn-sm"
                      >
                        Reset probe to target
                      </button>
                    )}
                    {!pack && (
                      <button
                        type="button"
                        onClick={() => set({ source: 'l2', targetId: 'barnard' })}
                        className="btn btn-sm"
                      >
                        Load Barnard's Star (Level-2)
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div ref={tab === 'astrom' ? chartRef : undefined} className="mt-4">
              {psfRep ? (
                <>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Stat
                      label="Verdict"
                      value={psfRep.verdict === 'point' ? 'Point source' : psfRep.verdict === 'hotpixel' ? 'Sub-PSF spike' : psfRep.verdict === 'extended' ? 'Extended' : psfRep.verdict === 'saturated' ? 'Saturated' : 'Low S/N'}
                      tone={psfRep.verdict === 'hotpixel' || psfRep.verdict === 'saturated' ? 'signal' : undefined}
                    />
                    <Stat label="Measured FWHM" value={Number.isFinite(psfRep.fwhmMeasured) ? `${psfRep.fwhmMeasured.toFixed(1)}"` : '—'} unit={`nom ${psfRep.fwhmNominal.toFixed(1)}"`} />
                    <Stat label="Sharpness I₀/⟨I₁⟩" value={Number.isFinite(psfRep.sharpness) ? psfRep.sharpness.toFixed(2) : '—'} />
                    <Stat label="Ellipticity 1−b/a" value={psfRep.ellipticity.toFixed(2)} unit={`peak ${psfRep.peakSn.toFixed(1)}σ`} />
                  </div>
                  <div className="mt-4">
                    <RadialProfileChart rep={psfRep} apArcsec={view.aperture * grid.scale} width={Math.max(300, width || 600)} height={260} />
                  </div>
                  <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink/65">
                    <span className="text-ink">{psfRep.summary}</span> Solid white curve: azimuthally averaged profile; dashed red curve: nominal Gaussian PSF; vertical line: current photometric aperture.
                  </p>
                </>
              ) : (
                <Empty text="Move the probe inside the image interior to measure its radial PSF profile." />
              )}
            </div>
          )}
        </div>
      )}

      {/* =============================== MOVERS ================================ */}
      {tab === 'movers' && (
        <div id="panel-movers" role="tabpanel" className="mt-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <p className="max-w-xl text-[0.8125rem] leading-relaxed text-ink/80">
              {guided
                ? 'Subtracts visits and pairs bright/dark sub-pixel lobes to spot objects that shifted position. Inspect every candidate in the Astrometry and PSF tabs before logging.'
                : `Sub-pixel dipole pairing across consecutive and full-baseline epoch co-adds (bands D${view.dets.join('D')}). Checks intermediate-visit linearity and cross-matches Gaia DR3 & CatWISE2020.`}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex border border-ink/20">
                {[4, 5, 6].map((sn) => (
                  <button key={sn} type="button" aria-pressed={view.moverSn === sn} onClick={() => set({ moverSn: sn })} className={cn('num micro min-h-9 border-l border-ink/20 px-2.5 first:border-l-0', view.moverSn === sn ? 'bg-ink text-black' : 'text-ink/65 hover:text-ink')}>
                    {sn}σ
                  </button>
                ))}
              </div>
              <Action active={view.tools.movers} onClick={() => set({ tools: { ...view.tools, movers: !view.tools.movers } })}>{view.tools.movers ? 'Markers on' : 'Markers'}</Action>
              {pack && movers.length > 0 && <Action onClick={() => download(`rendezvous-candidates-${pack.id}.csv`, moversCsv(movers))}>CSV</Action>}
            </div>
          </div>

          {!pack ? (
            <Empty text="Automated dipole search requires calibrated noise & flag maps (available on all five bundled SPHEREx targets and on any local FITS exposures dropped into the viewer). In All-Sky mode, use Difference + Astrometry across DSS2 / 2MASS / AllWISE / SPHEREx." />
          ) : movers.length === 0 ? (
            <Empty text={`No balanced dipoles above ${view.moverSn}σ in the selected bands. Lower the threshold to 4σ, enable more detector bands, or inspect sub-pixel drift in the Astrometry tab.`} />
          ) : (
            <>
              <p className="num mt-4 text-[0.8125rem] text-ink/75">
                {movers.length} candidate{movers.length > 1 ? 's' : ''} · {Math.max(...movers.map((m) => m.sn)).toFixed(0)}σ strongest · {view.dets.length === 6 ? 'D1–D6' : `D${view.dets.join(' D')}`}
                {savedId && <span className="ml-3 text-signal">Saved “{savedId}”</span>}
              </p>
              <div className="mt-4">
                <MoversChart movers={movers} onInspect={onInspect} width={Math.max(320, width || 640)} />
              </div>
              <div className="thin-scroll mt-5 overflow-x-auto border border-ink/15">
                <table className="w-full min-w-[48rem] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-ink/20">
                      {['ID', 'Position (ICRS)', 'S/N', 'Shift & Rate', 'Baseline', 'Status', ''].map((h) => (
                        <th key={h} className="micro px-3 py-2.5 font-semibold text-ink/75">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {movers.map((m) => (
                      <tr key={m.id} className="border-b border-ink/10 transition-colors last:border-0 hover:bg-ink/[0.045]">
                        <td className="num px-3 py-3 text-sm font-semibold text-signal">{m.id}</td>
                        <td className="num whitespace-nowrap px-3 py-3 text-[0.8125rem]">
                          {fmtRA(m.ra, 1)} {fmtDec(m.dec, 0)}
                        </td>
                        <td className="num px-3 py-3 text-sm">{m.sn.toFixed(0)}σ</td>
                        <td className="num whitespace-nowrap px-3 py-3 text-[0.8125rem]">
                          {m.sep.toFixed(1)}" <span className="text-ink/75">({m.rateArcsecYr.toFixed(1)}"/yr · PA {m.pa.toFixed(0)}°)</span>
                        </td>
                        <td className="px-3 py-3 text-[0.75rem] text-ink/65">
                          {m.title0} <span className="text-ink/65">→</span> {m.title1}
                        </td>
                        <td className="px-3 py-3 text-[0.75rem]">
                          {m.match ? (
                            <span className={cn('border px-1.5 py-0.5', m.match === 'target' ? 'border-signal/60 text-signal' : 'border-ink/30 text-ink/70')}>
                              {m.match === 'target' ? 'target track' : m.match}
                            </span>
                          ) : (
                            <span className="border border-ink/20 px-1.5 py-0.5 text-ink/75">unmatched</span>
                          )}
                          {m.consistent && m.e1 - m.e0 >= 2 && <span className="ml-1.5 text-ink/70">· multi-visit</span>}
                          {m.flagged && <span className="ml-1.5 text-signal">· flagged</span>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right">
                          <button type="button" onClick={() => onInspect(m)} className="micro min-h-8 px-2 text-ink/80 hover:text-ink">
                            Inspect
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              add({
                                target: targetId,
                                kind: 'candidate',
                                title: `${m.id} · ${fmtRA(m.ra, 1)} ${fmtDec(m.dec, 0)}`,
                                body: `Dipole S/N ${m.sn.toFixed(1)}, shift ${m.sep.toFixed(2)}" (${m.rateArcsecYr.toFixed(2)}"/yr) at PA ${m.pa.toFixed(0)}° between ${m.title0} and ${m.title1}. ${m.note}`,
                                ra: m.ra,
                                dec: m.dec,
                                frame: m.title1,
                              })
                            }
                            className="micro min-h-8 px-2 text-ink/75 hover:text-ink"
                          >
                            Log
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex flex-wrap items-start justify-between gap-4 border border-signal/40 p-4">
                <p className="max-w-xl text-[0.8125rem] leading-relaxed text-ink/70">
                  <span className="micro mr-2 text-signal">Protocol</span>
                  Click <b className="text-ink">Inspect</b> on any candidate to centre the probe on it, then verify its radial PSF profile and linear trajectory in the <b className="text-ink">Astrometry</b> tab right here in Rendezvous.
                </p>
                <button type="button" onClick={() => setTab('astrom')} className="micro min-h-9 shrink-0 border border-ink/25 px-3 text-ink/80 hover:bg-ink hover:text-black">
                  Open Astrometry
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ============================== COVERAGE =============================== */}
      {tab === 'coverage' && (
        <div id="panel-coverage" role="tabpanel" className="mt-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <p className="max-w-xl text-[0.8125rem] leading-relaxed text-ink/80">
              {guided
                ? 'Every telescope visit to this field, how faint a point source it can detect at 5σ, and what share of pixels carry pipeline flags.'
                : `Visit co-add ledger with formal inverse-variance 1σ surface-brightness noise and 5σ point-source sensitivity (r = ${(view.aperture * grid.scale).toFixed(1)}", EE-corrected).`}
            </p>
            {pack && (
              <div className="flex flex-wrap gap-2">
                <Action onClick={() => download(`rendezvous-coverage-${pack.id}.csv`, coverageCsv(coverage))}>Coverage CSV</Action>
                <Action onClick={() => download(`rendezvous-exposures-${pack.id}.csv`, framesCsv(pack))}>Exposures CSV</Action>
              </div>
            )}
          </div>

          {!pack ? (
            <Empty text="Visit depth tables apply to Level-2 exposure stacks. Load one of the five bundled targets, or drop local FITS exposures into the Data Source panel." />
          ) : (
            <>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <Stat label="Visits" value={String(coverage.length)} />
                <Stat label="Exposures" value={String(pack.frames.length)} unit={`/ ${pack.available}`} />
                <Stat label="Baseline" value={((pack.frames[pack.frames.length - 1].mjd - pack.frames[0].mjd) / 30.44).toFixed(1)} unit="mo" />
                <Stat label="Median 5σ depth" value={Number.isFinite(medianLimMag) ? medianLimMag.toFixed(1) : '—'} unit="AB mag" />
                <Stat label="Pixel scale" value={pack.grid.scale.toFixed(2)} unit='"' />
                <Stat label="Field" value={(((pack.n - 1) * pack.grid.scale) / 60).toFixed(1)} unit="arcmin" />
              </div>
              <div className="mt-4">
                <CoverageChart coverage={coverage} pack={pack} onGotoEpoch={onGotoEpoch} width={Math.max(320, width || 640)} />
              </div>
              <div className="thin-scroll mt-5 overflow-x-auto border border-ink/15">
                <table className="w-full min-w-[42rem] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-ink/20">
                      {['Visit', 'Dates (UTC)', 'Exp', 'Bands', '1σ (MJy/sr)', '5σ limit', 'Wavelength', 'Flagged', ''].map((h) => (
                        <th key={h} className="micro px-3 py-2.5 font-semibold text-ink/75">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {coverage.map((c) => (
                      <tr key={c.e} className="border-b border-ink/10 last:border-0 hover:bg-ink/[0.045]">
                        <td className="num px-3 py-2.5 text-sm font-semibold">{c.e + 1}</td>
                        <td className="num whitespace-nowrap px-3 py-2.5 text-[0.8125rem]">
                          {fmtDate(c.mjd0)}
                          {fmtDate(c.mjd1) !== fmtDate(c.mjd0) ? ` → ${fmtDate(c.mjd1)}` : ''}
                        </td>
                        <td className="num px-3 py-2.5 text-[0.8125rem]">{c.n}</td>
                        <td className="num px-3 py-2.5 text-[0.8125rem]">{c.dets.map((d) => `D${d}`).join(' ')}</td>
                        <td className="num px-3 py-2.5 text-[0.8125rem]">{c.sigma.toExponential(1)}</td>
                        <td className="num whitespace-nowrap px-3 py-2.5 text-[0.8125rem]">
                          {c.lim5Mjy.toPrecision(2)} mJy <span className="text-ink/70">({c.lim5Mag.toFixed(1)})</span>
                        </td>
                        <td className="num whitespace-nowrap px-3 py-2.5 text-[0.8125rem]">
                          {c.lamMin.toFixed(2)}–{c.lamMax.toFixed(2)} µm
                        </td>
                        <td className={cn('num px-3 py-2.5 text-[0.8125rem]', c.flagged > 0.15 ? 'text-signal' : 'text-ink/70')}>{Math.round(c.flagged * 100)}%</td>
                        <td className="px-3 py-2.5 text-right">
                          <button type="button" onClick={() => onGotoEpoch(c.e)} className="micro min-h-8 px-2 text-ink/75 hover:text-ink">
                            Show
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ============================ FIELD CATALOGUE ========================== */}
      {tab === 'field' && (
        <div id="panel-field" role="tabpanel" className="mt-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <p className="max-w-xl text-[0.8125rem] leading-relaxed text-ink/70">
              {guided
                ? 'Every matched star in the field, plotted by how red it looks between Gaia’s G band and CatWISE2020 W1. The reddest points are the coldest candidates.'
                : 'Catalogue colour–magnitude diagram built from Gaia DR3 G magnitudes and CatWISE2020 W1 photometry. Counterparts are matched within 8″ at the catalogue epoch; unmatched sources are omitted, not assigned a synthetic colour.'}
            </p>
            {pack && <p className="num text-[0.6875rem] uppercase tracking-[0.12em] text-ink/70">{pack.gaia.length} Gaia · {pack.wise.length} CatWISE</p>}
          </div>
          {!pack ? (
            <Empty text="Colour–magnitude diagnostics require a bundled Level-2 pack or local FITS exposures with catalogue overlays. No colours are invented for all-sky previews." />
          ) : (
            <div className="mt-4">
              <FieldDiagram pack={pack} />
            </div>
          )}
        </div>
      )}

      {/* ============================== NOTEBOOK =============================== */}
      {tab === 'log' && (
        <div id="panel-log" role="tabpanel" className="mt-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <p className="max-w-xl text-[0.8125rem] leading-relaxed text-ink/80">
              Your self-contained discovery dossier for this field. Log SED fits, astrometric solutions, dipole candidates and free-form notes, preview the formatted report in-site, or export Markdown and JSON.
            </p>
            <div className="flex flex-wrap gap-2">
              {notes.length > 0 && (
                <>
                  <Action active={previewMd} onClick={() => setPreviewMd((v) => !v)}>{previewMd ? 'Edit view' : 'Preview dossier'}</Action>
                  <Action onClick={() => download(`rendezvous-dossier-${targetId}.md`, notesMarkdown(notes, view.label), 'text/markdown;charset=utf-8')}>Markdown</Action>
                  <Action onClick={() => download(`rendezvous-dossier-${targetId}.json`, JSON.stringify(notes, null, 2), 'application/json')}>JSON</Action>
                  <Action onClick={async () => flash((await copyText(notesMarkdown(notes, view.label))) ? 'Dossier copied' : 'Copy blocked')}>Copy</Action>
                </>
              )}
            </div>
          </div>

          {previewMd && notes.length > 0 ? (
            <pre className="thin-scroll num mt-4 max-h-96 overflow-auto whitespace-pre-wrap border border-ink/20 bg-ink/[0.02] p-4 text-[0.8125rem] leading-relaxed text-ink/85">
              {notesMarkdown(notes, view.label)}
            </pre>
          ) : (
            <>
              <form
                className="mt-4 border border-ink/15 p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!title.trim()) return;
                  add({
                    target: targetId,
                    kind: 'note',
                    title: title.trim(),
                    body: draft.trim(),
                    ra: probeCoords[0],
                    dec: probeCoords[1],
                    frame: shot?.title,
                  });
                  setDraft('');
                }}
              >
                <label htmlFor="note-title" className="micro text-ink/75">
                  Entry title
                </label>
                <input id="note-title" value={title} onChange={(e) => setTitle(e.target.value)} className="field mt-1.5 min-h-10 text-sm" maxLength={120} />
                <label htmlFor="note-body" className="micro mt-3 block text-ink/75">
                  Observation ({shot?.title ?? 'active frame'} · ICRS {fmtRA(probeCoords[0], 1)} {fmtDec(probeCoords[1], 0)})
                </label>
                <textarea
                  id="note-body"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={3}
                  placeholder="Record S/N, measured proper motion, PSF FWHM verdict, molecular features, and flag status…"
                  className="field mt-1.5 min-h-20 resize-y py-2 text-sm leading-relaxed"
                  maxLength={1200}
                />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-[0.75rem] text-ink/70">Stored locally in this browser. Works across both Level-2 and All-Sky fields.</span>
                  <button type="submit" disabled={!title.trim()} className="btn btn-sm">
                    Save entry
                  </button>
                </div>
              </form>

              {savedId && <p className="mt-3 text-sm text-signal">Saved “{savedId}”.</p>}
              {msg && <p className="mt-3 text-sm text-ink/70">{msg}</p>}

              {notes.length === 0 ? (
                <Empty text="No entries logged for this field yet. Use Log SED, Log astrometry, Log on any mover candidate, or write an observation above." />
              ) : (
                <ul className="mt-4 border-t border-ink/15">
                  {notes.map((n) => (
                    <li key={n.id} className="border-b border-ink/15 py-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-[0.9375rem] font-semibold text-ink">{n.title}</p>
                        <div className="flex items-center gap-3">
                          <span className={cn('micro border px-1.5 py-0.5', n.kind === 'candidate' ? 'border-signal/60 text-signal' : 'border-ink/25 text-ink/75')}>{n.kind}</span>
                          <span className="num text-[0.75rem] text-ink/70">{n.created.slice(0, 16).replace('T', ' ')}</span>
                          <button type="button" onClick={() => del(n.id)} className="micro min-h-8 px-1 text-ink/70 hover:text-signal" aria-label={`Delete ${n.title}`}>
                            Delete
                          </button>
                        </div>
                      </div>
                      {n.body && <p className="mt-2 max-w-2xl text-[0.8125rem] leading-relaxed text-ink/70">{n.body}</p>}
                      {n.ra !== undefined && <p className="num mt-2 text-[0.75rem] text-ink/70">ICRS {n.ra.toFixed(6)}°, {n.dec?.toFixed(6)}°</p>}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="mt-4 grid min-h-48 place-items-center border border-ink/15 p-8">
      <p className="max-w-md text-center text-sm leading-relaxed text-ink/80">{text}</p>
    </div>
  );
}
