// pages/api/campaigns/index.js
import { getCampaigns, saveCampaign } from "../../../lib/supabase";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
  if (req.method==="OPTIONS") return res.status(200).end();

  if (req.method==="GET") {
    const campaigns = await getCampaigns();
    return res.status(200).json({ campaigns });
  }

  if (req.method==="POST") {
    if (!req.body.campaign_name) return res.status(400).json({ error:"campaign_name required" });
    const result = await saveCampaign(req.body);
    return res.status(200).json({ success:true, result });
  }

  return res.status(405).json({ error:"Method not allowed" });
}
