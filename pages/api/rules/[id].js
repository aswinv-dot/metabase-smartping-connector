// pages/api/rules/[id].js
import { updateRule, deleteRule } from "../../../lib/supabase";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
  if (req.method==="OPTIONS") return res.status(200).end();

  const { id } = req.query;

  if (req.method==="PATCH") {
    const result = await updateRule(id, req.body);
    return res.status(200).json({ rule: result?.[0]||{} });
  }

  if (req.method==="DELETE") {
    await deleteRule(id);
    return res.status(200).json({ deleted:true });
  }

  return res.status(405).json({ error:"Method not allowed" });
}
