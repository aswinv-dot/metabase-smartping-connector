import { getAllRules, saveRule } from "../../../lib/kv";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") {
    const rules = await getAllRules();
    return res.status(200).json({ rules });
  }

  if (req.method === "POST") {
    const body = req.body;
    if (!body.name || !body.campaign || !body.filters?.length) {
      return res.status(400).json({ error: "name, campaign and filters are required" });
    }
    const rule = {
      id:         body.id || Date.now().toString(36),
      name:       body.name,
      campaign:   body.campaign,
      filters:    body.filters,
      active:     body.active !== undefined ? body.active : true,
      created_at: body.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const saved = await saveRule(rule);
    return res.status(200).json({ rule: saved });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
