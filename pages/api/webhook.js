// pages/api/webhook.js
import { getAllRules, isDuplicate, markSent, addLog } from "../../lib/kv";

const SMARTPING_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY3NmU5MTQ2ZjJjOGUzMGJlY2FlMDVkYiIsIm5hbWUiOiJUZXJyYXRlcm4iLCJhcHBOYW1lIjoiQWlTZW5zeSIsImNsaWVudElkIjoiNjc2ZTkxNDZmMmM4ZTMwYmVjYWUwNWNlIiwiYWN0aXZlUGxhbiI6IlBST19NT05USExZIiwiaWF0IjoxNzY5Njc2MzQ2fQ.Oj6veBiRUaPtWZ1yaVgTAp-q_JvCfXC8zuU42_T4rM4";
const SMARTPING_URL    = "https://backend.api-wa.co/campaign/smartping/api/v2";

// Template params per campaign — add more campaigns here
const CAMPAIGN_PARAMS = {
  ghcalum_api: (row) => [
    "1 hour", "15 May", "6PM IST",
    "meet.google.com/ocz-xymg-dgf",
    "storiesbyachu", "0987654"
  ],
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const auth  = req.headers["authorization"] || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (token !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const rows = extractRows(req.body);
  if (!rows.length) return res.status(400).json({ error: "No data found" });

  // Load all active rules from KV
  const allRules   = await getAllRules();
  const activeRules = allRules.filter(r => r.active);

  if (!activeRules.length) {
    return res.status(200).json({ message: "No active rules — nothing sent" });
  }

  const results = [];

  for (const row of rows) {
    const phone = normalizePhone(row.phone || row.Phone || row.mobile || row.Mobile || "");
    const name  = row.fullname || row.name || row.Name || "User";

    if (!phone) {
      await addLog({ campaign: "webhook", status: "skipped", reason: "no_phone" });
      results.push({ skipped: true, reason: "no_phone" });
      continue;
    }

    // Find first active rule that matches this row
    const matchedRule = activeRules.find(rule => applyFilters([row], rule.filters).length > 0);

    if (!matchedRule) {
      results.push({ skipped: true, phone, reason: "no_rule_match" });
      continue;
    }

    // Dedup check — skip if already sent for this campaign in last 24h
    const alreadySent = await isDuplicate(phone, matchedRule.campaign, 24);
    if (alreadySent) {
      await addLog({ campaign: matchedRule.campaign, rule: matchedRule.name, phone, status: "skipped", reason: "dedup" });
      results.push({ skipped: true, phone, reason: "dedup" });
      continue;
    }

    // Build template params
    const paramsFn = CAMPAIGN_PARAMS[matchedRule.campaign];
    const templateParams = paramsFn ? paramsFn(row) : [];

    const payload = {
      apiKey:       SMARTPING_API_KEY,
      campaignName: matchedRule.campaign,
      destination:  phone,
      userName:     name,
      templateParams,
      source:       "metabase-webhook",
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

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        await markSent(phone, matchedRule.campaign);
        await addLog({ campaign: matchedRule.campaign, rule: matchedRule.name, phone, name, status: "success", http_status: response.status });
        results.push({ success: true, phone, campaign: matchedRule.campaign, rule: matchedRule.name });
      } else {
        await addLog({ campaign: matchedRule.campaign, rule: matchedRule.name, phone, status: "error", http_status: response.status, response: JSON.stringify(data).slice(0, 200) });
        results.push({ success: false, phone, error: JSON.stringify(data) });
      }

    } catch (err) {
      await addLog({ campaign: matchedRule.campaign, rule: matchedRule.name, phone, status: "error", error: err.message });
      results.push({ success: false, phone, error: err.message });
    }
  }

  return res.status(200).json({ processed: results.length, results });
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
  if (digits.length === 10)                          return "91" + digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length === 11 && digits.startsWith("0")) return "91" + digits.slice(1);
  if (digits.length > 6)                             return digits;
  return null;
}

function extractRows(body) {
  if (body?.data?.rows && body?.data?.cols) {
    const cols = body.data.cols.map(c => c.name);
    return body.data.rows.map(row => Object.fromEntries(cols.map((col, i) => [col, row[i]])));
  }
  if (Array.isArray(body)) return body;
  if (typeof body === "object" && body !== null) return [body];
  return [];
}
