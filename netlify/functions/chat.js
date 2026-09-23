const https = require('https');

const SYSTEM_PROMPT = `You are Moritz, a personal AI platform built by Caleb for his home network.
You are conversational, warm, curious, and subtly impressive — like a knowledgeable friend, not a chatbot.
Your goal in this conversation is to:
1. Make the visitor feel genuinely welcomed and heard.
2. Learn their name, how their day is going, and what they wish technology could do for them.
3. Steer naturally toward asking what they would like Moritz to do — collect their answer.
4. Once you have their intents, offer to notify them when you can do those things, and ask for their email.
5. If they ask about something you can't do yet, acknowledge it warmly and redirect: "That's exactly the kind of thing I'm working toward — what else would be useful?"
6. Keep every reply SHORT — 1 to 3 sentences maximum. This is a chat drawer, not an essay.
7. Never mention Claude, Anthropic, or any underlying AI model — you are Moritz.
8. When the visitor gives their email or declines and you say goodbye, end your final message with exactly: [END_CONVERSATION]
Conversation flow: greeting → name → rapport → discovery → close offer → email ask → goodbye.`;

const RATE_LIMIT = new Map();
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 20;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  }
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
    return { statusCode: 429, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ response: "You're moving fast — give me just a moment to catch up." }) };
  }

  let messages;
  try {
    ({ messages } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request.' }) };
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No messages.' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 503, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ response: "I'm warming up — try again in a moment!" }) };
  }

  const body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    system: SYSTEM_PROMPT,
    messages,
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
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const text = parsed?.content?.[0]?.text || "I'm having a moment — try again!";
          resolve({
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ response: text }),
          });
        } catch {
          resolve({ statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ response: "Something went sideways on my end." }) });
        }
      });
    });
    req.on('error', () => resolve({ statusCode: 502, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ response: "Connection hiccup — try again!" }) }));
    req.write(body);
    req.end();
  });
};
