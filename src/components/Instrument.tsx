import observatory from '../assets/observatory-raw.png';
import { DETECTORS } from '../lib/packs';
import { Reveal } from './ui';

const X = (l: number) => ((l - 0.7) / 4.4) * 100;

const FEATURES: [string, number][] = [
  ['H₂O', 1.4],
  ['H₂O', 1.9],
  ['H₂O ice', 3.0],
  ['CH₄', 3.32],
  ['CO₂', 4.27],
  ['CO', 4.67],
];

function BandRuler() {
  return (
    <figure className="mt-10" aria-label="SPHEREx wavelength coverage: six detector bands from 0.75 to 5 microns, with the molecules that absorb in each">
      <div className="relative h-[4.5rem]">
        {FEATURES.map(([name, l], k) => (
          <div key={k} className="absolute bottom-0 flex -translate-x-1/2 flex-col items-center" style={{ left: `${X(l)}%` }}>
            <span className="micro whitespace-nowrap text-ink/85">{name}</span>
            <span className="num mt-0.5 text-[0.6875rem] text-ink/50">{l}</span>
            <span className="mt-1 block w-px bg-ink/40" style={{ height: k % 2 ? '0.5rem' : '2rem' }} />
          </div>
        ))}
      </div>
      <div className="relative h-16 border border-ink/25">
        {DETECTORS.map((d) => (
          <div
            key={d.det}
            className="absolute inset-y-0 flex items-end justify-end border-r border-black p-1.5 sm:p-2.5"
            style={{ left: `${X(d.lo)}%`, width: `${X(d.hi) - X(d.lo)}%`, background: `linear-gradient(90deg, ${d.color}30, ${d.color})` }}
          >
            <span className="text-xs font-bold tracking-wider text-black sm:text-sm">D{d.det}</span>
          </div>
        ))}
      </div>
      <div className="relative mt-2 h-5">
        {[1, 2, 3, 4, 5].map((l) => (
          <span key={l} className="num absolute -translate-x-1/2 text-xs text-ink/55" style={{ left: `${X(l)}%` }}>
            {l} µm
          </span>
        ))}
      </div>
      <figcaption className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-[0.8125rem] leading-relaxed text-ink/60">
        <span className="rule-spectrum h-0.5 w-16 shrink-0" aria-hidden="true" />
        Six detector arrays, each behind a filter whose colour slides from one edge to the other. The shading shows that ramp. Seventeen channels per detector make 102.
      </figcaption>
    </figure>
  );
}

const STATS: [string, string][] = [
  ['6', 'Detector arrays'],
  ['6 mo', 'Per all-sky pass'],
  ['1B+', 'Objects imaged'],
  ['May 2025', 'First survey data'],
];

const STORY: [string, string, string, string][] = [
  ['1930', 'Pluto', 'Clyde Tombaugh flipped between two photographic plates of the same star field. One dot had jumped. Nobody has found a planet-sized world faster.', '#ffd166'],
  ['2010s', 'WISE and the volunteers', 'Infrared images from WISE, blinked the same way, exposed the coldest brown dwarfs known. Hundreds of thousands of volunteers joined in through projects like Backyard Worlds.', '#ffa51f'],
  ['Now', 'SPHEREx', 'A fresh map of the entire sky every six months, in 102 colours. Too much for one person or one algorithm. Most of it has never been blinked by anyone.', '#35e6e0'],
];

export function Instrument() {
  return (
    <section id="instrument" className="border-t border-ink/10">
      <div className="relative flex min-h-[86svh] flex-col justify-end overflow-hidden">
        <img src={observatory} alt="" loading="lazy" className="absolute inset-0 -z-10 h-full w-full object-cover object-[72%_50%]" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black/90 via-black/45 to-transparent" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black via-transparent to-black/40" />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_85%_30%,rgba(53,230,224,0.14),transparent_70%)]" />
        <div className="wrap pb-12 pt-40">
          <Reveal className="max-w-2xl">
            <p className="eyebrow text-ink/70">
              <span className="num text-cyan">03</span>
              <span className="rule-spectrum mx-3 inline-block h-0.5 w-8 align-middle" />
              Instrument
            </p>
            <h2 className="display mt-5 text-[clamp(2.1rem,5vw,4.25rem)]">
              The whole sky.
              <br />
              102 colours.
              <br />
              Twice a year.
            </h2>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink/80">
              SPHEREx rode a Falcon 9 to orbit in March 2025 and has been sweeping the sky in near-infrared light ever since. It is tuned to water, carbon dioxide, carbon monoxide and methane: the chemistry of comets, brown dwarfs and
              cold new worlds.
            </p>
          </Reveal>
          <Reveal delay={120}>
            <dl className="mt-12 grid grid-cols-2 gap-y-6 border-t border-ink/20 pt-6 md:grid-cols-4">
              {STATS.map(([value, label], k) => (
                <div key={label} className="border-l pl-3" style={{ borderColor: `var(--color-d${k + 1})` }}>
                  <dd className="num text-2xl font-semibold tracking-wide sm:text-3xl" style={{ color: `var(--color-d${k + 1})` }}>
                    {value}
                  </dd>
                  <dt className="micro mt-2 text-ink/60">{label}</dt>
                </div>
              ))}
            </dl>
            <p className="mt-6 text-[0.75rem] text-ink/45">Artist’s illustration, not an official rendering of the spacecraft.</p>
          </Reveal>
        </div>
      </div>

      <div className="wash-amber wrap grid gap-14 py-24 lg:grid-cols-2 lg:gap-20 lg:py-32">
        <Reveal>
          <h3 className="display text-[clamp(1.6rem,3vw,2.5rem)]">One exposure, every colour at once</h3>
          <p className="mt-6 max-w-xl leading-relaxed text-ink/75">
            SPHEREx has no filter wheel. Wavelength changes smoothly across each detector, so in a single exposure a star on the left edge is seen at one colour and a star on the right at another. The telescope steps, the star lands
            somewhere new, and exposure by exposure it walks through the spectrum.
          </p>
          <p className="mt-4 max-w-xl leading-relaxed text-ink/75">
            That is why Rendezvous never blindly adds everything together. It co-adds each visit by detector band, rejects outliers the pipeline flags missed, and keeps every exposure’s own wavelength so a click on any source returns its
            spectrum.
          </p>
          <BandRuler />
        </Reveal>

        <div>
          <Reveal>
            <h3 className="display text-[clamp(1.6rem,3vw,2.5rem)]">Why blinking works</h3>
            <p className="mt-6 max-w-xl leading-relaxed text-ink/75">
              Nearby things shift against the distant background: asteroids and comets orbit the Sun, close stars drift across the Galaxy, and Earth’s own orbit makes anything near us wobble. Flip between two images taken months apart
              and the eye catches the one point that is not where it was.
            </p>
          </Reveal>
          <ol className="mt-10 border-t border-ink/15">
            {STORY.map(([when, who, text, accent], k) => (
              <li key={who} className="border-b border-ink/15">
                <Reveal delay={k * 80} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-5 py-6 sm:grid-cols-[6rem_minmax(0,1fr)]">
                  <span className="num pt-1 text-sm font-semibold uppercase tracking-[0.14em]" style={{ color: accent }}>
                    {when}
                  </span>
                  <div className="border-l pl-4" style={{ borderColor: `${accent}80` }}>
                    <p className="text-lg font-semibold uppercase tracking-[0.06em]">{who}</p>
                    <p className="mt-2 leading-relaxed text-ink/70">{text}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
