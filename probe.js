async function probe() {
  const ra = 133.795129;
  const dec = -7.245147;
  const urls = [
    { name: 'SIA2 spherex_qr', url: 'https://irsa.ipac.caltech.edu/SIA?COLLECTION=spherex_qr&POS=circle+' + ra + '+' + dec + '+0.05&RESPONSEFORMAT=votable' },
    { name: 'SIA2 spherex_qr3', url: 'https://irsa.ipac.caltech.edu/SIA?COLLECTION=spherex_qr3&POS=circle+' + ra + '+' + dec + '+0.05&RESPONSEFORMAT=votable' },
    { name: 'TAP spherex query', url: 'https://irsa.ipac.caltech.edu/TAP/sync?QUERY=' + encodeURIComponent("SELECT a.uri, p.time_bounds_lower, p.energy_bandpassname, p.obsid FROM spherex.artifact a JOIN spherex.plane p ON a.planeid = p.planeid WHERE 1 = CONTAINS(POINT('ICRS', " + ra + ", " + dec + "), p.poly) ORDER BY p.time_bounds_lower") + '&FORMAT=csv' },
    { name: 'TAP obscore query', url: 'https://irsa.ipac.caltech.edu/TAP/sync?QUERY=' + encodeURIComponent("SELECT TOP 5 obs_collection, obs_id, access_url, t_min, t_max FROM ivoa.obscore WHERE obs_collection LIKE '%spherex%' AND 1=CONTAINS(POINT('ICRS', " + ra + ", " + dec + "), s_region)") + '&FORMAT=csv' },
    { name: 'Cutout query', url: 'https://irsa.ipac.caltech.edu/ibe/data/spherex/qr/level2/2025W19_2B/l2b-v11-2025-163/3/level2_2025W19_2B_0073_2D3_spx_l2b-v11-2025-163.fits?center=' + ra + ',' + dec + '&size=80px' }
  ];

  for (const item of urls) {
    const t0 = Date.now();
    try {
      const res = await fetch(item.url, { method: 'GET' });
      const dt = Date.now() - t0;
      const cl = res.headers.get('content-length') || '(chunked)';
      const acao = res.headers.get('access-control-allow-origin');
      const text = await res.text();
      console.log('=== ' + item.name + ' ===');
      console.log('Status: ' + res.status);
      console.log('ACAO: ' + acao);
      console.log('Size: ' + text.length + ' chars (header content-length: ' + cl + ')');
      console.log('Time: ' + dt + ' ms');
      console.log('Sample body (first 300 chars):');
      console.log(text.slice(0, 300).replace(/\r?\n/g, ' '));
      console.log('-----------------------------------------');
    } catch (e) {
      console.log('=== ' + item.name + ' === ERROR: ' + e.message);
    }
  }
}
probe();
