import { useEffect, useMemo, useState } from 'react';
import { DESTINATIONS, EXPEDITIONS, type Destination } from '../data/destinations';
import { decimalYear, formatCatalogCoords, formatLightTravel, positionAtEpoch } from '../lib/atlas';
import { cn } from '../utils/cn';

const EXPEDITION_COLOR: Record<number, string> = {
  1: '#7aa8ff',
  2: '#b6ff3d',
  3: '#ff9f4a',
  4: '#7fe3a1',
  5: '#f2d660',
  6: '#ff5c4d',
};

interface Props {
  open: boolean;
  onClose: () => void;
  onLaunch: (dest: Destination, blind: boolean) => void;
}

export function Atlas({ open, onClose, onLaunch }: Props) {
  const [expedition, setExpedition] = useState<number | null>(null);
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  const [blind, setBlind] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const now = decimalYear();

  const filtered = useMemo(
    () => (expedition ? DESTINATIONS.filter((d) => d.expedition === expedition) : DESTINATIONS),
    [expedition],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key >= '1' && e.key <= '6') setExpedition(Number(e.key));
      if (e.key === '0') setExpedition(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 1200);
    } catch {
      setCopied(null);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-black/95 backdrop-blur-md">
      <div className="flex h-full flex-col">
        <header className="border-b border-ink/15 px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="eyebrow text-ink/70">The Atlas</p>
              <h2 className="display text-2xl sm:text-3xl">Destinations</h2>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setBlind((b) => !b)} className="micro min-h-10 border border-ink/25 px-3 text-ink/75 transition-colors hover:border-ink hover:text-ink">
                Blind Mission: {blind ? 'On' : 'Off'}
              </button>
              <button type="button" onClick={onClose} className="micro min-h-10 border border-ink/25 px-3 text-ink/75 transition-colors hover:border-ink hover:text-ink">
                Close
              </button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => setExpedition(null)} className={cn('micro min-h-9 border px-3 transition-colors', expedition === null ? 'border-ink bg-ink text-black' : 'border-ink/25 text-ink/75 hover:border-ink hover:text-ink')}>
              All
            </button>
            {EXPEDITIONS.map((e) => (
              <button key={e.id} type="button" onClick={() => setExpedition(e.id)} className={cn('micro min-h-9 border px-3 transition-colors', expedition === e.id ? 'border-ink bg-ink text-black' : 'border-ink/25 text-ink/75 hover:border-ink hover:text-ink')}>
                {e.id} {e.name}
              </button>
            ))}
          </div>
        </header>

        <div className="flex-1 overflow-x-auto overflow-y-hidden px-4 py-6 sm:px-6">
          <div className="flex h-full gap-4">
            {filtered.map((dest) => {
              const pos = positionAtEpoch(dest.ra, dest.dec, dest.pmra, dest.pmdec, 2000, now);
              const coords = formatCatalogCoords(dest.ra, dest.dec);
              const nowCoords = formatCatalogCoords(pos.ra, pos.dec);
              const isFlipped = !!flipped[dest.id];
              const accent = EXPEDITION_COLOR[dest.expedition];
              return (
                <article key={dest.id} className="relative h-full w-[22rem] shrink-0 [perspective:1200px]">
                  <div className={cn('relative h-full w-full transition-transform duration-300 [transform-style:preserve-3d]', isFlipped && '[transform:rotateY(180deg)]')}>
                    <div className="absolute inset-0 flex flex-col overflow-hidden border border-ink/20 bg-panel2 p-4 [backface-visibility:hidden]">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="micro" style={{ color: accent }}>{EXPEDITIONS.find((e) => e.id === dest.expedition)?.name}</p>
                          <h3 className="display mt-1 text-xl">{blind ? 'Blind Mission' : dest.name}</h3>
                        </div>
                        <span className="micro border border-ink/25 px-2 py-1 text-ink/75">{dest.difficulty}</span>
                      </div>

                      <div className="mt-4 border border-ink/15 bg-black/40 p-3 font-mono text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-ink/65">J2000</span>
                          <span className="text-ink">{coords.sex}</span>
                          <button type="button" onClick={() => copy(`${dest.ra.toFixed(5)} ${dest.dec.toFixed(5)}`, `${dest.id}-j2000`)} className="micro border border-ink/25 px-2 py-1 text-ink/75 hover:border-ink hover:text-ink">
                            {copied === `${dest.id}-j2000` ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-ink/65">Now</span>
                          <span className="text-ink">{nowCoords.sex}</span>
                          <button type="button" onClick={() => copy(`${pos.ra.toFixed(5)} ${pos.dec.toFixed(5)}`, `${dest.id}-now`)} className="micro border border-ink/25 px-2 py-1 text-ink/75 hover:border-ink hover:text-ink">
                            {copied === `${dest.id}-now` ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                        <div className="mt-2 text-ink/65">{coords.dec}</div>
                      </div>

                      <p className="mt-4 text-sm text-ink/80">{dest.why}</p>
                      <p className="mt-2 text-sm text-ink/65">Look for: {dest.look}</p>
                      <p className="mt-2 text-xs text-ink/60">FOV {dest.fov}' · Mode {dest.mode} · {formatLightTravel(dest.distanceLy)}</p>
                      <p className="mt-2 text-xs text-ink/60">{dest.verified ? 'Verified coordinates' : dest.verificationNote}</p>

                      <div className="mt-auto flex gap-2 pt-4">
                        <button type="button" onClick={() => onLaunch(dest, blind)} className="btn btn-sm flex-1">
                          Launch
                        </button>
                        <button type="button" onClick={() => setFlipped((f) => ({ ...f, [dest.id]: !f[dest.id] }))} className="micro min-h-10 border border-ink/25 px-3 text-ink/75 transition-colors hover:border-ink hover:text-ink">
                          Brief
                        </button>
                      </div>
                    </div>

                    <div className="absolute inset-0 flex flex-col overflow-hidden border border-ink/20 bg-panel2 p-4 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                      <h3 className="display text-xl">{blind ? 'Blind Mission' : dest.name}</h3>
                      <p className="mt-2 text-sm text-ink/75">{dest.note}</p>
                      <p className="mt-3 text-xs text-ink/65">Coverage: {dest.coverageImages !== null ? `${dest.coverageImages} SPHEREx images / ${dest.coverageEpochs} epochs` : 'check on launch'}</p>
                      <p className="mt-3 text-xs text-ink/65">SIMBAD: {dest.simbadId ?? 'not resolved in this build'}</p>
                      <p className="mt-3 text-xs text-ink/65">PM: {dest.pmra !== null ? `${dest.pmra.toFixed(1)}, ${dest.pmdec?.toFixed(1)} mas/yr` : 'not available'}</p>
                      <p className="mt-3 text-xs text-ink/65">{dest.verified ? 'Verified' : dest.verificationNote}</p>
                      <button type="button" onClick={() => setFlipped((f) => ({ ...f, [dest.id]: false }))} className="micro mt-auto min-h-10 border border-ink/25 px-3 text-ink/75 transition-colors hover:border-ink hover:text-ink">
                        Back
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
