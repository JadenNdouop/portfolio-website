// Vercel serverless function — proxies Notion API calls to avoid CORS
// Deploy to: /api/notion.js in your portfolio repo
// Set NOTION_TOKEN in Vercel Dashboard → Project Settings → Environment Variables

const DB_IDS = {
  sw: '8eed05ff81a543b1a4ed38e4d4cd9fbc', // StudyWiser Tasks
  ca: '2d87ac096dc24e92a994b78bd5e111e0', // Career & Applications
  ct: '17950dad121741b9adb4e3e52c3bfdb5', // Content Creation
  gy: '875f4680c53140c98f12d76c2b665b2f', // Gym & Health
};

export default async function handler(req, res) {
  // CORS — allow your own domain only (change to your domain in production)
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { db } = req.query;
  const dbId = DB_IDS[db];

  if (!dbId) {
    return res.status(400).json({ error: `Unknown db key: ${db}` });
  }

  if (!process.env.NOTION_TOKEN) {
    return res.status(500).json({ error: 'NOTION_TOKEN env var not set' });
  }

  try {
    const r = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ page_size: 50 }),
    });

    if (!r.ok) {
      const err = await r.text();
      return res.status(r.status).json({ error: err });
    }

    const data = await r.json();
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
