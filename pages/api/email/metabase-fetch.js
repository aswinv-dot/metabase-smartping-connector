const METABASE_EMAIL_URL = 'https://metabase.terratern.com/api/public/card/d14792bd-69e5-4d64-b693-1f70153724d0/query/json';

export default async function handler(req, res) {
  try {
    const r = await fetch(METABASE_EMAIL_URL, { headers: { 'Accept-Encoding': 'identity' } });
    const data = await r.json();
    res.status(200).json(Array.isArray(data) ? data : []);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
