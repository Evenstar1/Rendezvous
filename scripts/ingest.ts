/* ---------------------------------------------------------------------------
 * SPHEREx snapshot ingest — rebuilds the bundled data packs from IRSA.
 *
 *   ./scripts/ingest.sh            (all mission targets)
 *   ./scripts/ingest.sh w0855      (one target)
 *
 * For every target: TAP query for all Level-2 images covering the position →
 * stream the first ~200 kB of each cutout (IMAGE, FLAGS, VARIANCE, ZODI) →
 * subtract the zodiacal model → reproject north-up → compand to 8 bit →
 * write src/data/packs/<id>.json. Re-run after a data release and rebuild.
 * ------------------------------------------------------------------------- */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { FIELD_EPOCH, TARGETS, fieldCentre, positionAt } from '../src/data/targets';
import * as S from '../src/lib/spherex';

const N = Number(process.env.GRID ?? 56);
const SCALE = 6.15;
const CUT = Math.ceil(N * 1.42) + 4;
const CAP = Number(process.env.CAP ?? 240);
const CONC = Number(process.env.CONC ?? 8);
const CACHE = process.env.CACHE ?? '.cache/ingest';
const OUT = 'src/data/packs';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sig = (v: number, d = 4) => Number(v.toPrecision(d));

async function cachedText(name: string, url: string): Promise<string> {
  const f = `${CACHE}/${name}`;
  if (existsSync(f) && readFileSync(f, 'utf8').trim().split('\n').length > 1) return readFileSync(f, 'utf8');
  console.log('  query', name);
  for (let a = 0; a < 3; a++) {
    try {
      const t = await (await fetch(url)).text();
      writeFileSync(f, t);
      return t;
    } catch {
      await sleep(3000);
    }
  }
  return '';
}

async function prefix(url: string, bytes: number): Promise<Uint8Array | null> {
  for (let a = 0; a < 3; a++) {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 90000);
    try {
      const r = await S.fetchPrefix(url, bytes, { signal: ctl.signal });
      clearTimeout(to);
      return r;
    } catch {
      clearTimeout(to);
      await sleep(1500 * (a + 1));
    }
  }
  return null;
}

async function pool<T, R>(items: T[], conc: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: conc }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

function stratified<T>(list: T[], cap: number, det: (t: T) => number): T[] {
  const out: T[] = [];
  const q = Math.ceil(cap / 6);
  for (let d = 1; d <= 6; d++) {
    const l = list.filter((x) => det(x) === d);
    if (l.length <= q) out.push(...l);
    else {
      const seen = new Set<number>();
      for (let k = 0; k < q; k++) seen.add(Math.round((k * (l.length - 1)) / (q - 1)));
      for (const i of seen) out.push(l[i]);
    }
  }
  return out;
}

async function specWcs(ref: Record<number, { first: string; last: string; ra: number; dec: number }>): Promise<Record<number, S.SpecWcs>> {
  const f = `${CACHE}/specwcs.json`;
  if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'));
  const out: Record<number, S.SpecWcs> = {};
  for (let d = 1; d <= 6; d++) {
    const tabs: S.SpecWcs[] = [];
    for (const uri of [ref[d].first, ref[d].last]) {
      const u8 = new Uint8Array(await (await fetch(S.cutoutUrl(uri, ref[d].ra, ref[d].dec, 8))).arrayBuffer());
      const h = S.parseFits(u8).find((x) => x.name === 'WCS-WAVE');
      if (!h || !h.complete) throw new Error('WCS-WAVE missing for D' + d);
      tabs.push(S.parseSpecWcs(u8, h));
    }
    const diff = Math.max(...tabs[0].v.map((v, i) => Math.abs(v - tabs[1].v[i])));
    console.log(`  spectral WCS D${d}: ${tabs[0].x.length}×${tabs[0].y.length} control points, λ ${Math.min(...tabs[0].v.filter((_, i) => i % 2 === 0)).toFixed(3)}–${Math.max(...tabs[0].v.filter((_, i) => i % 2 === 0)).toFixed(3)} µm, first↔last exposure max Δ = ${diff.toExponential(1)} µm`);
    out[d] = tabs[1];
  }
  writeFileSync(f, JSON.stringify(out));
  return out;
}

async function main() {
  mkdirSync(CACHE, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  const only = process.argv.slice(2);
  const targets = TARGETS.filter((t) => !only.length || only.includes(t.id));

  // frame lists
  const lists: Record<string, S.FrameRef[]> = {};
  for (const t of targets) {
    const [ra, dec] = fieldCentre(t);
    lists[t.id] = S.parseFramesCsv(await cachedText(`tap_${t.id}.csv`, S.tapUrl(S.framesAdql(ra, dec))));
    console.log(`${t.id}: ${lists[t.id].length} Level-2 images at IRSA`);
  }

  // spectral WCS (instrument calibration: one lookup table per detector)
  const t0 = targets[0];
  const [ra0, dec0] = fieldCentre(t0);
  const ref: Record<number, { first: string; last: string; ra: number; dec: number }> = {};
  for (let d = 1; d <= 6; d++) {
    const l = lists[t0.id].filter((x) => x.det === d);
    ref[d] = { first: l[0].uri, last: l[l.length - 1].uri, ra: ra0, dec: dec0 };
  }
  const spec = await specWcs(ref);
  writeFileSync('src/data/specwcs.json', JSON.stringify(spec));

  for (const t of targets) {
    const [ra, dec] = fieldCentre(t);
    const grid: S.Grid = { ra, dec, n: N, scale: SCALE };
    const refs = lists[t.id];
    const cand = refs.length > 700 ? stratified(refs, 480, (x) => x.det) : refs;
    let done = 0;
    const started = Date.now();
    const res = await pool(cand, CONC, async (r) => {
      const u8 = await prefix(S.cutoutUrl(r.uri, ra, dec, CUT), 200000);
      done++;
      if (done % 50 === 0) console.log(`  ${t.id} ${done}/${cand.length} (${((Date.now() - started) / 1000).toFixed(0)} s)`);
      if (!u8) return null;
      try {
        const f = S.processCutout(u8, grid, spec);
        return f ? { r, f } : null;
      } catch {
        return null;
      }
    });
    const good = res.filter((x): x is { r: S.FrameRef; f: S.ProcessedFrame } => !!x && x.f.cover >= 0.9 && Number.isFinite(x.f.lam));
    const sel = (good.length > CAP ? stratified(good, CAP, (x) => x.f.det) : good).sort((a, b) => a.f.mjd - b.f.mjd);
    console.log(`  ${t.id}: fetched ${cand.length}, usable ${good.length}, packed ${sel.length}`);

    const px = N * N;
    const codes = new Uint8Array(sel.length * px);
    const bits = new Uint8Array(sel.length * Math.ceil(px / 8));
    const stack = new Float32Array(px);
    const cnt = new Float32Array(px);
    sel.forEach(({ f }, k) => {
      for (let i = 0; i < px; i++) {
        codes[k * px + i] = S.compand(f.img[i], f.sigma);
        if (f.bad[i]) bits[k * Math.ceil(px / 8) + (i >> 3)] |= 1 << (i & 7);
        else if (Number.isFinite(f.img[i])) {
          stack[i] += f.img[i] / f.sigma;
          cnt[i]++;
        }
      }
    });
    for (let i = 0; i < px; i++) stack[i] = cnt[i] ? stack[i] / Math.sqrt(cnt[i]) : 0;

    // catalogs
    const inside = (r: number, d: number) => {
      const [i, j] = S.skyToGrid(grid, r, d);
      return i > -1 && j > -1 && i < N && j < N;
    };
    const gq = `SELECT TOP 260 source_id, ra, dec, pmra, pmdec, parallax, phot_g_mean_mag, bp_rp FROM gaiadr3.gaia_source WHERE 1=CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',${ra},${dec},0.075)) ORDER BY phot_g_mean_mag ASC`;
    const gaiaCsv = await cachedText(`gaia_${t.id}.csv`, `https://gea.esac.esa.int/tap-server/tap/sync?REQUEST=doQuery&LANG=ADQL&FORMAT=csv&QUERY=${encodeURIComponent(gq)}`);
    const gaia = gaiaCsv
      .trim()
      .split('\n')
      .slice(1)
      .map((l) => l.split(','))
      .map((c) => ({ id: c[0], ra: +c[1], dec: +c[2], pmra: +c[3] || 0, pmdec: +c[4] || 0, plx: +c[5] || 0, g: +c[6] }))
      .filter((s) => {
        const [r, d] = positionAt({ ...s, epoch: 2016, ref: '' }, FIELD_EPOCH);
        return inside(r, d);
      })
      .slice(0, 140);
    const wq = `SELECT TOP 260 ra, dec, w1mpro, w2mpro, pmra, pmdec FROM catwise_2020 WHERE CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',${ra},${dec},0.075))=1 ORDER BY w1mpro ASC`;
    const wiseCsv = await cachedText(`wise_${t.id}.csv`, S.tapUrl(wq));
    const wise = wiseCsv
      .trim()
      .split('\n')
      .slice(1)
      .map((l) => l.split(',').map(Number))
      .filter((c) => c.length >= 4 && inside(c[0], c[1]))
      .slice(0, 140)
      .map((c) => [sig(c[0], 9), sig(c[1], 8), c[2], c[3]]);

    // astrometric self-check: do bright Gaia stars land where the WCS says they should?
    const checks: string[] = [];
    for (const s of gaia.slice(0, 8)) {
      const [r, d] = positionAt({ ...s, epoch: 2016, ref: '' }, FIELD_EPOCH);
      const [gi, gj] = S.skyToGrid(grid, r, d);
      const ci = Math.round(gi);
      const cj = Math.round(gj);
      if (ci < 5 || cj < 5 || ci > N - 6 || cj > N - 6) continue;
      let best = -1e9;
      let bi = 0;
      let bj = 0;
      for (let j = cj - 4; j <= cj + 4; j++)
        for (let i = ci - 4; i <= ci + 4; i++)
          if (stack[j * N + i] > best) {
            best = stack[j * N + i];
            bi = i;
            bj = j;
          }
      checks.push(`G${s.g.toFixed(1)} Δ(${(bi - gi).toFixed(1)},${(bj - gj).toFixed(1)})px S/N ${best.toFixed(0)}`);
    }
    console.log(`  astrometry check [peak − Gaia prediction]: ${checks.join(' | ') || 'no bright Gaia stars away from edges'}`);

    // quick-look PGM
    const pgm = Buffer.alloc(px);
    for (let i = 0; i < px; i++) pgm[i] = Math.max(0, Math.min(255, 40 + 45 * Math.asinh(stack[i] / 3)));
    writeFileSync(`${CACHE}/ql_${t.id}.pgm`, Buffer.concat([Buffer.from(`P5\n${N} ${N}\n255\n`), pgm]));

    const m = /spherex\/([^/]+)\/level2/.exec(sel[0]?.r.uri ?? '');
    const pack = {
      id: t.id,
      ra,
      dec,
      n: N,
      scale: SCALE,
      release: (m ? m[1] : '').toUpperCase(),
      built: new Date().toISOString().slice(0, 10),
      available: refs.length,
      flagNames: sel[0]?.f.flagNames ?? {},
      frames: sel.map(({ r, f }) => {
        const u = /level2_(.+?)D\d_spx_(.+)\.fits/.exec(r.uri);
        return [sig(f.mjd, 10), f.det, sig(f.lam, 5), sig(f.dlam, 3), sig(f.bg), sig(f.sigma), f.cflags, sig(f.fwhm, 3), u ? u[1] : '', u ? u[2] : ''];
      }),
      img: deflateSync(codes, { level: 9 }).toString('base64'),
      bad: deflateSync(bits, { level: 9 }).toString('base64'),
      gaia: gaia.map((s) => [sig(s.ra, 10), sig(s.dec, 9), sig(s.pmra, 5), sig(s.pmdec, 5), sig(s.plx, 4), sig(s.g, 4), s.id]),
      wise,
    };
    const json = JSON.stringify(pack);
    writeFileSync(`${OUT}/${t.id}.json`, json);
    console.log(`  wrote ${OUT}/${t.id}.json  ${(json.length / 1024).toFixed(0)} kB  (${sel.length} frames, ${gaia.length} Gaia, ${wise.length} CatWISE)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
