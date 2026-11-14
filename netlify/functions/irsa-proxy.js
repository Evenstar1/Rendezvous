// Pass-through proxy for IRSA (no processing). Used only when direct browser access is blocked by CORS.
export async function handler(event) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  const url = event.queryStringParameters && event.queryStringParameters.url;
  if (!url || !/^https:\/\/irsa\.ipac\.caltech\.edu\//.test(url)) {
    return { statusCode: 400, headers: { ...cors, 'Content-Type': 'text/plain' }, body: 'Missing or disallowed url' };
  }
  try {
    const upstream = await fetch(url, { method: 'GET' });
    const buf = Buffer.from(await upstream.arrayBuffer());
    const headers = { ...cors };
    const ct = upstream.headers.get('content-type');
    if (ct) headers['Content-Type'] = ct;
    const cd = upstream.headers.get('content-disposition');
    if (cd) headers['Content-Disposition'] = cd;
    return { statusCode: upstream.status, headers, body: buf.toString('base64'), isBase64Encoded: true };
  } catch (err) {
    return { statusCode: 502, headers: { ...cors, 'Content-Type': 'text/plain' }, body: String(err && err.message ? err.message : err) };
  }
}
