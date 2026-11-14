import { useMemo } from 'react';
import { positionAt } from '../../data/targets';
import { sepArcsec } from '../../lib/coords';
import { CATWISE_EPOCH, GAIA_EPOCH } from '../../lib/epochs';
import type { Pack } from '../../lib/packs';

interface Point {
  id: string;
  color: number;
  g: number;
  w1: number;
  target: boolean;
}

/** Gaia DR3 G vs CatWISE2020 W1 colour–magnitude diagram for the active field.
 *  Every point is a real catalogue match; nothing is synthesised. */
export function FieldDiagram({ pack }: { pack: Pack }) {
  const points = useMemo<Point[]>(() => {
    const [tra, tdec] = positionAt(pack.target.astrom, GAIA_EPOCH);
    const out: Point[] = [];
    for (const g of pack.gaia) {
      if (!(Number.isFinite(g.g) && g.g > 0)) continue;
      /* Gaia is at J2016.0; CatWISE2020 positions are at 2015.4. */
      const [gwra, gwdec] = positionAt({ ra: g.ra, dec: g.dec, epoch: GAIA_EPOCH, pmra: g.pmra, pmdec: g.pmdec, plx: g.plx, ref: '' }, CATWISE_EPOCH);
      let best: Pack['wise'][number] | null = null;
      let bestSep = 8;
      for (const w of pack.wise) {
        if (!(Number.isFinite(w.w1) && w.w1 > 0)) continue;
        const s = sepArcsec(gwra, gwdec, w.ra, w.dec);
        if (s < bestSep) {
          best = w;
          bestSep = s;
        }
      }
      if (!best) continue;
      out.push({
        id: g.id,
        color: g.g - best.w1,
        g: g.g,
        w1: best.w1,
        target: sepArcsec(tra, tdec, g.ra, g.dec) < 6,
      });
    }
    return out.sort((a, b) => b.color - a.color);
  }, [pack]);

  const targetPoint = points.find((p) => p.target) ?? null;
  const reddest = points.slice(0, 12);

  if (!points.length) {
    return (
      <div className="border border-line bg-panel2 p-6">
        <p className="micro text-ink/75">Field CMD unavailable</p>
        <p className="mt-2 max-w-md text-[0.8125rem] leading-relaxed text-ink/75">
          This pack does not carry a Gaia DR3 field catalogue with CatWISE2020 counterparts. No synthetic colours are plotted.
        </p>
      </div>
    );
  }

  const xs = points.map((p) => p.color);
  const ys = points.map((p) => p.g);
  const x0 = Math.floor(Math.min(...xs) - 0.4);
  const x1 = Math.ceil(Math.max(...xs) + 0.4);
  const y0 = Math.floor(Math.min(...ys) - 0.4);
  const y1 = Math.ceil(Math.max(...ys) + 0.4);

  const W = 760;
  const H = 440;
  const M = { l: 54, r: 18, t: 26, b: 44 };
  const X = (v: number) => M.l + ((v - x0) / Math.max(0.001, x1 - x0)) * (W - M.l - M.r);
  const Y = (v: number) => M.t + ((v - y0) / Math.max(0.001, y1 - y0)) * (H - M.t - M.b);
  const xTicks = [0, 2, 4, 6, 8, 10].filter((v) => v >= x0 && v <= x1);
  const yTicks = [8, 10, 12, 14, 16, 18, 20].filter((v) => v >= y0 && v <= y1);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
      <div className="panel p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="micro text-cyan">Gaia DR3 · CatWISE2020 colour–magnitude</p>
          <p className="num text-[0.6875rem] text-ink/70">{points.length} matched sources</p>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label="Gaia G magnitude versus Gaia G minus CatWISE2020 W1 colour for catalogue sources in this field">
          <rect x={M.l} y={M.t} width={W - M.l - M.r} height={H - M.t - M.b} fill="var(--color-panel2)" stroke="var(--color-line)" />
          {xTicks.map((v) => (
            <g key={'x' + v}>
              <line x1={X(v)} x2={X(v)} y1={M.t} y2={H - M.b} stroke="var(--color-line)" strokeDasharray="2 5" />
              <text x={X(v)} y={H - M.b + 16} textAnchor="middle" fontSize="10" fill="rgb(240 240 250 / 0.7)" className="num">
                {v}
              </text>
            </g>
          ))}
          {yTicks.map((v) => (
            <g key={'y' + v}>
              <line x1={M.l} x2={W - M.r} y1={Y(v)} y2={Y(v)} stroke="var(--color-line)" strokeDasharray="2 5" />
              <text x={M.l - 8} y={Y(v) + 3} textAnchor="end" fontSize="10" fill="rgb(240 240 250 / 0.7)" className="num">
                {v}
              </text>
            </g>
          ))}
          {points.map((p) => (
            <circle
              key={p.id}
              cx={X(p.color)}
              cy={Y(p.g)}
              r={p.target ? 5 : 2.6}
              fill={p.target ? 'var(--color-acid)' : p.color > 4 ? 'var(--color-amber)' : 'var(--color-cyan)'}
              fillOpacity={p.target ? 1 : 0.72}
            >
              <title>{`${p.id} · G ${p.g.toFixed(2)} · W1 ${p.w1.toFixed(2)} · G−W1 ${p.color.toFixed(2)}`}</title>
            </circle>
          ))}
          {targetPoint && (
            <g>
              <circle cx={X(targetPoint.color)} cy={Y(targetPoint.g)} r={9} fill="none" stroke="var(--color-acid)" strokeWidth={1.4} />
              <text x={X(targetPoint.color) + 13} y={Y(targetPoint.g) - 7} fontSize={10} fill="var(--color-acid)" className="num">
                TARGET
              </text>
            </g>
          )}
          <text x={(M.l + W - M.r) / 2} y={H - 8} textAnchor="middle" fontSize={10} fill="rgb(240 240 250 / 0.65)">
            G − W1 (mag) → redder
          </text>
          <text x={16} y={(M.t + H - M.b) / 2} textAnchor="middle" fontSize={10} fill="rgb(240 240 250 / 0.65)" transform={`rotate(-90 16 ${(M.t + H - M.b) / 2})`}>
            G (mag, brighter ↑)
          </text>
        </svg>
        <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink/70">
          Cyan: field stars. Amber: G − W1 &gt; 4 mag, a red-excess selection. Acid ring: the pack target. CatWISE2020 counterparts are matched within 8″ after propagating Gaia to the catalogue epoch (2015.4); unmatched Gaia sources are omitted rather than assigned a colour.
        </p>
      </div>

      <div className="panel p-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="micro text-cyan">Reddest sources</p>
          <p className="micro text-ink/70">G − W1</p>
        </div>
        <div className="mt-2 max-h-[390px] overflow-y-auto thin-scroll">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-line text-[0.6875rem] uppercase tracking-[0.12em] text-ink/65">
                <th className="py-1.5 pr-2 font-normal">Gaia DR3</th>
                <th className="px-2 py-1.5 text-right font-normal">G−W1</th>
                <th className="px-2 py-1.5 text-right font-normal">G</th>
                <th className="py-1.5 pl-2 text-right font-normal">W1</th>
              </tr>
            </thead>
            <tbody>
              {reddest.map((p) => (
                <tr key={p.id} className="border-b border-line/60 last:border-0">
                  <td className="num py-1.5 pr-2 text-[0.6875rem] text-ink/85">{p.id}</td>
                  <td className="num px-2 py-1.5 text-right text-[0.6875rem] text-amber">{p.color.toFixed(2)}</td>
                  <td className="num px-2 py-1.5 text-right text-[0.6875rem] text-ink/75">{p.g.toFixed(2)}</td>
                  <td className="num py-1.5 pl-2 text-right text-[0.6875rem] text-ink/65">{p.w1.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {targetPoint && (
          <p className="mt-3 border-t border-line pt-2 text-[0.8125rem] leading-relaxed text-ink/80">
            Target: G {targetPoint.g.toFixed(3)} · W1 {targetPoint.w1.toFixed(3)} · G − W1 {targetPoint.color.toFixed(3)} mag.
          </p>
        )}
      </div>
    </div>
  );
}
