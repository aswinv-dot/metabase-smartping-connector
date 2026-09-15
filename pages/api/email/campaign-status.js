import { createClient } from '@supabase/supabase-js';
const sb = createClient(
  'https://oagsgovnxgiszofgytre.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZ3Nnb3ZueGdpc3pvZmd5dHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MzA1MjgsImV4cCI6MjA5NjEwNjUyOH0.V3eNIE3PXAcMuS3Gv0tBb3kqjVRAI25tSj8ED5W7vmI'
);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    const { data, error } = await sb
      .from('email_campaigns')
      .select('id,status,total,sent,failed,skipped,already_sent,cursor,error,updated_at')
      .eq('id', id)
      .single();
    if (error) throw error;
    return res.status(200).json({ campaign: data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
