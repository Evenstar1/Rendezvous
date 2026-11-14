const adql = "SELECT TOP 5 source_id, ra, dec, pmra, pmdec, parallax FROM gaiadr3.gaia_source WHERE 1=CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',12.295,5.389,0.05)) ORDER BY phot_g_mean_mag ASC";
const url = 'https://gea.esac.esa.int/tap-server/tap/sync?REQUEST=doQuery&LANG=ADQL&FORMAT=json&QUERY=' + encodeURIComponent(adql);
const res = await fetch(url);
const text = await res.text();
console.log(res.status, text.slice(0, 1000));