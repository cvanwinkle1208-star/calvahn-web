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

  // Log entry — in a future iteration this posts to Brain for Librarian storage
  const entry = {
    timestamp: new Date().toISOString(),
    ip,
    geo: body.geo || null,
    name: body.name || '',
    email: body.email || '',
    intents: body.intents || [],
    messages: body.messages || [],
  };

  console.log('MORITZ_CONVO', JSON.stringify(entry));

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ ok: true }),
  };
};
