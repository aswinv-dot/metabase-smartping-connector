import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'node21.urmailtechno.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER || 'user_teratern',
    pass: process.env.SMTP_PASS || 'A9fK7M2qL8R5tZ',
  },
  tls: { rejectUnauthorized: false },
});

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    await transporter.verify();
    res.status(200).json({ live: true, message: 'SMTP connection successful' });
  } catch (e) {
    res.status(200).json({ live: false, message: e.message });
  }
}
