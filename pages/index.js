// pages/api/rules/index.js
import { getAllRules, saveRule } from "../../../lib/supabase";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
  if (req.method==="OPTIONS") return res.status(200).end();

  if (req.method==="GET") {
    const rules = await getAllRules();
    return res.status(200).json({ rules });
  }

  if (req.method==="POST") {
    const body = req.body;
    if (!body.name||!body.campaign) return res.status(400).json({ error:"name and campaign required" });
    const rule = {
      id:           body.id||Date.now().toString(36),
      name:         body.name,
      campaign:     body.campaign,
      filters_json: body.filters||body.filters_json||[],
      batch_size:   body.batch_size||500,
      active:       body.active!==false,
    };
    const saved = await saveRule(rule);
    return res.status(200).json({ rule: saved?.[0]||rule });
  }

  return res.status(405).json({ error:"Method not allowed" });
}
