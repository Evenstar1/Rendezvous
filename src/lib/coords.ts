/* Coordinate parsing / formatting and name resolution. */

const pad = (v: number, n = 2) => String(v).padStart(n, '0');

export function fmtRA(deg: number, prec = 2): string {
  const f = 10 ** prec;
  let total = Math.round(((((deg % 360) + 360) % 360) / 15) * 3600 * f) / f;
  if (total >= 86400) total -= 86400;
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total - hh * 3600) / 60);
  const ss = total - hh * 3600 - mm * 60;
  return `${pad(hh)}h${pad(mm)}m${ss.toFixed(prec).padStart(prec ? prec + 3 : 2, '0')}s`;
}

export function fmtDec(deg: number, prec = 1): string {
  const f = 10 ** prec;
  const total = Math.round(Math.abs(deg) * 3600 * f) / f;
  const dd = Math.floor(total / 3600);
  const mm = Math.floor((total - dd * 3600) / 60);
  const ss = total - dd * 3600 - mm * 60;
  return `${deg < 0 ? '−' : '+'}${pad(dd)}°${pad(mm)}'${ss.toFixed(prec).padStart(prec ? prec + 3 : 2, '0')}"`;
}

/** Accepts "08h55m10.831s -7d14m42.53s", "08 55 10.8 -07 14 42", "8:55:10.8 -7:14:42", "133.795 -7.245". */
export function parseCoords(input: string): { ra: number; dec: number } | null {
  const s = input
    .trim()
    .replace(/[−–—]/g, '-')
    .replace(/,/g, ' ');
  if (!s) return null;
  const hours = /\d\s*h/i.test(s);
  const tok = s
    .replace(/[hmsd°'"′″:]/gi, ' ')
    .trim()
    .split(/\s+/);
  if (!tok.every((t) => /^[+-]?\d+(\.\d+)?$/.test(t))) return null;
  const v = tok.map(Number);
  let ra: number;
  let dec: number;
  if (v.length === 2) {
    ra = hours ? v[0] * 15 : v[0];
    dec = v[1];
  } else if (v.length === 4 || v.length === 6) {
    const h = v.length / 2;
    const sex = (a: number[]) => Math.abs(a[0]) + a[1] / 60 + (a[2] ?? 0) / 3600;
    ra = sex(v.slice(0, h)) * 15;
    dec = (tok[h].startsWith('-') ? -1 : 1) * sex(v.slice(h));
  } else return null;
  if (!(ra >= 0 && ra < 360 && dec >= -90 && dec <= 90)) return null;
  return { ra, dec };
}

export function sepArcsec(ra1: number, dec1: number, ra2: number, dec2: number): number {
  const r = Math.PI / 180;
  const a = Math.sin(((dec2 - dec1) * r) / 2) ** 2 + Math.cos(dec1 * r) * Math.cos(dec2 * r) * Math.sin(((ra2 - ra1) * r) / 2) ** 2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(a))) * 3600) / r;
}

const ALIASES: [RegExp, string][] = [
  [/barnard|gj\s*699/i, 'barnard'],
  [/(eps|epsilon|ε)\s*ind/i, 'epsindb'],
  [/0855/i, 'w0855'],
  [/rw\s*aur/i, 'rwaur'],
  [/^r\s*dra/i, 'rdra'],
];

/** Mission targets resolve locally — no network needed. */
export function matchTarget(name: string): string | null {
  const hit = ALIASES.find(([re]) => re.test(name.trim()));
  return hit ? hit[1] : null;
}

const SESAME = ['https://vizier.cfa.harvard.edu/viz-bin/nph-sesame/-oI/SNV?', 'https://cds.unistra.fr/cgi-bin/nph-sesame/-oI/SNV?'];

async function sesame(base: string, name: string): Promise<{ ra: number; dec: number } | null> {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 9000);
  try {
    const res = await fetch(base + encodeURIComponent(name), { signal: ctl.signal });
    const m = /%J\s+([\d.]+)\s+([+-]?[\d.]+)/.exec(await res.text());
    return m ? { ra: Number(m[1]), dec: Number(m[2]) } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(to);
  }
}

/** CDS Sesame (SIMBAD → NED → VizieR): the CfA mirror first, Strasbourg as fallback.
 *  Returns null when the name is unknown or neither service is reachable. */
export async function resolveName(name: string): Promise<{ ra: number; dec: number } | null> {
  for (const base of SESAME) {
    const r = await sesame(base, name.trim());
    if (r) return r;
  }
  return null;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function mjdToDate(mjd: number): Date {
  return new Date((mjd - 40587) * 86400000);
}

export function fmtDate(mjd: number): string {
  const d = mjdToDate(mjd);
  return `${d.getUTCFullYear()} ${MONTHS[d.getUTCMonth()]} ${pad(d.getUTCDate())}`;
}

export function fmtTime(mjd: number): string {
  const d = mjdToDate(mjd);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

export function fmtDateRange(a: number, b: number): string {
  const da = mjdToDate(a);
  const db = mjdToDate(b);
  if (da.getUTCFullYear() === db.getUTCFullYear() && da.getUTCMonth() === db.getUTCMonth()) {
    if (da.getUTCDate() === db.getUTCDate()) return fmtDate(a);
    return `${fmtDate(a)}–${pad(db.getUTCDate())}`;
  }
  return `${fmtDate(a)} – ${MONTHS[db.getUTCMonth()]} ${pad(db.getUTCDate())}`;
}
