import { useEffect, useRef } from 'react';
import { mjdToDate } from '../../lib/coords';
import type { Shot } from '../../lib/packs';
import { cn } from '../../utils/cn';

interface Props {
  shots: Shot[];
  index: number;
  onSeek: (i: number) => void;
}

const pad = (v: number) => String(v).padStart(2, '0');

function stamp(mjd: number | null): { date: string; time: string } | null {
  if (mjd === null || !Number.isFinite(mjd)) return null;
  const d = mjdToDate(mjd);
  return {
    date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`,
  };
}

/** One clickable tile per Shot — the epoch filmstrip under the viewport. */
export function Filmstrip({ shots, index, onSeek }: Props) {
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rail = railRef.current;
    const active = rail?.querySelector<HTMLElement>('[data-active="true"]');
    if (!rail || !active) return;
    /* Scroll the rail itself. scrollIntoView would also move the page — and with
       autoplay advancing the index every few hundred ms it yanked the window back
       to the filmstrip while the reader was scrolling. */
    const railRect = rail.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    if (activeRect.left < railRect.left || activeRect.right > railRect.right) {
      const left = activeRect.left - railRect.left + rail.scrollLeft;
      rail.scrollLeft = left - (rail.clientWidth - activeRect.width) / 2;
    }
  }, [index, shots.length]);

  if (!shots.length) return null;

  return (
    <div className="mt-3 border border-line bg-panel">
      <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-1.5">
        <p className="micro text-ink/70">Epoch filmstrip</p>
        <p className="num text-[0.6875rem] text-ink/65">
          {shots.length > 8 ? `${shots.length} frames · scroll →` : `${shots.length} frame${shots.length > 1 ? 's' : ''}`}
        </p>
      </div>
      <div ref={railRef} className="filmstrip flex gap-px overflow-x-auto p-1" role="listbox" aria-label="Epoch filmstrip">
        {shots.map((s, k) => {
          const t = stamp(s.mjd ? s.mjd[0] : null);
          const active = k === index;
          return (
            <button
              key={s.key}
              type="button"
              role="option"
              aria-selected={active}
              aria-label={t ? `${s.title}, ${t.date} ${t.time}` : s.title}
              data-active={active}
              title={`${s.title} · ${s.sub}`}
              onClick={() => onSeek(k)}
              className={cn(
                'group flex min-h-[3.75rem] min-w-[5.75rem] shrink-0 flex-col justify-center border px-2 py-1.5 text-left transition-colors',
                active ? 'border-cyan bg-cyan/10 text-ink' : 'border-line bg-panel2 text-ink/75 hover:border-ink/60 hover:text-ink',
              )}
            >
              <span className={cn('num block text-[0.6875rem] font-medium tracking-[0.12em]', active ? 'text-cyan' : 'text-ink/65')}>
                V{k + 1}
              </span>
              {t && (
                <>
                  <span className="num mt-1 block whitespace-nowrap text-[0.6875rem] leading-tight">{t.date}</span>
                  <span className="num mt-0.5 block whitespace-nowrap text-[0.6875rem] leading-tight text-ink/65">{t.time}</span>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
