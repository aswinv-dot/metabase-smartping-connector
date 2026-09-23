import { createClient } from '@supabase/supabase-js';
const sb = createClient(
  'https://oagsgovnxgiszofgytre.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZ3Nnb3ZueGdpc3pvZmd5dHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MzA1MjgsImV4cCI6MjA5NjEwNjUyOH0.V3eNIE3PXAcMuS3Gv0tBb3kqjVRAI25tSj8ED5W7vmI'
);

// Pause / resume / stop a campaign that's queued or already sending.
// The Railway worker only ever picks up rows with status 'queued' or
// 'sending' (see cron/index.js), so setting status to 'paused' or
// 'stopped' here is enough on its own to make the worker skip it on its
// next tick — no separate signal needed. A campaign already mid-batch
// checks its own status every 10 sends and will stop within a few
// seconds rather than only between batches.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { id, action } = req.body;
    if (!id || !['pause', 'resume', 'stop'].includes(action)) {
      return res.status(400).json({ error: "id and action ('pause'|'resume'|'stop') required" });
    }

    const { data: campaign, error } = await sb.from('email_campaigns')
      .select('status,cursor').eq('id', id).single();
    if (error || !campaign) return res.status(404).json({ error: 'Campaign not found' });

    let newStatus;
    if (action === 'pause') {
      if (!['queued', 'sending'].includes(campaign.status)) {
        return res.status(400).json({ error: `Cannot pause a campaign that is ${campaign.status}` });
      }
      newStatus = 'paused';
    } else if (action === 'resume') {
      if (campaign.status !== 'paused') {
        return res.status(400).json({ error: `Cannot resume a campaign that is ${campaign.status}` });
      }
      newStatus = campaign.cursor > 0 ? 'sending' : 'queued';
    } else {
      if (['done', 'stopped'].includes(campaign.status)) {
        return res.status(400).json({ error: `Campaign already ${campaign.status}` });
      }
      newStatus = 'stopped';
    }

    const { error: uErr } = await sb.from('email_campaigns')
      .update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', id);
    if (uErr) throw uErr;

    return res.status(200).json({ success: true, status: newStatus });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
