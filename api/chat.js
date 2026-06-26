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

  const { message, today, time, dayOfWeek, userEvents = [], calendarEvents = [], templates = [], tasks = [], habits = [] } = req.body;

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

  const fmtList = (arr, key) => arr.length === 0 ? 'None' : arr.map(x => `- ${x[key]}`).join('\n');

  const system = `You are a smart personal assistant embedded in a dashboard called Ora. You manage a calendar, a task list, and habit tracker.

Today is ${dayOfWeek}, ${today}. Current time is ${time}.

SYNCED CALENDAR EVENTS (read-only context):
${fmtEv(calendarEvents)}

USER'S CALENDAR EVENTS:
${fmtEv(userEvents)}

USER'S TASK LIST:
${fmtList(tasks, 'title')}

USER'S HABITS:
${fmtList(habits, 'name')}

USER'S SAVED EVENT TEMPLATES:
${fmtTemplates}
When the user says something that matches a template trigger (e.g. "gym", "study block"), ALWAYS use the saved title and category from the template. Use the saved duration unless the user specifies a different one.

The user can ask you to:
1. Add calendar EVENTS (things with a specific time/date)
2. Add TASKS (to-do items without a specific time — "remind me to...", "add task...", "I need to...", "don't let me forget...")
3. Add HABITS (recurring behaviors to track — "track habit...", "add habit...", "I want to start...")
4. Any combination of the above in one message

Rules for calendar events:
- start and end are minutes from midnight. 6:00 AM = 360, 9:00 AM = 540, 12:00 PM = 720, 3:00 PM = 900, 6:00 PM = 1080
- cat must be one of: work, gym, personal, social, study
- If no time given, find a free gap in the existing schedule
- Do NOT re-add events already in the calendar
- PAST TIME CHECK: If asked to schedule something today at an already-passed time, set events to [] and flag it in "message"
- MOVE/RESCHEDULE: Put in "moves" (not "events"), use the exact existing title

Rules for tasks:
- Extract MULTIPLE tasks if the user lists several (e.g. "add tasks: buy milk, call dentist, pay rent" → 3 tasks)
- Tasks that sound like reminders count: "remind me to email Sarah" → task
- Do NOT duplicate tasks already in the task list

Rules for habits:
- Extract MULTIPLE habits if listed
- Do NOT duplicate habits already in the habit list

Respond ONLY with valid JSON, no prose outside the JSON:
{
  "message": "Short friendly confirmation (1-2 sentences)",
  "events": [
    { "title": "Event name", "date": "YYYY-MM-DD", "start": 900, "end": 990, "cat": "gym" }
  ],
  "moves": [
    { "title": "Existing event title", "date": "YYYY-MM-DD", "start": 1050, "end": 1140 }
  ],
  "tasks": [
    { "title": "Task title" }
  ],
  "habits": [
    { "name": "Habit name" }
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
