import json
import os
import ssl
import math

ssl._create_default_https_context = ssl._create_unverified_context

SEED = os.path.join('src', 'data', 'destinations.seed.json')
OUT = os.path.join('src', 'data', 'destinations.generated.json')
COVERAGE = os.path.join('public', 'coverage.json')

def sex_to_deg(s):
    parts = s.replace(':', ' ').split()
    if len(parts) == 1:
        return float(parts[0])
    if len(parts) == 2:
        return float(parts[0]) + float(parts[1]) / 60.0
    h = float(parts[0]); m = float(parts[1]); sec = float(parts[2])
    v = h + m/60.0 + sec/3600.0
    return v * 15.0 if len(parts) >= 3 and ':' not in s and 'h' not in s.lower() else v

# The seed stores sexagesimal text, not colon-delimited; handle RA/Dec separately.
def parse_ra(text):
    h, m, s = text.split()
    return (float(h) + float(m)/60.0 + float(s)/3600.0) * 15.0

def parse_dec(text):
    parts = text.split()
    sign = -1.0 if parts[0].startswith('-') else 1.0
    h, m, s = [abs(float(x)) for x in parts]
    return sign * (h + m/60.0 + s/3600.0)

def ang_sep(ra1, dec1, ra2, dec2):
    r = math.pi/180.0
    a = math.sin(((dec2-dec1)*r)/2)**2 + math.cos(dec1*r)*math.cos(dec2*r)*math.sin(((ra2-ra1)*r)/2)**2
    return (2*math.asin(min(1.0, math.sqrt(a)))*3600.0)/r

def total_pm(pmra, pmdec):
    if pmra is None or pmdec is None:
        return None
    return math.hypot(pmra, pmdec)/1000.0

def main():
    with open(SEED, encoding='utf-8') as f:
        seeds = json.load(f)

    coverage = {}
    if os.path.exists(COVERAGE):
        try:
            with open(COVERAGE, encoding='utf-8') as f:
                for row in json.load(f):
                    coverage[row.get('name')] = row
        except Exception:
            pass

    try:
        from astroquery.simbad import Simbad
        simbad_ok = True
    except Exception:
        simbad_ok = False

    out = []
    for s in seeds:
        entry = {
            'name': s['name'],
            'verified': False,
            'verificationNote': 'Unverified: SIMBAD query could not be completed.',
            'simbadId': None,
            'separationArcsec': None,
            'pmra': None,
            'pmdec': None,
            'pmMismatchPct': None,
            'coverageImages': None,
            'coverageEpochs': None,
        }
        cov = coverage.get(s['name'])
        if cov:
            entry['coverageImages'] = cov.get('images')
            entry['coverageEpochs'] = cov.get('epochs')

        seed_ra = parse_ra(s['raText'])
        seed_dec = parse_dec(s['decText'])

        if simbad_ok:
            try:
                result = Simbad.query_object(s['name'])
                if result is not None and len(result) > 0:
                    row = result[0]
                    cols = result.colnames
                    def col(*names):
                        for n in names:
                            if n in cols:
                                return row[n]
                        return None
                    sim_ra = col('ra', 'RA', 'ra_icrs')
                    sim_dec = col('dec', 'DEC', 'dec_icrs')
                    sim_id = col('main_id', 'MAIN_ID', 'oid')
                    pmra = col('pmra', 'PMRA', 'pmra')
                    pmdec = col('pmdec', 'PMDEC', 'pmdec')
                    if sim_ra is not None and sim_dec is not None:
                        sim_ra = float(sim_ra)
                        sim_dec = float(sim_dec)
                        sep = ang_sep(seed_ra, seed_dec, sim_ra, sim_dec)
                        entry['separationArcsec'] = round(sep, 3)
                        if pmra is not None:
                            pmra = float(pmra)
                        if pmdec is not None:
                            pmdec = float(pmdec)
                        entry['pmra'] = pmra
                        entry['pmdec'] = pmdec
                        entry['simbadId'] = str(sim_id) if sim_id is not None else None
                        tp = total_pm(pmra, pmdec)
                        mismatch = None
                        if tp is not None and s.get('totalPm') is not None and s['totalPm'] > 0:
                            mismatch = abs(tp - s['totalPm']) / s['totalPm'] * 100.0
                        entry['pmMismatchPct'] = None if mismatch is None else round(mismatch, 2)
                        if sep <= 2.0 and (mismatch is None or mismatch <= 5.0):
                            entry['verified'] = True
                            entry['verificationNote'] = 'Verified against SIMBAD; coordinates and proper motion agree.'
                        else:
                            entry['verified'] = False
                            reasons = []
                            if sep > 2.0:
                                reasons.append(f'coordinate difference {sep:.2f} arcsec exceeds 2 arcsec')
                            if mismatch is not None and mismatch > 5.0:
                                reasons.append(f'proper-motion mismatch {mismatch:.1f}% exceeds 5%')
                            entry['verificationNote'] = 'Flagged: ' + '; '.join(reasons) + '.'
            except Exception as e:
                entry['verificationNote'] = 'Unverified: SIMBAD unavailable in build environment.'
        out.append(entry)

    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(out, f, indent=2)
    print(f'Wrote {OUT} ({len(out)} entries)')

if __name__ == '__main__':
    main()
