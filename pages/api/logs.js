import { getLogs, getCampaignSummary } from "../../lib/logger";

export default function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { campaign, limit, view } = req.query;

  if (view === "summary") {
    return res.status(200).json({ campaigns: getCampaignSummary() });
  }

  return res.status(200).json({
    logs: getLogs({
      campaign: campaign || null,
      limit:    parseInt(limit || "100"),
    }),
  });
}
