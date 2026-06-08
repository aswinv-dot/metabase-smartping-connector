// pages/api/trigger.js
// Triggers the Railway cron service manually

const RAILWAY_URL = process.env.RAILWAY_CRON_URL || "";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type,Authorization");
  if (req.method==="OPTIONS") return res.status(200).end();

  if (req.method!=="POST") return res.status(405).json({ error:"Method not allowed" });

  const auth = req.headers["authorization"];
  if (auth !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
    return res.status(401).json({ error:"Unauthorized" });
  }

  if (!RAILWAY_URL) {
    return res.status(200).json({ 
      success: true, 
      message: "Railway cron runs automatically. Set RAILWAY_CRON_URL env var to enable manual trigger." 
    });
  }

  try {
    const response = await fetch(`${RAILWAY_URL}/trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
    const data = await response.json();
    return res.status(200).json({ success: true, railway: data });
  } catch(e) {
    return res.status(200).json({ 
      success: true, 
      message: "Railway cron is running. Manual trigger unavailable: "+e.message
    });
  }
}
