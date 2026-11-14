import { useEffect, useState } from 'react';
import { TARGETS } from '../data/targets';
import { loadPack, type Pack } from './packs';

let all: Promise<Pack[]> | null = null;

/** Unpacks every bundled snapshot after first paint (one at a time, so the main thread stays free). */
export function useAllPacks(): Pack[] | null {
  const [packs, setPacks] = useState<Pack[] | null>(null);
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      all ??= (async () => {
        const out: Pack[] = [];
        for (const tg of TARGETS) {
          out.push(await loadPack(tg.id));
          await new Promise((r) => setTimeout(r, 60));
        }
        return out;
      })();
      all.then((p) => alive && setPacks(p)).catch(() => {});
    }, 700);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, []);
  return packs;
}

export function jumpTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduced = !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
}
