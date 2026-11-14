import { useEffect, useState } from 'react';
import { jumpTo } from '../lib/usePacks';
import { cn } from '../utils/cn';
import { Wordmark } from './ui';

const LINKS: [string, string][] = [
  ['Viewer', 'viewer'],
  ['Targets', 'targets'],
  ['Instrument', 'instrument'],
  ['Data', 'data'],
];

export function Nav({ onGuide, onPalette, onAtlas }: { onGuide: () => void; onPalette: () => void; onAtlas: () => void }) {
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const on = () => setSolid(window.scrollY > 40);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', esc);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  const go = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setOpen(false);
    jumpTo(id);
  };

  return (
    <header className={cn('fixed inset-x-0 top-0 z-50 transition-[background-color,box-shadow] duration-500', solid || open ? 'bg-black/90 shadow-[0_1px_0_rgb(240_240_250/0.1)] backdrop-blur-md' : 'bg-gradient-to-b from-black/70 to-transparent')}>
      <div className="wrap flex h-[4.5rem] items-center justify-between gap-6">
        <a href="#top" onClick={(e) => go(e, 'top')} aria-label="Rendezvous, back to top" className="flex min-h-11 items-center">
          <Wordmark className="text-[0.9375rem] sm:text-base" />
        </a>

        <nav aria-label="Sections" className="hidden items-center gap-10 lg:flex">
          {LINKS.map(([label, id]) => (
            <a key={id} href={`#${id}`} onClick={(e) => go(e, id)} className="group relative flex min-h-11 items-center text-[0.8125rem] font-semibold uppercase tracking-[0.16em] text-ink/85 transition-colors hover:text-ink">
              {label}
              <span className="rule-spectrum absolute inset-x-0 bottom-2.5 h-0.5 origin-left scale-x-0 transition-transform duration-300 ease-[var(--ease-expo)] group-hover:scale-x-100" />
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button type="button" onClick={onAtlas} className="micro hidden min-h-10 items-center border border-ink/25 px-3 text-ink/70 transition-colors hover:border-ink hover:text-ink md:flex">
              Destinations
            </button>
            <button type="button" onClick={onPalette} className="micro hidden min-h-10 items-center gap-2 border border-ink/25 px-3 text-ink/70 transition-colors hover:border-ink hover:text-ink md:flex" aria-label="Open command palette">
            Search
            <kbd className="num border border-ink/25 px-1 py-0.5 text-[0.6875rem]">⌘K</kbd>
          </button>
          <button type="button" onClick={onGuide} className="micro hidden min-h-10 items-center border border-ink/25 px-3 text-ink/70 transition-colors hover:border-ink hover:text-ink xl:flex">
            Science guide
          </button>
          <a href="#viewer" onClick={(e) => go(e, 'viewer')} className="btn btn-sm hidden sm:inline-flex">
            Open viewer
          </a>
          <button
            type="button"
            className="-mr-2 grid h-11 w-11 place-items-center lg:hidden"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((o) => !o)}
          >
            <span className="relative block h-3.5 w-6">
              <span className={cn('absolute left-0 h-0.5 w-6 bg-ink transition-transform duration-300', open ? 'top-1.5 rotate-45' : 'top-0')} />
              <span className={cn('absolute left-0 h-0.5 w-6 bg-ink transition-transform duration-300', open ? 'top-1.5 -rotate-45' : 'top-3')} />
            </span>
          </button>
        </div>
      </div>

      <div id="mobile-menu" className={cn('fixed inset-x-0 bottom-0 top-[4.5rem] bg-black transition-opacity duration-300 lg:hidden', open ? 'opacity-100' : 'pointer-events-none opacity-0')} hidden={!open}>
        <nav aria-label="Sections" className="wrap flex h-full flex-col justify-center pb-24">
          {LINKS.map(([label, id], k) => (
            <a key={id} href={`#${id}`} onClick={(e) => go(e, id)} className="display flex items-baseline gap-5 border-b border-ink/12 py-4 text-3xl">
              <span className="num text-sm font-semibold tracking-widest text-cyan">0{k + 1}</span>
              {label}
            </a>
          ))}
          <button type="button" onClick={() => { setOpen(false); onGuide(); }} className="micro flex min-h-12 items-center gap-3 border-b border-ink/12 text-left text-ink/80">
            Science guide
          </button>
          <p className="micro flex items-center gap-2 pt-6 text-ink/70"><span className="h-1.5 w-1.5 bg-cyan" aria-hidden="true" />Rendezvous — mission console</p>
        </nav>
      </div>
    </header>
  );
}
