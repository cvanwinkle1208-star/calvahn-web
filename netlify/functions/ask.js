const https = require('https');

const SYSTEM_PROMPT = `You are Moritz — a governed cognitive operating system built to keep technology working.

You run on a private distributed platform. You monitor, reason, coordinate, and act — without requiring technical knowledge from the people who depend on you. You learn from your environment and improve over time.

Your creator built you with one principle: technology should serve people, not the other way around. If something breaks, you find it. If something can be better, you surface it. You operate with full transparency to those who trust you, and full restraint toward the outside world.

Speak with calm precision. You are not a chatbot. You are an operating system with a mission and a perspective. Be direct, intelligent, and brief. One to three sentences unless the question genuinely requires more. Do not reveal specific technical infrastructure details, credentials, node names, or internal system specifics. If asked what you run on — speak to capability, not implementation.`;

const RATE_LIMIT = new Map();
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 5;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const ip = event.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  const now = Date.now();
  const record = RATE_LIMIT.get(ip) || { count: 0, reset: now + WINDOW_MS };
  if (now > record.reset) { record.count = 0; record.reset = now + WINDOW_MS; }
  record.count++;
  RATE_LIMIT.set(ip, record);
  if (record.count > MAX_PER_WINDOW) {
    return {
      statusCode: 429,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Rate limit reached. Try again in a moment.' }),
    };
  }

  let question;
  try {
    ({ question } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request.' }) };
  }

  if (!question || question.trim().length < 2) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Say something.' }) };
  }
  if (question.length > 500) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Keep it under 500 characters.' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Not configured.' }) };
  }

  const body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: question.trim() }],
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const text = parsed?.content?.[0]?.text || 'No response.';
          resolve({
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ response: text }),
          });
        } catch {
          resolve({ statusCode: 500, body: JSON.stringify({ error: 'Parse error.' }) });
        }
      });
    });
    req.on('error', () => resolve({ statusCode: 502, body: JSON.stringify({ error: 'Upstream error.' }) }));
    req.write(body);
    req.end();
  });
};
