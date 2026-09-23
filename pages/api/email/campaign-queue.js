import { createClient } from '@supabase/supabase-js';
const sb = createClient(
  'https://oagsgovnxgiszofgytre.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZ3Nnb3ZueGdpc3pvZmd5dHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MzA1MjgsImV4cCI6MjA5NjEwNjUyOH0.V3eNIE3PXAcMuS3Gv0tBb3kqjVRAI25tSj8ED5W7vmI'
);

// Queues a campaign for background sending by the Railway worker.
// Resolves the contact list ONCE here, writes it into email_campaigns,
// and returns immediately — no SMTP work happens in this request.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { draft_id, stage, test_emails, batch_size } = req.body;
    if (!draft_id) return res.status(400).json({ error: 'draft_id required' });

    const { data: draft, error: dErr } = await sb.from('email_drafts').select('id').eq('id', draft_id).single();
    if (dErr || !draft) throw new Error('Draft not found');

    const isTest = !!(test_emails?.length);
    let contacts;
    if (isTest) {
      contacts = test_emails.map(email => ({ email, fullname: 'Test User', mobile: '9876543210' }));
    } else {
      // A plain .select() caps out at Supabase/PostgREST's default row
      // limit (1000) regardless of how many contacts actually match —
      // confirmed live: every past "all"/broad-stage campaign topped out
      // at exactly 1000 total, silently, even when the real audience was
      // bigger. Page through in chunks of 1000 until a page comes back
      // short, so the full matching audience is queued, not just the
      // first 1000 rows.
      const PAGE = 1000;
      contacts = [];
      for (let from = 0; ; from += PAGE) {
        let query = sb.from('email_contacts').select('fullname,email,mobile')
          .not('email', 'is', null).neq('email', '')
          .range(from, from + PAGE - 1);
        if (stage && stage !== 'all') query = query.eq('lead_stage', stage);
        const { data, error: cErr } = await query;
        if (cErr) throw cErr;
        contacts.push(...(data || []));
        if (!data || data.length < PAGE) break;
      }
    }

    if (!contacts.length) return res.status(200).json({ success: true, empty: true, message: 'No contacts found' });

    const { data: campaign, error: iErr } = await sb.from('email_campaigns').insert([{
      draft_id,
      stage: stage || null,
      status: 'queued',
      contacts,
      total: contacts.length,
      batch_size: batch_size || 50,
    }]).select().single();
    if (iErr) throw iErr;

    return res.status(200).json({ success: true, campaign_id: campaign.id, total: contacts.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
