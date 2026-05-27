import { addLog } from "../../lib/logger";

const SMARTPING_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY3NmU5MTQ2ZjJjOGUzMGJlY2FlMDVkYiIsIm5hbWUiOiJUZXJyYXRlcm4iLCJhcHBOYW1lIjoiQWlTZW5zeSIsImNsaWVudElkIjoiNjc2ZTkxNDZmMmM4ZTMwYmVjYWUwNWNlIiwiYWN0aXZlUGxhbiI6IlBST19NT05USExZIiwiaWF0IjoxNzY5Njc2MzQ2fQ.Oj6veBiRUaPtWZ1yaVgTAp-q_JvCfXC8zuU42_T4rM4";
const SMARTPING_API_URL = "https://backend.aisensy.com/campaign/t1/api/v2";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = req.headers["authorization"] || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (token !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const campaign = req.query.campaign || req.body?.campaign || "unknown";
  const templateName = req.query.template || req.body?.template || "";
  const rows = extractRows(req.body);

  if (!rows.length) {
    return res.status(400).json({ error: "No data found" });
  }

  const results = [];

  for (const row of rows) {
    const phone = normalizePhone(row.phone || row.Phone || row.mobile || row.Mobile || row.whatsapp || "");
    const name  = row.name || row.Name || row.full_name || "";

    if (!phone) {
      addLog({ campaign, status: "skipped", reason: "no_phone", raw: JSON.stringify(row).slice(0, 100) });
      results.push({ skipped: true, reason: "no_phone" });
      continue;
    }

    // Build AiSensy campaign send payload
    const payload = {
      apiKey:       SMARTPING_API_KEY,
      campaignName: templateName || campaign,
      destination:  phone,
      userName:     name,
      templateParams: buildTemplateParams(row),
      source:       "metabase-webhook",
      media:        {},
      buttons:      [],
      carouselCards:[],
      location:     {},
    };

    try {
      const response = await fetch(SMARTPING_API_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      addLog({
        campaign,
        template: templateName || campaign,
        phone,
        name,
        status:      response.ok ? "success" : "error",
        http_status: response.status,
        response:    JSON.stringify(data).slice(0, 200),
      });

      results.push({ success: response.ok, phone, status: response.status, data });

    } catch (err) {
      addLog({ campaign, phone, status: "error", error: err.message });
      results.push({ success: false, phone, error: err.message });
    }
  }

  return res.status(200).json({ processed: results.length, results });
}

// Normalize to 91XXXXXXXXXX format
function normalizePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 10) return "91" + digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length === 11 && digits.startsWith("0")) return "91" + digits.slice(1);
  if (digits.length > 6) return digits;
  return null;
}

// Pass all remaining row fields as ordered template params array
function buildTemplateParams(row) {
  const skip = new Set(["phone","Phone","mobile","Mobile","whatsapp","name","Name","full_name","email","Email","campaign","template"]);
  return Object.entries(row)
    .filter(([k]) => !skip.has(k))
    .map(([, v]) => String(v ?? ""));
}

function extractRows(body) {
  if (body?.data?.rows && body?.data?.cols) {
    const cols = body.data.cols.map(c => c.name);
    return body.data.rows.map(row =>
      Object.fromEntries(cols.map((col, i) => [col, row[i]]))
    );
  }
  if (Array.isArray(body)) return body;
  if (typeof body === "object" && body !== null) return [body];
  return [];
}
