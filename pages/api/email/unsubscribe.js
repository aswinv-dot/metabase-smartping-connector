import { createClient } from '@supabase/supabase-js';
const sb = createClient('https://oagsgovnxgiszofgytre.supabase.co','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZ3Nnb3ZueGdpc3pvZmd5dHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MzA1MjgsImV4cCI6MjA5NjEwNjUyOH0.V3eNIE3PXAcMuS3Gv0tBb3kqjVRAI25tSj8ED5W7vmI');

export default async function handler(req, res) {
  const { email } = req.query;
  if (email) {
    await sb.from('email_unsubscribes').upsert([{ email, unsubscribed_at: new Date().toISOString() }]);
  }
  res.setHeader('Content-Type','text/html');
  res.end(`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Unsubscribed</title>
  <style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f0f4fb;margin:0}
  .box{background:#fff;border:1.5px solid #dde6f5;border-radius:12px;padding:40px;text-align:center;max-width:400px}
  h2{color:#00215C;margin-bottom:8px}p{color:#5a7ab5;font-size:14px}</style></head>
  <body><div class="box"><h2>✅ Unsubscribed</h2><p>You've been successfully unsubscribed from TerraTern emails.<br/>You won't receive any further emails from us.</p></div></body></html>`);
}
