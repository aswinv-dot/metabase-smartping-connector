// pages/api/campaigns/[name].js
import { deleteCampaign, updateCampaign } from "../../../lib/supabase";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
  if (req.method==="OPTIONS") return res.status(200).end();

  const { name } = req.query;

  try {
    if (req.method==="PATCH") {
      const result = await updateCampaign(name, req.body);
      return res.status(200).json({ success:true, result });
    }

    if (req.method==="DELETE") {
      await deleteCampaign(name);
      return res.status(200).json({ deleted:true });
    }

    return res.status(405).json({ error:"Method not allowed" });

  } catch(e) {
    console.error("[api/campaigns/name]", e.message);
    return res.status(500).json({ error: e.message });
  }
}
