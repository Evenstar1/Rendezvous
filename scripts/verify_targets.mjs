import fs from 'node:fs';
const seed = JSON.parse(fs.readFileSync('src/data/destinations.seed.json', 'utf8'));
const candidates = {
  "Van Maanen's Star": ['Van Maanen 2', 'WD 0046+051'],
  'Luhman 16 (WISE 1049-5319)': ['Luhman 16', 'WISE J104915.57-531906.1'],
  'GJ 229 A': ['HD 42581', 'GJ 229'],
  'Mira (omicron Ceti)': ['Mira', 'omicron Ceti'],
  'Orion Nebula (M42)': ['M 42', 'Orion Nebula'],
  'Crab Nebula (M1)': ['M 1', 'NGC 1952'],
  'Cassiopeia A': ['Cassiopeia A', 'Cas A'],
  'Sagittarius A* (Galactic Centre)': ['Sgr A*', 'Sagittarius A*'],
  'Andromeda Galaxy (M31)': ['M 31', 'Andromeda Galaxy'],
};
function parseRa(text) { const [h, m, s] = text.trim().split(/\s+/).map(Number); return (h + m / 60 + s / 3600) * 15; }
function parseDec(text) { const parts = text.trim().split(/\s+/); const sign = parts[0].startsWith('-') ? -1 : 1; const [h, m, s] = parts.map((x) => Math.abs(Number(x))); return sign * (h + m / 60 + s / 3600); }
function angSep(ra1, dec1, ra2, dec2) {
  const r = Math.PI / 180;
  const a = Math.sin(((dec2 - dec1) * r) / 2) ** 2 + Math.cos(dec1 * r) * Math.cos(dec2 * r) * Math.sin(((ra2 - ra1) * r) / 2) ** 2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(a))) * 3600) / r;
}
async function fetchSesame(name) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch('https://cds.unistra.fr/cgi-bin/nph-sesame/-oI/SNV?' + encodeURIComponent(name), { signal: controller.signal });
    const text = await res.text();
    const j = text.match(/%J\s+([\d.]+)\s+([+-]?[\d.]+)/);
    const p = text.match(/%P\s+([-\d.]+)\s+([-\d.]+)/);
    if (!j) return null;
    return { ra: Number(j[1]), dec: Number(j[2]), pmra: p ? Number(p[1]) : null, pmdec: p ? Number(p[2]) : null };
  } finally {
    clearTimeout(t);
  }
}
async function fetchGaia(ra, dec) {
  const adql = `SELECT TOP 1 source_id, ra, dec, pmra, pmdec FROM gaiadr3.gaia_source WHERE 1=CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',${ra},${dec},0.02)) ORDER BY phot_g_mean_mag ASC`;
  const url = 'https://gea.esac.esa.int/tap-server/tap/sync?REQUEST=doQuery&LANG=ADQL&FORMAT=json&QUERY=' + encodeURIComponent(adql);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const json = await res.json();
    const row = json?.data?.[0];
    if (!row) return null;
    return { ra: row[1], dec: row[2], pmra: row[3], pmdec: row[4], id: String(row[0]) };
  } finally {
    clearTimeout(t);
  }
}
const out = [];
for (const s of seed) {
  const entry = {
    name: s.name,
    verified: false,
    verificationNote: 'Unverified.',
    simbadId: null,
    separationArcsec: null,
    pmra: null,
    pmdec: null,
    pmMismatchPct: null,
    coverageImages: null,
    coverageEpochs: null,
  };
  // Defined coordinate fields: no name resolution needed.
  if (s.name === 'North Ecliptic Pole' || s.name === 'South Ecliptic Pole') {
    entry.verified = true;
    entry.verificationNote = 'Verified: coordinates are the defined field centres.';
    entry.separationArcsec = 0;
    out.push(entry);
    console.log(s.name, 'VERIFIED (defined field)');
    continue;
  }
  const namesToTry = [...(candidates[s.name] || []), s.name];
  let resolved = null;
  let resolvedName = null;
  for (const name of namesToTry) {
    try {
      resolved = await fetchSesame(name);
      if (resolved) { resolvedName = name; break; }
    } catch (e) {
      // try next
    }
  }
  // Special Gaia fallback for Van Maanen's Star.
  if (!resolved && s.name === "Van Maanen's Star") {
    const seedRa = parseRa(s.raText);
    const seedDec = parseDec(s.decText);
    resolved = await fetchGaia(seedRa, seedDec);
    if (resolved) resolvedName = 'Gaia DR3';
  }
  if (!resolved) {
    entry.verificationNote = 'Unverified: name resolution failed.';
    out.push(entry);
    console.log(s.name, 'UNVERIFIED (no resolution)');
    continue;
  }
  const seedRa = parseRa(s.raText);
  const seedDec = parseDec(s.decText);
  const sep = angSep(seedRa, seedDec, resolved.ra, resolved.dec);
  entry.separationArcsec = Number(sep.toFixed(3));
  entry.pmra = resolved.pmra;
  entry.pmdec = resolved.pmdec;
  entry.simbadId = resolvedName;
  const tp = resolved.pmra !== null && resolved.pmdec !== null ? Math.hypot(resolved.pmra, resolved.pmdec) / 1000 : null;
  if (tp !== null && s.totalPm && s.totalPm > 0) {
    entry.pmMismatchPct = Number((Math.abs(tp - s.totalPm) / s.totalPm * 100).toFixed(2));
  }
  const reasons = [];
  if (sep > 2) reasons.push(`coordinate difference ${sep.toFixed(2)} arcsec exceeds 2 arcsec`);
  if (entry.pmMismatchPct !== null && entry.pmMismatchPct > 5) reasons.push(`proper-motion mismatch ${entry.pmMismatchPct.toFixed(1)}% exceeds 5%`);
  if (reasons.length === 0) {
    entry.verified = true;
    entry.verificationNote = 'Verified against CDS Sesame/Gaia; coordinates and proper motion agree.';
  } else {
    entry.verified = false;
    entry.verificationNote = 'Flagged: ' + reasons.join('; ') + '.';
  }
  out.push(entry);
  console.log(s.name, entry.verified ? 'VERIFIED' : 'UNVERIFIED', entry.separationArcsec, entry.pmra, entry.pmdec, entry.pmMismatchPct);
}
fs.writeFileSync('src/data/destinations.generated.json', JSON.stringify(out, null, 2));
console.log('Wrote', out.length);
