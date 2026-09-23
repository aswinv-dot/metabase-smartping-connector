const METABASE_EMAIL_URL = 'https://metabase.terratern.com/api/public/card/d14792bd-69e5-4d64-b693-1f70153724d0/query/json';
const SUPABASE_URL = 'https://oagsgovnxgiszofgytre.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZ3Nnb3ZueGdpc3pvZmd5dHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MzA1MjgsImV4cCI6MjA5NjEwNjUyOH0.V3eNIE3PXAcMuS3Gv0tBb3kqjVRAI25tSj8ED5W7vmI';
const sbH = { 'Content-Type':'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { stage, search, limit=100, offset=0, all } = req.query;

      // By default, only show contacts from the most recent full sync run
      // (every contact synced together carries the same synced_at stamp —
      // see /api/email/contacts POST and public/contacts.html's syncContacts()).
      // Older rows from a previous query/sync stay in Supabase untouched,
      // just out of view here, unless ?all=true is passed.
      let latestSyncFilter = '';
      if (all !== 'true') {
        const latestUrl = `${SUPABASE_URL}/rest/v1/email_contacts?select=synced_at&order=synced_at.desc.nullslast&limit=1`;
        const lr = await fetch(latestUrl, { headers: sbH });
        const latest = await lr.json();
        const latestSyncedAt = latest?.[0]?.synced_at;
        if (latestSyncedAt) latestSyncFilter = `&synced_at=eq.${encodeURIComponent(latestSyncedAt)}`;
      }

      let url = `${SUPABASE_URL}/rest/v1/email_contacts?select=*&order=created_at.desc&limit=${limit}&offset=${offset}${latestSyncFilter}`;
      if (stage && stage !== 'all') url += `&lead_stage=eq.${encodeURIComponent(stage)}`;
      if (search) url += `&or=(fullname.ilike.*${encodeURIComponent(search)}*,email.ilike.*${encodeURIComponent(search)}*)`;
      const r = await fetch(url, { headers: sbH });
      const data = await r.json();
      const countUrl = `${SUPABASE_URL}/rest/v1/email_contacts?select=count${latestSyncFilter}` + (stage && stage !== 'all' ? `&lead_stage=eq.${encodeURIComponent(stage)}` : '');
      const cr = await fetch(countUrl, { headers: { ...sbH, Prefer: 'count=exact' } });
      const total = cr.headers.get('content-range')?.split('/')?.[1] || 0;
      return res.status(200).json({ contacts: Array.isArray(data) ? data : [], total });
    }

    if (req.method === 'POST') {
      const { contacts, synced_at } = req.body;
      if (!Array.isArray(contacts)) return res.status(400).json({ error: 'contacts array required' });
      // All batches of one sync run should share the exact same synced_at
      // stamp, so the GET above can pick out "everyone from the latest run"
      // with a plain equality check. The caller (contacts.html) generates
      // this once per run and passes it on every batch; fall back to "now"
      // for any older caller that doesn't send one.
      const stamp = synced_at || new Date().toISOString();
      const rows = contacts.map(l => ({
        lead_id: String(l.lead_id || l.id || ''),
        email: l.email || '',
        fullname: l.name || l.fullname || '',
        mobile: l.mobile || '',
        lead_stage: l.lead_stage || '',
        adset: l.utm_adset || l.adset || '',
        latest_utm_campaign: l.latest_utm_campaign || '',
        applications: l.applications || '',
        webinar_booked: l.webinar_booked || 'No',
        webinar_attended: l.webinar_attended || 'No',
        payment: l.payment || 'No',
        created_at: l.created_at || null,
        synced_at: stamp,
      })).filter(r => r.lead_id && r.email);
      await fetch(`${SUPABASE_URL}/rest/v1/email_contacts`, {
        method: 'POST',
        headers: { ...sbH, Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify(rows),
      });
      return res.status(200).json({ success: true, synced: rows.length });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
