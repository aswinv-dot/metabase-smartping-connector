// pages/api/cron.js
import { getAllRules, isDuplicate, markSent, addLog } from "../../lib/kv";

const SMARTPING_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY3NmU5MTQ2ZjJjOGUzMGJlY2FlMDVkYiIsIm5hbWUiOiJUZXJyYXRlcm4iLCJhcHBOYW1lIjoiQWlTZW5zeSIsImNsaWVudElkIjoiNjc2ZTkxNDZmMmM4ZTMwYmVjYWUwNWNlIiwiYWN0aXZlUGxhbiI6IlBST19NT05USExZIiwiaWF0IjoxNzY5Njc2MzQ2fQ.Oj6veBiRUaPtWZ1yaVgTAp-q_JvCfXC8zuU42_T4rM4";
const SMARTPING_URL     = "https://backend.api-wa.co/campaign/smartping/api/v2";
const METABASE_URL      = "https://metabase.terratern.com/api/public/card/7e84f141-e90d-4852-a158-4d6a75bf4833/query/json";

// Template params per campaign
const CAMPAIGN_PARAMS = {
  ghcalum_api: (row) => [
    "1 hour", "15 May", "6PM IST",
    "meet.google.com/ocz-xymg-dgf",
    "storiesbyachu", "0987654"
  ],
};

export default async function handler(req, res) {
  // Vercel cron sends GET with header x-vercel-cron
  // Also allow manual trigger via POST for testing
  const isCron   = req.headers["x-vercel-cron"] === "1";
  const isManual = req.method === "POST" && req.headers["authorization"] === `Bearer ${process.env.WEBHOOK_SECRET}`;

  if (!isCron && !isManual) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  await addLog({ campaign: "cron", status: "success", reason: "cron_started", note: "Daily 1PM IST run started" });

  // 1. Fetch leads from Metabase
  let leads = [];
  try {
    const mbRes = await fetch(METABASE_URL);
    leads = await mbRes.json();
    if (!Array.isArray(leads)) throw new Error("Bad Metabase response");
  } catch (e) {
    await addLog({ campaign: "cron", status: "error", reason: "metabase_fetch_failed", error: e.message });
    return res.status(500).json({ error: "Metabase fetch failed", detail: e.message });
  }

  // 2. Load active rules from KV
  const allRules    = await getAllRules();
  const activeRules = allRules.filter(r => r.active);

  if (!activeRules.length) {
    await addLog({ campaign: "cron", status: "skipped", reason: "no_active_rules" });
    return res.status(200).json({ message: "No active rules" });
  }

  const results = { sent: 0, skipped_dedup: 0, skipped_no_match: 0, failed: 0 };

  // 3. For each lead, find matching rule and send
  for (const row of leads) {
    const phone = normalizePhone(row.phone || row.Phone || row.mobile || row.Mobile || "");
    const name  = row.fullname || row.name || row.Name || "User";

    if (!phone) { results.skipped_no_match++; continue; }

    // Find first active rule that matches
    const matchedRule = activeRules.find(rule => applyFilters([row], rule.filters).length > 0);
    if (!matchedRule) { results.skipped_no_match++; continue; }

    // Dedup — skip if sent in last 24h
    const alreadySent = await isDuplicate(phone, matchedRule.campaign, 24);
    if (alreadySent) {
      results.skipped_dedup++;
      await addLog({ campaign: matchedRule.campaign, rule: matchedRule.name, phone, status: "skipped", reason: "dedup" });
      continue;
    }

    // Build payload
    const paramsFn      = CAMPAIGN_PARAMS[matchedRule.campaign];
    const templateParams = paramsFn ? paramsFn(row) : [];

    const payload = {
      apiKey:       SMARTPING_API_KEY,
      campaignName: matchedRule.campaign,
      destination:  phone,
      userName:     name,
      templateParams,
      source:       "cron-1pm",
      media:        {},
      buttons:      [],
      carouselCards:[],
      location:     {},
      attributes:   {},
      paramsFallbackValue: { FirstName: "user" },
    };

    try {
      const response = await fetch(SMARTPING_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });

      if (response.ok) {
        await markSent(phone, matchedRule.campaign);
        await addLog({ campaign: matchedRule.campaign, rule: matchedRule.name, phone, name, status: "success", source: "cron" });
        results.sent++;
      } else {
        const data = await response.json().catch(() => ({}));
        await addLog({ campaign: matchedRule.campaign, rule: matchedRule.name, phone, status: "error", http_status: response.status, response: JSON.stringify(data).slice(0, 200) });
        results.failed++;
      }
    } catch (e) {
      await addLog({ campaign: matchedRule.campaign, rule: matchedRule.name, phone, status: "error", error: e.message });
      results.failed++;
    }
  }

  await addLog({ campaign: "cron", status: "success", reason: "cron_completed", ...results });
  return res.status(200).json({ success: true, leads_total: leads.length, ...results });
}

// ── FILTER ENGINE ─────────────────────────────────────────────
function applyFilters(rows, filterList) {
  if (!filterList?.length) return rows;
  return rows.filter(lead => {
    let result = evalFilter(lead, filterList[0]);
    for (let i = 1; i < filterList.length; i++) {
      const test = evalFilter(lead, filterList[i]);
      result = filterList[i].logic === "OR" ? result || test : result && test;
    }
    return result;
  });
}

function evalFilter(lead, f) {
  const raw  = lead[f.field];
  const cell = String(raw ?? "").toLowerCase().trim();
  const val  = String(f.val ?? "").toLowerCase().trim();
  switch (f.op) {
    case "is":           return cell === val;
    case "is_not":       return cell !== val;
    case "contains":     return cell.includes(val);
    case "not_contains": return !cell.includes(val);
    case "has_value":    return raw !== null && raw !== undefined && String(raw).trim() !== "";
    case "is_empty":     return raw === null || raw === undefined || String(raw).trim() === "";
    default:             return true;
  }
}

function normalizePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 10)                            return "91" + digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length === 11 && digits.startsWith("0"))  return "91" + digits.slice(1);
  if (digits.length > 6)                               return digits;
  return null;
}
