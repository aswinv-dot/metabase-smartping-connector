import { createClient } from '@supabase/supabase-js';
const sb = createClient('https://oagsgovnxgiszofgytre.supabase.co','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZ3Nnb3ZueGdpc3pvZmd5dHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MzA1MjgsImV4cCI6MjA5NjEwNjUyOH0.V3eNIE3PXAcMuS3Gv0tBb3kqjVRAI25tSj8ED5W7vmI');

export default async function handler(req, res) {
  const { type, id, url } = req.query;
  if (type === 'open') {
    if (id) await sb.from('email_sends').update({ opened_at: new Date().toISOString() }).eq('id', id).is('opened_at', null);
    const px = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64');
    res.setHeader('Content-Type','image/gif');
    res.setHeader('Cache-Control','no-store');
    return res.end(px);
  }
  if (type === 'click') {
    if (id) await sb.from('email_sends').update({ clicked_at: new Date().toISOString() }).eq('id', id).is('clicked_at', null);
    return res.redirect(302, url || '/');
  }
  res.status(400).json({ error: 'Invalid type' });
}
