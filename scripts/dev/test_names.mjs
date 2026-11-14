import fs from 'node:fs';
const names = [
  "Van Maanen's Star", "Van Maanen 2",
  "Luhman 16", "WISE J104915.57-531906.1",
  "GJ 229 A", "GJ 229", "HD 42581",
  "Mira", "omicron Ceti",
  "M 42", "Orion Nebula",
  "M 1", "NGC 1952",
  "Cassiopeia A", "Cas A",
  "Sgr A*", "Sagittarius A*",
  "M 31", "Andromeda Galaxy",
];
for (const name of names) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch('https://cds.unistra.fr/cgi-bin/nph-sesame/-oI/SNV?' + encodeURIComponent(name), { signal: controller.signal });
    const text = await res.text();
    const j = text.match(/%J\s+([\d.]+)\s+([+-]?[\d.]+)/);
    const p = text.match(/%P\s+([-\d.]+)\s+([-\d.]+)/);
    console.log(JSON.stringify(name), j ? (j[1] + ' ' + j[2]) : 'NO COORDS', p ? (p[1] + ' ' + p[2]) : 'NO PM');
  } catch (e) {
    console.log(JSON.stringify(name), 'ERR', e.message);
  } finally {
    clearTimeout(t);
  }
}
