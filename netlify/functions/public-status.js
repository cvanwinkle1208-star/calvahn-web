const https = require('https');

function httpsGet(options) {
  return new Promise((resolve) => {
    const req = https.request({ ...options, timeout: 4000 }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: null }); }
      });
    });
    req.on('timeout', () => { req.destroy(); });
    req.on('error', () => resolve({ status: 0, body: null }));
    req.end();
  });
}

const FALLBACK = { nodes_online: 4, nodes_total: 7, services: 12, vram_gb: 54, hb_age_s: null };

exports.handler = async () => {
  const clientId     = process.env.CF_ACCESS_CLIENT_ID;
  const clientSecret = process.env.CF_ACCESS_CLIENT_SECRET;

  let data = FALLBACK;

  if (clientId && clientSecret) {
    try {
      const result = await httpsGet({
        hostname: 'dashboard.calvahn.com',
        path: '/api/public-status',
        method: 'GET',
        headers: {
          'CF-Access-Client-Id': clientId,
          'CF-Access-Client-Secret': clientSecret,
        },
      });
      if (result.status === 200 && result.body) data = result.body;
    } catch (e) {
      // fall through to static fallback
    }
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
    },
    body: JSON.stringify(data),
  };
};
