import { useEffect, useRef, useState } from 'react';
import heroImg from '../assets/hero-raw.png';
import { DESTINATIONS } from '../data/destinations';
import { TARGETS } from '../data/targets';
import { buildShots, loadPack, type Pack } from '../lib/packs';
import { paint } from '../lib/render';
import { jumpTo } from '../lib/usePacks';
import { cn } from '../utils/cn';
import { AcquireBar, Arrow } from './ui';

/** A live blink of real SPHEREx frames: Barnard's Star stepping north, epoch by epoch. */
function Scope() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [label, setLabel] = useState('');
  useEffect(() => {
    let alive = true;
    let timer = 0;
    loadPack('barnard')
      .then((pack) => {
        if (!alive) return;
        const shots = buildShots(pack, 'epoch', [5, 6]);
        if (!shots.length) return;
        const sig = shots.map((s) => s.sigma).sort((a, b) => a - b)[shots.length >> 1];
        const frames = shots.map((s) => {
          const c = document.createElement('canvas');
          c.width = c.height = pack.n;
          c.getContext('2d')?.putImageData(paint(s, pack.n, { cmap: 'ember', hi: 5000, sigma: sig, diff: false, unit: 'MJy/sr', flags: false }), 0, 0);
          return c;
        });
        const crop = 28;
        const s0 = pack.n / 2 - crop / 2;
        let k = 0;
        const draw = () => {
          const cv = ref.current;
          const ctx = cv?.getContext('2d');
          if (!cv || !ctx) return;
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(frames[k], s0, s0, crop, crop, 0, 0, cv.width, cv.height);
          setLabel(shots[k].title);
          k = (k + 1) % frames.length;
        };
        draw();
        const reduced = !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!reduced && frames.length > 1) timer = window.setInterval(draw, 750);
      })
      .catch(() => {});
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="rise hidden w-[min(30vw,24rem)] shrink-0 lg:block" style={{ animationDelay: '0.5s' }}>
      <div className="relative aspect-square">
        <canvas ref={ref} width={480} height={480} className="absolute inset-[10%] h-[80%] w-[80%] rounded-full bg-black" />
        <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full" fill="none" aria-hidden="true">
          <circle cx="100" cy="100" r="80" stroke="var(--color-ink)" strokeOpacity="0.85" strokeWidth="0.8" />
          <circle cx="100" cy="100" r="97" stroke="var(--color-ink)" strokeOpacity="0.25" strokeWidth="0.5" />
          {Array.from({ length: 72 }, (_, k) => {
            const a = (k * 5 * Math.PI) / 180;
            const r0 = k % 18 === 0 ? 84 : k % 6 === 0 ? 89 : 92.5;
            return <line key={k} x1={100 + r0 * Math.cos(a)} y1={100 + r0 * Math.sin(a)} x2={100 + 96 * Math.cos(a)} y2={100 + 96 * Math.sin(a)} stroke="var(--color-ink)" strokeOpacity={k % 6 === 0 ? 0.8 : 0.35} strokeWidth="0.6" />;
          })}
          <path d="M100 26v22M100 152v22M26 100h22M152 100h22" stroke="var(--color-ink)" strokeOpacity="0.7" strokeWidth="0.7" />
          <g className="sweep">
            <path d="M100 100 L100 20" stroke="var(--color-signal)" strokeWidth="0.7" strokeOpacity="0.9" />
            <circle cx="100" cy="20" r="1.6" fill="var(--color-signal)" />
          </g>
        </svg>
        <span className="micro absolute left-1/2 top-[1.5%] -translate-x-1/2 bg-black/60 px-1 text-ink/80">N</span>
        <span className="micro absolute left-[1.5%] top-1/2 -translate-y-1/2 bg-black/60 px-1 text-ink/80">E</span>
      </div>
      <div className="mt-5">
        <p className="micro flex items-center gap-2 text-ink/65">
          <span className="blip h-1.5 w-1.5 bg-signal" />
          Real SPHEREx data, blinking
        </p>
        <p className="mt-2 text-sm font-semibold tracking-[0.12em]">BARNARD’S STAR · 3.8–5.0 µm</p>
        <p className="num micro mt-2 whitespace-nowrap text-ink/70">{label || 'Unpacking'}</p>
      </div>
    </div>
  );
}

interface Props {
  acquire: (text: string) => Promise<{ ok: boolean; msg: string }>;
  onTarget: (id: string) => void;
  activeId: string | null;
  packs: Pack[] | null;
  onGuide: () => void;
  onAtlas: () => void;
}

export function Hero({ acquire, onTarget, activeId, packs, onGuide, onAtlas }: Props) {
  const frames = packs ? packs.reduce((s, p) => s + p.frames.length, 0) : 0;
  const stats: [string, string][] = [
    ['102', 'Spectral channels'],
    ['0.75–5.0 µm', 'Near-infrared range'],
    ['6.15"', 'Per pixel'],
    [frames ? frames.toLocaleString('en-US') : '—', 'Real exposures on board'],
  ];
  return (
    <section id="top" className="relative flex min-h-svh flex-col justify-end overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <img src={heroImg} alt="" className="drift h-full w-full object-cover object-[70%_50%]" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-black/30" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/25 to-transparent" />
      </div>

      <div className="wrap flex items-end justify-between gap-14 pb-12 pt-32">
        <div className="min-w-0 max-w-3xl">
          <div className="rise">
            <p className="eyebrow text-ink">
              Rendezvous
              <span className="mx-3 text-signal">/</span>
              Planet X &amp; SPHEREx
            </p>
            <p className="eyebrow mt-2 text-ink/75">2026 NASA Space Apps Challenge · Planet X and SPHEREx</p>
          </div>
          <h1 className="display rise mt-6 text-[clamp(3rem,8.2vw,7.25rem)]" style={{ animationDelay: '0.08s' }}>
            Catch what
            <br />
            moves.
          </h1>
          <p className="rise mt-7 max-w-xl text-lg leading-relaxed text-ink/85 sm:text-xl" style={{ animationDelay: '0.18s' }}>
            Hand Rendezvous a patch of sky. It plays real SPHEREx infrared images back as a short film, so the one star, comet or cold new world that shifted between passes gives itself away.
          </p>

          <div className="rise mt-9 max-w-2xl" style={{ animationDelay: '0.28s' }}>
            <AcquireBar onAcquire={acquire} onDone={() => jumpTo('viewer')} />
            <p className="micro mt-6 text-ink/75">Or load a challenge test target</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {TARGETS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    onTarget(t.id);
                    jumpTo('viewer');
                  }}
                  className={cn(
                    'micro min-h-9 border px-3 transition-colors',
                    activeId === t.id ? 'border-ink bg-ink text-black' : 'border-ink/30 bg-black/30 text-ink/85 hover:border-ink hover:bg-ink hover:text-black',
                  )}
                >
                  {t.name}
                </button>
              ))}
              <button
                type="button"
                onClick={onAtlas}
                className="micro min-h-9 border border-cyan/60 bg-cyan/10 px-3 text-cyan transition-colors hover:border-cyan hover:bg-cyan hover:text-black"
                aria-label={`Browse ${DESTINATIONS.length} more destinations`}
              >
                + {DESTINATIONS.length} more destinations →
              </button>
            </div>
            <button type="button" onClick={onGuide} className="micro mt-5 flex min-h-9 items-center gap-2 text-ink/75 transition-colors hover:text-ink">
              First visit? Read the 60-second science guide
              <Arrow />
            </button>
            <button type="button" onClick={onAtlas} className="micro mt-2 flex min-h-9 items-center gap-2 text-cyan transition-colors hover:text-ink">
              Not sure where to look? Browse the sky atlas
              <Arrow />
            </button>
          </div>
        </div>
        <Scope />
      </div>

      <div className="wrap">
        <dl className="rise grid grid-cols-2 border-t border-ink/20 md:grid-cols-4" style={{ animationDelay: '0.4s' }}>
          {stats.map(([value, label], k) => (
            <div key={label} className={cn('border-ink/20 py-5 md:py-6', k % 2 === 1 && 'border-l pl-5', k > 1 && 'border-t md:border-t-0', k > 0 && 'md:border-l md:pl-6')}>
              <dd className="num text-2xl font-semibold tracking-wide sm:text-3xl">{value}</dd>
              <dt className="micro mt-2 text-ink/80">{label}</dt>
            </div>
          ))}
        </dl>
      </div>

      <button type="button" onClick={() => jumpTo('viewer')} className="micro group absolute bottom-[8.5rem] right-[clamp(1.25rem,4.2vw,4.5rem)] hidden items-center gap-3 text-ink/70 transition-colors hover:text-ink 2xl:flex" style={{ writingMode: 'vertical-rl' }}>
        Scroll to viewer
        <Arrow className="rotate-90 transition-transform group-hover:translate-y-1" />
      </button>
    </section>
  );
}
