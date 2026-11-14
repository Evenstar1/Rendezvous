import { DESTINATIONS } from '../data/destinations';

const EXPEDITION_COLOR: Record<number, string> = {
  1: '#7aa8ff',
  2: '#b6ff3d',
  3: '#ff9f4a',
  4: '#7fe3a1',
  5: '#f2d660',
  6: '#ff5c4d',
};

function project(ra: number, dec: number): { x: number; y: number } {
  const lambda = ((180 - ra) * Math.PI) / 180;
  const phi = (dec * Math.PI) / 180;
  let theta = phi;
  if (Math.abs(phi) < Math.PI / 2 - 1e-9) {
    for (let i = 0; i < 5; i++) {
      const f = 2 * theta + Math.sin(2 * theta) - Math.PI * Math.sin(phi);
      const fp = 2 + 2 * Math.cos(2 * theta);
      theta -= f / fp;
    }
  } else {
    theta = phi;
  }
  const x = (2 * Math.sqrt(2) / Math.PI) * lambda * Math.cos(theta);
  const y = Math.sqrt(2) * Math.sin(theta);
  return { x: 400 + x * 130, y: 200 - y * 130 };
}

function path(points: { x: number; y: number }[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

export function SkyPreview({ onOpen }: { onOpen: () => void }) {
  const graticule: string[] = [];
  for (let ra = 0; ra < 360; ra += 30) {
    const pts = [];
    for (let dec = -90; dec <= 90; dec += 5) pts.push(project(ra, dec));
    graticule.push(path(pts));
  }
  for (let dec = -60; dec <= 60; dec += 30) {
    const pts = [];
    for (let ra = 0; ra <= 360; ra += 5) pts.push(project(ra, dec));
    graticule.push(path(pts));
  }
  const ecliptic: { x: number; y: number }[] = [];
  const eps = (23.4393 * Math.PI) / 180;
  for (let lam = 0; lam <= 360; lam += 2) {
    const l = (lam * Math.PI) / 180;
    const ra = ((Math.atan2(Math.sin(l) * Math.cos(eps), Math.cos(l)) * 180) / Math.PI + 360) % 360;
    const dec = (Math.asin(Math.sin(l) * Math.sin(eps)) * 180) / Math.PI;
    ecliptic.push(project(ra, dec));
  }
  const poles = [
    project(270, 66.56),
    project(90, -66.56),
  ];

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Sky map of ${DESTINATIONS.length} SPHEREx destinations. Open full atlas.`}
      className="block w-full overflow-hidden rounded-sm border border-ink/15 bg-black/60 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan"
    >
      <svg viewBox="0 0 800 400" width="100%" role="img" aria-label={`Sky map of ${DESTINATIONS.length} SPHEREx destinations`}>
        <ellipse cx="400" cy="200" rx="368" ry="184" fill="#050814" stroke="rgba(240,240,250,0.25)" strokeWidth="1.5" />
        {graticule.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="rgba(240,240,250,0.08)" strokeWidth="1" />
        ))}
        <path d={path(ecliptic)} fill="none" stroke="rgba(242,214,96,0.75)" strokeWidth="1.5" strokeDasharray="6 6" />
        {poles.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="12" fill="rgba(255,92,77,0.18)" />
            <circle cx={p.x} cy={p.y} r="4" fill="#ff5c4d" />
          </g>
        ))}
        {DESTINATIONS.map((d) => {
          const p = project(d.ra, d.dec);
          const color = EXPEDITION_COLOR[d.expedition] || '#7aa8ff';
          return (
            <circle key={d.id} cx={p.x} cy={p.y} r="3.5" fill={color} stroke="#000" strokeWidth="0.75">
              <title>{d.name}</title>
            </circle>
          );
        })}
        {DESTINATIONS.length === 0 && (
          <text x="400" y="200" textAnchor="middle" fill="#a0a8c0" fontSize="14">
            Loading destinations...
          </text>
        )}
      </svg>
      <span className="micro block px-3 py-2 text-ink/60">Open full atlas →</span>
    </button>
  );
}