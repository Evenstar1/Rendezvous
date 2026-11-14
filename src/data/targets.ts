/* Mission test targets named in the challenge brief.
 * Astrometry is catalog-sourced; field centres are the catalog positions
 * propagated to the middle of the SPHEREx baseline (FIELD_EPOCH). */

export interface Astrometry {
  ra: number; // deg, ICRS at `epoch`
  dec: number;
  epoch: number; // Julian year
  pmra: number; // mas/yr (μα·cosδ)
  pmdec: number; // mas/yr
  plx: number; // mas
  ref: string;
}

export interface Target {
  id: string;
  name: string;
  code: string;
  kind: string;
  tagline: string;
  blurb: string;
  look: string;
  astrom: Astrometry;
  stats: [string, string, string][]; // label, value, unit
}

export const FIELD_EPOCH = 2025.9;

export function mjdToYear(mjd: number): number {
  return 2000 + (mjd - 51544.5) / 365.25;
}

/** Linear proper-motion propagation (parallax ≤ 0.55″ is < 0.1 SPHEREx pixel and is ignored). */
export function positionAt(a: Astrometry, year: number): [number, number] {
  const dt = year - a.epoch;
  const dec = a.dec + (dt * a.pmdec) / 3.6e6;
  const ra = a.ra + (dt * a.pmra) / 3.6e6 / Math.cos((a.dec * Math.PI) / 180);
  return [ra, dec];
}

export function fieldCentre(t: Target): [number, number] {
  const [ra, dec] = positionAt(t.astrom, FIELD_EPOCH);
  return [Math.round(ra * 1e5) / 1e5, Math.round(dec * 1e5) / 1e5];
}

export const TARGETS: Target[] = [
  {
    id: 'barnard',
    name: "Barnard's Star",
    code: 'GJ 699',
    kind: 'M4 red dwarf',
    tagline: 'Fastest star in the sky',
    blurb:
      'A dim red dwarf six light-years away that crosses a full Moon-width of sky every 180 years. If your blink tool cannot show this one moving, nothing will.',
    look: 'Watch the centre star step north between epochs, then switch to difference mode for the classic black-and-white dipole.',
    astrom: { ra: 269.44850252543836, dec: 4.739420051112412, epoch: 2016.0, pmra: -801.551, pmdec: 10362.394, plx: 546.976, ref: 'Gaia DR3 4472832130942575872' },
    stats: [
      ['Proper motion', '10.39', '"/yr'],
      ['Distance', '5.96', 'ly'],
      ['Spectral type', 'M4 V', ''],
    ],
  },
  {
    id: 'epsindb',
    name: 'Epsilon Indi B',
    code: 'ε Ind Ba·Bb',
    kind: 'T1 + T6 brown dwarf pair',
    tagline: 'Two failed stars, one orbit',
    blurb:
      'A pair of methane-rich brown dwarfs circling each other while orbiting the orange star ε Indi A at 1,460 au. Twelve light-years out, and among the nearest brown dwarfs known.',
    look: 'Faint in the short bands, bright past 4 µm. Sweep the spectrum to see methane and water bite into it.',
    astrom: { ra: 331.07645259656397, dec: -56.79381206688221, epoch: 2016.0, pmra: 3981.977, pmdec: -2466.832, plx: 270.658, ref: 'Gaia DR3 6412596012146801152' },
    stats: [
      ['Proper motion', '4.68', '"/yr'],
      ['Distance', '12.05', 'ly'],
      ['Spectral type', 'T1 + T6', ''],
    ],
  },
  {
    id: 'w0855',
    name: 'WISE 0855−0714',
    code: 'W0855',
    kind: 'Y dwarf · ≈ 250 K',
    tagline: 'Colder than a winter day',
    blurb:
      'The coldest brown dwarf known and the fourth-nearest system to the Sun. Found in 2014 from its motion between WISE images. It has since slid two arcminutes west of the coordinates in its own name.',
    look: 'Invisible below 4 µm. Detector 6 picks it up at S/N ≈ 25 per epoch, one pixel further west each visit. Follow the catalog track from its 2010 WISE position.',
    astrom: { ra: 133.795129, dec: -7.245147, epoch: 2010.6, pmra: -8123.7, pmdec: 673.2, plx: 439.0, ref: 'AllWISE position · Kirkpatrick et al. 2021 motion' },
    stats: [
      ['Proper motion', '8.15', '"/yr'],
      ['Distance', '7.43', 'ly'],
      ['Spectral type', 'Y4', ''],
    ],
  },
  {
    id: 'rwaur',
    name: 'RW Aurigae',
    code: 'RW Aur A·B',
    kind: 'T Tauri binary',
    tagline: 'A newborn star that flickers',
    blurb:
      'A young binary still wrapped in the disk that built it. Since 2010 it has plunged into deep, irregular dimmings as dust from a disrupted disk crosses our line of sight.',
    look: 'It will not move. Watch brightness instead: compare epochs in difference mode and open the light curve. Most exposures carry overflow flags, shown as hollow points.',
    astrom: { ra: 76.95608119552952, dec: 30.401204589097233, epoch: 2016.0, pmra: 2.641, pmdec: -27.398, plx: 6.406, ref: 'Gaia DR3 156430822114424576' },
    stats: [
      ['Variability', '≈ 3', 'mag'],
      ['Distance', '≈ 510', 'ly'],
      ['Spectral type', 'K1–K5 e', ''],
    ],
  },
  {
    id: 'rdra',
    name: 'R Draconis',
    code: 'R Dra',
    kind: 'Mira variable',
    tagline: 'A giant that breathes',
    blurb:
      'A pulsating red giant that swells and fades over 245 days. It sits near the north ecliptic pole, where SPHEREx looks almost every day, so the archive holds thousands of frames.',
    look: 'It saturates SPHEREx: the core is masked in every exposure. Turn on the flag overlay to see the overflow footprint, then step through fifteen monthly epochs.',
    astrom: { ra: 248.1673783672889, dec: 66.75500674547219, epoch: 2016.0, pmra: -20.643, pmdec: 6.149, plx: 1.251, ref: 'Gaia DR3 1648328016354496384' },
    stats: [
      ['Period', '245.6', 'days'],
      ['Distance', '≈ 2,600', 'ly'],
      ['Spectral type', 'M5–M9 e', ''],
    ],
  },
];
