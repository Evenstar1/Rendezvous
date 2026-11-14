/* ---------------------------------------------------------------------------
 * Rendezvous — astrophysical analysis engine.
 * Pure TypeScript, zero DOM dependencies, safe in browser and Node:
 *   · Photometric units, AB magnitudes, solid angles, coordinate frames
 *   · Planck blackbody & power-law SED fitting + molecular absorption EW/depth
 *   · Variability statistics (χ²_ν, F_var) + generalized Lomb–Scargle + phase fold
 *   · Sub-pixel multi-epoch astrometry, linear proper-motion fit & kinematics
 *   · Radial PSF surface-brightness profile & morphology diagnostics
 *   · Sub-pixel dipole + full-baseline moving-object candidate search
 *   · 5σ point-source depth ledger, discovery notebook & self-contained exports
 * ------------------------------------------------------------------------- */
import { positionAt } from '../data/targets';
import { fmtDate, sepArcsec } from './coords';
import { CATWISE_EPOCH, GAIA_EPOCH } from './epochs';
import { buildShots, coadd, isBad, pixMjy, psfEncircledEnergy, targetAt, type Pack, type Phot, type Shot } from './packs';
import type { Plane } from './render';
import { gridToSky, median, type Grid } from './spherex';

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/* --------------------- Units & Coordinate Frames ------------------------ */

/** AB magnitude zero points (Oke & Gunn 1983: 3631 Jy standard).
 *  - mJy:  -2.5·log10(10⁻³ / 3631) = 16.4000656
 *  - µJy:  -2.5·log10(10⁻⁶ / 3631) = 23.9000656
 */
export const AB_ZP_MJY = 16.4000656;
export const AB_ZP_UJY = 23.9000656;
export const AB_ZP = AB_ZP_MJY;
export const toMag = (mjy: number) => (mjy > 0 ? AB_ZP - 2.5 * Math.log10(mjy) : NaN);
export const magToMjy = (mag: number) => 10 ** ((AB_ZP - mag) / 2.5);
export const toUjy = (mjy: number) => mjy * 1000;

export interface Offset {
  east: number;
  north: number;
  sep: number;
  pa: number;
}

/** Tangent-plane offset from field centre in arcseconds, with position angle (N=0°, E=90°). */
export function offsetFromCentre(grid: Grid, ra: number, dec: number): Offset {
  const dE = (ra - grid.ra) * Math.cos(dec * D2R) * 3600;
  const dN = (dec - grid.dec) * 3600;
  return { east: dE, north: dN, sep: Math.hypot(dE, dN), pa: (((Math.atan2(dE, dN) * R2D) % 360) + 360) % 360 };
}

/** ICRS (α, δ) → J2000 Ecliptic (λ, β) in degrees (IAU 2006 obliquity ε₀ = 23.43929111°). */
export function icrsToEcliptic(raDeg: number, decDeg: number): { lon: number; lat: number } {
  const eps = 23.43929111 * D2R;
  const a = raDeg * D2R;
  const d = decDeg * D2R;
  const sinB = Math.sin(d) * Math.cos(eps) - Math.cos(d) * Math.sin(eps) * Math.sin(a);
  const y = Math.sin(a) * Math.cos(eps) + Math.tan(d) * Math.sin(eps);
  const x = Math.cos(a);
  return { lon: (((Math.atan2(y, x) * R2D) % 360) + 360) % 360, lat: Math.asin(Math.max(-1, Math.min(1, sinB))) * R2D };
}

/** ICRS (α, δ) → Galactic (l, b) in degrees (Hipparcos / ESA exact rotation matrix). */
export function icrsToGalactic(raDeg: number, decDeg: number): { l: number; b: number } {
  const a = raDeg * D2R;
  const d = decDeg * D2R;
  const x = Math.cos(d) * Math.cos(a);
  const y = Math.cos(d) * Math.sin(a);
  const z = Math.sin(d);
  const gx = -0.0548755604 * x - 0.8734370902 * y - 0.4838350155 * z;
  const gy = 0.4941094279 * x - 0.44482963 * y + 0.7469822445 * z;
  const gz = -0.867666149 * x - 0.1980763734 * y + 0.4559837762 * z;
  return { l: (((Math.atan2(gy, gx) * R2D) % 360) + 360) % 360, b: Math.asin(Math.max(-1, Math.min(1, gz))) * R2D };
}

/* ------------------ Sub-Pixel Centroiding Helper ------------------------ */

function lobeCentroid(diff: Float32Array, n: number, i0: number, j0: number, sign: 1 | -1): [number, number, number] {
  let sw = 0;
  let sx = 0;
  let sy = 0;
  let peak = 0;
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      const i = i0 + di;
      const j = j0 + dj;
      if (i < 0 || j < 0 || i >= n || j >= n) continue;
      const v = sign * diff[j * n + i];
      if (v > 0 && Number.isFinite(v)) {
        sw += v;
        sx += v * i;
        sy += v * j;
        if (v > peak) peak = v;
      }
    }
  }
  return sw > 0 ? [sx / sw, sy / sw, peak] : [i0, j0, peak];
}

/* ---------------------- Moving-Object Candidates ------------------------ */

export interface Mover {
  id: string;
  ra: number;
  dec: number;
  x: number;
  y: number;
  x0: number;
  y0: number;
  sn: number;
  sep: number;
  rateArcsecYr: number;
  pa: number;
  e0: number;
  e1: number;
  mjd0: number;
  mjd1: number;
  title0: string;
  title1: string;
  flagged: boolean;
  consistent: boolean;
  match: 'target' | 'Gaia DR3' | 'CatWISE2020' | null;
  note: string;
}

/**
 * Sub-pixel dipole search across visit co-adds:
 *   · Compares consecutive visits (e → e+1) AND full baseline (0 → last) when ≥3 visits exist.
 *   · Computes flux-weighted sub-pixel centroids on both positive (earlier) and negative (later) lobes.
 *   · Checks intermediate-visit consistency when spanning ≥2 intervals.
 */
export function findMovers(pack: Pack, dets: number[], minSn = 5): Mover[] {
  const eps = buildShots(pack, 'epoch', dets);
  if (eps.length < 2) return [];
  const n = pack.n;
  const out: Mover[] = [];
  const midYear = (a: number, b: number) => 2000 + ((a + b) / 2 - 51544.5) / 365.25;

  const pairs: [number, number][] = [];
  for (let e = 0; e + 1 < eps.length; e++) pairs.push([e, e + 1]);
  if (eps.length >= 3) pairs.unshift([0, eps.length - 1]);

  for (const [eA, eB] of pairs) {
    const A = eps[eA];
    const B = eps[eB];
    const sigma = Math.hypot(A.sigma, B.sigma) || 1;
    const diff = new Float32Array(n * n);
    for (let k = 0; k < diff.length; k++) diff[k] = A.data[k] - B.data[k];

    const pos: { i: number; j: number; cx: number; cy: number; v: number }[] = [];
    const neg: { i: number; j: number; cx: number; cy: number; v: number }[] = [];
    for (let j = 2; j < n - 2; j++) {
      for (let i = 2; i < n - 2; i++) {
        const k = j * n + i;
        const d = diff[k];
        if (d !== d || Math.abs(d) < minSn * sigma) continue;
        if ((A.badFrac && A.badFrac[k] > 0.5) || (B.badFrac && B.badFrac[k] > 0.5)) continue;
        let peak = true;
        for (let dj = -1; dj <= 1 && peak; dj++) {
          for (let di = -1; di <= 1; di++) {
            if (!di && !dj) continue;
            const vq = diff[(j + dj) * n + (i + di)];
            if (vq !== vq || (d > 0 ? vq > d : vq < d)) {
              peak = false;
              break;
            }
          }
        }
        if (!peak) continue;
        const [cx, cy] = lobeCentroid(diff, n, i, j, d > 0 ? 1 : -1);
        (d > 0 ? pos : neg).push({ i, j, cx, cy, v: d });
      }
    }

    const thin = (list: typeof pos) => {
      const keep: typeof pos = [];
      for (const p of [...list].sort((a, b) => Math.abs(b.v) - Math.abs(a.v))) {
        if (keep.every((q) => Math.hypot(q.cx - p.cx, q.cy - p.cy) >= 2)) keep.push(p);
      }
      return keep.slice(0, 14);
    };
    const P = thin(pos);
    const N = thin(neg);
    const cands: { sn: number; pe: (typeof pos)[0]; pl: (typeof pos)[0]; sepPx: number }[] = [];
    for (const pe of P) {
      for (const pl of N) {
        const sepPx = Math.hypot(pl.cx - pe.cx, pl.cy - pe.cy);
        if (sepPx < 0.35 || sepPx > 9) continue;
        // Require roughly balanced dipole flux (within factor ~4) to reject pure variable stars next to faint noise spikes
        const ratio = Math.max(Math.abs(pe.v), Math.abs(pl.v)) / Math.max(1e-9, Math.min(Math.abs(pe.v), Math.abs(pl.v)));
        if (ratio > 4.5) continue;
        cands.push({ sn: Math.min(Math.abs(pe.v), Math.abs(pl.v)) / sigma, pe, pl, sepPx });
      }
    }
    cands.sort((a, b) => b.sn - a.sn);
    const used: { cx: number; cy: number }[] = [];
    let kept = 0;
    for (const c of cands) {
      if (kept >= 6) break;
      if (used.some((u) => Math.hypot(u.cx - c.pl.cx, u.cy - c.pl.cy) < 2.8)) continue;
      used.push(c.pl);
      const [ra0, dec0] = gridToSky(pack.grid, c.pe.cx, c.pe.cy);
      const [ra1, dec1] = gridToSky(pack.grid, c.pl.cx, c.pl.cy);
      const dE = (ra1 - ra0) * Math.cos(dec1 * D2R) * 3600;
      const dN = (dec1 - dec0) * 3600;
      const sep = Math.hypot(dE, dN);
      const pa = (((Math.atan2(dE, dN) * R2D) % 360) + 360) % 360;
      const mjdA = A.mjd ? 0.5 * (A.mjd[0] + A.mjd[1]) : 0;
      const mjdB = B.mjd ? 0.5 * (B.mjd[0] + B.mjd[1]) : 0;
      const dtYr = Math.max(1e-3, (mjdB - mjdA) / 365.25);
      const rateArcsecYr = sep / dtYr;
      const year = midYear(mjdA, mjdB);

      // Check intermediate epoch linear interpolation if spanning multiple visits
      let consistent = eB - eA === 1;
      if (eB - eA >= 2 && mjdB > mjdA) {
        let hits = 0;
        let checks = 0;
        for (let em = eA + 1; em < eB; em++) {
          const M = eps[em];
          const mjdM = M.mjd ? 0.5 * (M.mjd[0] + M.mjd[1]) : mjdA;
          const frac = (mjdM - mjdA) / (mjdB - mjdA);
          const ix = Math.round(c.pe.cx + frac * (c.pl.cx - c.pe.cx));
          const iy = Math.round(c.pe.cy + frac * (c.pl.cy - c.pe.cy));
          if (ix >= 1 && iy >= 1 && ix < n - 1 && iy < n - 1) {
            checks++;
            const val = M.data[iy * n + ix];
            if (Number.isFinite(val) && val > 3 * M.sigma) hits++;
          }
        }
        consistent = checks > 0 && hits === checks;
      }

      let match: Mover['match'] = null;
      let note = consistent && eB - eA >= 2 ? 'Detected consistently across intermediate visits.' : sep < 3 ? 'Compact dipole — verify centroid shift across visits.' : 'No counterpart in Gaia DR3 or CatWISE2020.';
      const [tra, tdec] = positionAt(pack.target.astrom, year);
      if (sepArcsec(ra1, dec1, tra, tdec) < 7.5 && Math.hypot(pack.target.astrom.pmra, pack.target.astrom.pmdec) > 50) {
        match = 'target';
        const tpa = (((Math.atan2(pack.target.astrom.pmra, pack.target.astrom.pmdec) * R2D) % 360) + 360) % 360;
        const dpa = Math.abs(((pa - tpa + 540) % 360) - 180);
        note = dpa < 45 ? `Matches proper-motion vector of ${pack.target.name}.` : `Near ${pack.target.name}, but PA differs from catalogue proper motion — inspect PSF halo.`;
      } else {
        const g = pack.gaia.find((s) => {
          const [gr, gd] = positionAt({ ...s, epoch: GAIA_EPOCH, ref: '' }, year);
          return sepArcsec(ra1, dec1, gr, gd) < 4.0;
        });
        if (g) {
          match = 'Gaia DR3';
          const gpm = Math.hypot(g.pmra, g.pmdec);
          note = gpm > 80 ? `Gaia DR3 high-PM star (${(gpm / 1000).toFixed(2)}"/yr).` : 'Coincides with a low-PM Gaia DR3 star — check variability or PSF residual.';
        } else {
          const w = pack.wise.find((s) => {
            const [wr, wd] = positionAt({ ra: s.ra, dec: s.dec, pmra: s.pmra ?? 0, pmdec: s.pmdec ?? 0, plx: 0, epoch: CATWISE_EPOCH, ref: '' }, year);
            return sepArcsec(ra1, dec1, wr, wd) < 4.0;
          });
          if (w) {
            match = 'CatWISE2020';
            note = 'Coincides with a CatWISE2020 infrared source (proper motion propagated to this epoch).';
          }
        }
      }
      const flagged = !!(B.badFrac && B.badFrac[c.pl.j * n + c.pl.i] > 0.1);
      if (flagged) note += ' Partial pipeline flag in later visit.';

      out.push({
        id: `M${out.length + 1}`,
        ra: ra1,
        dec: dec1,
        x: c.pl.cx,
        y: c.pl.cy,
        x0: c.pe.cx,
        y0: c.pe.cy,
        sn: c.sn,
        sep,
        rateArcsecYr,
        pa,
        e0: eA,
        e1: eB,
        mjd0: mjdA,
        mjd1: mjdB,
        title0: A.title,
        title1: B.title,
        flagged,
        consistent,
        match,
        note,
      });
      kept++;
      if (out.length >= 36) return tidyMovers(out);
    }
  }
  return tidyMovers(out);
}

function tidyMovers(list: Mover[]): Mover[] {
  const keep: Mover[] = [];
  for (const m of [...list].sort((a, b) => (Number(b.consistent) - Number(a.consistent)) * 8 + (b.sn - a.sn))) {
    const dup = keep.some((s) => sepArcsec(s.ra, s.dec, m.ra, m.dec) < 5.5 && Math.abs(((s.pa - m.pa + 540) % 360) - 180) < 45);
    if (!dup) keep.push({ ...m, id: `M${keep.length + 1}` });
  }
  return keep.slice(0, 14);
}

/* --------------------- Coverage & 5σ Depth Ledger ----------------------- */

export interface EpochStat {
  e: number;
  mjd0: number;
  mjd1: number;
  n: number;
  dets: number[];
  sigma: number;
  lim5Mjy: number;
  lim5Mag: number;
  flagged: number;
  lamMin: number;
  lamMax: number;
  members: number[];
}

/** Per-visit summary including formal 5σ point-source flux & AB magnitude limits. */
export function coverageStats(pack: Pack, apPx = 1.8): EpochStat[] {
  const solid = pixMjy(pack.grid.scale);
  const apArea = Math.PI * apPx * apPx;
  const ee = psfEncircledEnergy(apPx * pack.grid.scale, 8.2);
  return pack.epochs.map((g, e) => {
    const fr = g.map((k) => pack.frames[k]);
    const s = coadd(pack, g);
    let bad = 0;
    let all = 0;
    if (s.badFrac) {
      for (let i = 0; i < s.badFrac.length; i++) {
        if (s.badFrac[i] === s.badFrac[i]) {
          all++;
          if (s.badFrac[i] > 0.5) bad++;
        }
      }
    }
    const lams = fr.map((f) => f.lam).filter((v) => Number.isFinite(v));
    const lim5Mjy = (5 * s.sigma * Math.sqrt(apArea * 1.18) * solid) / ee;
    return {
      e,
      mjd0: fr[0].mjd,
      mjd1: fr[fr.length - 1].mjd,
      n: g.length,
      dets: [...new Set(fr.map((f) => f.det))].sort(),
      sigma: s.sigma,
      lim5Mjy,
      lim5Mag: toMag(lim5Mjy),
      flagged: all ? bad / all : 0,
      lamMin: lams.length ? Math.min(...lams) : NaN,
      lamMax: lams.length ? Math.max(...lams) : NaN,
      members: g,
    };
  });
}

/* ------------------ Spectral Modeling & Molecular Bands ----------------- */

export interface PowerLawFit {
  alpha: number;
  err: number;
  f1um: number;
  chi2Red: number;
  dof: number;
  n: number;
  curve: [number, number][];
}

function fitPowerLawRaw(pts: Phot[]) {
  let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of pts) {
    const x = Math.log10(p.lam);
    const y = Math.log10(p.flux);
    const sigLog = Math.max(0.015, 0.43429448 * (p.err / p.flux));
    const w = 1 / (sigLog * sigLog);
    sw += w; sx += w * x; sy += w * y; sxx += w * x * x; sxy += w * x * y;
  }
  const det = sw * sxx - sx * sx;
  if (!(det > 0)) return null;
  const alpha = (sw * sxy - sx * sy) / det;
  const beta = (sy - alpha * sx) / sw;
  const err = Math.sqrt(sw / det);
  const f1um = 10 ** beta;
  let chi2 = 0;
  const resid: number[] = [];
  for (const p of pts) {
    const model = f1um * p.lam ** alpha;
    chi2 += ((p.flux - model) / Math.max(1e-9, p.err)) ** 2;
    resid.push(Math.log10(p.flux) - (beta + alpha * Math.log10(p.lam)));
  }
  return { alpha, err, f1um, chi2, dof: Math.max(1, pts.length - 2), resid };
}

/** MAD-clipped weighted power-law fit F_ν = F(1 µm)·λ^α with reduced χ²_ν and model curve. */
export function spectralIndex(phot: Phot[], allowFlagged = false): PowerLawFit {
  const empty: PowerLawFit = { alpha: NaN, err: NaN, f1um: NaN, chi2Red: NaN, dof: 0, n: 0, curve: [] };
  const base = phot.filter((p) => (allowFlagged || !p.flagged) && p.flux > 0 && p.err > 0 && p.lam > 0);
  if (base.length < 4) return { ...empty, n: base.length };
  const first = fitPowerLawRaw(base);
  if (!first) return empty;
  let use = base;
  if (base.length >= 6) {
    const medR = median(first.resid);
    const mad = 1.4826 * median(first.resid.map((r) => Math.abs(r - medR)));
    const kept = base.filter((_, i) => Math.abs(first.resid[i] - medR) <= 4.0 * Math.max(mad, 0.025));
    if (kept.length >= 4) use = kept;
  }
  const fin = fitPowerLawRaw(use) ?? first;
  const curve: [number, number][] = [];
  for (let l = 0.75; l <= 5.01; l += 0.06) curve.push([Number(l.toFixed(3)), fin.f1um * l ** fin.alpha]);
  return { alpha: fin.alpha, err: fin.err, f1um: fin.f1um, chi2Red: fin.chi2 / fin.dof, dof: fin.dof, n: use.length, curve };
}

export interface BlackbodyFit {
  tempK: number;
  errK: number;
  omegaSr: number;
  angDiamMas: number;
  fbolWm2: number;
  chi2Red: number;
  dof: number;
  curve: [number, number][];
}

/** Planck B_ν(λ, T) in mJy sr⁻¹ for λ in µm and T in Kelvin (CODATA 2018 exact constants). */
export function planckMjySr(lamUm: number, tempK: number): number {
  const x = 14387.768775 / (lamUm * tempK);
  if (x > 680) return 0;
  const lamM = lamUm * 1e-6;
  const twoHc = 3.972891714e-25; // 2·h·c [J·m]
  return (1e29 * twoHc) / (lamM * lamM * lamM * Math.expm1(x));
}

/** Weighted Planck blackbody fit F_ν(λ) = Ω_disk · B_ν(λ, T_eff) across 150 K – 12,000 K.
 *  Retains non-detections (F ≤ 0) to avoid Malmquist/truncation bias on cold Y/T dwarfs. */
export function fitBlackbody(phot: Phot[], allowFlagged = false): BlackbodyFit | null {
  const pts = phot.filter((p) => (allowFlagged || !p.flagged) && Number.isFinite(p.flux) && p.err > 0 && p.lam > 0);
  if (pts.filter((p) => p.flux > 2 * p.err).length < 3 || pts.length < 4) return null;
  const evalAt = (T: number) => {
    let sfb = 0;
    let sbb = 0;
    for (const p of pts) {
      const b = planckMjySr(p.lam, T);
      if (!(b > 0)) continue;
      const sig = Math.hypot(p.err, 0.03 * Math.max(0, p.flux));
      const w = 1 / (sig * sig);
      sfb += w * p.flux * b;
      sbb += w * b * b;
    }
    if (!(sfb > 0 && sbb > 0)) return { omega: 0, chi2: Infinity };
    const omega = sfb / sbb;
    let chi2 = 0;
    for (const p of pts) {
      const sig = Math.hypot(p.err, 0.03 * Math.max(0, p.flux));
      const r = (p.flux - omega * planckMjySr(p.lam, T)) / sig;
      chi2 += r * r;
    }
    return { omega, chi2 };
  };

  let bestT = 1000;
  let best = evalAt(1000);
  const nGrid = 180;
  const logMin = Math.log(150);
  const logMax = Math.log(12000);
  for (let i = 0; i <= nGrid; i++) {
    const T = Math.exp(logMin + ((logMax - logMin) * i) / nGrid);
    const r = evalAt(T);
    if (r.chi2 < best.chi2) {
      best = r;
      bestT = T;
    }
  }
  // Golden-section refinement around bestT
  let lo = Math.max(130, bestT * 0.85);
  let hi = Math.min(15000, bestT * 1.18);
  const phi = (Math.sqrt(5) - 1) / 2;
  for (let it = 0; it < 26; it++) {
    const t1 = hi - phi * (hi - lo);
    const t2 = lo + phi * (hi - lo);
    if (evalAt(t1).chi2 < evalAt(t2).chi2) hi = t2;
    else lo = t1;
  }
  bestT = 0.5 * (lo + hi);
  best = evalAt(bestT);
  if (!Number.isFinite(best.chi2) || !(best.omega > 0)) return null;

  const dof = Math.max(1, pts.length - 2);
  const chi2Red = best.chi2 / dof;
  // Uncertainty σ_T scaled by √(max(1, χ²_ν)) from numerical curvature d²χ²/dT²
  const hStep = Math.max(1, bestT * 0.015);
  const d2 = (evalAt(bestT + hStep).chi2 - 2 * best.chi2 + evalAt(Math.max(100, bestT - hStep)).chi2) / (hStep * hStep);
  const errK = d2 > 0 ? Math.min(bestT * 0.8, Math.sqrt((2 * Math.max(1, chi2Red)) / d2)) : bestT * 0.15;

  const sigmaSB = 5.670374419e-8;
  const fbolWm2 = (best.omega * sigmaSB * bestT ** 4) / Math.PI;
  const angDiamMas = 2 * Math.sqrt(best.omega / Math.PI) * R2D * 3600 * 1000;
  const curve: [number, number][] = [];
  for (let l = 0.75; l <= 5.01; l += 0.05) curve.push([Number(l.toFixed(3)), best.omega * planckMjySr(l, bestT)]);
  return { tempK: bestT, errK, omegaSr: best.omega, angDiamMas, fbolWm2, chi2Red, dof, curve };
}

export interface BandFeature {
  species: string;
  centreUm: number;
  depth: number; // fractional absorption depth 1 - F_band / F_cont (positive = absorption)
  errDepth: number;
  ewNm: number; // equivalent width in nm
  sn: number;
}

const BAND_WINDOWS: { species: string; cen: number; band: [number, number]; blue: [number, number]; red: [number, number] }[] = [
  { species: 'H₂O 1.4 µm', cen: 1.40, band: [1.34, 1.48], blue: [1.22, 1.31], red: [1.52, 1.63] },
  { species: 'H₂O 1.9 µm', cen: 1.88, band: [1.80, 1.98], blue: [1.65, 1.76], red: [2.03, 2.16] },
  { species: 'H₂O / ice 2.8 µm', cen: 2.80, band: [2.62, 3.05], blue: [2.22, 2.42], red: [3.55, 3.80] },
  { species: 'CH₄ 3.3 µm', cen: 3.32, band: [3.18, 3.48], blue: [2.95, 3.14], red: [3.65, 3.92] },
  { species: 'CO₂ 4.27 µm', cen: 4.27, band: [4.20, 4.35], blue: [3.95, 4.15], red: [4.38, 4.52] },
  { species: 'CO 4.67 µm', cen: 4.67, band: [4.58, 4.78], blue: [4.42, 4.55], red: [4.80, 4.96] },
];

/** Continuum-interpolated molecular absorption depths and equivalent widths across SPHEREx's 6 key bands. */
export function molecularBands(phot: Phot[], allowFlagged = false): BandFeature[] {
  const pts = phot.filter((p) => (allowFlagged || !p.flagged) && Number.isFinite(p.flux) && p.err > 0);
  if (pts.length < 12) return [];
  const winMean = (lo: number, hi: number): [number, number, number] | null => {
    const sub = pts.filter((p) => p.lam >= lo && p.lam <= hi);
    if (sub.length < 2) return null;
    let sw = 0, sf = 0, sl = 0;
    for (const p of sub) {
      const w = 1 / (p.err * p.err);
      sw += w; sf += w * p.flux; sl += w * p.lam;
    }
    return [sl / sw, sf / sw, 1 / Math.sqrt(sw)];
  };
  const out: BandFeature[] = [];
  for (const b of BAND_WINDOWS) {
    const bl = winMean(b.blue[0], b.blue[1]);
    const rd = winMean(b.red[0], b.red[1]);
    const bd = winMean(b.band[0], b.band[1]);
    if (!bl || !rd || !bd || rd[0] <= bl[0]) continue;
    const t = (bd[0] - bl[0]) / (rd[0] - bl[0]);
    const fCont = bl[1] * (1 - t) + rd[1] * t;
    const sigCont = Math.hypot(bl[2] * (1 - t), rd[2] * t);
    if (!(fCont > 3 * sigCont)) continue;
    const ratio = bd[1] / fCont;
    const errRatio = Math.hypot(bd[2] / fCont, (bd[1] * sigCont) / (fCont * fCont));
    const depth = 1 - ratio;
    const widthNm = (b.band[1] - b.band[0]) * 1000;
    out.push({
      species: b.species,
      centreUm: b.cen,
      depth,
      errDepth: errRatio,
      ewNm: depth * widthNm,
      sn: depth / Math.max(1e-6, errRatio),
    });
  }
  return out;
}

/** Peak flux and the exposure that produced it. */
export function peakOf(phot: Phot[]): Phot | null {
  const good = phot.filter((p) => !p.flagged && p.flux > 0);
  const pool = good.length ? good : phot;
  return pool.length ? pool.reduce((a, b) => (b.flux > a.flux ? b : a)) : null;
}

/** Robust peak-to-peak variability (5th–95th percentile), in magnitudes. */
export function amplitude(phot: Phot[], allowFlagged = false): number {
  const clean = phot.filter((p) => !p.flagged && p.flux > 0).map((p) => toMag(p.flux));
  const all = phot.filter((p) => p.flux > 0).map((p) => toMag(p.flux));
  const good = (allowFlagged || clean.length < 4 ? all : clean).sort((a, b) => a - b);
  if (good.length < 4) return NaN;
  return good[Math.floor(good.length * 0.95)] - good[Math.floor(good.length * 0.05)];
}

/* ---------- Variability Statistics & Lomb–Scargle Periodogram ----------- */

export interface VariabilityReport {
  chi2Red: number;
  dof: number;
  fvar: number; // Vaughan et al. (2003) fractional excess RMS
  fvarErr: number;
  ampMag: number;
  variable: boolean;
}

/** Normalize each exposure by its narrow spectral-channel median (Δλ/λ ≈ 1/35) so static molecular
 *  absorption bands (H₂O, CH₄, CO) never leak into temporal variability or periodograms. */
function normalizedSeries(phot: Phot[], allowFlagged: boolean): { mjd: number; rel: number; err: number; det: number }[] {
  const pool = phot.filter((p) => (allowFlagged || !p.flagged) && p.flux > p.err && p.err > 0 && p.mjd > 0);
  const chanBin = (lam: number, det: number) => `${det}:${Math.round(Math.log(lam) * 42)}`;
  const byChan = new Map<string, number[]>();
  for (const p of pool) {
    const key = chanBin(p.lam, p.det);
    byChan.set(key, [...(byChan.get(key) ?? []), p.flux]);
  }
  const medChan = new Map<string, number>();
  for (const [k, vals] of byChan) if (vals.length >= 2) medChan.set(k, median(vals));
  const out: { mjd: number; rel: number; err: number; det: number }[] = [];
  for (const p of pool) {
    const m = medChan.get(chanBin(p.lam, p.det));
    if (!m || !(m > 0)) continue;
    out.push({ mjd: p.mjd, rel: p.flux / m, err: Math.hypot(p.err / m, 0.025), det: p.det });
  }
  return out.sort((a, b) => a.mjd - b.mjd);
}

/** Constant-flux null-hypothesis test (χ²_ν) and Vaughan et al. (2003) fractional excess variance F_var. */
export function variabilityStats(phot: Phot[], allowFlagged = false): VariabilityReport {
  const s = normalizedSeries(phot, allowFlagged);
  if (s.length < 4) return { chi2Red: NaN, dof: 0, fvar: NaN, fvarErr: NaN, ampMag: amplitude(phot, allowFlagged), variable: false };
  let sw = 0, sy = 0;
  for (const p of s) {
    const w = 1 / (p.err * p.err);
    sw += w; sy += w * p.rel;
  }
  const mean = sy / sw;
  let chi2 = 0;
  let s2 = 0;
  let mse = 0;
  for (const p of s) {
    chi2 += ((p.rel - mean) / p.err) ** 2;
    s2 += (p.rel - mean) ** 2;
    mse += p.err * p.err;
  }
  const N = s.length;
  s2 /= N - 1;
  mse /= N;
  const dof = N - 1;
  const chi2Red = chi2 / dof;
  const xs = s2 - mse;
  const fvar = xs > 0 ? Math.sqrt(xs) / mean : 0;
  const errXs = Math.sqrt((2 / N) * mse * mse + (mse / N) * 4 * xs);
  const fvarErr = fvar > 0 ? errXs / (2 * mean * Math.sqrt(xs)) : Math.sqrt(Math.sqrt(2 / N) * mse) / mean;
  return {
    chi2Red,
    dof,
    fvar,
    fvarErr,
    ampMag: amplitude(phot, allowFlagged),
    variable: chi2Red > 3.0 && fvar > 2.5 * fvarErr,
  };
}

export interface Periodogram {
  periods: number[]; // days
  powers: number[]; // Zechmeister–Kürster normalized GLS power [0, 1]
  bestPeriod: number;
  bestPower: number;
  fap: number;
  fap01Power: number; // 1% FAP threshold line
}

/** Generalized floating-mean Lomb–Scargle periodogram (Zechmeister & Kürster 2009, A&A 496, 577). */
export function lombScargle(phot: Phot[], allowFlagged = false): Periodogram | null {
  const s = normalizedSeries(phot, allowFlagged);
  if (s.length < 8) return null;
  const t0 = s[0].mjd;
  const span = s[s.length - 1].mjd - t0;
  if (!(span > 5)) return null;

  const N = s.length;
  const t = new Float64Array(N);
  const y = new Float64Array(N);
  const w = new Float64Array(N);
  let wsum = 0;
  for (let i = 0; i < N; i++) {
    t[i] = s[i].mjd - t0;
    w[i] = 1 / (s[i].err * s[i].err);
    wsum += w[i];
  }
  let yMean = 0;
  for (let i = 0; i < N; i++) {
    w[i] /= wsum;
    yMean += w[i] * s[i].rel;
  }
  let YY = 0;
  for (let i = 0; i < N; i++) {
    y[i] = s[i].rel - yMean;
    YY += w[i] * y[i] * y[i];
  }
  if (!(YY > 0)) return null;

  const pMin = Math.max(1.5, span / 160);
  const pMax = Math.max(pMin * 2, span * 1.35);
  const fMin = 1 / pMax;
  const fMax = 1 / pMin;
  const nFreq = 360;
  const periods: number[] = [];
  const powers: number[] = [];
  let bestPower = -1;
  let bestPeriod = NaN;

  for (let k = 0; k < nFreq; k++) {
    const freq = fMin + ((fMax - fMin) * k) / (nFreq - 1);
    const omega = 2 * Math.PI * freq;
    let C = 0, S = 0, YC = 0, YS = 0, CC = 0, SS = 0, CS = 0;
    for (let i = 0; i < N; i++) {
      const c = Math.cos(omega * t[i]);
      const sn = Math.sin(omega * t[i]);
      const wc = w[i] * c;
      const ws = w[i] * sn;
      C += wc; S += ws;
      YC += y[i] * wc; YS += y[i] * ws;
      CC += wc * c; SS += ws * sn; CS += wc * sn;
    }
    const cHat = CC - C * C;
    const sHat = SS - S * S;
    const csHat = CS - C * S;
    const D = cHat * sHat - csHat * csHat;
    const P = D > 1e-14 ? (sHat * YC * YC + cHat * YS * YS - 2 * csHat * YC * YS) / (YY * D) : 0;
    const clamped = Math.max(0, Math.min(1, P));
    const per = 1 / freq;
    periods.push(per);
    powers.push(clamped);
    if (clamped > bestPower) {
      bestPower = clamped;
      bestPeriod = per;
    }
  }

  // Horne & Baliunas / Zechmeister–Kürster independent frequencies M_eff ≈ span · Δf
  const mEff = Math.max(1, span * (fMax - fMin));
  const singleProb = Math.pow(Math.max(1e-15, 1 - bestPower), Math.max(1, (N - 3) / 2));
  const fap = singleProb * mEff < 1e-4 ? singleProb * mEff : 1 - Math.pow(Math.max(0, 1 - singleProb), mEff);
  const fap01Single = 1 - Math.pow(0.99, 1 / mEff);
  const fap01Power = 1 - Math.pow(fap01Single, 2 / Math.max(1, N - 3));
  return { periods, powers, bestPeriod, bestPower, fap: Math.min(1, Math.max(0, fap)), fap01Power: Math.min(0.99, Math.max(0.05, fap01Power)) };
}

export interface PhasePoint {
  phase: number;
  rel: number;
  err: number;
  det: number;
  mjd: number;
}

export function foldLightCurve(phot: Phot[], periodDays: number, allowFlagged = false): PhasePoint[] {
  if (!(periodDays > 0)) return [];
  const s = normalizedSeries(phot, allowFlagged);
  if (!s.length) return [];
  const t0 = s[0].mjd;
  const pts: PhasePoint[] = [];
  for (const p of s) {
    const ph = (((p.mjd - t0) / periodDays) % 1 + 1) % 1;
    pts.push({ phase: ph, rel: p.rel, err: p.err, det: p.det, mjd: p.mjd });
    pts.push({ phase: ph + 1, rel: p.rel, err: p.err, det: p.det, mjd: p.mjd });
  }
  return pts;
}

/* ----------- Multi-Epoch Astrometry, Radial PSF & Kinematics ------------ */

export interface AstromEpoch {
  title: string;
  year: number;
  ra: number;
  dec: number;
  x: number;
  y: number;
  dEastArcsec: number;
  dNorthArcsec: number;
  posErrArcsec: number;
  sn: number;
}

export interface ProperMotionSolution {
  epochs: AstromEpoch[];
  refYear: number;
  pmRaMasYr: number; // μα* = μα·cos(δ) in mas/yr
  pmDecMasYr: number;
  errMasYr: number;
  pmTotArcsecYr: number;
  paDeg: number;
  errPaDeg: number;
  chi2Red: number;
  dof: number;
  baselineYr: number;
}

/** Sub-pixel PSF-weighted centroiding across a sequence of shots (Level-2 visits OR multi-decade All-Sky surveys)
 *  followed by weighted linear proper-motion least squares. */
export function measureAstrometry(shots: Shot[], grid: Grid, seedAt: (year: number) => [number, number]): ProperMotionSolution | null {
  const usable = shots.filter((s) => Number.isFinite(s.year) && (s.mjd !== null || s.unit === 'display'));
  if (usable.length < 2) return null;
  const n = grid.n;
  const epochs: AstromEpoch[] = [];

  for (const s of usable) {
    const arr = s.raw ?? s.data;
    const [si, sj] = seedAt(s.year);
    const i0 = Math.round(si);
    const j0 = Math.round(sj);
    if (i0 < 4 || j0 < 4 || i0 > n - 5 || j0 > n - 5) continue;

    // Local background & MAD noise in r = 4..7 px annulus
    const ann: number[] = [];
    for (let dj = -7; dj <= 7; dj++) {
      for (let di = -7; di <= 7; di++) {
        const r = Math.hypot(di, dj);
        if (r < 4 || r > 7.2) continue;
        const ii = i0 + di, jj = j0 + dj;
        if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
        const v = arr[jj * n + ii];
        if (Number.isFinite(v)) ann.push(v);
      }
    }
    if (ann.length < 12) continue;
    const bg = median(ann);
    const mad = 1.4826 * median(ann.map((v) => Math.abs(v - bg)));
    const sig = s.unit === 'display' ? Math.max(1.5, mad) : Math.max(s.sigma, mad);

    // Find brightest 3×3 local sum within searchR of seed (robust against single hot pixels)
    let bestI = i0;
    let bestJ = j0;
    let bestPeak = -Infinity;
    const searchR = s.unit === 'display' ? 3 : 2;
    for (let dj = -searchR; dj <= searchR; dj++) {
      for (let di = -searchR; di <= searchR; di++) {
        if (Math.hypot(di, dj) > searchR + 0.3) continue;
        const ii = i0 + di, jj = j0 + dj;
        if (ii < 2 || jj < 2 || ii >= n - 2 || jj >= n - 2) continue;
        let boxSum = 0;
        let ok = 0;
        for (let qj = -1; qj <= 1; qj++) {
          for (let qi = -1; qi <= 1; qi++) {
            const v = arr[(jj + qj) * n + (ii + qi)] - bg;
            if (Number.isFinite(v)) {
              boxSum += v;
              ok++;
            }
          }
        }
        if (ok === 9 && boxSum > bestPeak) {
          bestPeak = boxSum;
          bestI = ii;
          bestJ = jj;
        }
      }
    }

    // Iterative Gaussian-windowed sub-pixel moment centroid (3 iterations, σ_w = 1.15 px)
    let cx = bestI;
    let cy = bestJ;
    let fluxSum = 0;
    let varSum = 0;
    let coreFlagged = false;
    for (let it = 0; it < 3; it++) {
      let sw = 0, sx = 0, sy = 0;
      fluxSum = 0; varSum = 0; coreFlagged = false;
      const ci = Math.round(cx), cj = Math.round(cy);
      for (let dj = -2; dj <= 2; dj++) {
        for (let di = -2; di <= 2; di++) {
          const ii = ci + di, jj = cj + dj;
          if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
          const idx = jj * n + ii;
          const val = arr[idx] - bg;
          if (!Number.isFinite(val)) continue;
          const r2 = (ii - cx) ** 2 + (jj - cy) ** 2;
          if (r2 > 5.2) continue;
          if (r2 <= 2.2 && s.badFrac && s.badFrac[idx] > 0.5) coreFlagged = true;
          const g = Math.exp(-r2 / (2 * 1.15 * 1.15));
          if (val > 0) {
            sw += g * val;
            sx += g * val * ii;
            sy += g * val * jj;
          }
          fluxSum += g * val;
          varSum += g * g * sig * sig;
        }
      }
      if (!(sw > 0)) break;
      cx = sx / sw;
      cy = sy / sw;
    }
    const sn = varSum > 0 && Number.isFinite(bestPeak) ? fluxSum / Math.sqrt(varSum) : 0;
    if (!(sn >= 3.2)) continue;

    const [ra, dec] = gridToSky(grid, cx, cy);
    const fwhm = Math.max(2.0 * grid.scale, 8.0);
    const sysFloor = s.unit === 'display' ? 0.38 : coreFlagged ? 0.65 : 0.22;
    const posErrArcsec = Math.hypot(fwhm / (2.3548 * sn), sysFloor);
    const off = offsetFromCentre(grid, ra, dec);
    epochs.push({ title: s.title, year: s.year, ra, dec, x: cx, y: cy, dEastArcsec: off.east, dNorthArcsec: off.north, posErrArcsec, sn });
  }

  if (epochs.length < 2) return null;
  epochs.sort((a, b) => a.year - b.year);
  const baselineYr = epochs[epochs.length - 1].year - epochs[0].year;
  if (!(baselineYr > 0.02)) return null;

  let sw = 0, st = 0;
  for (const e of epochs) {
    const w = 1 / (e.posErrArcsec * e.posErrArcsec);
    sw += w; st += w * e.year;
  }
  const refYear = st / sw;
  let stt = 0, sx = 0, sy = 0, stx = 0, sty = 0;
  for (const e of epochs) {
    const w = 1 / (e.posErrArcsec * e.posErrArcsec);
    const dt = e.year - refYear;
    stt += w * dt * dt;
    sx += w * e.dEastArcsec;
    sy += w * e.dNorthArcsec;
    stx += w * dt * e.dEastArcsec;
    sty += w * dt * e.dNorthArcsec;
  }
  if (!(stt > 0)) return null;
  const x0 = sx / sw;
  const y0 = sy / sw;
  const muE = stx / stt; // arcsec/yr
  const muN = sty / stt; // arcsec/yr
  const errArcsecYr = Math.sqrt(1 / stt);

  let chi2 = 0;
  for (const e of epochs) {
    const dt = e.year - refYear;
    const rx = (e.dEastArcsec - (x0 + muE * dt)) / e.posErrArcsec;
    const ry = (e.dNorthArcsec - (y0 + muN * dt)) / e.posErrArcsec;
    chi2 += rx * rx + ry * ry;
  }
  const dof = Math.max(1, 2 * epochs.length - 4);
  const chi2Red = epochs.length > 2 ? chi2 / dof : 1;
  const scaleErr = Math.sqrt(Math.max(1, chi2Red));
  const pmTotArcsecYr = Math.hypot(muE, muN);
  const paDeg = (((Math.atan2(muE, muN) * R2D) % 360) + 360) % 360;
  const errPaDeg = pmTotArcsecYr > 0 ? Math.min(180, ((errArcsecYr * scaleErr) / pmTotArcsecYr) * R2D) : 180;

  return {
    epochs,
    refYear,
    pmRaMasYr: muE * 1000,
    pmDecMasYr: muN * 1000,
    errMasYr: errArcsecYr * scaleErr * 1000,
    pmTotArcsecYr,
    paDeg,
    errPaDeg,
    chi2Red: epochs.length > 2 ? chi2Red : NaN,
    dof: epochs.length > 2 ? dof : 0,
    baselineYr,
  };
}

export interface RadialBin {
  rArcsec: number;
  fluxNorm: number;
  errNorm: number;
  psfModel: number;
}

export interface RadialReport {
  bins: RadialBin[];
  fwhmMeasured: number;
  fwhmNominal: number;
  sharpness: number;
  ellipticity: number;
  peakSn: number;
  verdict: 'point' | 'hotpixel' | 'extended' | 'saturated' | 'faint';
  summary: string;
}

/** Azimuthal surface-brightness profile I(r), second-moment ellipticity, and PSF morphology verdict. */
export function radialProfile(plane: Plane | null, grid: Grid, cx: number, cy: number, fwhmNominal = 8.2): RadialReport | null {
  if (!plane) return null;
  const n = grid.n;
  const i0 = Math.round(cx), j0 = Math.round(cy);
  if (i0 < 3 || j0 < 3 || i0 > n - 4 || j0 > n - 4) return null;

  // Sky annulus 4.5..7 px
  const ann: number[] = [];
  let coreMasked = 0;
  for (let dj = -7; dj <= 7; dj++) {
    for (let di = -7; di <= 7; di++) {
      const ii = i0 + di, jj = j0 + dj;
      if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
      const r = Math.hypot(ii - cx, jj - cy);
      const v = plane.data[jj * n + ii];
      if (r <= 1.6 && (!Number.isFinite(v) || (plane.badFrac && plane.badFrac[jj * n + ii] > 0.5))) coreMasked++;
      if (r >= 4.5 && r <= 7.2 && Number.isFinite(v)) ann.push(v);
    }
  }
  const sky = ann.length >= 8 ? median(ann) : 0;
  const mad = ann.length >= 8 ? 1.4826 * median(ann.map((v) => Math.abs(v - sky))) : plane.sigma;
  const sig = Math.max(plane.sigma || 1, Number.isFinite(mad) && mad > 0 ? mad : 0);

  // Recenter subtly within 1.5 px on positive peak so profile sits on source core
  let px0 = cx, py0 = cy, sw0 = 0;
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      const v = plane.data[(j0 + dj) * n + (i0 + di)] - sky;
      if (Number.isFinite(v) && v > 2 * sig) {
        sw0 += v;
        px0 += v * (i0 + di - cx);
        py0 += v * (j0 + dj - cy);
      }
    }
  }
  if (sw0 > 0) {
    px0 = cx + (px0 - cx) / sw0;
    py0 = cy + (py0 - cy) / sw0;
  } else {
    px0 = cx;
    py0 = cy;
  }

  const nBins = 9;
  const stepPx = 0.65;
  const sum = new Float64Array(nBins);
  const cnt = new Int32Array(nBins);
  let qxx = 0, qyy = 0, qxy = 0, qsum = 0;
  let ringSum = 0, ringCnt = 0;

  for (let dj = -6; dj <= 6; dj++) {
    for (let di = -6; di <= 6; di++) {
      const ii = Math.round(px0) + di, jj = Math.round(py0) + dj;
      if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
      const v = plane.data[jj * n + ii] - sky;
      if (!Number.isFinite(v)) continue;
      const dx = ii - px0, dy = jj - py0;
      const rPx = Math.hypot(dx, dy);
      const b = Math.min(nBins - 1, Math.floor(rPx / stepPx));
      if (rPx < nBins * stepPx) {
        sum[b] += v;
        cnt[b]++;
      }
      if (rPx >= 0.7 && rPx <= 1.5) {
        ringSum += v;
        ringCnt++;
      }
      if (rPx <= 2.6 && v > 1.5 * sig) {
        qsum += v;
        qxx += v * dx * dx;
        qyy += v * dy * dy;
        qxy += v * dx * dy;
      }
    }
  }

  const peak = cnt[0] > 0 ? sum[0] / cnt[0] : (cnt[1] > 0 ? sum[1] / cnt[1] : 0);
  const peakSn = peak / (sig || 1);
  const norm = Math.max(peak, sig);
  const bins: RadialBin[] = [];
  for (let b = 0; b < nBins; b++) {
    if (!cnt[b]) continue;
    const rArcsec = (b + 0.5) * stepPx * grid.scale;
    bins.push({
      rArcsec,
      fluxNorm: sum[b] / cnt[b] / norm,
      errNorm: sig / Math.sqrt(cnt[b]) / norm,
      psfModel: 2 ** (-4 * (rArcsec / fwhmNominal) ** 2),
    });
  }

  // Empirical HWHM via linear crossing of fluxNorm = 0.5
  let fwhmMeasured = NaN;
  for (let k = 0; k + 1 < bins.length; k++) {
    if (bins[k].fluxNorm >= 0.5 && bins[k + 1].fluxNorm < 0.5) {
      const f = (0.5 - bins[k].fluxNorm) / (bins[k + 1].fluxNorm - bins[k].fluxNorm);
      fwhmMeasured = 2 * (bins[k].rArcsec + f * (bins[k + 1].rArcsec - bins[k].rArcsec));
      break;
    }
  }
  const ringMean = ringCnt > 0 ? ringSum / ringCnt : 0;
  const sharpness = ringMean > 0 ? peak / ringMean : NaN;
  let ellipticity = 0;
  if (qsum > 0) {
    const ixx = qxx / qsum, iyy = qyy / qsum, ixy = qxy / qsum;
    const tr = ixx + iyy;
    const disc = Math.sqrt(Math.max(0, (ixx - iyy) ** 2 + 4 * ixy * ixy));
    const a2 = 0.5 * (tr + disc);
    const b2 = Math.max(0, 0.5 * (tr - disc));
    ellipticity = a2 > 0 ? 1 - Math.sqrt(b2 / a2) : 0;
  }

  let verdict: RadialReport['verdict'] = 'point';
  let summary = 'Radial profile matches a diffraction/pixel-limited point source.';
  if (coreMasked >= 2) {
    verdict = 'saturated';
    summary = 'Core pixels carry pipeline saturation/overflow masks; measure wings or fainter bands.';
  } else if (peakSn < 4) {
    verdict = 'faint';
    summary = 'Peak is below 4σ — stack more frames or select longer/shorter bands.';
  } else if ((Number.isFinite(fwhmMeasured) && fwhmMeasured < 0.62 * fwhmNominal) || (!Number.isFinite(fwhmMeasured) && sharpness > 6.5)) {
    verdict = 'hotpixel';
    summary = 'Narrower than the telescope PSF — characteristic of an unflagged hot pixel or cosmic ray.';
  } else if (Number.isFinite(fwhmMeasured) && fwhmMeasured > 1.38 * fwhmNominal) {
    verdict = 'extended';
    summary = ellipticity > 0.38 ? 'Extended and elongated — check for a blend, trail, galaxy or cometary tail.' : 'Broader than the nominal PSF — extended source, close binary, or cometary coma.';
  }

  return { bins, fwhmMeasured, fwhmNominal, sharpness, ellipticity, peakSn, verdict, summary };
}

export interface KinematicAssessment {
  eclLon: number;
  eclLat: number;
  galL: number;
  galB: number;
  /** Bound Solar-System / trans-Neptunian interpretation */
  rKeplerAu: number; // secular orbital drift μ ≈ 2π / r^(3/2) rad/yr
  periodYr: number;
  rReflexAu: number; // annual reflex parallax Δθ ≈ 2 au / r over 0.5 yr
  tEqK: number;
  /** Galactic star / brown-dwarf interpretation */
  distPcCatalog: number | null;
  vtCatalogKms: number | null;
  distPcDisk30: number; // distance if v_t = 30 km/s (thin disk)
  distPcHalo150: number; // distance if v_t = 150 km/s (thick disk / halo)
  regime: string;
}

/** Evaluates both Solar-System (reflex parallax + Keplerian drift) and Galactic (proper motion v_t = 4.74 μ d)
 *  distance/kinematic regimes right inside the site — zero external ephemeris tools required. */
export function kinematicAssessment(ra: number, dec: number, muArcsecYr: number, baselineYr: number, plxMas?: number | null, teffK?: number | null): KinematicAssessment {
  const ecl = icrsToEcliptic(ra, dec);
  const gal = icrsToGalactic(ra, dec);
  const mu = Math.max(1e-4, muArcsecYr);
  // Secular prograde circular Keplerian angular rate: ω = 360°/r^(3/2) yr⁻¹ = 1,296,000"/yr / r^(3/2)
  const rKeplerAu = (1296000 / mu) ** (2 / 3);
  const periodYr = rKeplerAu ** 1.5;
  // Earth's 2 au baseline over ~0.5 yr induces reflex shift Δθ ≈ 2·206265"·cos(β_eff)/r; rate over 0.5 yr ≈ 8.25e5"/yr / r
  const cosProj = Math.max(0.35, Math.cos(ecl.lat * D2R));
  const rReflexAu = baselineYr <= 0.75 ? (412530 * cosProj) / (mu * Math.max(0.25, baselineYr)) : (206265 * cosProj) / mu;
  const rRef = baselineYr <= 0.75 ? rReflexAu : rKeplerAu;
  const tEqK = 278 / Math.sqrt(Math.max(0.1, rRef));

  const hasPlx = typeof plxMas === 'number' && plxMas > 0.2;
  const distPcCatalog = hasPlx ? 1000 / (plxMas as number) : null;
  const vtCatalogKms = distPcCatalog !== null ? 4.74047 * mu * distPcCatalog : null;
  // v_t [km/s] = 4.74047 · μ ["/yr] · d [pc]
  const distPcDisk30 = 30 / (4.74047 * mu);
  const distPcHalo150 = 150 / (4.74047 * mu);

  let regime: string;
  if (muArcsecYr > 3600) {
    regime = 'Fast solar-system rate (>1°/yr): main-belt / near-Earth asteroid or active comet regime.';
  } else if (muArcsecYr > 30) {
    regime = `Outer solar-system / Centaur / Kuiper-belt rate (~${rReflexAu.toFixed(0)}–${rKeplerAu.toFixed(0)} au if bound; <1 pc if stellar).`;
  } else if (muArcsecYr >= 1.5) {
    regime = teffK && teffK < 900
      ? `High proper motion (${muArcsecYr.toFixed(2)}"/yr) + cool SED (${teffK.toFixed(0)} K): nearby Y/T brown dwarf (${distPcDisk30.toFixed(1)}–${distPcHalo150.toFixed(0)} pc) or distant trans-Neptunian / Planet-X candidate (~${rReflexAu.toFixed(0)} au if reflex-dominated).`
      : `High proper motion (${muArcsecYr.toFixed(2)}"/yr): solar-neighbourhood star/brown dwarf (${distPcCatalog ? `${distPcCatalog.toFixed(2)} pc, v_t = ${vtCatalogKms!.toFixed(1)} km/s` : `d ≈ ${distPcDisk30.toFixed(1)}–${distPcHalo150.toFixed(0)} pc`}) or ultra-distant TNO (~${rReflexAu.toFixed(0)} au).`;
  } else {
    regime = `Sub-arcsec/yr motion (${(muArcsecYr * 1000).toFixed(0)} mas/yr): typical Galactic disk star${distPcCatalog ? ` at ${distPcCatalog.toFixed(0)} pc (v_t = ${vtCatalogKms!.toFixed(0)} km/s)` : ''}.`;
  }

  return { eclLon: ecl.lon, eclLat: ecl.lat, galL: gal.l, galB: gal.b, rKeplerAu, periodYr, rReflexAu, tEqK, distPcCatalog, vtCatalogKms, distPcDisk30, distPcHalo150, regime };
}

/* ------------------------------ Notebook ------------------------------- */

export interface Note {
  id: string;
  target: string;
  kind: 'note' | 'candidate' | 'measurement';
  title: string;
  body: string;
  ra?: number;
  dec?: number;
  frame?: string;
  created: string;
}

const NOTE_KEY = 'rendezvous.notes.v1';

export function readNotes(): Note[] {
  try {
    const raw = localStorage.getItem(NOTE_KEY);
    return raw ? (JSON.parse(raw) as Note[]) : [];
  } catch {
    return [];
  }
}

export function writeNotes(notes: Note[]): void {
  try {
    localStorage.setItem(NOTE_KEY, JSON.stringify(notes.slice(0, 400)));
  } catch {
    /* private mode or sandboxed frame — notes stay in memory for this session */
  }
}

export function newNote(n: Omit<Note, 'id' | 'created'>): Note {
  return { ...n, id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, created: new Date().toISOString() };
}

export function notesMarkdown(notes: Note[], targetName: string): string {
  const head = `# Rendezvous discovery dossier — ${targetName}\n\nRendezvous · exported ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC\nData attribution: ${DATA_CITATION}\n`;
  const body = notes
    .filter((n) => n.target)
    .map(
      (n) =>
        `\n## ${n.title}\n\n- Kind: ${n.kind}\n- Saved: ${n.created.slice(0, 16).replace('T', ' ')} UTC\n${n.ra !== undefined ? `- Position (ICRS): ${n.ra.toFixed(6)}°, ${n.dec?.toFixed(6)}°\n` : ''}${n.frame ? `- Epoch / Frame: ${n.frame}\n` : ''}\n${n.body}\n`,
    )
    .join('');
  return head + body;
}

export const DATA_CITATION =
  'SPHEREx Level-2 data (NASA/JPL-Caltech/Caltech IPAC), via NASA/IPAC IRSA; Gaia DR3 (ESA / DPAC); CatWISE2020 (NASA/JPL); HiPS mosaics from IRSA and CDS.';

/* ------------------------------ Exports -------------------------------- */

export function download(name: string, text: string, mime = 'text/csv;charset=utf-8'): void {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  } catch {
    /* ignore */
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

const csvCell = (v: string | number) => (typeof v === 'number' ? (Number.isFinite(v) ? String(v) : '') : /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function toCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

export function photometryCsv(phot: Phot[], label: string): string {
  const rows: (string | number)[][] = [['target', label], [], ['exposure', 'mjd', 'detector', 'lambda_um', 'dlambda_um', 'flux_mJy', 'err_mJy', 'snr', 'ab_mag', 'encircled_energy', 'flagged']];
  for (const p of phot)
    rows.push([
      p.k,
      p.mjd.toFixed(5),
      p.det,
      p.lam.toFixed(4),
      p.dlam.toFixed(4),
      p.flux.toPrecision(5),
      p.err.toPrecision(3),
      (p.flux / (p.err || 1)).toFixed(2),
      Number.isFinite(toMag(p.flux)) ? toMag(p.flux).toFixed(3) : '',
      p.ee.toFixed(4),
      p.flagged ? 1 : 0,
    ]);
  return toCsv(rows);
}

export function coverageCsv(stats: EpochStat[]): string {
  const rows: (string | number)[][] = [['visit', 'mjd_start', 'mjd_end', 'utc_mid', 'exposures', 'detectors', 'noise_MJy_sr', 'lim5sigma_mJy', 'lim5sigma_ABmag', 'flagged_fraction', 'lambda_min_um', 'lambda_max_um']];
  for (const s of stats)
    rows.push([
      s.e + 1,
      s.mjd0.toFixed(5),
      s.mjd1.toFixed(5),
      fmtDate((s.mjd0 + s.mjd1) / 2),
      s.n,
      s.dets.map((d) => `D${d}`).join(' '),
      s.sigma.toPrecision(3),
      s.lim5Mjy.toPrecision(3),
      Number.isFinite(s.lim5Mag) ? s.lim5Mag.toFixed(2) : '',
      s.flagged.toFixed(3),
      s.lamMin.toFixed(3),
      s.lamMax.toFixed(3),
    ]);
  return toCsv(rows);
}

export function moversCsv(movers: Mover[]): string {
  const rows: (string | number)[][] = [['candidate', 'ra_deg', 'dec_deg', 'snr', 'sep_arcsec', 'rate_arcsec_yr', 'pa_deg', 'epoch_a', 'epoch_b', 'mjd_a', 'mjd_b', 'multi_visit_consistent', 'known_match', 'note']];
  for (const m of movers)
    rows.push([m.id, m.ra.toFixed(6), m.dec.toFixed(6), m.sn.toFixed(1), m.sep.toFixed(2), m.rateArcsecYr.toFixed(2), m.pa.toFixed(1), m.title0, m.title1, m.mjd0.toFixed(4), m.mjd1.toFixed(4), m.consistent ? 1 : 0, m.match ?? 'unmatched', m.note]);
  return toCsv(rows);
}

export function framesCsv(pack: Pack): string {
  const rows: (string | number)[][] = [['exposure', 'obsid', 'pipeline', 'mjd', 'utc', 'detector', 'lambda_um', 'dlambda_um', 'bg_MJy_sr', 'noise_MJy_sr', 'psf_fwhm_arcsec', 'centre_flags']];
  for (const f of pack.frames) {
    rows.push([
      f.k,
      f.obsid,
      f.proc,
      f.mjd.toFixed(5),
      fmtDate(f.mjd),
      f.det,
      f.lam.toFixed(4),
      f.dlam.toFixed(4),
      f.bg.toPrecision(4),
      f.sigma.toPrecision(3),
      Number.isFinite(f.fwhm) ? f.fwhm.toFixed(2) : '',
      f.cflags,
    ]);
  }
  return toCsv(rows);
}

export function epochShots(pack: Pack, dets: number[]): Shot[] {
  return buildShots(pack, 'epoch', dets);
}

/** Extract un-levelled SPHEREx HiPS cube spectral samples at pixel (pi, pj) in All-Sky sweep mode. */
export function cubePhotometry(shots: Shot[], pi?: number, pj?: number): Phot[] {
  const out: Phot[] = [];
  shots.forEach((s, k) => {
    if (s.lam === null) return;
    const arr = s.raw ?? s.data;
    const n = Math.round(Math.sqrt(arr.length));
    const ci = Math.round(pi ?? (n - 1) / 2);
    const cj = Math.round(pj ?? (n - 1) / 2);
    if (ci < 2 || cj < 2 || ci > n - 3 || cj > n - 3) return;
    let sum = 0;
    let cnt = 0;
    const ann: number[] = [];
    for (let dj = -5; dj <= 5; dj++) {
      for (let di = -5; di <= 5; di++) {
        const v = arr[(cj + dj) * n + (ci + di)];
        if (!Number.isFinite(v)) continue;
        const r = Math.hypot(di, dj);
        if (r <= 1.5) {
          sum += v;
          cnt++;
        } else if (r >= 3 && r <= 5) ann.push(v);
      }
    }
    if (!cnt) return;
    const sky = ann.length >= 6 ? median(ann) : 0;
    const mad = ann.length >= 6 ? 1.4826 * median(ann.map((v) => Math.abs(v - sky))) : 2;
    out.push({
      k,
      lam: s.lam,
      dlam: s.lam * 0.025,
      det: s.dets[0] ?? 1,
      mjd: 0,
      flux: Math.max(0, sum / cnt - sky),
      err: Math.max(0.5, mad / Math.sqrt(cnt)),
      flagged: false,
      ee: 1,
    });
  });
  return out;
}

export { isBad, targetAt };

/* ---------------------------- Flag Dictionary --------------------------- */

export const FLAG_DOCS: Record<string, string> = {
  TRANSIENT: 'A transient was detected during sample-up-the-ramp readout; pixel value may include cosmic-ray charge.',
  OVERFLOW: 'Charge overflow during integration. Saturated cores and inner wings carry biased flux.',
  SUR_ERROR: 'Error in onboard sample-up-the-ramp (SUR) linear slope fitting.',
  NONFUNC: 'Pixel is permanently non-functional in calibration darks/flats.',
  DICHROIC: 'Reduced transmission near the dichroic beam-splitter transition; absolute flux is biased low.',
  MISSING_DATA: 'Onboard telemetry packet loss affected this pixel.',
  HOT: 'Elevated dark current pixel.',
  COLD: 'Depressed quantum efficiency / unresponsive pixel.',
  FULLSAMPLE: 'Full readout sample history downlinked; informational flag, not a defect.',
  PHANMISS: 'Reference phantom-pixel drift correction was unavailable.',
  NONLINEAR: 'Detector nonlinearity correction exceeded calibrated regime.',
  PERSIST: 'Latent charge persistence from a bright source in a preceding exposure.',
  OUTLIER: 'Spatial/temporal outlier flagged during pipeline multi-frame comparison.',
  CROSSTALK: 'Electronic readout channel crosstalk from a saturated pixel.',
  SOURCE: 'Pixel coincides with a reference-catalogue source; informational flag, not a defect.',
  GHOST: 'Internal optical ghost from a bright source inside the field of view.',
  GHOST_FPA: 'Cross-dichroic focal-plane optical ghost from another detector.',
  GHOST_EXT: 'Stray-light ghost from a bright source outside the detector field.',
  STREAK: 'Linear satellite or orbital-debris trail.',
  BLOOM: 'Charge bleeding into adjacent pixels from a saturated core.',
  SNOWBALL: 'Extended circular charge halo from a heavy-ion cosmic-ray impact.',
  HALO: 'Extended scattered-light PSF wing around a very bright star.',
};

export const INFO_FLAGS = new Set(['SOURCE', 'FULLSAMPLE']);
