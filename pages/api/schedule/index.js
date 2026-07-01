// pages/api/schedule/index.js
import { getSchedules, saveSchedule } from "../../../lib/supabase";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
  if (req.method==="OPTIONS") return res.status(200).end();

  try {
    if (req.method==="GET") {
      const schedules = await getSchedules();
      return res.status(200).json({ schedules });
    }

    if (req.method==="POST") {
      const body = req.body;
      if (!body) return res.status(400).json({ error:"Empty request body" });
      if (!body.name||!body.start_date||!body.r1_campaign||!body.r2_campaign||!body.r3_campaign) {
        return res.status(400).json({ error:"Missing required fields", received: Object.keys(body||{}) });
      }
      const result = await saveSchedule(body);
      return res.status(200).json({ success:true, result });
    }

    return res.status(405).json({ error:"Method not allowed" });

  } catch(e) {
    console.error("[api/schedule]", e.message);
    return res.status(500).json({ error: e.message });
  }
}
