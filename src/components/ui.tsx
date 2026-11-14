import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cn } from '../utils/cn';

export function Arrow({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 10" className={cn('h-2.5 w-5 shrink-0', className)} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M0 5h18M14 1l4 4-4 4" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-[0.5em] font-bold uppercase leading-none tracking-[0.26em]', className)}>
      Rendezvous
      <svg viewBox="0 0 58 20" className="h-[1.05em] w-auto" fill="none" aria-hidden="true">
        <ellipse cx="29" cy="10" rx="25" ry="5.4" transform="rotate(-8 29 10)" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="53.2" cy="6.4" r="2.2" fill="var(--color-signal)" />
        <circle cx="29" cy="10" r="1.7" fill="currentColor" />
        <circle cx="4.9" cy="13.4" r="1.2" fill="var(--color-cyan)" />
      </svg>
    </span>
  );
}

interface SegOption<T> {
  value: T;
  label: string;
  title?: string;
  disabled?: boolean;
}

export function Seg<T extends string | number>({ value, options, onChange, label, className }: { value: T; options: SegOption<T>[]; onChange: (v: T) => void; label: string; className?: string }) {
  return (
    <div className={cn('seg', className)} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={o.value === value} disabled={o.disabled} title={o.title} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Check({ on, onChange, children, swatch, disabled, hint }: { on: boolean; onChange: (v: boolean) => void; children: ReactNode; swatch?: string; disabled?: boolean; hint?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      title={hint}
      onClick={() => onChange(!on)}
      className={cn('group flex min-h-10 w-full items-center gap-3 py-1 text-left transition-opacity', disabled && 'opacity-35')}
    >
      <span
        className={cn('grid h-4 w-4 shrink-0 place-items-center border transition-colors', on ? 'border-ink bg-ink' : 'border-ink/40 group-hover:border-ink')}
        style={on && swatch ? { background: swatch, borderColor: swatch } : undefined}
      >
        {on && (
          <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" stroke="#000" strokeWidth="2" aria-hidden="true">
            <path d="M1.5 5.2 4 7.6 8.5 2.4" />
          </svg>
        )}
      </span>
      <span className={cn('micro transition-colors', on ? 'text-ink' : 'text-ink/65 group-hover:text-ink')}>{children}</span>
    </button>
  );
}

/** Fades content up the first time it scrolls into view. */
export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={cn('reveal', seen && 'is-in', className)} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
      {children}
    </div>
  );
}

export function SectionHead({ index, kicker, title, children, className, accent = '#35e6e0' }: { index: string; kicker: string; title: ReactNode; children?: ReactNode; className?: string; accent?: string }) {
  return (
    <Reveal className={cn('max-w-3xl', className)}>
      <p className="eyebrow text-ink/65">
        <span className="num" style={{ color: accent }}>
          {index}
        </span>
        <span className="mx-3 inline-block h-0.5 w-8 align-middle" style={{ background: accent }} />
        {kicker}
      </p>
      <h2 className="display mt-5 text-[clamp(2.1rem,5vw,4.25rem)]">{title}</h2>
      {children && <div className="mt-6 max-w-2xl text-lg leading-relaxed text-ink/75">{children}</div>}
    </Reveal>
  );
}

/** Coordinate / name entry used in the hero and the viewer header. */
export function AcquireBar({ onAcquire, initial = '', compact, onDone }: { onAcquire: (text: string) => Promise<{ ok: boolean; msg: string }>; initial?: string; compact?: boolean; onDone?: () => void }) {
  const id = useId();
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => setText(initial), [initial]);
  return (
    <div>
      <form
        className="flex flex-col gap-3 sm:flex-row"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setMsg('');
          const r = await onAcquire(text);
          setBusy(false);
          setMsg(r.msg);
          if (r.ok) onDone?.();
        }}
      >
        <label htmlFor={id} className="sr-only">
          Right ascension and declination, or an object name
        </label>
        <input
          id={id}
          className={cn('field num flex-1', compact && 'min-h-10 text-sm')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="RA Dec or name · 08h55m10.83s −07d14m42.5s"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-describedby={`${id}-msg`}
        />
        <button type="submit" className={cn('btn', compact && 'btn-sm')} disabled={busy}>
          {busy ? 'Resolving' : 'Acquire'}
          <Arrow />
        </button>
      </form>
      <p id={`${id}-msg`} role="status" aria-live="polite" className={cn('text-sm text-signal', msg ? 'mt-2' : 'sr-only')}>
        {msg}
      </p>
    </div>
  );
}

/** Tracks an element's content-box width, robust across unmounting and tab switches. */
export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const [w, setW] = useState(0);
  const roRef = useRef<ResizeObserver | null>(null);
  const targetRef = useRef<T | null>(null);

  const refObj = useRef<{ (node: T | null): void; current: T | null } | null>(null);
  if (!refObj.current) {
    const fn = Object.assign(
      (node: T | null) => {
        targetRef.current = node;
        fn.current = node;
        if (roRef.current) {
          roRef.current.disconnect();
          roRef.current = null;
        }
        if (node) {
          const initial = Math.round(node.getBoundingClientRect().width) || node.clientWidth;
          if (initial > 0) setW(initial);
          if (typeof ResizeObserver !== 'undefined') {
            const ro = new ResizeObserver((entries) => {
              const cr = entries[0]?.contentRect;
              const width = cr ? Math.round(cr.width) : node.clientWidth;
              if (width > 0) setW(width);
            });
            ro.observe(node);
            roRef.current = ro;
          }
        }
      },
      { current: null as T | null },
    );
    refObj.current = fn;
  }

  useEffect(() => {
    return () => {
      if (roRef.current) {
        roRef.current.disconnect();
        roRef.current = null;
      }
    };
  }, []);

  return [refObj.current as unknown as React.RefObject<T | null>, w];
}
