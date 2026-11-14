import { useCallback, useEffect, useMemo, useState } from 'react';
import { CommandPalette } from './components/CommandPalette';
import { DataSection, Footer } from './components/DataSection';
import { Guide } from './components/Guide';
import { Hero } from './components/Hero';
import { Instrument } from './components/Instrument';
import { Nav } from './components/Nav';
import { Targets } from './components/Targets';
import { Viewer } from './components/viewer/Viewer';
import { useAllPacks } from './lib/usePacks';
import { Atlas, AtlasMap } from './components/Atlas';
import { DESTINATIONS } from './data/destinations';
import { decimalYear, positionAtEpoch } from './lib/atlas';
import { isEmbed, useView } from './state';

function Site() {
  const { view, set, acquire, selectTarget, toL2, toSky, loadCustomPack } = useView();
  const packs = useAllPacks();
  const [guide, setGuide] = useState(false);
  const [palette, setPalette] = useState(false);
  const [atlas, setAtlas] = useState(false);
  const active = view.source === 'l2' ? view.targetId : null;

  const launchDestination = useCallback(async (dest: any, blind: boolean) => {
    const pos = positionAtEpoch(dest.ra, dest.dec, dest.pmra, dest.pmdec, 2000, decimalYear());
    await acquire(`${pos.ra.toFixed(6)} ${pos.dec.toFixed(6)}`);
    if (blind) {
      window.sessionStorage.setItem('rv-blind-name', dest.name);
      set({ label: 'Blind Mission' });
    }
    const q = new URLSearchParams(window.location.search || window.location.hash.replace(/^#/, ''));
    q.set('live', '1');
    if (blind) q.set('blind', '1');
    else q.delete('blind');
    try {
      window.history.replaceState(null, '', `${window.location.pathname}?${q.toString()}`);
    } catch {
      /* ignore */
    }
    setAtlas(false);
  }, [acquire]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (e.key.toLowerCase() === 'd' && !e.metaKey && !e.ctrlKey && !e.altKey && !typing) {
        e.preventDefault();
        setAtlas(true);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => !p);
      } else if (!typing && e.key === '?' && !guide) {
        e.preventDefault();
        setGuide(true);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [guide]);

  return (
    <>
      <a href="#viewer" className="sr-only z-[60] bg-ink px-4 py-3 text-sm font-semibold text-black focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to the viewer
      </a>
      <Nav onGuide={() => setGuide(true)} onPalette={() => setPalette(true)} onAtlas={() => setAtlas(true)} />
      <main>
        <Hero acquire={acquire} onTarget={selectTarget} activeId={active} packs={packs} onGuide={() => setGuide(true)} onAtlas={() => setAtlas(true)} />
        <section id="atlas-teaser" className="wrap py-16">
          <p className="eyebrow text-ink/70">Where should I point it?</p>
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <AtlasMap expedition={null} height={220} interactive={false} />
            <div className="grid gap-3 sm:grid-cols-3">
              {['Proxima Centauri', 'Mira (omicron Ceti)', 'South Ecliptic Pole'].map((name) => {
                const dest = DESTINATIONS.find((d) => d.name === name);
                if (!dest) return null;
                return (
                  <button key={dest.id} type="button" onClick={() => launchDestination(dest, false)} className="border border-ink/20 bg-panel2 p-4 text-left transition-colors hover:border-cyan">
                    <p className="micro text-cyan">{dest.name}</p>
                    <p className="mt-2 text-sm text-ink/75">{dest.note}</p>
                    <p className="mt-3 text-xs text-ink/60">Launch →</p>
                  </button>
                );
              })}
            </div>
          </div>
          <button type="button" onClick={() => setAtlas(true)} className="micro mt-6 border border-cyan/50 bg-cyan/10 px-4 py-2 text-cyan transition-colors hover:border-cyan hover:bg-cyan hover:text-black">
            See all {DESTINATIONS.length} destinations →
          </button>
        </section>
        <Viewer view={view} set={set} acquire={acquire} toL2={toL2} toSky={toSky} onLoadPack={loadCustomPack} onGuide={() => setGuide(true)} onAtlas={() => setAtlas(true)} />

        <Targets packs={packs} activeId={active} onSelect={selectTarget} />
        <Instrument />
        <DataSection view={view} packs={packs} onLoadPack={loadCustomPack} />
      </main>
      <Footer />
      <Guide open={guide} onClose={() => setGuide(false)} />
      <Atlas open={atlas} onClose={() => setAtlas(false)} onLaunch={launchDestination} />
      <CommandPalette
        open={palette}
        onClose={() => setPalette(false)}
        view={view}
        set={set}
        selectTarget={selectTarget}
        toL2={toL2}
        toSky={toSky}
        onGuide={() => setGuide(true)}
        onAtlas={() => setAtlas(true)}
        onPng={() => window.dispatchEvent(new Event('rv:png'))}
      />
    </>
  );
}

function Embed() {
  const { view, set, acquire, toL2, toSky, loadCustomPack } = useView();
  return (
    <main>
      <Viewer view={view} set={set} acquire={acquire} toL2={toL2} toSky={toSky} onLoadPack={loadCustomPack} onGuide={() => {}} embed />
    </main>
  );
}

export default function App() {
  const embed = useMemo(isEmbed, []);
  return embed ? <Embed /> : <Site />;
}
