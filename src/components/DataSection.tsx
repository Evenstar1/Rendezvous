import { useMemo, useRef, useState } from 'react';
import { ingestLocalFiles } from '../lib/fitsWorkbench';
import type { Pack } from '../lib/packs';
import { copyText } from '../lib/science';
import { jumpTo } from '../lib/usePacks';
import { toQuery, type View } from '../state';
import { cn } from '../utils/cn';
import { Arrow, Reveal, SectionHead, Wordmark } from './ui';

function CopyBox({ label, text, accent = '#35e6e0' }: { label: string; text: string; accent?: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'fail'>('idle');
  return (
    <div className="border border-line bg-panel/60" style={{ borderTopColor: accent, borderTopWidth: 2 }}>
      <div className="flex items-center justify-between gap-4 border-b border-line pl-4">
        <span className="micro flex items-center gap-2 text-ink/75">
          <span className="h-1.5 w-1.5" style={{ background: accent }} aria-hidden="true" />
          {label}
        </span>
        <button
          type="button"
          className="micro min-h-10 border-l border-line px-4 text-ink/85 transition-colors hover:bg-ink hover:text-black"
          onClick={async () => {
            setState((await copyText(text)) ? 'done' : 'fail');
            setTimeout(() => setState('idle'), 1800);
          }}
        >
          <span aria-live="polite">{state === 'done' ? 'Copied' : state === 'fail' ? 'Select and copy' : 'Copy'}</span>
        </button>
      </div>
      <pre className="thin-scroll num overflow-x-auto whitespace-pre-wrap break-all p-4 text-[0.8125rem] leading-relaxed text-ink/85">{text}</pre>
    </div>
  );
}

const PARAMS: [string, string][] = [
  ['ra, dec', 'Field centre in decimal degrees (ICRS).'],
  ['fov', 'Field of view in arcminutes (2–5.7 Level-2, 6–48 all-sky).'],
  ['seq', 'epoch · sweep · frames, or legacy · sweep with src=sky.'],
  ['det', 'Detector bands to co-add, e.g. det=56 for 3.8–5.0 µm.'],
  ['op, ref', 'image · diff · stack; ref=prev · first · mean.'],
  ['ap, apcorr', 'Aperture radius (px) and PSF encircled-energy correction (1/0).'],
  ['ov', 'Overlays: track, gaia, wise, flags, noreticle.'],
  ['mode, embed', 'guided · research; embed=1 renders the standalone instrument.'],
];

/** External links strictly credit the mission archives and space agencies whose data power Rendezvous. */
const CREDITS: [string, string, string][] = [
  ['NASA / IPAC', 'SPHEREx Mission & NASA/IPAC Infrared Science Archive (IRSA)', 'https://irsa.ipac.caltech.edu/Missions/spherex.html'],
  ['NASA / JPL', 'AllWISE & CatWISE2020 Infrared Sky Surveys (IPAC)', 'https://irsa.ipac.caltech.edu/Missions/wise.html'],
  ['ESA / DPAC', 'Gaia Mission — Data Release 3 Astrometric Catalogue', 'https://www.cosmos.esa.int/web/gaia/dr3'],
  ['CDS', 'Centre de Données astronomiques de Strasbourg (SIMBAD & HiPS)', 'https://cds.unistra.fr/'],
  ['2MASS / STScI', 'Two Micron All Sky Survey & Digitized Sky Survey (DSS2)', 'https://irsa.ipac.caltech.edu/Missions/2mass.html'],
  ['CSA', 'Canadian Space Agency — NEOSSat Near-Earth Space Surveillance', 'https://www.asc-csa.gc.ca/eng/satellites/neossat/'],
  ['CADC', 'Canadian Astronomy Data Centre — National Research Council Canada', 'https://www.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/'],
];

const FEATURES: [string, string, string][] = [
  ['Planck & molecular SED', 'Sub-pixel PSF-corrected aperture photometry, nonlinear Planck B_ν(T_eff) & power-law fits, and continuum-interpolated H₂O / CH₄ / CO₂ / CO equivalent widths.', '#35e6e0'],
  ['Periodogram & variability', 'Constant-flux χ²_ν test, Vaughan F_var intrinsic RMS, Zechmeister–Kürster floating-mean Lomb–Scargle periodogram with 1% FAP, and phase-folding.', '#ffa51f'],
  ['Astrometry & kinematics', 'Gaussian-windowed sub-pixel centroids across epochs, weighted proper-motion fit, and Solar-System reflex/Keplerian vs. Galactic v_t distance classification.', '#8fd3ff'],
  ['PSF morphology & dipoles', 'Azimuthal surface-brightness profile vs. nominal PSF FWHM, second-moment ellipticity, and multi-visit sub-pixel dipole candidate pairing.', '#b6ff3d'],
  ['In-browser FITS workbench', 'Drop local SPHEREx or WCS FITS exposures directly onto the page to run TAN-SIP reprojection, zodi subtraction and WAVE-TAB lookup — or export 32-bit FITS.', '#ff5c4d'],
  ['Guided & Research modes', 'Progressive disclosure pairs plain-language workflows for newcomers with full equations, covariance uncertainties and discovery dossiers for astrophysicists.', '#7fe3a1'],
];

/** What each mission catalogue actually contributes — no implied data source without a code path. */
const SOURCES: { name: string; use: string; status: 'ingested' | 'live' | 'context'; accent: string }[] = [
  { name: 'SPHEREx DR1 · Level-2', use: 'Five bundled calibrated fields, 102-channel HiPS cube', status: 'ingested', accent: '#35e6e0' },
  { name: 'Gaia DR3', use: 'Astrometry, field CMD and reference-star overlays', status: 'ingested', accent: '#8fd3ff' },
  { name: 'CatWISE2020', use: 'W1/W2 crossmatch + proper motion (epoch 2015.4)', status: 'ingested', accent: '#ffd166' },
  { name: 'AllWISE W1/W2 HiPS', use: 'Infrared layers in the all-sky blink sequence', status: 'live', accent: '#ffa51f' },
  { name: '2MASS J/Ks · DSS2', use: '1990s–2000s baseline for 34-year motion stacks', status: 'live', accent: '#7fe3a1' },
  { name: 'SIMBAD / Sesame', use: 'Name resolution and field reference stars', status: 'live', accent: '#b6ff3d' },
  { name: 'CSA NEOSSat · CADC', use: 'Partner context only — no NEOSSat pixels are ingested', status: 'context', accent: '#f0f0fa' },
];

const RESOURCES: [string, string, string][] = [
  ['NASA / IPAC', 'SPHEREx mission and IRSA data archive', 'https://irsa.ipac.caltech.edu/Missions/spherex.html'],
  ['IRSA', 'SPHEREx Python notebooks · spectral images', 'https://caltech-ipac.github.io/irsa-tutorials/spherex-intro/'],
  ['IRSA', 'SPHEREx cutouts, PSF and HiPS-cube notebooks', 'https://caltech-ipac.github.io/irsa-tutorials/spherex-hipscube/'],
  ['Backyard Worlds', 'WiseView — WISE motion and variability viewer', 'https://github.com/backyardworlds/wiseview'],
  ['ESA / DPAC', 'Gaia Data Release 3', 'https://www.cosmos.esa.int/web/gaia/dr3'],
  ['CSA', 'NEOSSat near-Earth object surveillance mission', 'https://www.asc-csa.gc.ca/eng/satellites/neossat/'],
  ['CADC', 'NEOSSat data collection and FITS products', 'https://www.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/en/neossat/'],
  ['CADC', 'Canadian Astronomy Data Centre', 'https://www.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/en/'],
];

const STATUS_LABEL: Record<'ingested' | 'live' | 'context', string> = {
  ingested: 'On board',
  live: 'Live',
  context: 'Context',
};

export function DataSection({ view, packs, onLoadPack }: { view: View; packs: Pack[] | null; onLoadPack: (p: Pack) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState('');
  const query = toQuery(view);
  const base = useMemo(() => {
    try {
      return window.location.origin.startsWith('http') ? window.location.origin + window.location.pathname : 'https://rendezvous.local/';
    } catch {
      return 'https://rendezvous.local/';
    }
  }, []);
  const frames = packs ? packs.reduce((s, p) => s + p.frames.length, 0) : 0;
  const built = packs?.[0]?.built ?? '';
  const release = packs?.[0]?.release ?? 'DR1';

  const handleFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    const arr = Array.from(list);
    setStatus(`Reprojecting ${arr.length} file${arr.length > 1 ? 's' : ''} in-browser…`);
    try {
      const inputs = await Promise.all(arr.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
      const { pack, warnings } = await ingestLocalFiles(inputs);
      onLoadPack(pack);
      setStatus(warnings.length ? `Loaded ${pack.frames.length} exposure(s) (${warnings[0]})` : `Loaded ${pack.frames.length} exposure${pack.frames.length > 1 ? 's' : ''} into the viewer.`);
      jumpTo('viewer');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Could not parse FITS input.');
    }
  };

  const paths: { tag: string; title: string; body: string; accent: string }[] = [
    {
      tag: 'On board · offline',
      title: 'Bundled Level-2 stacks',
      body: `${frames ? frames.toLocaleString('en-US') : '—'} calibrated SPHEREx ${release} exposures across the five challenge fields${built ? ` (${built})` : ''}. Zodiacal background subtracted, TAN-SIP reprojected north-up, and 22-bit pipeline flags preserved — operating completely offline.`,
      accent: '#b6ff3d',
    },
    {
      tag: 'Live · all-sky',
      title: 'Any coordinates on the sky',
      body: 'Enter any RA/Dec or target name to stream north-up HiPS cutouts across 34 years (DSS2, 2MASS, AllWISE and the 102-channel SPHEREx DR1 cube) with live astrometric cross-matching, proper-motion solving and cube profiling.',
      accent: '#ffa51f',
    },
    {
      tag: 'In-browser · FITS',
      title: 'Local FITS workbench',
      body: 'Bring new SPHEREx releases or FITS cutouts from any WCS-calibrated telescope straight into the browser. Rendezvous parses multi-extension FITS, subtracts ZODI, resolves WAVE-TAB wavelengths, co-adds visits, and exports 32-bit FITS.',
      accent: '#ff5c4d',
    },
  ];

  return (
    <section id="data" className="border-t border-ink/10 py-24 lg:py-32">
      <div className="wrap">
        <SectionHead index="04" kicker="Instrumentation & provenance" title={<>Self-contained science</>}>
          Every reduction, astrometric fit, spectrum, periodogram and FITS export executes inside this page. Bundled targets work fully offline; other positions and name lookups use live requests to IRSA (HiPS tiles) and SIMBAD. Real data only; no synthetic pixels anywhere.
        </SectionHead>

        <ul className="mt-12 grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([title, body, accent], k) => (
            <li
              key={title}
              className="group relative overflow-hidden bg-panel p-5 transition-colors hover:bg-panel2"
              style={{ borderTop: `2px solid ${accent}` }}
            >
              <p className="num micro" style={{ color: accent }}>
                0{k + 1}
              </p>
              <h3 className="mt-3 text-[0.9375rem] font-semibold uppercase tracking-[0.08em]">{title}</h3>
              <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink/80">{body}</p>
              <span
                className="pointer-events-none absolute inset-x-0 bottom-0 h-px opacity-40 transition-opacity group-hover:opacity-100"
                style={{ background: accent }}
                aria-hidden="true"
              />
            </li>
          ))}
        </ul>

        <div className="mt-14 grid border-t border-line lg:grid-cols-3">
          {paths.map((p, k) => (
            <Reveal key={p.title} delay={k * 80} className={cn('border-b border-line py-8 lg:py-10', k > 0 && 'lg:border-l lg:pl-10', k < 2 && 'lg:pr-10')}>
              <span className="mb-4 block h-0.5 w-10" style={{ background: p.accent }} aria-hidden="true" />
              <p className="micro flex items-center gap-2" style={{ color: p.accent }}>
                <span className="h-1.5 w-1.5" style={{ background: p.accent }} />
                {p.tag}
              </p>
              <h3 className="mt-4 text-xl font-semibold uppercase tracking-[0.06em]">{p.title}</h3>
              <p className="mt-4 leading-relaxed text-ink/70">{p.body}</p>
            </Reveal>
          ))}
        </div>

        <div className="mt-16 grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
          <Reveal className="panel p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="eyebrow text-cyan">What each dataset contributes</h3>
              <span className="micro text-ink/60">code path checked</span>
            </div>
            <ul className="mt-4">
              {SOURCES.map((s) => (
                <li key={s.name} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 border-t border-line/70 py-2.5 first:border-t-0">
                  <span className="mt-1.5 h-1.5 w-1.5" style={{ background: s.accent }} aria-hidden="true" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <p className="text-[0.875rem] font-semibold">{s.name}</p>
                      <span
                        className="micro"
                        style={{ color: s.status === 'context' ? 'rgb(240 240 250 / 0.55)' : s.accent }}
                      >
                        {STATUS_LABEL[s.status]}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[0.75rem] leading-relaxed text-ink/65">{s.use}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={100} className="panel p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="eyebrow text-amber">Challenge resource links</h3>
              <span className="micro text-ink/60">external</span>
            </div>
            <ul className="mt-4">
              {RESOURCES.map(([org, name, url], k) => (
                <li key={url} className="border-t border-line/70 first:border-t-0">
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex min-h-11 items-center gap-3 py-2 transition-colors hover:bg-ink/[0.04]"
                  >
                    <span className="micro w-20 shrink-0" style={{ color: k % 2 === 0 ? '#ffd166' : '#35e6e0' }}>
                      {org}
                    </span>
                    <span className="min-w-0 flex-1 text-[0.8125rem] leading-snug text-ink/80 group-hover:text-ink">{name}</span>
                    <span className="pr-1 text-ink/60 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden="true">
                      ↗
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        <div className="mt-20 grid gap-14 lg:grid-cols-2 lg:gap-20">
          <Reveal>
            <h3 className="eyebrow">Link or embed this exact state</h3>
            <p className="mt-4 max-w-xl leading-relaxed text-ink/70">Every instrument setting is encoded in the URL query string so collaborators can reproduce or embed the exact reduction.</p>
            <div className="mt-6 space-y-4">
              <CopyBox label="Permalink" text={`${base}?${query}`} accent="#35e6e0" />
              <CopyBox label="Iframe embed" text={`<iframe src="${base}?${query}&embed=1" width="960" height="1280" style="border:0" title="Rendezvous SPHEREx blink lab"></iframe>`} accent="#ffa51f" />
            </div>
            <dl className="mt-8 border-t border-ink/15">
              {PARAMS.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-4 border-b border-ink/15 py-3">
                  <dt className="num text-sm font-semibold text-ink">{k}</dt>
                  <dd className="text-sm leading-relaxed text-ink/70">{v}</dd>
                </div>
              ))}
            </dl>
          </Reveal>

          <div>
            <Reveal>
              <h3 className="eyebrow">In-browser FITS & release workbench</h3>
              <p className="mt-4 max-w-xl leading-relaxed text-ink/70">
                Drop one or more <span className="num text-ink">.fits</span> exposures (SPHEREx Level-2 files, multi-epoch WCS cutouts, or exported Rendezvous FITS / JSON snapshots) below. TAN-SIP celestial reprojection, zodiacal subtraction, flag masking and spectral wavelength lookup run locally in browser memory.
              </p>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  handleFiles(e.dataTransfer.files);
                }}
                className={cn('mt-6 border p-6 transition-colors', dragging ? 'border-signal bg-signal/[0.06]' : 'border-ink/25 bg-ink/[0.02]')}
              >
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept=".fits,.fit,.fts,.json"
                  className="sr-only"
                  onChange={(e) => {
                    handleFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
                <p className="micro text-ink/75">Client-side FITS pipeline · TAN / TAN-SIP + WAVE-TAB</p>
                <p className="mt-2 text-sm leading-relaxed text-ink/80">
                  Drag <span className="num text-ink">.fits</span> or <span className="num text-ink">.json</span> files here, or browse from disk to open them directly in the Blink Viewer.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-4">
                  <button type="button" onClick={() => inputRef.current?.click()} className="btn btn-sm">
                    Select FITS files <Arrow />
                  </button>
                  {status && <span role="status" className="text-xs text-signal">{status}</span>}
                </div>
              </div>
            </Reveal>

            <Reveal delay={100}>
              <h3 className="eyebrow mt-14">Data & mission credits</h3>
              <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink/75">External links below are provided solely to credit the space-agency archives and astronomical surveys whose observations are analysed in Rendezvous.</p>
              <ul className="mt-4 border-t border-ink/15">
                {CREDITS.map(([org, name, url], k) => {
                  const accents = ['#8fd3ff', '#ffd166', '#8fd3ff', '#35e6e0', '#7fe3a1', '#ff5c4d', '#f0f0fa'];
                  const accent = accents[k % accents.length];
                  return (
                    <li key={url} className="border-b border-line">
                      <a href={url} target="_blank" rel="noreferrer" className="group flex min-h-12 items-center gap-4 py-2 transition-colors hover:bg-ink/[0.045]">
                        <span className="micro w-24 shrink-0" style={{ color: accent }}>
                          {org}
                        </span>
                        <span className="min-w-0 flex-1 text-[0.9375rem] text-ink/85 group-hover:text-ink">{name}</span>
                        <span className="pr-1 text-ink/75 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden="true">
                          ↗
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="relative border-t border-line py-14">
      <span className="rule-spectrum absolute inset-x-0 top-0 h-0.5" aria-hidden="true" />
      <div className="wrap grid gap-10 lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-24">
        <div>
          <Wordmark className="text-base" />
          <p className="micro mt-5 text-cyan">Rendezvous</p>
          <p className="micro mt-2 text-ink/70">2026 NASA Space Apps Challenge · Planet X and SPHEREx</p>
          <p className="mt-5 text-[0.8125rem] leading-relaxed text-ink/80">
            Built by <span className="font-semibold text-ink">Team Afterlight · Evenstar1</span>
          </p>
          <a
            href="https://github.com/evenstar1"
            target="_blank"
            rel="noreferrer"
            className="micro mt-2 inline-flex min-h-8 items-center gap-2 text-cyan transition-colors hover:text-ink"
          >
            github.com/evenstar1 <span aria-hidden="true">↗</span>
          </a>
        </div>
        <div className="grid gap-8 text-[0.8125rem] leading-relaxed text-ink/75 sm:grid-cols-2">
          <p>
            SPHEREx Level-2 exposures and HiPS cubes: NASA / JPL-Caltech / Caltech-IPAC (IRSA). Astrometry: ESA Gaia DR3 & CDS SIMBAD. Infrared reference surveys: NASA/JPL AllWISE & CatWISE2020, 2MASS, and STScI DSS2. Space-agency partner context: CSA NEOSSat & CADC.
          </p>
          <p>
            Rendezvous is a self-contained scientific web instrument. It is not affiliated with or endorsed by NASA, Caltech/IPAC, ESA, CSA or SpaceX; the interface is a stylistic homage. Hero and spacecraft visuals are illustrations; every measurement in the viewer is computed from real telescope data.
          </p>
        </div>
      </div>
      <div className="wrap mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-line/70 pt-5">
        <p className="micro text-ink/55">Real photons · no synthetic pixels</p>
        <a href="#top" className="micro inline-flex min-h-8 items-center gap-2 text-ink/70 transition-colors hover:text-cyan">
          Back to top <span aria-hidden="true">↑</span>
        </a>
      </div>
    </footer>
  );
}
