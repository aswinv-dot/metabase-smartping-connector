// pages/api/cron.js
// Simplified — actual cron logic runs on Railway
// This endpoint kept for backward compatibility

export default async function handler(req, res) {
  return res.status(200).json({ 
    message: "Cron logic runs on Railway. Check Railway logs for execution details.",
    railway: "https://railway.com/project/cd977a3b-600f-4101-b514-89ee10e1504c"
  });
}
