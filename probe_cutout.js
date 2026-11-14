async function testCutouts() {
  const ra = 133.795129;
  const dec = -7.245147;
  // Get real URIs from TAP query first:
  const q = "SELECT TOP 3 a.uri, p.time_bounds_lower, p.energy_bandpassname, p.obsid FROM spherex.artifact a JOIN spherex.plane p ON a.planeid = p.planeid WHERE 1 = CONTAINS(POINT('ICRS', " + ra + ", " + dec + "), p.poly) ORDER BY p.time_bounds_lower";
  const tapUrl = 'https://irsa.ipac.caltech.edu/TAP/sync?QUERY=' + encodeURIComponent(q) + '&FORMAT=csv';
  console.log('Fetching TAP to get live URIs...');
  const tapRes = await fetch(tapUrl);
  const text = await tapRes.text();
  console.log('TAP text:', text);
  const lines = text.trim().split(/\r?\n/).slice(1);
  for (const line of lines) {
    const uri = line.split(',')[0];
    if (!uri) continue;
    const cutoutUrl = 'https://irsa.ipac.caltech.edu/' + uri + '?center=' + ra + ',' + dec + '&size=64px';
    console.log('\nTesting Cutout:', cutoutUrl);
    const t0 = Date.now();
    try {
      const res = await fetch(cutoutUrl);
      const dt = Date.now() - t0;
      const acao = res.headers.get('access-control-allow-origin');
      const cl = res.headers.get('content-length');
      const ct = res.headers.get('content-type');
      console.log('Status:', res.status, 'ACAO:', acao, 'Type:', ct, 'Length:', cl, 'Time:', dt + 'ms');
      if (res.ok) {
        const buf = await res.arrayBuffer();
        console.log('Successfully fetched buffer byteLength:', buf.byteLength);
        const headerSample = Buffer.from(buf.slice(0, 160)).toString('ascii');
        console.log('Header sample:', headerSample);
        break;
      } else {
        const errText = await res.text();
        console.log('Error text:', errText.slice(0, 100));
      }
    } catch (e) {
      console.log('Error:', e.message);
    }
  }
}
testCutouts();
