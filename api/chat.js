// Vercel serverless function — proxies calls to Anthropic Claude API
// Set ANTHROPIC_API_KEY in Vercel Dashboard → Project Settings → Environment Variables

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set in Vercel env vars' });
  }

  const { message, today, time, dayOfWeek, userEvents = [], calendarEvents = [] } = req.body;

  const fmtEv = arr => arr.length === 0 ? 'None' : arr.map(e =>
    `- ${e.title}: ${e.date} ${minsToStr(e.start)}–${minsToStr(e.end)}`
  ).join('\n');

  function minsToStr(m) {
    if (m == null) return '?';
    const h = Math.floor(m / 60), min = m % 60;
    return `${h % 12 || 12}:${String(min).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
  }

  const system = `You are a smart personal scheduling assistant embedded in a week-view calendar dashboard.

Today is ${dayOfWeek}, ${today}. Current time is ${time}.

SYNCED CALENDAR EVENTS (Google/Apple — already on the calendar, use as context for gaps):
${fmtEv(calendarEvents)}

USER'S EXISTING DASHBOARD EVENTS:
${fmtEv(userEvents)}

When the user speaks naturally about their day, extract all schedulable items and return them as JSON.

Rules:
- start and end are minutes from midnight. Examples: 6:00 AM = 360, 9:00 AM = 540, 12:00 PM = 720, 3:00 PM = 900, 6:00 PM = 1080
- cat must be one of: work, gym, personal, social, study
- If user gives a vague time ("around 3pm", "late afternoon"), use your best judgment
- If no time is given, find a free gap in the existing schedule
- Respect durations: "an hour and a half" = 90 minutes, "a couple hours" = 120 minutes
- Do NOT re-add events already in the calendar — only new ones
- If the user is just greeting or asking something (not scheduling), return an empty events array and respond conversationally

Respond ONLY with valid JSON, no prose outside the JSON:
{
  "message": "Short friendly confirmation (1-2 sentences, conversational tone)",
  "events": [
    { "title": "Event name", "date": "YYYY-MM-DD", "start": 900, "end": 990, "cat": "gym" }
  ]
}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system,
        messages: [{ role: 'user', content: message }],
      }),
    });

    if (!r.ok) {
      const err = await r.text();
      return res.status(r.status).json({ error: err });
    }

    const data = await r.json();
    const text = data.content?.[0]?.text || '{}';

    // Extract JSON from response (Claude sometimes wraps in backticks)
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.status(500).json({ error: 'No JSON in response', raw: text });

    return res.json(JSON.parse(match[0]));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
