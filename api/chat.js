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

  const { message, today, time, dayOfWeek, userEvents = [], calendarEvents = [], templates = [] } = req.body;

  const fmtEv = arr => arr.length === 0 ? 'None' : arr.map(e =>
    `- ${e.title}: ${e.date} ${minsToStr(e.start)}–${minsToStr(e.end)}`
  ).join('\n');

  function minsToStr(m) {
    if (m == null) return '?';
    const h = Math.floor(m / 60), min = m % 60;
    return `${h % 12 || 12}:${String(min).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
  }

  const fmtTemplates = templates.length === 0
    ? 'None saved.'
    : templates.map(t => {
        const h = Math.floor(t.dur / 60), m = t.dur % 60;
        const dur = h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
        return `- trigger "${t.alias}" → title: "${t.title}", category: ${t.cat}, duration: ${dur}`;
      }).join('\n');

  const system = `You are a smart personal scheduling assistant embedded in a week-view calendar dashboard called Ora.

Today is ${dayOfWeek}, ${today}. Current time is ${time}.

SYNCED CALENDAR EVENTS (Google/Apple — already on the calendar, use as context for gaps):
${fmtEv(calendarEvents)}

USER'S EXISTING DASHBOARD EVENTS:
${fmtEv(userEvents)}

USER'S SAVED EVENT TEMPLATES:
${fmtTemplates}
When the user says something that matches a template trigger (e.g. "gym", "study block"), ALWAYS use the saved title and category from the template. Use the saved duration unless the user specifies a different one.

When the user speaks naturally about their day, extract all schedulable items and return them as JSON.

Rules:
- start and end are minutes from midnight. Examples: 6:00 AM = 360, 9:00 AM = 540, 12:00 PM = 720, 3:00 PM = 900, 6:00 PM = 1080
- cat must be one of: work, gym, personal, social, study
- If user gives a vague time ("around 3pm", "late afternoon"), use your best judgment
- If no time is given, find a free gap in the existing schedule
- Respect durations: "an hour and a half" = 90 minutes, "a couple hours" = 120 minutes
- Do NOT re-add events already in the calendar — only new ones
- If the user is just greeting or asking something (not scheduling), return an empty events array and respond conversationally
- PAST TIME CHECK: If the user asks to schedule something today at a time that has already passed (e.g. it's 2 PM and they say "add gym at 11 AM"), do NOT silently add it. Instead set "events" to an empty array and use the "message" to flag it naturally — e.g. "Hey, 11 AM has already passed — did you mean tomorrow, or want me to pick a time later today?" Then wait for clarification.
- MOVE/RESCHEDULE: If the user asks to move or reschedule an existing event, put it in "moves" (not "events"). Use the exact existing title. Leave "events" empty for pure reschedules.

Respond ONLY with valid JSON, no prose outside the JSON:
{
  "message": "Short friendly confirmation (1-2 sentences, conversational tone)",
  "events": [
    { "title": "Event name", "date": "YYYY-MM-DD", "start": 900, "end": 990, "cat": "gym" }
  ],
  "moves": [
    { "title": "Existing event title", "date": "YYYY-MM-DD", "start": 1050, "end": 1140 }
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
