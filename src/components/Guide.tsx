import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FLAG_DOCS } from '../lib/science';
import { cn } from '../utils/cn';
import { Arrow } from './ui';

interface Section {
  id: string;
  label: string;
  kicker: string;
  title: string;
  body: ReactNode;
}

const P = ({ children }: { children: ReactNode }) => <p className="mt-3 max-w-2xl leading-relaxed text-ink/75 first:mt-0">{children}</p>;
const H = ({ children }: { children: ReactNode }) => <h4 className="mt-7 text-sm font-semibold uppercase tracking-[0.16em] text-ink first:mt-0">{children}</h4>;
const List = ({ items }: { items: ReactNode[] }) => (
  <ul className="mt-4 border-t border-ink/12">
    {items.map((it, k) => (
      <li key={k} className="flex gap-4 border-b border-ink/12 py-3 leading-relaxed text-ink/75">
        <span className="num mt-0.5 shrink-0 text-[0.75rem] font-semibold text-ink/70">{String(k + 1).padStart(2, '0')}</span>
        <span>{it}</span>
      </li>
    ))}
  </ul>
);
const Code = ({ children }: { children: ReactNode }) => <span className="num rounded-none bg-ink/10 px-1.5 py-0.5 text-[0.9em] text-ink">{children}</span>;

const SECTIONS: Section[] = [
  {
    id: 'start',
    label: 'Start here',
    kicker: 'Accessible to newcomers, rigorous for researchers',
    title: 'Three steps from sky image to verified measurement',
    body: (
      <>
        <P>Rendezvous turns multi-epoch infrared sky surveys into a self-contained laboratory. Every reduction, astrometric fit, spectrum, periodogram and FITS export runs directly inside this page.</P>
        <List
          items={[
            <>
              <b className="text-ink">Acquire a field.</b> Load one of the five bundled SPHEREx Level-2 fields (100% offline), enter any sky coordinates or object name for a 34-year multi-mission stack, or drop local <Code>.fits</Code> exposures directly onto the viewport.
            </>,
            <>
              <b className="text-ink">Blink &amp; subtract.</b> Step through <Code>Epochs</Code> and switch Operation to <Code>Difference</Code>. Static stars cancel to grey; moving objects leave a bright/dark dipole and variable stars leave a monopole residual.
            </>,
            <>
              <b className="text-ink">Verify in the Scientific Bench.</b> Click any source to measure its PSF radial profile, proper-motion vector, kinematic distance regime, Planck blackbody temperature, molecular absorption bands, and Lomb–Scargle periodogram — then log it to your in-site Discovery Notebook.
            </>,
          ]}
        />
        <P>Switch between <b className="text-ink">Guided</b> and <b className="text-ink">Research</b> at the top of the viewer, or press <Code>⌘K</Code> / <Code>Ctrl-K</Code> to search every instrument action.</P>
      </>
    ),
  },
  {
    id: 'motion',
    label: 'Spotting motion',
    kicker: 'Dipoles, baselines & false positives',
    title: 'How true motion separates from instrumental artefacts',
    body: (
      <>
        <P>Subtracting an earlier visit A from a later visit B removes static background galaxies and distant stars. A moving source produces a positive lobe at (x₀, y₀) and a negative lobe at (x₁, y₁) with comparable integrated flux.</P>
        <H>In-site verification protocol</H>
        <List
          items={[
            <>
              <b className="text-ink">PSF morphology test (Astrometry → PSF &amp; morphology).</b> Real astronomical point sources follow the telescope PSF (<Code>FWHM ≈ 7.5"–9.0"</Code> in SPHEREx). Unflagged hot pixels and single-readout cosmic rays appear narrower than the PSF (<Code>Sub-PSF spike</Code>) with high central sharpness; cometary comae and galaxies appear broader (<Code>Extended</Code>).
            </>,
            <>
              <b className="text-ink">Multi-visit linearity (Movers &amp; Astrometry).</b> When three or more visits span the field, a genuine proper-motion or outer-solar-system object marches monotonically along a coherent trajectory with reduced <Code>χ²_ν ≈ 1</Code>.
            </>,
            <>
              <b className="text-ink">Pipeline bitmasks.</b> Enable <Code>Pipeline flags</Code> to highlight pixels carrying <Code>OVERFLOW</Code>, <Code>TRANSIENT</Code>, <Code>SNOWBALL</Code>, <Code>STREAK</Code> or <Code>GHOST</Code> flags. Saturated stellar cores (such as Barnard&rsquo;s Star, RW Aurigae and R Draconis) generate halo residuals that must not be mistaken for companions.
            </>,
            <>
              <b className="text-ink">Catalogue cross-match.</b> Gaia DR3 and CatWISE2020 overlays propagate known stars to the exact epoch of each frame so stationary variables are cleanly separated from uncatalogued movers.
            </>,
          ]}
        />
      </>
    ),
  },
  {
    id: 'photometry',
    label: 'Units & photometry',
    kicker: 'Radiometric calibration & error propagation',
    title: 'From MJy sr⁻¹ surface brightness to PSF-corrected mJy',
    body: (
      <>
        <P>SPHEREx Level-2 images are calibrated in surface brightness <Code>MJy sr⁻¹</Code> with the zodiacal foreground model (<Code>ZODI</Code> HDU) subtracted. Rendezvous integrates point-source flux densities using exact sub-pixel geometry and rigorous noise propagation:</P>
        <List
          items={[
            <>
              <b className="text-ink">Solid angle conversion.</b> A pixel of angular side s arcseconds subtends <Code>Ω_pix = (s / 206264.806)² sr</Code>, giving <Code>0.88886 mJy per (MJy sr⁻¹)</Code> at s = 6.15".
            </>,
            <>
              <b className="text-ink">Sub-pixel circular aperture.</b> Boundary pixels are supersampled on a 5×5 sub-grid (wᵢ ∈ [0, 1]), eliminating discrete pixel-stepping jumps as aperture radius or source centroid shifts.
            </>,
            <>
              <b className="text-ink">PSF encircled-energy correction.</b> Diffraction causes SPHEREx&rsquo;s PSF FWHM to grow from ~7.5" in D1–D3 to ~9.0" in D6. When <Code>PSF aperture corr.</Code> is active (default), aperture sums are divided by the analytical Gaussian encircled-energy fraction <Code>EE(R) = 1 − 2^(−4·(R / FWHM)²)</Code> per exposure, removing chromatic aperture loss.
            </>,
            <>
              <b className="text-ink">Merline &amp; Howell (1995) uncertainty.</b> Flux variance combines pixel noise and sky-estimation uncertainty in the local 25"–40" annulus: <Code>σ_F = Ω_pix · EE⁻¹ · √( (Σ wᵢ²)·σ_pix² + (π/2)·(Σ wᵢ)²/N_sky · σ_sky² )</Code>, where <Code>σ_pix = max(σ_frame, 1.4826·MAD_sky)</Code>.
            </>,
            <>
              <b className="text-ink">AB magnitude &amp; 5σ depth.</b> Monochromatic AB magnitudes follow Oke &amp; Gunn (1983): <Code>m_AB = 23.900 − 2.5 log₁₀(F / mJy)</Code>. Visit coverage tables report the formal 5σ point-source limit in both mJy and AB mag.
            </>,
          ]}
        />
      </>
    ),
  },
  {
    id: 'spectra',
    label: 'Spectra & chemistry',
    kicker: '0.75–5.0 µm spectrophotometry',
    title: 'Blackbody fitting, power laws & molecular bands',
    body: (
      <>
        <P>SPHEREx employs linear variable filters (LVFs) across six HgCdTe detector arrays rather than a filter wheel. Each exposure&rsquo;s <Code>WCS-WAVE</Code> lookup table maps detector coordinates (X, Y) to exact central wavelength λ and bandpass Δλ.</P>
        <H>Continuum models</H>
        <List
          items={[
            <>
              <b className="text-ink">Planck blackbody fit.</b> Solves <Code>F_ν(λ) = Ω_disk · B_ν(λ, T_eff)</Code> across 150–12,000 K by exact linear-in-Ω profile χ² minimization with golden-section refinement, yielding <Code>T_eff ± σ_T</Code> (from ∂²χ²/∂T²), photometric angular diameter <Code>θ_d = 2√(Ω_disk / π)</Code>, and bolometric flux <Code>F_bol = Ω_disk · σ_SB · T_eff⁴ / π</Code>.
            </>,
            <>
              <b className="text-ink">Power-law fit.</b> Fits <Code>log₁₀ F_ν = log₁₀ F(1 µm) + α log₁₀ λ</Code> with 4σ MAD outlier clipping and exact inverse-variance covariance σ_α. Rayleigh–Jeans stellar tails approach α ≈ −2; cold Y dwarfs and dusty disks rise steeply (α &gt; +2).
            </>,
          ]}
        />
        <H>Molecular absorption diagnostics</H>
        <P>Rendezvous interpolates the linear continuum across clean sidebands bracketing six key near-IR bands — <Code>H₂O (1.40, 1.88, 2.80 µm)</Code>, <Code>CH₄ (3.32 µm)</Code>, <Code>CO₂ (4.27 µm)</Code>, and <Code>CO (4.67 µm)</Code> — reporting fractional band depth <Code>D_b = 1 − F_band / F_cont</Code>, equivalent width <Code>W_λ = D_b · Δλ</Code> in nm, and detection significance <Code>D_b / σ_D</Code>.</P>
      </>
    ),
  },
  {
    id: 'variability',
    label: 'Time series & periods',
    kicker: 'Variability & generalized Lomb–Scargle',
    title: 'Testing constancy and finding pulsation or rotation periods',
    body: (
      <>
        <P>Because every SPHEREx exposure samples a different wavelength, raw fluxes cannot be fed directly into a multi-band periodogram without static SED slopes masquerading as temporal signals. Rendezvous first normalizes each exposure by its detector-band median flux (<Code>yᵢ = Fᵢ / median(F_det)</Code>):</P>
        <List
          items={[
            <>
              <b className="text-ink">Constant-flux null test (χ²_ν).</b> Tests yᵢ = ⟨y⟩ against measurement and intra-band scatter. Sources with χ²_ν &gt; 3 and &gt; 2.5σ excess variance are flagged <Code>VARIABLE</Code>.
            </>,
            <>
              <b className="text-ink">Fractional excess RMS (F_var).</b> Computes intrinsic variability amplitude above measurement noise following Vaughan et al. (2003): <Code>F_var = √(S² − ⟨σ_err²⟩) / ⟨y⟩</Code>.
            </>,
            <>
              <b className="text-ink">Generalized Lomb–Scargle periodogram.</b> Implements the Zechmeister &amp; Kürster (2009) floating-mean weighted periodogram <Code>P(ω) ∈ [0, 1]</Code>, accounting for non-zero phase offsets in sparsely sampled cadences, with Horne–Baliunas analytical false-alarm probability (<Code>1% FAP</Code> threshold shown in red). Click any periodogram peak to phase-fold over two full cycles (φ ∈ [0, 2]).
            </>,
          ]}
        />
      </>
    ),
  },
  {
    id: 'astrometry',
    label: 'Astrometry & Planet X',
    kicker: 'Proper motion, parallax & heliocentric kinematics',
    title: 'Measuring motion and constraining distance inside the site',
    body: (
      <>
        <P>The <b className="text-ink">Astrometry</b> tab measures iterative Gaussian-windowed sub-pixel centroids (αₑ, δₑ) across either SPHEREx Level-2 visits or the 34-year All-Sky survey stack (DSS2 → 2MASS → AllWISE → SPHEREx), assigning King/Lindegren astrometric uncertainties <Code>σ_pos = √( (FWHM / 2.355·S/N)² + σ_sys² )</Code>.</P>
        <H>Two physical distance regimes</H>
        <List
          items={[
            <>
              <b className="text-ink">Bound Solar-System / Planet-X regime.</b> Over a 6-month SPHEREx baseline, Earth&rsquo;s 2 au orbital diameter induces reflex parallax <Code>Δθ_par ≈ (2 au · cos β) / r_h</Code> (e.g. at r_h = 400 au, reflex parallax shifts an object by ~2.0"–2.6" every 6 months), superimposed on secular Keplerian orbital drift <Code>μ_Kep = 1.296×10⁶ · r_h^(−3/2) "/yr</Code> with radiative equilibrium temperature <Code>T_eq ≈ 278 · r_h^(−1/2) K</Code>.
            </>,
            <>
              <b className="text-ink">Self-luminous Stellar / Brown-Dwarf regime.</b> Linear space motion produces tangential velocity <Code>v_t = 4.74047 · μ["/yr] · d[pc] km s⁻¹</Code>. When a catalogue parallax ϖ is present, <Code>d = 1000 / ϖ pc</Code> and v_t are exact; for uncatalogued movers, Rendezvous brackets kinematic distances across Galactic thin-disk (v_t ≈ 30 km s⁻¹) and halo (v_t ≈ 150 km s⁻¹) populations alongside ICRS, Ecliptic (λ, β) and Galactic (l, b) coordinates.
            </>,
          ]}
        />
      </>
    ),
  },
  {
    id: 'flags',
    label: 'Flags & artefacts',
    kicker: 'The 22-bit contamination dictionary',
    title: 'Every SPHEREx pipeline flag, translated',
    body: (
      <>
        <P>Each SPHEREx Level-2 pixel carries a 32-bit integer mask (<Code>FLAGS</Code> HDU). Rendezvous excludes non-informational flag bits during inverse-variance co-addition unless no unflagged sample exists at that sky pixel, and decodes active flags within 15" of the target:</P>
        <ul className="mt-5 border-t border-ink/12">
          {Object.entries(FLAG_DOCS).map(([k, v]) => (
            <li key={k} className="grid gap-1 border-b border-ink/12 py-2.5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-6">
              <code className="num text-[0.75rem] font-semibold tracking-wider text-ink">{k}</code>
              <span className="text-sm leading-relaxed text-ink/70">{v}</span>
            </li>
          ))}
        </ul>
      </>
    ),
  },
  {
    id: 'methods',
    label: 'Methods & credits',
    kicker: 'Pipeline architecture & known limits',
    title: 'Self-contained reduction, FITS I/O & attribution',
    body: (
      <>
        <H>Reduction &amp; co-addition</H>
        <P>Exposures are reprojected onto a north-up, east-left gnomonic tangent plane (<Code>TAN-SIP</Code> forward + Newton-refined inverse polynomials). Co-adds compute the flag-masked inverse-variance weighted mean; when ≥ 4 clean samples cover a pixel, points deviating by &gt; 5·max(σ_k, 1.4826·MAD) + 0.3|m| from the pixel median are clipped.</P>
        <H>In-browser FITS import &amp; export</H>
        <P>Drop any SPHEREx Level-2 <Code>.fits</Code> exposures or generic WCS-calibrated 2D FITS cutouts into the viewer or Section 04 to reduce them in browser memory, and click <Code>Export .fits</Code> in Frame Metadata to write a standards-compliant IEEE-754 32-bit floating-point FITS file with full ICRS <Code>RA---TAN / DEC--TAN</Code> WCS and <Code>FLAGS</Code> extension.</P>
        <H>Known dynamic-range &amp; sampling limits</H>
        <P>The five bundled offline packs store background-subtracted pixels using 8-bit asinh companding (~0.25σ quantization near sky, ~5% steps on bright sources); local FITS files imported during a session retain full 32-bit float precision. Bundled snapshots are 5.7'×5.7' and cap at 240 exposures per field; All-Sky HiPS tiles are 8-bit display mosaics suitable for astrometry and morphology rather than absolute radiometry.</P>
        <H>Catalogue epochs</H>
        <P>Gaia DR3 positions are at J2016.0. CatWISE2020 positions are at MJD 57170 (2015.4), not the AllWISE epoch; each source carries its catalogue proper motion so overlays and crossmatches are propagated to the frame being viewed. NEOSSat / CADC are linked as space-agency partner resources only — no NEOSSat pixels are ingested.</P>
        <H>Credits</H>
        <P><b className="text-ink">Rendezvous</b> was built for the 2026 NASA Space Apps Challenge (<i>Planet X and SPHEREx</i>) by Team Afterlight · Evenstar1. Observations courtesy of NASA/JPL-Caltech/IPAC SPHEREx, ESA Gaia DR3, NASA/JPL WISE &amp; CatWISE2020, CDS Strasbourg, 2MASS, and STScI DSS2.</P>
      </>
    ),
  },
];

export function Guide({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [active, setActive] = useState('start');
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const hash = window.location.hash;
    if (hash === '#guide') window.history.replaceState(null, '', window.location.pathname + window.location.search);
    window.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', key);
      prev?.focus?.();
    };
  }, [open, onClose]);

  useEffect(() => {
    const el = document.getElementById('guide-' + active);
    if (open && el && panel.current) panel.current.scrollTop = el.offsetTop - 12;
  }, [active, open]);

  if (!open) return null;
  const sec = SECTIONS.find((s) => s.id === active) ?? SECTIONS[0];

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black/95 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="guide-title">
      <div className="wrap flex h-16 shrink-0 items-center justify-between border-b border-ink/15">
        <div className="flex min-w-0 items-baseline gap-4">
          <span className="font-bold uppercase tracking-[0.3em]">Science</span>
          <span className="micro hidden truncate text-ink/75 sm:block">Rendezvous · mission console</span>
        </div>
        <div className="flex items-center gap-2">
          <a href="#viewer" onClick={onClose} className="micro hidden min-h-10 items-center px-3 text-ink/70 hover:text-ink sm:flex">
            Back to viewer
          </a>
          <button ref={closeRef} type="button" onClick={onClose} className="btn btn-sm" aria-label="Close the science guide">
            Close <span aria-hidden="true">✕</span>
          </button>
        </div>
      </div>
      <div className="wrap grid min-h-0 flex-1 gap-8 py-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-14 lg:py-8">
        <nav aria-label="Guide sections" className="thin-scroll -mx-1 flex gap-1 overflow-x-auto pb-2 lg:mx-0 lg:block lg:overflow-y-auto lg:pb-10">
          {SECTIONS.map((s, k) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActive(s.id)}
              aria-current={active === s.id ? 'true' : undefined}
              className={cn(
                'flex shrink-0 items-baseline gap-3 whitespace-nowrap border border-ink/15 px-3 py-3 text-left text-[0.8125rem] font-medium transition-colors lg:mb-1 lg:w-full lg:whitespace-normal lg:border-0 lg:border-l-2 lg:px-4',
                active === s.id ? 'border-ink bg-ink text-black lg:border-signal lg:bg-transparent lg:text-ink' : 'text-ink/80 hover:bg-ink/10 hover:text-ink lg:border-ink/15',
              )}
            >
              <span className="num text-[0.6875rem] opacity-50">0{k + 1}</span>
              {s.label}
            </button>
          ))}
        </nav>
        <div ref={panel} className="thin-scroll min-h-0 overflow-y-auto pb-20 pr-1">
          <div id={'guide-' + sec.id}>
            <p className="eyebrow text-ink/75">{sec.kicker}</p>
            <h2 id="guide-title" className="display mt-4 max-w-3xl text-[clamp(1.9rem,4vw,3.4rem)]">
              {sec.title}
            </h2>
            <div className="mt-8">{sec.body}</div>
            <div className="mt-12 flex items-center justify-between gap-4 border-t border-ink/15 pt-5">
              {SECTIONS.findIndex((s) => s.id === sec.id) < SECTIONS.length - 1 ? (
                <button type="button" onClick={() => setActive(SECTIONS[SECTIONS.findIndex((s) => s.id === sec.id) + 1].id)} className="micro flex min-h-11 items-center gap-3 text-ink/75 hover:text-ink">
                  Next · {SECTIONS[SECTIONS.findIndex((s) => s.id === sec.id) + 1].label}
                  <Arrow />
                </button>
              ) : (
                <button type="button" onClick={onClose} className="btn btn-sm">
                  Back to the sky <Arrow />
                </button>
              )}
              <button type="button" onClick={onClose} className="micro min-h-11 px-2 text-ink/70 hover:text-ink">
                Esc to close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
