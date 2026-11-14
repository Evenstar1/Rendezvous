import seed from './destinations.seed.json';
import generatedRaw from './destinations.generated.json';
import { parseCoords } from '../lib/coords';

export interface DestinationSeed {
  name: string;
  expedition: number;
  raText: string;
  decText: string;
  totalPm: number | null;
  difficulty: 'Cadet' | 'Navigator' | 'Commander';
  note: string;
  why: string;
  look: string;
  fov: number;
  mode: 'epoch' | 'sweep' | 'frames';
  distanceLy: number | null;
}

export interface Destination extends DestinationSeed {
  id: string;
  ra: number;
  dec: number;
  pmra: number | null;
  pmdec: number | null;
  verified: boolean;
  verificationNote: string;
  simbadId: string | null;
  separationArcsec: number | null;
  pmMismatchPct: number | null;
  coverageImages: number | null;
  coverageEpochs: number | null;
}

interface GeneratedEntry {
  name: string;
  verified: boolean;
  verificationNote: string;
  simbadId: string | null;
  separationArcsec: number | null;
  pmra: number | null;
  pmdec: number | null;
  pmMismatchPct: number | null;
  coverageImages: number | null;
  coverageEpochs: number | null;
}

const generated = (generatedRaw as GeneratedEntry[]).reduce<Record<string, GeneratedEntry>>((acc, e) => {
  acc[e.name] = e;
  return acc;
}, {});

export const DESTINATIONS: Destination[] = (seed as DestinationSeed[]).map((s, i) => {
  const parsed = parseCoords(`${s.raText} ${s.decText}`);
  const g = generated[s.name];
  return {
    ...s,
    id: `dest-${i + 1}`,
    ra: parsed?.ra ?? 0,
    dec: parsed?.dec ?? 0,
    pmra: g?.pmra ?? null,
    pmdec: g?.pmdec ?? null,
    verified: g?.verified ?? false,
    verificationNote: g?.verificationNote ?? 'Unverified: build script has not been run successfully.',
    simbadId: g?.simbadId ?? null,
    separationArcsec: g?.separationArcsec ?? null,
    pmMismatchPct: g?.pmMismatchPct ?? null,
    coverageImages: g?.coverageImages ?? null,
    coverageEpochs: g?.coverageEpochs ?? null,
  };
});

export const EXPEDITIONS = [
  { id: 1, name: 'Neighbours & Speed Demons' },
  { id: 2, name: 'Cold Worlds' },
  { id: 3, name: 'Pulse & Flicker' },
  { id: 4, name: 'Ice & Dust' },
  { id: 5, name: 'Cosmic Giants' },
  { id: 6, name: 'The Poles' },
] as const;
