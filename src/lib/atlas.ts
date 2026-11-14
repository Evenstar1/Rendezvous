import { parseCoords, fmtRA, fmtDec } from './coords';

export function decimalYear(date: Date = new Date()): number {
  const start = new Date(date.getFullYear(), 0, 1);
  const end = new Date(date.getFullYear() + 1, 0, 1);
  return date.getFullYear() + (date.getTime() - start.getTime()) / (end.getTime() - start.getTime());
}

/** Proper-motion propagation. PM components are mas/yr (mu* cos delta for RA). */
export function positionAtEpoch(
  ra: number,
  dec: number,
  pmra: number | null,
  pmdec: number | null,
  fromYear: number,
  toYear: number,
): { ra: number; dec: number } {
  if (pmra === null || pmdec === null) return { ra, dec };
  const dt = toYear - fromYear;
  const dra = (pmra * dt) / 3.6e6 / Math.cos((dec * Math.PI) / 180);
  const ddec = (pmdec * dt) / 3.6e6;
  return { ra: ra + dra, dec: dec + ddec };
}

export function formatLightTravel(distanceLy: number | null): string {
  if (distanceLy === null || !Number.isFinite(distanceLy)) return 'Light-travel time not listed in the seed data.';
  if (distanceLy < 1) return `The light you will see left here ${Math.round(distanceLy * 365)} days ago.`;
  return `The light you will see left here ${distanceLy.toLocaleString('en-US', { maximumFractionDigits: 1 })} years ago.`;
}

export function formatCatalogCoords(ra: number, dec: number): { sex: string; dec: string } {
  return { sex: `${fmtRA(ra, 2)} ${fmtDec(dec, 1)}`, dec: `${ra.toFixed(5)}° ${dec.toFixed(5)}°` };
}

export const ATLAS_INPUT_TESTS = [
  { input: '14 29 42.95 -62 40 46.1', ra: 217.4289583, dec: -62.6794722 },
  { input: '14h29m42.95s -62d40m46.1s', ra: 217.4289583, dec: -62.6794722 },
  { input: '217.42896 -62.67947', ra: 217.42896, dec: -62.67947 },
];

export function runAtlasSelfTest(): { ok: boolean; details: string[] } {
  const details: string[] = [];
  let ok = true;
  for (const t of ATLAS_INPUT_TESTS) {
    const p = parseCoords(t.input);
    if (!p || Math.abs(p.ra - t.ra) > 1e-3 || Math.abs(p.dec - t.dec) > 1e-3) {
      ok = false;
      details.push(`parse failed: ${t.input}`);
    } else {
      details.push(`parse ok: ${t.input}`);
    }
  }
  // Kapteyn's Star sanity check: 8.67 arcsec/yr over 26.9 yr is about 3.88 arcmin.
  const kapteyn = positionAtEpoch(81.9, -45.0, 8670, 0, 2000, 2026.9);
  const shift = Math.hypot((kapteyn.ra - 81.9) * Math.cos(-45 * Math.PI / 180), kapteyn.dec + 45) * 3600;
  if (Math.abs(shift - 233.2) > 1) {
    ok = false;
    details.push(`proper-motion sanity check failed: ${shift.toFixed(1)} arcsec`);
  } else {
    details.push(`proper-motion sanity check ok: ${shift.toFixed(1)} arcsec`);
  }
  return { ok, details };
}
