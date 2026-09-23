const Anthropic = require('@anthropic-ai/sdk');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let messages;
  try {
    const body = JSON.parse(event.body || '{}');
    messages = body.messages || [];
  } catch {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, profile: null }) };
  }

  // Need at least a couple turns to infer anything
  const userMsgs = messages.filter(m => m.role === 'user');
  if (userMsgs.length < 2) {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, profile: null }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, profile: null }) };
  }

  try {
    const client = new Anthropic({ apiKey });

    const transcript = messages
      .map(m => `${m.role === 'user' ? 'Visitor' : 'Moritz'}: ${m.content.replace(/\[END_CONVERSATION\]/g, '').trim()}`)
      .filter(l => l.split(': ')[1])
      .join('\n');

    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 450,
      messages: [{
        role: 'user',
        content: `Analyze this conversation between Moritz (an AI home/business platform) and a website visitor. Return ONLY a valid JSON object with these exact fields — no markdown, no explanation, just the JSON:

{
  "technical_level": "technical" | "semi-technical" | "non-technical",
  "persona": "homeowner" | "developer" | "IT pro" | "small business" | "enterprise" | "student" | "other",
  "pain_point": "home network" | "business servers" | "IoT" | "uptime" | "monitoring" | "automation" | "other",
  "interest_level": "high" | "medium" | "low" | "browsing",
  "urgency": "active problem" | "planning" | "exploring" | "curious",
  "sentiment": "frustrated" | "excited" | "skeptical" | "neutral",
  "key_quote": "most memorable or revealing thing the visitor said verbatim — empty string if nothing notable",
  "use_case": "one sentence: what Moritz could specifically do for this person",
  "marketing_tags": ["array", "of", "2-5", "short", "descriptive", "tags"]
}

Conversation:
${transcript}`
      }]
    });

    const raw = res.content[0]?.text?.trim() || '';
    // Strip markdown code fences if present
    const jsonStr = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    const profile = JSON.parse(jsonStr);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ok: true, profile }),
    };
  } catch (e) {
    console.error('MORITZ_ANALYZE_ERR', e.message);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ok: true, profile: null }),
    };
  }
};
