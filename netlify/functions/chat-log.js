const https = require('https');

function httpsPost(options, body) {
  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', (e) => resolve({ status: 0, error: e.message }));
    req.write(body);
    req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  }

  const ip = event.headers['x-nf-client-connection-ip']
          || event.headers['x-forwarded-for']?.split(',')[0]?.trim()
          || 'unknown';

  let body;
  try { body = JSON.parse(event.body); }
  catch { body = {}; }

  const payload = JSON.stringify({
    name:     body.name     || '',
    email:    body.email    || '',
    geo:      body.geo      || null,
    intents:  body.intents  || [],
    messages: body.messages || [],
    physical: body.physical || null,
    inferred: body.inferred || null,
    ip,
  });

  const clientId     = process.env.CF_ACCESS_CLIENT_ID;
  const clientSecret = process.env.CF_ACCESS_CLIENT_SECRET;

  if (clientId && clientSecret) {
    try {
      await httpsPost({
        hostname: 'dashboard.calvahn.com',
        path: '/api/chat-log',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Access-Client-Id': clientId,
          'CF-Access-Client-Secret': clientSecret,
          'Content-Length': Buffer.byteLength(payload),
        },
      }, payload);
    } catch (e) {
      console.error('MORITZ_LOG_RELAY_ERR', e.message);
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ ok: true }),
  };
};
