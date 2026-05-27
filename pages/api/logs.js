// pages/api/logs.js
import { getLogs, getLogStats, clearLogs } from "../../lib/kv";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") {
    const { campaign, limit, view } = req.query;

    if (view === "summary") {
      const stats = await getLogStats();
      return res.status(200).json({ stats });
    }

    const logs = await getLogs({ campaign: campaign || null, limit: parseInt(limit || "100") });
    const stats = await getLogStats();
    return res.status(200).json({ logs, stats });
  }

  if (req.method === "DELETE") {
    await clearLogs();
    return res.status(200).json({ cleared: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
