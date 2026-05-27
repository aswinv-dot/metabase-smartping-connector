// pages/api/rules/[id].js
import { getRule, updateRule, deleteRule } from "../../../lib/kv";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { id } = req.query;

  if (req.method === "GET") {
    const rule = await getRule(id);
    if (!rule) return res.status(404).json({ error: "Rule not found" });
    return res.status(200).json({ rule });
  }

  if (req.method === "PATCH") {
    const rule = await updateRule(id, req.body);
    if (!rule) return res.status(404).json({ error: "Rule not found" });
    return res.status(200).json({ rule });
  }

  if (req.method === "DELETE") {
    await deleteRule(id);
    return res.status(200).json({ deleted: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
