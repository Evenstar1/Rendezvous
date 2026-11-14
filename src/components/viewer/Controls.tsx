import type { ReactNode } from 'react';
import { SURVEYS } from '../../lib/hips';
import { CHANNELS, DETECTORS, type Pack } from '../../lib/packs';
import { FOV_L2, FOV_SKY, type View } from '../../state';
import { cn } from '../../utils/cn';
import { Check, Seg } from '../ui';

function Section({ title, aside, open, children }: { title: string; aside?: ReactNode; open: boolean; children: ReactNode }) {
  return (
    <details open={open}>
      <summary>
        {title}
        {aside && (
          <span className="ml-auto flex items-center" onClick={(e) => e.stopPropagation()}>
            {aside}
          </span>
        )}
      </summary>
      <div>{children}</div>
    </details>
  );
}

const Note = ({ children }: { children: ReactNode }) => <p className="mt-2.5 text-[0.8125rem] leading-relaxed text-ink/70">{children}</p>;

const TextBtn = ({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) => (
  <button type="button" onClick={onClick} disabled={disabled} className="micro -my-1 py-1 text-ink/75 underline decoration-ink/35 underline-offset-4 transition-colors hover:text-ink hover:decoration-ink disabled:opacity-35">
    {children}
  </button>
);

interface Props {
  view: View;
  set: (p: Partial<View>) => void;
  pack: Pack | null;
  hasSnapshot: boolean;
  toL2: () => void;
  toSky: () => void;
  hi: number;
  onGuide: () => void;
  onImportFits: () => void;
}

export function Controls({ view, set, pack, hasSnapshot, toL2, toSky, hi, onGuide, onImportFits }: Props) {
  const l2 = view.source === 'l2';
  const guided = view.mode === 'guided';
  const toggleDet = (d: number) => {
    const next = view.dets.includes(d) ? view.dets.filter((x) => x !== d) : [...view.dets, d].sort();
    if (next.length) set({ dets: next, hi: null });
  };
  const toggleSurvey = (id: string) => {
    const next = view.surveys.includes(id) ? view.surveys.filter((x) => x !== id) : [...view.surveys, id];
    if (next.length) set({ surveys: SURVEYS.map((s) => s.id).filter((s) => next.includes(s)) });
  };
  const slider = Math.round((Math.log(hi / 8) / Math.log(3000 / 8)) * 100);

  return (
    <div className="deck">
      <div className="border-b border-line pb-3">
        <Seg
          label="Interface mode"
          value={view.mode}
          onChange={(mode) => set({ mode })}
          options={[
            { value: 'guided', label: 'Guided' },
            { value: 'research', label: 'Research' },
          ]}
        />
        <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink/65">
          {guided ? 'Essential controls. Switch to Research for apertures, stretch functions and measurement tools.' : 'Full instrument control. Every method is documented in the science guide.'}
        </p>
      </div>

      {guided && (
        <section className="my-4 border border-line bg-panel2 p-3">
          <p className="micro flex items-center gap-2 text-cyan">
            <span className="blip h-1.5 w-1.5 bg-cyan" /> Your first look
          </p>
          <ol className="mt-3 space-y-2 text-[0.8125rem] leading-relaxed text-ink/80">
            <li>
              <span className="num mr-2 text-ink/65">01</span>Press play and watch the image, not the numbers.
            </li>
            <li>
              <span className="num mr-2 text-ink/65">02</span>Switch to Difference. Unchanging stars cancel; anything that moved shows a bright/dark pair.
            </li>
            <li>
              <span className="num mr-2 text-ink/65">03</span>Check a candidate in two visits, then save it in the Notebook.
            </li>
          </ol>
          <button type="button" onClick={onGuide} className="micro mt-3 min-h-9 border border-line px-3 text-ink/85 transition-colors hover:border-ink hover:bg-ink hover:text-black">
            Open the science guide
          </button>
        </section>
      )}

      <Section title="Data source" open aside={<TextBtn onClick={onImportFits}>Import FITS</TextBtn>}>
        <Seg
          label="Data source"
          value={view.source}
          onChange={(v) => (v === 'l2' ? toL2() : toSky())}
          options={[
            { value: 'l2', label: 'Level-2 time series', disabled: !hasSnapshot, title: hasSnapshot ? undefined : 'Import local .fits files or load a bundled target' },
            { value: 'sky', label: 'All-sky · any field' },
          ]}
        />
        <Note>
          {l2 && pack
            ? pack.release === 'LOCAL FITS'
              ? `${pack.frames.length} local FITS exposure${pack.frames.length > 1 ? 's' : ''} reprojected and background-subtracted directly in this browser.`
              : `Real SPHEREx ${pack.release} exposures, calibrated and zodi-subtracted. ${pack.frames.length} of ${pack.available.toLocaleString('en-US')} archive frames on board (${pack.built}).`
            : l2
              ? 'Unpacking SPHEREx exposures.'
              : hasSnapshot
                ? 'Live HiPS mosaics: SPHEREx DR1 102-channel cube plus WISE, 2MASS and DSS across 34 years.'
                : 'Live all-sky mosaics across 34 years. Drop .fits files onto the viewport (or click Import FITS) to run calibrated Level-2 analysis on your own exposures.'}
        </Note>
      </Section>

      <Section title="Sequence" open>
        {l2 ? (
          <Seg
            label="Sequence"
            value={view.seq}
            onChange={(seq) => set({ seq, hi: null })}
            options={[
              { value: 'epoch', label: 'Epochs' },
              { value: 'sweep', label: 'Spectrum' },
              { value: 'frames', label: 'Exposures' },
            ]}
          />
        ) : (
          <Seg
            label="Sequence"
            value={view.skyMode}
            onChange={(skyMode) => set({ skyMode })}
            options={[
              { value: 'legacy', label: 'Missions' },
              { value: 'sweep', label: 'Spectrum' },
            ]}
          />
        )}
        <Note>
          {l2
            ? view.seq === 'epoch'
              ? 'One co-add per SPHEREx visit. Blink them to see what moved.'
              : view.seq === 'sweep'
                ? 'Steps through the spectral channels from 0.75 to 5 µm, all epochs combined.'
                : 'Every single exposure in time order. Noisy, but nothing is averaged away.'
            : view.skyMode === 'legacy'
              ? 'Blinks the same field as seen by different missions, oldest first.'
              : 'Sweeps 34 of the 102 SPHEREx channels across the cube.'}
        </Note>
      </Section>

      {!guided && l2 && (
        <Section title="Detector bands" open aside={<TextBtn onClick={() => set({ dets: [1, 2, 3, 4, 5, 6], hi: null })}>All six</TextBtn>}>
          <div className="grid grid-cols-6 gap-1.5" role="group" aria-label="Detector bands">
            {DETECTORS.map((d) => {
              const on = view.dets.includes(d.det);
              return (
                <button
                  key={d.det}
                  type="button"
                  aria-pressed={on}
                  title={`Detector ${d.det}: ${d.lo}–${d.hi} µm`}
                  onClick={() => toggleDet(d.det)}
                  className={cn('flex min-h-14 flex-col items-center justify-center border-t-2 transition-colors', on ? 'bg-ink text-black' : 'bg-ink/[0.06] text-ink/75 hover:bg-ink/15 hover:text-ink')}
                  style={{ borderTopColor: d.color }}
                >
                  <span className="text-sm font-semibold tracking-wider">D{d.det}</span>
                  <span className={cn('num mt-0.5 text-[0.6875rem] font-medium', on ? 'text-black/70' : 'text-ink/65')}>{d.lo.toFixed(1)} µm</span>
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {!guided && !l2 && view.skyMode === 'legacy' && (
        <Section title="Detector bands · missions" open>
          <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Missions">
            {SURVEYS.map((s) => {
              const on = view.surveys.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleSurvey(s.id)}
                  className={cn('flex min-h-14 flex-col items-center justify-center px-1 transition-colors', on ? 'bg-ink text-black' : 'bg-ink/[0.06] text-ink/75 hover:bg-ink/15 hover:text-ink')}
                >
                  <span className="text-[0.75rem] font-semibold uppercase tracking-wider">{s.label}</span>
                  <span className={cn('num mt-0.5 text-[0.6875rem] font-medium', on ? 'text-black/70' : 'text-ink/65')}>{s.epoch}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-4">
            <div className="flex items-baseline justify-between">
              <label htmlFor="spx-ch" className="text-[0.6875rem] uppercase tracking-[0.14em] text-ink/65">
                SPHEREx channel
              </label>
              <span className="num text-sm text-ink">
                {CHANNELS[view.channel].toFixed(3)} µm <span className="text-ink/65">· {view.channel + 1}/102</span>
              </span>
            </div>
            <input id="spx-ch" type="range" className="range mt-1" min={0} max={101} step={1} value={view.channel} onChange={(e) => set({ channel: Number(e.target.value) })} />
          </div>
        </Section>
      )}

      {!guided && (
        <Section title="Operation" open>
          <Seg
            label="Operation"
            value={view.op}
            onChange={(op) => set({ op, hi: null })}
            options={[
              { value: 'image', label: 'Image' },
              { value: 'diff', label: 'Difference' },
              { value: 'stack', label: 'Stack' },
            ]}
          />
          {view.op === 'diff' && (
            <Seg
              className="mt-2"
              label="Subtract"
              value={view.ref}
              onChange={(ref) => set({ ref })}
              options={[
                { value: 'prev', label: '− Previous' },
                { value: 'first', label: '− First' },
                { value: 'mean', label: '− Mean' },
              ]}
            />
          )}
          <Note>
            {view.op === 'image'
              ? 'Frames as observed.'
              : view.op === 'diff'
                ? 'Each frame minus a reference. Static stars cancel; anything that moved leaves a bright and dark pair.'
                : 'Running sum of every frame up to the current one. Faint sources climb out of the noise.'}
          </Note>
        </Section>
      )}

      {!guided && (
        <Section title="Field of view" open>
          {l2 ? (
            <Seg label="Field of view" value={view.fovL2} onChange={(fovL2) => set({ fovL2 })} options={FOV_L2.map((f) => ({ value: f, label: `${f}'` }))} />
          ) : (
            <Seg label="Field of view" value={view.fovSky} onChange={(fovSky) => set({ fovSky })} options={FOV_SKY.map((f) => ({ value: f, label: `${f}'` }))} />
          )}
        </Section>
      )}

      <Section title="Display" open aside={<TextBtn onClick={() => set({ hi: null })} disabled={view.hi === null}>Auto level</TextBtn>}>
        <div className="flex items-baseline justify-between">
          <label htmlFor="white" className="text-[0.8125rem] text-ink/70">
            {l2 ? 'White point' : 'Exposure'}
          </label>
          <span className="num text-sm text-ink">{l2 ? `${hi < 100 ? hi.toFixed(0) : Math.round(hi / 10) * 10}σ` : `${Math.sqrt(60 / hi).toFixed(2)}×`}</span>
        </div>
        <input
          id="white"
          type="range"
          className="range"
          min={0}
          max={100}
          step={1}
          value={Math.min(100, Math.max(0, slider))}
          onChange={(e) => set({ hi: 8 * (3000 / 8) ** (Number(e.target.value) / 100) })}
        />
        <Seg
          className="mt-2"
          label="Palette"
          value={view.cmap}
          onChange={(cmap) => set({ cmap })}
          options={[
            { value: 'ironbow', label: 'Ironbow' },
            { value: 'ice', label: 'Ice' },
            { value: 'gray', label: 'Gray' },
            { value: 'ember', label: 'Ember' },
            { value: 'invert', label: 'Invert' },
          ]}
        />
        <div className="mt-2">
          <Check on={view.smooth} onChange={(smooth) => set({ smooth })}>
            Smooth pixels
          </Check>
        </div>
      </Section>

      {!guided && (
        <Section title="Precision" open>
          <div className="flex items-baseline justify-between">
            <label htmlFor="ap-radius" className="text-[0.8125rem] text-ink/70">
              Aperture radius
            </label>
            <span className="num text-sm text-ink">
              {view.aperture.toFixed(1)} px · {(view.aperture * 6.15).toFixed(0)}″
            </span>
          </div>
          <input id="ap-radius" type="range" className="range" min={1} max={3} step={0.1} value={view.aperture} onChange={(e) => set({ aperture: Number(e.target.value) })} />
          <p className="mt-1 text-[0.6875rem] uppercase tracking-[0.12em] text-ink/65">Sky annulus 25–40″ · recomputes spectra and light curves</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Seg
              label="Flux units"
              value={view.units}
              onChange={(units) => set({ units })}
              options={[
                { value: 'mJy', label: 'mJy' },
                { value: 'ujy', label: 'µJy' },
              ]}
            />
            <Seg
              label="Stretch"
              value={view.stretchFn}
              onChange={(stretchFn) => set({ stretchFn })}
              options={[
                { value: 'asinh', label: 'Asinh' },
                { value: 'linear', label: 'Lin' },
                { value: 'log', label: 'Log' },
              ]}
            />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <label htmlFor="bias" className="text-[0.8125rem] text-ink/70">
              Black level
            </label>
            <span className="num text-sm text-ink">{(view.bias * 100).toFixed(0)}%</span>
          </div>
          <input id="bias" type="range" className="range" min={-0.2} max={0.2} step={0.01} value={view.bias} onChange={(e) => set({ bias: Number(e.target.value) })} />
          <div className="mt-3 grid grid-cols-2 gap-x-4">
            <Check on={view.tools.grid} onChange={(grid) => set({ tools: { ...view.tools, grid } })}>
              Coordinate grid
            </Check>
            <Check on={view.tools.measure} onChange={(measure) => set({ tools: { ...view.tools, measure } })}>
              Measure tool
            </Check>
            <Check on={view.tools.movers} onChange={(movers) => set({ tools: { ...view.tools, movers } })} disabled={!pack}>
              Candidate markers
            </Check>
            <button type="button" onClick={() => set({ aperture: 1.8, bias: 0, stretchFn: 'asinh', tools: { grid: false, measure: false, movers: false } })} className="micro min-h-10 text-left text-ink/65 hover:text-ink">
              Reset precision
            </button>
          </div>
        </Section>
      )}

      {!guided && (
        <Section title="Overlays" open>
          <div className="grid grid-cols-2 gap-x-4">
          <Check on={view.ov.reticle} onChange={(reticle) => set({ ov: { ...view.ov, reticle } })}>
            Reticle
          </Check>
          <Check on={view.ov.track && l2} disabled={!l2} swatch="var(--color-signal)" onChange={(track) => set({ ov: { ...view.ov, track } })} hint="Catalog proper-motion track of the target">
            Catalog track
          </Check>
          <Check on={view.ov.gaia && l2} disabled={!l2} swatch="var(--color-gaia)" onChange={(gaia) => set({ ov: { ...view.ov, gaia } })} hint="Gaia DR3 sources, moved to each frame's epoch">
            Gaia DR3
          </Check>
          <Check on={view.ov.wise && l2} disabled={!l2} swatch="var(--color-wise)" onChange={(wise) => set({ ov: { ...view.ov, wise } })} hint="CatWISE2020 sources, propagated from epoch 2015.4 with catalogue proper motion">
            CatWISE
          </Check>
          <Check on={view.ov.flags && l2} disabled={!l2} swatch="var(--color-signal)" onChange={(flags) => set({ ov: { ...view.ov, flags } })} hint="Pixels flagged by the SPHEREx pipeline in most exposures">
            Pipeline flags
          </Check>
        </div>
          {!l2 && <Note>Gaia / SIMBAD overlays propagate reference stars to each survey epoch; pipeline flags apply to Level-2 frames.</Note>}
        </Section>
      )}
    </div>
  );
}
