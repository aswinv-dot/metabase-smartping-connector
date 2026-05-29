// pages/api/campaigns/[name].js
import { deleteCampaign } from "../../../lib/gas";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
  if (req.method==="OPTIONS") return res.status(200).end();

  if (req.method==="DELETE") {
    const result = await deleteCampaign(req.query.name);
    return res.status(200).json(result);
  }

  return res.status(405).json({ error:"Method not allowed" });
}
