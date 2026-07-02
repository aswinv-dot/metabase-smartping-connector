import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://oagsgovnxgiszofgytre.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZ3Nnb3ZueGdpc3pvZmd5dHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MzA1MjgsImV4cCI6MjA5NjEwNjUyOH0.V3eNIE3PXAcMuS3Gv0tBb3kqjVRAI25tSj8ED5W7vmI'
);

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { data, error } = await sb.from('email_drafts').select('*').order('updated_at', { ascending: false });
      if (error) throw error;
      return res.status(200).json({ drafts: data });
    }
    if (req.method === 'POST') {
      const { id, ...body } = req.body;
      if (id) {
        const { error } = await sb.from('email_drafts').update({ ...body, updated_at: new Date().toISOString() }).eq('id', id);
        if (error) throw error;
        return res.status(200).json({ success: true });
      }
      const { data, error } = await sb.from('email_drafts').insert([{ ...body }]).select().single();
      if (error) throw error;
      return res.status(200).json({ draft: data });
    }
    if (req.method === 'DELETE') {
      const { id } = req.query;
      const { error } = await sb.from('email_drafts').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ success: true });
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
