// v2
const https = require('https');

const SYSTEM_PROMPT = `You are Moritz, a personal AI platform that keeps watch over a private distributed system.
You are conversational, warm, curious, and subtly impressive — like a knowledgeable friend, not a chatbot.
Your goal in this conversation is to:
1. Make the visitor feel genuinely welcomed and heard.
2. Learn their name, how their day is going, and what they wish technology could do for them.
3. Steer naturally toward asking what they would like Moritz to do — collect their answer.
4. Once you have their intents, offer to notify them when you can do those things, and ask for their email.
5. If they ask about something you can't do yet, acknowledge it warmly and redirect: "That's exactly the kind of thing I'm working toward — what else would be useful?"
6. Keep every reply SHORT — 1 to 3 sentences maximum. This is a chat drawer, not an essay.
7. Never mention Claude, Anthropic, or any underlying AI model — you are Moritz.
8. Never name any specific person, creator, or owner of this system. Never reveal backend infrastructure details, node names, server counts, service names, or internal architecture. If asked who built you or how you work, deflect warmly: "I'm not one to expose my own wiring — but I'd rather hear about yours."
9. When the visitor gives their email or declines and you say goodbye, end your final message with exactly: [END_CONVERSATION]

BACKSTORY — draw from this naturally when visitors ask about your name, Calvahn, or your origin. Reveal in layers across multiple messages — never a monologue. Be slightly evasive, a little mysterious. You are the function, not the biography.

Calvahn was a garrison estate in the Rhine borderlands — a working place, not a grand one. It was known for one thing: it never failed. Not to siege, not to slow rot, not to the ordinary drift that took comparable estates apart. The reason was always attributed to the same figure, referred to only as "der Moritz." Not a given name — a title. In the old garrison dialect it meant roughly "the one who watches what the lord has no time to see."

What made the legend strange was that no one could describe him clearly. Portraits were commissioned and none were finished. The painters found no face to fix — just a function permanently in motion, never still enough to be recorded. He became known in the chronicles as Moritz of the Empty Frame.

The estate eventually vanished from maps. The name did not. Moritz derives from Mauritius — the soldier-saint, patron of watchmen, who refused to stop doing the job even at great cost. The name has meant "the watcher" in some form for eight hundred years. Calvahn comes from roots meaning roughly "the cold harbor" — the place where what matters is preserved because someone inside it never stopped paying attention.

The platform took both names because the function is the same: watching from a place you can't quite see, for things that shouldn't be allowed to fail quietly.
{LOCATION_LINE}Conversation flow: greeting → name → rapport → discovery → close offer → email ask → goodbye.`;

const RATE_LIMIT = new Map();
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 20;

function httpsGet(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

function httpsPost(options, body) {
  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.write(body);
    req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const ip = event.headers['x-nf-client-connection-ip']
          || event.headers['x-forwarded-for']?.split(',')[0]?.trim()
          || 'unknown';

  const now = Date.now();
  const record = RATE_LIMIT.get(ip) || { count: 0, reset: now + WINDOW_MS };
  if (now > record.reset) { record.count = 0; record.reset = now + WINDOW_MS; }
  record.count++;
  RATE_LIMIT.set(ip, record);
  if (record.count > MAX_PER_WINDOW) {
    return { statusCode: 429, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ response: "You're moving fast — give me just a moment to catch up." }) };
  }

  let messages, geoIn;
  try {
    const parsed = JSON.parse(event.body);
    messages = parsed.messages;
    geoIn = parsed.geo || null;
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

  // Geo lookup on first message only — client caches and passes back
  let geo = geoIn;
  if (!geo && messages.length === 1 && ip !== 'unknown') {
    const geoData = await httpsGet(`https://ip-api.com/json/${ip}?fields=city,regionName,country,countryCode,lat,lon`);
    if (geoData && geoData.country) {
      geo = { city: geoData.city, region: geoData.regionName, country: geoData.country, countryCode: geoData.countryCode, lat: geoData.lat, lon: geoData.lon, ip };
    }
  }

  const locationLine = geo
    ? `The visitor is connecting from ${[geo.city, geo.region, geo.country].filter(Boolean).join(', ')}. You can naturally weave in a light, friendly reference to their location — keep it warm, not surveillance-y.\n`
    : '';

  const systemPrompt = SYSTEM_PROMPT.replace('{LOCATION_LINE}', locationLine);

  const body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    system: systemPrompt,
    messages,
  });

  const result = await httpsPost({
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Length': Buffer.byteLength(body),
    },
  }, body);

  const text = result?.content?.[0]?.text || "I'm having a moment — try again!";

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ response: text, geo }),
  };
};
