import { useMemo } from 'react';
import { positionAt, type Target } from '../../data/targets';
import { fmtDec, fmtRA, sepArcsec } from '../../lib/coords';
import { CATWISE_EPOCH, GAIA_EPOCH } from '../../lib/epochs';
import type { Pack } from '../../lib/packs';
import { cn } from '../../utils/cn';

interface Props {
  pack: Pack | null;
  target: Target | null;
  label: string;
  ra: number;
  dec: number;
  loading: boolean;
}

const finite = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

function CrossRow({ k, v, mono = true }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/70 py-1.5 last:border-0">
      <dt className="text-[0.6875rem] uppercase tracking-[0.14em] text-ink/65">{k}</dt>
      <dd className={cn('min-w-0 truncate text-right text-[0.8125rem] text-ink', mono && 'num')}>{v}</dd>
    </div>
  );
}

/** Target dossier + Gaia DR3 / CatWISE2020 crossmatch, built only from the active pack. */
export function Dossier({ pack, target, label, ra, dec, loading }: Props) {
  const gaia = useMemo(() => {
    if (!pack?.gaia.length) return null;
    const ref = /Gaia DR3\s+(\d+)/.exec(pack.target.astrom.ref)?.[1];
    const exact = ref ? pack.gaia.find((g) => g.id === ref) : null;
    if (exact) return exact;
    const [tra, tdec] = positionAt(pack.target.astrom, GAIA_EPOCH);
    let best = pack.gaia[0];
    let bestSep = sepArcsec(tra, tdec, best.ra, best.dec);
    for (const g of pack.gaia) {
      const s = sepArcsec(tra, tdec, g.ra, g.dec);
      if (s < bestSep) {
        best = g;
        bestSep = s;
      }
    }
    return bestSep <= 20 ? best : null;
  }, [pack]);

  const wise = useMemo(() => {
    if (!pack?.wise.length) return null;
    /* CatWISE2020 positions are measured at MJD 57170 (2015.4); propagate there. */
    const [tra, tdec] = positionAt(pack.target.astrom, CATWISE_EPOCH);
    let best = pack.wise[0];
    let bestSep = sepArcsec(tra, tdec, best.ra, best.dec);
    for (const w of pack.wise) {
      const s = sepArcsec(tra, tdec, w.ra, w.dec);
      if (s < bestSep) {
        best = w;
        bestSep = s;
      }
    }
    return bestSep <= 20 ? best : null;
  }, [pack]);

  const rows: [string, string][] = [
    ['Gaia DR3 source', gaia ? gaia.id : 'n/a'],
    ['G mag', gaia && finite(gaia.g) ? gaia.g.toFixed(3) : 'n/a'],
    ['μ α*', gaia && finite(gaia.pmra) ? `${gaia.pmra.toFixed(2)} mas yr⁻¹` : 'n/a'],
    ['μ δ', gaia && finite(gaia.pmdec) ? `${gaia.pmdec.toFixed(2)} mas yr⁻¹` : 'n/a'],
    ['Parallax', gaia && finite(gaia.plx) && gaia.plx > 0 ? `${gaia.plx.toFixed(3)} mas` : 'n/a'],
    ['CatWISE2020 W1', wise && finite(wise.w1) && wise.w1 > 0 ? `${wise.w1.toFixed(3)} mag` : 'n/a'],
    ['CatWISE2020 W2', wise && finite(wise.w2) && wise.w2 > 0 ? `${wise.w2.toFixed(3)} mag` : 'n/a'],
  ];

  return (
    <div className="space-y-4">
      <section className="panel p-4">
        <p className="micro text-cyan">Target dossier</p>
        <h3 className="display mt-2 text-[clamp(1.6rem,2.4vw,2.25rem)]">{label}</h3>
        <p className="num mt-2 text-[0.8125rem] text-ink/80">
          {fmtRA(ra, 2)} <span className="mx-1 text-ink/70">/</span> {fmtDec(dec, 1)}
        </p>
        <p className="mt-1 text-[0.6875rem] uppercase tracking-[0.14em] text-ink/65">ICRS · {target ? target.kind : 'all-sky field'}</p>

        {target ? (
          <>
            <p className="mt-4 text-[0.8125rem] leading-relaxed text-ink/80">{target.blurb}</p>
            <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3">
              {target.stats.map(([k, v, unit]) => (
                <div key={k} className="min-w-0">
                  <dd className="num truncate text-[0.9375rem] font-medium text-ink">
                    {v}
                    {unit && <span className="ml-1 text-[0.6875rem] text-ink/80">{unit}</span>}
                  </dd>
                  <dt className="mt-1 text-[0.6875rem] uppercase tracking-[0.12em] text-ink/65">{k}</dt>
                </div>
              ))}
            </dl>
            <p className="mt-4 border-l border-cyan/60 pl-3 text-[0.8125rem] leading-relaxed text-ink/80">
              <span className="micro text-cyan">Look for</span>
              <br />
              {target.look}
            </p>
          </>
        ) : (
          <p className="mt-4 text-[0.8125rem] leading-relaxed text-ink/80">
            Live HiPS field. No bundled Level-2 pack is loaded, so catalogue crossmatch fields are unavailable for this position.
          </p>
        )}
      </section>

      <section className="panel p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="micro text-cyan">Crossmatch</p>
          <span className="micro text-ink/65">{pack ? 'Gaia DR3 · CatWISE2020' : loading ? 'Acquiring' : 'n/a'}</span>
        </div>
        {pack ? (
          <dl className="mt-3">
            {rows.map(([k, v]) => (
              <CrossRow key={k} k={k} v={v} />
            ))}
          </dl>
        ) : (
          <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink/70">
            {loading ? 'Unpacking the bundled Level-2 exposures and their catalogue overlay.' : 'No catalogue data in the current field.'}
          </p>
        )}
        <p className="mt-3 border-t border-line pt-3 text-[0.6875rem] leading-relaxed text-ink/65">
          Gaia DR3 at J2016.0; CatWISE2020 at 2015.4. Proper motion is quoted in mas yr⁻¹; missing entries are shown as n/a, never inferred.
        </p>
      </section>
    </div>
  );
}
