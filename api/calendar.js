// Vercel serverless function — proxies iCal URL fetches to avoid CORS
// No env vars needed — just pass ?url=<encoded-ical-url>

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing ?url= parameter' });

  try {
    const decoded = decodeURIComponent(url);
    const r = await fetch(decoded, {
      headers: { 'User-Agent': 'MissionControlDashboard/1.0' },
    });
    if (!r.ok) return res.status(r.status).json({ error: `Upstream error ${r.status}` });
    const ics = await r.text();
    res.setHeader('Content-Type', 'text/calendar');
    return res.status(200).send(ics);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
