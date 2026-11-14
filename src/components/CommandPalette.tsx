import { useEffect, useMemo, useRef, useState } from 'react';
import { TARGETS } from '../data/targets';
import { copyText } from '../lib/science';
import { toQuery, type View } from '../state';
import { cn } from '../utils/cn';
import { Arrow } from './ui';

type Group = 'Fields' | 'Timeline' | 'Display' | 'Overlays' | 'Science' | 'Share' | 'Go to';

interface Action {
  id: string;
  label: string;
  group: Group;
  hint?: string;
  keys?: string;
  run: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
  view: View;
  set: (p: Partial<View>) => void;
  selectTarget: (id: string) => void;
  toL2: () => void;
  toSky: () => void;
  onGuide: () => void;
  onPng: () => void;
  onAtlas: () => void;
}

const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
const tab = (name: string) => window.dispatchEvent(new CustomEvent('rv:tab', { detail: name }));

export function CommandPalette({ open, onClose, view, set, selectTarget, toL2, toSky, onGuide, onPng, onAtlas }: Props) {
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const [copied, setCopied] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const ov = view.ov;
  const actions = useMemo<Action[]>(() => {
    const l2 = view.source === 'l2';
    const list: Action[] = [
      ...TARGETS.map((t) => ({ id: 't-' + t.id, group: 'Fields' as Group, label: `Load ${t.name}`, hint: t.kind, run: () => selectTarget(t.id) })),
      { id: 'src-sky', group: 'Fields', label: 'Switch to all-sky (any coordinates)', hint: l2 ? 'Live HiPS mosaics' : 'Active', run: () => toSky() },
      { id: 'src-l2', group: 'Fields', label: 'Switch to Level-2 time series', hint: 'Bundled SPHEREx exposures', run: () => toL2() },
      ...(view.mode === 'guided' ? [{ id: 'mode-r', group: 'Fields' as Group, label: 'Enable Research mode', hint: 'Precision controls and exports', run: () => set({ mode: 'research' }) }] : [{ id: 'mode-g', group: 'Fields' as Group, label: 'Enable Guided mode', hint: 'Fewer controls, plain-language tips', run: () => set({ mode: 'guided' }) }]),
      { id: 'seq-epoch', group: 'Timeline', label: 'Sequence: epoch co-adds', keys: view.seq === 'epoch' ? 'current' : undefined, run: () => set({ seq: 'epoch', op: 'image', source: 'l2' }) },
      { id: 'seq-sweep', group: 'Timeline', label: 'Sequence: spectral channels', keys: view.seq === 'sweep' ? 'current' : undefined, run: () => set({ seq: 'sweep', op: 'image', source: 'l2' }) },
      { id: 'seq-frames', group: 'Timeline', label: 'Sequence: single exposures', keys: view.seq === 'frames' ? 'current' : undefined, run: () => set({ seq: 'frames', op: 'image', source: 'l2' }) },
      { id: 'op-diff', group: 'Timeline', label: 'Operation: difference', hint: 'Static stars cancel', run: () => set({ op: 'diff' }) },
      { id: 'op-stack', group: 'Timeline', label: 'Operation: running stack', hint: 'Faint sources climb out', run: () => set({ op: 'stack' }) },
      { id: 'op-img', group: 'Timeline', label: 'Operation: image', run: () => set({ op: 'image' }) },
      { id: 'cmap-iron', group: 'Display', label: 'Palette: ironbow', hint: 'Guided default', run: () => set({ cmap: 'ironbow' }) },
      { id: 'cmap-ice', group: 'Display', label: 'Palette: ice', run: () => set({ cmap: 'ice' }) },
      { id: 'cmap-gray', group: 'Display', label: 'Palette: gray', run: () => set({ cmap: 'gray' }) },
      { id: 'cmap-ember', group: 'Display', label: 'Palette: ember', run: () => set({ cmap: 'ember' }) },
      { id: 'cmap-inv', group: 'Display', label: 'Palette: invert', run: () => set({ cmap: 'invert' }) },
      { id: 'auto', group: 'Display', label: 'Reset auto level', run: () => set({ hi: null }) },
      { id: 'grid', group: 'Display', label: `${view.tools.grid ? 'Hide' : 'Show'} coordinate grid`, run: () => set({ tools: { ...view.tools, grid: !view.tools.grid } }) },
      { id: 'flags', group: 'Overlays', label: `${ov.flags ? 'Hide' : 'Show'} pipeline-flag overlay`, run: () => set({ ov: { ...ov, flags: !ov.flags } }) },
      { id: 'track', group: 'Overlays', label: `${ov.track ? 'Hide' : 'Show'} catalog proper-motion track`, run: () => set({ ov: { ...ov, track: !ov.track } }) },
      { id: 'gaia', group: 'Overlays', label: `${ov.gaia ? 'Hide' : 'Show'} Gaia DR3`, run: () => set({ ov: { ...ov, gaia: !ov.gaia } }) },
      { id: 'wise', group: 'Overlays', label: `${ov.wise ? 'Hide' : 'Show'} CatWISE2020`, run: () => set({ ov: { ...ov, wise: !ov.wise } }) },
      { id: 'movers', group: 'Overlays', label: `${view.tools.movers ? 'Hide' : 'Show'} candidate markers`, run: () => set({ tools: { ...view.tools, movers: !view.tools.movers } }) },
      { id: 'fits-in', group: 'Fields', label: 'Import local FITS exposures (.fits / .json)', hint: 'Processed 100% in-browser', run: () => window.dispatchEvent(new Event('rv:import-fits')) },
      { id: 'tab-spec', group: 'Science', label: 'Open spectrum & blackbody / molecular fit', run: () => tab('spec') },
      { id: 'tab-curve', group: 'Science', label: 'Open light curve & Lomb–Scargle periodogram', run: () => tab('curve') },
      { id: 'tab-astrom', group: 'Science', label: 'Open astrometry, kinematics & PSF profile', run: () => tab('astrom') },
      { id: 'tab-movers', group: 'Science', label: 'Open moving-object candidates', run: () => tab('movers') },
      { id: 'tab-coverage', group: 'Science', label: 'Open coverage & 5σ depth ledger', run: () => tab('coverage') },
      { id: 'tab-field', group: 'Science', label: 'Open field colour–magnitude & reddest sources', run: () => tab('field') },
      { id: 'tab-log', group: 'Science', label: 'Open discovery notebook', run: () => tab('log') },
      { id: 'apcorr', group: 'Science', label: `${view.apCorr ? 'Disable' : 'Enable'} PSF encircled-energy aperture correction`, run: () => set({ apCorr: !view.apCorr }) },
      { id: 'guide', group: 'Science', label: 'Open the science guide & equations', hint: 'Beginner to researcher', run: onGuide },
      { id: 'atlas', group: 'Go to', label: 'Open destinations', hint: 'Browse the sky atlas', keys: 'D', run: onAtlas },
      { id: 'png', group: 'Share', label: 'Download current frame as PNG', run: onPng },
      {
        id: 'copy',
        group: 'Share',
        label: 'Copy link to this exact view',
        run: async () => {
          const ok = await copyText(`${window.location.origin}${window.location.pathname}?${toQuery(view)}`);
          setCopied(ok ? 'Link copied' : 'Copy failed — use the Data section');
          setTimeout(() => setCopied(''), 2200);
        },
      },
      { id: 'go-top', group: 'Go to', label: 'Go to top', run: () => scrollTo('top') },
      { id: 'go-viewer', group: 'Go to', label: 'Go to viewer', run: () => scrollTo('viewer') },
      { id: 'go-targets', group: 'Go to', label: 'Go to targets', run: () => scrollTo('targets') },
      { id: 'go-instrument', group: 'Go to', label: 'Go to instrument', run: () => scrollTo('instrument') },
      { id: 'go-data', group: 'Go to', label: 'Go to data & embed', run: () => scrollTo('data') },
    ];
    return list;
  }, [view, set, selectTarget, toL2, toSky, onGuide, onPng, onAtlas, ov]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return actions;
    return actions.filter((a) => (a.label + ' ' + a.group + ' ' + (a.hint ?? '')).toLowerCase().includes(s));
  }, [q, actions]);

  useEffect(() => setI(0), [q, open]);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setCopied('');
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (!filtered.length) return;
      else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setI((v) => (v + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setI((v) => (v - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const a = filtered[i];
        if (!a) return;
        if (a.id !== 'copy') onClose();
        a.run();
      }
    };
    window.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', key);
    };
  }, [open, filtered, i, onClose]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [i]);

  if (!open) return null;

  let lastGroup = '';
  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/70 px-4 pt-[8vh] backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-2xl border border-ink/25 bg-[#050505] shadow-[0_30px_120px_rgba(0,0,0,0.8)]">
        <div className="flex items-center gap-3 border-b border-ink/20 px-4">
          <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-ink/75" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <circle cx="7" cy="7" r="4.5" />
            <path d="m10.5 10.5 4 4" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search actions, fields, tools…"
            aria-label="Search commands"
            className="min-h-14 w-full bg-transparent text-base text-ink outline-none placeholder:text-ink/70"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="micro hidden shrink-0 border border-ink/25 px-2 py-1 text-ink/75 sm:block">Esc</kbd>
        </div>
        <ul ref={listRef} className="thin-scroll max-h-[56vh] overflow-y-auto py-2" role="listbox" aria-label="Commands">
          {filtered.length === 0 && <li className="px-5 py-8 text-sm text-ink/75">No action matches “{q}”. Try “movers”, “Gaia”, “PNG” or a target name.</li>}
          {filtered.map((a, k) => {
            const head = a.group !== lastGroup ? a.group : '';
            lastGroup = a.group;
            return (
              <li key={a.id}>
                {head && <p className="micro px-5 pb-1.5 pt-3 text-ink/65">{head}</p>}
                <button
                  type="button"
                  role="option"
                  aria-selected={k === i}
                  data-active={k === i}
                  onMouseEnter={() => setI(k)}
                  onClick={() => {
                    if (a.id !== 'copy') onClose();
                    a.run();
                  }}
                  className={cn('flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors', k === i ? 'bg-ink text-black' : 'text-ink/80 hover:bg-ink/10')}
                >
                  <span className="min-w-0 flex-1 truncate text-sm">{a.label}</span>
                  {a.hint && <span className={cn('hidden max-w-[40%] truncate text-[0.75rem] sm:block', k === i ? 'text-black/55' : 'text-ink/70')}>{a.hint}</span>}
                  {a.keys && <span className={cn('micro border px-1.5 py-0.5', k === i ? 'border-black/30 text-black/60' : 'border-ink/20 text-ink/70')}>{a.keys}</span>}
                  {k === i && <Arrow className="shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink/20 px-4 py-2.5">
          <span className="micro text-ink/70">↑↓ move · ⏎ run · esc close</span>
          <span className="micro text-ink/70">{copied || 'Rendezvous · mission console'}</span>
        </div>
      </div>
    </div>
  );
}
