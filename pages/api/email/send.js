import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://oagsgovnxgiszofgytre.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZ3Nnb3ZueGdpc3pvZmd5dHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MzA1MjgsImV4cCI6MjA5NjEwNjUyOH0.V3eNIE3PXAcMuS3Gv0tBb3kqjVRAI25tSj8ED5W7vmI'
);

const transporter = nodemailer.createTransport({
  host: 'node21.urmailtechno.com',
  port: 587,
  secure: false,
  auth: { user: 'user_teratern', pass: process.env.SMTP_PASS || 'A9fK7M2qL8R5tZ' },
  tls: { rejectUnauthorized: false },
});

function resolveTokens(html, contact) {
  return html
    .replace(/\{\{name\}\}/g, contact.fullname || '')
    .replace(/\{\{email\}\}/g, contact.email || '')
    .replace(/\{\{mobile\}\}/g, contact.mobile || '');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { draft_id, stage, test_emails } = req.body;
    if (!draft_id) return res.status(400).json({ error: 'draft_id required' });

    // Fetch draft
    const { data: draft, error: dErr } = await sb.from('email_drafts').select('*').eq('id', draft_id).single();
    if (dErr || !draft) throw new Error('Draft not found');

    // Test mode — send only to specified emails
    let contacts;
    if (test_emails?.length) {
      contacts = test_emails.map(email => ({ email, fullname: 'Test User', mobile: '9876543210' }));
    } else {
      let query = sb.from('email_contacts').select('fullname,email,mobile').not('email','is',null).neq('email','');
      if (stage && stage !== 'all') query = query.eq('lead_stage', stage);
      const { data, error: cErr } = await query;
      if (cErr) throw cErr;
      contacts = data;
    }
    if (!contacts?.length) return res.status(200).json({ success: true, sent: 0, failed: 0, message: 'No contacts found' });

    const from = `${draft.from_name} <user_teratern@${draft.domain}>`;
    let sent = 0, failed = 0;
    const logs = [];

    for (const c of contacts) {
      try {
        const sendId = `${draft_id}_${c.email}_${Date.now()}`;
        const baseUrl = 'https://metabase-smartping-connector.vercel.app';
        let html = resolveTokens(draft.body, c);
        // Wrap links with click tracker
        html = html.replace(/href="(https?:\/\/[^"]+)"/g, (_, u) =>
          `href="${baseUrl}/api/email/track?type=click&id=${encodeURIComponent(sendId)}&url=${encodeURIComponent(u)}"`
        );
        // Append tracking pixel
        html += `<img src="${baseUrl}/api/email/track?type=open&id=${encodeURIComponent(sendId)}" width="1" height="1" style="display:none"/>`;
        html += `<br/><hr/><p style="font-size:11px;color:#999">You're receiving this email because you opted in. <a href="#">Unsubscribe</a></p>`;
        await transporter.sendMail({
          from, to: c.email,
          subject: draft.subject,
          html,
          headers: { 'X-Preview-Text': draft.preview_text || '' }
        });
        logs.push({ id: sendId, draft_id, email: c.email, status: 'sent' });
        sent++;
      } catch(e) {
        logs.push({ id: `${draft_id}_${c.email}_err`, draft_id, email: c.email, status: 'failed' });
        failed++;
      }
    }

    // Log to email_sends
    if (logs.length) await sb.from('email_sends').insert(logs);
    return res.status(200).json({ success: true, sent, failed, total: contacts.length });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
