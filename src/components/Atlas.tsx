import { useEffect, useMemo, useState, useRef } from 'react';
import { DESTINATIONS, EXPEDITIONS, type Destination } from '../data/destinations';
import { decimalYear, formatCatalogCoords, formatLightTravel, positionAtEpoch } from '../lib/atlas';
import { TARGETS, fieldCentre } from '../data/targets';
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
const [listView, setListView] = useState(false);
const [surpriseSpin, setSurpriseSpin] = useState(false);
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

  // map rendered by AtlasMap below
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
              <button type="button" onClick={() => setListView((v) => !v)} className="micro min-h-10 border border-ink/25 px-3 text-ink/75 transition-colors hover:border-ink hover:text-ink">
                {listView ? 'Cards' : 'List'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const pick = DESTINATIONS[Math.floor(Math.random() * DESTINATIONS.length)];
                  setSurpriseSpin(true);
                  setTimeout(() => setSurpriseSpin(false), 650);
                  onLaunch(pick, blind);
                }}
                className={cn('micro min-h-10 border border-ink/25 px-3 text-ink/75 transition-colors hover:border-ink hover:text-ink', surpriseSpin && 'animate-spin')}
              >
                Surprise me
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

        <div className="border-b border-ink/15 px-4 py-3 sm:px-6">
          <AtlasMap expedition={expedition} height={224} interactive onSelect={(id) => {
            const dest = DESTINATIONS.find((d) => d.id === id);
            if (dest) {
              setExpedition(dest.expedition);
              document.getElementById(`dest-${dest.id}`)?.scrollIntoView({ behavior: 'smooth', inline: 'center' });
            }
          }} />
          <p className="mt-2 text-xs text-ink/60">Hover a beacon. Gold dashed line = ecliptic; red glows = deep fields.</p>
        </div>
{listView ? (
          <div className="flex-1 overflow-auto px-4 py-6 sm:px-6">
            <table className="w-full text-left text-sm">
              <thead className="text-ink/65">
                <tr>
                  <th className="pb-2">Name</th>
                  <th className="pb-2">Exp</th>
                  <th className="pb-2">Coordinates</th>
                  <th className="pb-2">Launch</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((dest) => {
                  return (
                    <tr key={dest.id} className="border-t border-ink/10">
                      <td className="py-2">{blind ? 'Blind Mission' : dest.name}</td>
                      <td className="py-2">{dest.expedition}</td>
                      <td className="py-2 font-mono text-xs">{dest.ra.toFixed(4)}, {dest.dec.toFixed(4)}</td>
                      <td className="py-2">
                        <button type="button" onClick={() => onLaunch(dest, blind)} className="micro border border-ink/25 px-2 py-1 text-ink/75 hover:border-ink hover:text-ink">
                          Launch
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
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
        )}
      </div>
    </div>
  );
}

export function AtlasMap({
  expedition = null,
  height = 224,
  aspectRatio,
  interactive = true,
  onSelect,
  onReady,
}: {
  expedition?: number | null;
  height?: number;
  aspectRatio?: number;
  interactive?: boolean;
  onSelect?: (id: string) => void;
  onReady?: (ok: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
const [hoverId, setHoverId] = useState<string | null>(null);
const reducedMotion = typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    const beacons = [
      ...DESTINATIONS.filter((d) => (expedition ? d.expedition === expedition : true)).map((d) => ({ id: d.id, name: d.name, ra: d.ra, dec: d.dec, expedition: d.expedition, bundled: false, pm: d.totalPm })),
      ...TARGETS.map((t) => {
        const [ra, dec] = fieldCentre(t);
        return { id: t.id, name: t.name, ra, dec, expedition: 0, bundled: true, pm: null as number | null };
      }),
    ];

    console.log('ATLASMAP_DEBUG', 'canvas=', canvas.width, canvas.height, 'destinations=', DESTINATIONS.length, 'beacons=', beacons.length, 'first=', beacons.slice(0, 3).map((b) => {
      const p = project(b.ra, b.dec);
      return { id: b.id, x: p.x, y: p.y };
    }));
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const h = aspectRatio ? rect.width / aspectRatio : height;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const project = (ra: number, dec: number) => {
      const W = canvas.width;
      const H = canvas.height;
      let lon = ((ra - 180) * Math.PI) / 180;
      const lat = (dec * Math.PI) / 180;
      let theta = lat;
      for (let i = 0; i < 6; i++) theta = (Math.PI * Math.sin(lat) - Math.sin(2 * theta)) / 2;
      for (let i = 0; i < 6; i++) {
        const f = 2 * theta + Math.sin(2 * theta) - Math.PI * Math.sin(lat);
        const fp = 2 + 2 * Math.cos(2 * theta);
        theta -= f / fp;
      }
      const x = (2 * Math.sqrt(2) / Math.PI) * lon * Math.cos(theta);
      const y = Math.sqrt(2) * Math.sin(theta);
      return { x: W / 2 + x * (W / 3.35), y: H / 2 - y * (H / 1.85) };
    };

    const draw = (time: number) => {
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#050814');
      bg.addColorStop(1, '#0b1020');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.strokeStyle = '#c9d6ff';
      ctx.lineWidth = H * 0.18;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i <= 180; i++) {
        const ra = (i / 180) * 360;
        const dec = 28 * Math.sin(((ra - 120) * Math.PI) / 180);
        const p = project(ra, dec);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = 'rgba(242,214,96,0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i <= 360; i++) {
        const lam = (i * Math.PI) / 180;
        const eps = (23.439 * Math.PI) / 180;
        const ra = (Math.atan2(Math.sin(lam) * Math.cos(eps), Math.cos(lam)) * 180) / Math.PI;
        const dec = (Math.asin(Math.sin(lam) * Math.sin(eps)) * 180) / Math.PI;
        const p = project((ra + 360) % 360, dec);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      for (const pole of [{ ra: 270, dec: 66.56 }, { ra: 90, dec: -66.56 }]) {
        const p = project(pole.ra, pole.dec);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 42);
        g.addColorStop(0, 'rgba(255,92,77,0.55)');
        g.addColorStop(1, 'rgba(255,92,77,0)');
        ctx.fillStyle = g;
        ctx.fillRect(p.x - 42, p.y - 42, 84, 84);
      }
      beacons.forEach((b, idx) => {
        const p = project(b.ra, b.dec);
        const pulse = reducedMotion || !interactive ? 0 : Math.sin(time / 450 + idx) * 1.8;
        const color = b.bundled ? '#ffffff' : EXPEDITION_COLOR[b.expedition] || '#7aa8ff';
        ctx.strokeStyle = color;
        ctx.lineWidth = b.bundled ? 2 : 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6 + pulse, 0, Math.PI * 2);
        if (b.bundled) ctx.stroke();
        else {
          ctx.setLineDash([3, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      });
      if (!canvas.dataset.ready) {
        canvas.dataset.ready = '1';
        const probe = ctx.getImageData(0, 0, Math.min(W, 20), Math.min(H, 20)).data;
        let nonBg = 0;
        for (let i = 0; i < probe.length; i += 4) if (probe[i] + probe[i + 1] + probe[i + 2] > 12) nonBg++;
        onReady?.(nonBg > 0);
      }
      if (!reducedMotion && interactive) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    const onMove = (e: MouseEvent) => {
      if (!interactive) return;
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (canvas.width / rect.width);
      const y = (e.clientY - rect.top) * (canvas.height / rect.height);
      let best: string | null = null;
      let bestD = 14;
      for (const b of beacons) {
        const p = project(b.ra, b.dec);
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < bestD) {
          bestD = d;
          best = b.id;
        }
      }
      setHoverId(best);
    };
    const onClick = (e: MouseEvent) => {
      if (!interactive || !onSelect) return;
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (canvas.width / rect.width);
      const y = (e.clientY - rect.top) * (canvas.height / rect.height);
      for (const b of beacons) {
        const p = project(b.ra, b.dec);
        if (Math.hypot(p.x - x, p.y - y) < 12) {
          onSelect(b.id);
          break;
        }
      }
    };
    if (interactive) {
      canvas.addEventListener('mousemove', onMove);
      canvas.addEventListener('click', onClick);
    }
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('click', onClick);
    };
  }, [expedition, interactive, hoverId, onSelect]);

  return (
    <div style={aspectRatio ? { aspectRatio: String(aspectRatio) } : { height }} className="w-full overflow-hidden rounded-sm border border-ink/15 bg-black/60">
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}
