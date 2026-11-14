import { useEffect, useRef, type CSSProperties } from 'react';
import { TARGETS, fieldCentre } from '../data/targets';
import { fmtDec, fmtRA } from '../lib/coords';
import { buildShots, type Pack } from '../lib/packs';
import { autoHi, paint } from '../lib/render';
import { jumpTo } from '../lib/usePacks';
import { cn } from '../utils/cn';
import { Arrow, Reveal, SectionHead } from './ui';

const BEST: Record<string, number[]> = { barnard: [5, 6], w0855: [6] };

/** One accent per field, drawn from the detector/credits palette. */
const ACCENT: Record<string, string> = {
  barnard: '#8fd3ff',
  epsindb: '#56d6e8',
  w0855: '#ffa51f',
  rwaur: '#ff5c4d',
  rdra: '#f2d660',
};

/** Deepest epoch co-add of the field, rendered from the bundled exposures. */
function Thumb({ pack }: { pack: Pack | undefined }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!pack || !cv || !ctx) return;
    const shots = buildShots(pack, 'epoch', BEST[pack.id] ?? [1, 2, 3, 4, 5, 6]);
    if (!shots.length) return;
    const best = shots.reduce((a, b) => (b.sigma < a.sigma ? b : a));
    const off = document.createElement('canvas');
    off.width = off.height = pack.n;
    off.getContext('2d')?.putImageData(paint(best, pack.n, { cmap: 'ironbow', hi: autoHi(best, 'MJy/sr'), sigma: best.sigma, diff: false, unit: 'MJy/sr', flags: false }), 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const crop = 40;
    const s0 = pack.n / 2 - crop / 2;
    ctx.drawImage(off, s0, s0, crop, crop, 0, 0, cv.width, cv.height);
  }, [pack]);
  return <canvas ref={ref} width={240} height={240} className={cn('h-full w-full transition-opacity duration-700', pack ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />;
}

export function Targets({ packs, activeId, onSelect }: { packs: Pack[] | null; activeId: string | null; onSelect: (id: string) => void }) {
  return (
    <section id="targets" className="border-t border-ink/10 py-24 lg:py-32">
      <div className="wrap">
        <SectionHead index="02" kicker="Test targets" title={<>Five fields.<br />Real photons.</>}>
          The challenge names five objects to prove a blink tool on. Every exposure of them here is real SPHEREx Level-2 data, pulled from the NASA/IPAC archive and packed into this page. No network needed.
        </SectionHead>

        <ul className="mt-14 border-t border-ink/15">
          {TARGETS.map((t, k) => {
            const pack = packs?.find((p) => p.id === t.id);
            const [ra, dec] = fieldCentre(t);
            const active = activeId === t.id;
            const accent = ACCENT[t.id] ?? '#35e6e0';
            return (
              <li key={t.id} className="target-row border-b border-ink/15" style={{ '--accent': accent } as CSSProperties}>
                <Reveal delay={k * 50}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(t.id);
                      jumpTo('viewer');
                    }}
                    aria-label={`Load ${t.name} in the viewer`}
                    className="group grid w-full grid-cols-[4.5rem_minmax(0,1fr)] items-start gap-x-5 gap-y-5 py-7 text-left transition-colors sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:px-3 lg:grid-cols-[2.5rem_7.5rem_minmax(0,1.25fr)_minmax(0,1fr)_auto] lg:items-center lg:gap-x-8 lg:py-8"
                  >
                    <span className="num hidden text-sm font-semibold tracking-widest text-[var(--accent)] lg:block">0{k + 1}</span>
                    <span
                      className="target-thumb relative block aspect-square w-full overflow-hidden border bg-black transition-colors"
                      style={{ borderColor: active ? accent : undefined }}
                    >
                      <Thumb pack={pack} />
                      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5" style={{ background: accent }} aria-hidden="true" />
                      <span className="pointer-events-none absolute left-1 top-1 h-1.5 w-1.5" style={{ background: accent }} aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="micro flex items-center gap-2 text-[var(--accent)]">
                          <span className="h-1 w-1" style={{ background: accent }} aria-hidden="true" />
                          {t.kind}
                        </span>
                        {active && <span className="micro text-signal">● In viewer</span>}
                      </span>
                      <span className="display mt-2 block text-[clamp(1.6rem,3.2vw,2.6rem)]">{t.name}</span>
                      <span className="mt-3 block max-w-xl text-[0.9375rem] leading-relaxed text-ink/70">{t.blurb}</span>
                      <span className="num mt-3 block text-[0.8125rem] text-ink/50">
                        {fmtRA(ra, 1)} {fmtDec(dec, 0)}
                        {pack ? ` · ${pack.frames.length} exposures · ${pack.epochs.length} epochs` : ''}
                      </span>
                    </span>
                    <span className="col-span-2 grid grid-cols-3 gap-4 lg:col-span-1">
                      {t.stats.map(([label, value, unit]) => (
                        <span key={label} className="block border-l pl-3" style={{ borderColor: `${accent}66` }}>
                          <span className="num block text-lg font-semibold leading-tight text-ink sm:text-xl">
                            {value}
                            {unit && <span className="ml-1 text-sm font-medium text-ink/60">{unit}</span>}
                          </span>
                          <span className="micro mt-1.5 block text-ink/55">{label}</span>
                        </span>
                      ))}
                    </span>
                    <span className="col-span-2 flex items-center gap-3 text-[0.8125rem] font-semibold uppercase tracking-[0.14em] text-ink/80 transition-colors group-hover:text-ink lg:col-span-1">
                      Load
                      <Arrow className="transition-transform duration-300 ease-[var(--ease-expo)] group-hover:translate-x-2" />
                    </span>
                  </button>
                </Reveal>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
