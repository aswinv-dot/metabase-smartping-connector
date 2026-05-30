// pages/api/cron.js
import { getAllRules, getCampaigns, addLog } from "../../lib/gas";

const SMARTPING_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY3NmU5MTQ2ZjJjOGUzMGJlY2FlMDVkYiIsIm5hbWUiOiJUZXJyYXRlcm4iLCJhcHBOYW1lIjoiQWlTZW5zeSIsImNsaWVudElkIjoiNjc2ZTkxNDZmMmM4ZTMwYmVjYWUwNWNlIiwiYWN0aXZlUGxhbiI6IlBST19NT05USExZIiwiaWF0IjoxNzY5Njc2MzQ2fQ.Oj6veBiRUaPtWZ1yaVgTAp-q_JvCfXC8zuU42_T4rM4";
const SMARTPING_URL     = "https://backend.api-wa.co/campaign/smartping/api/v2";
const METABASE_URL      = "https://metabase.terratern.com/api/public/card/7e84f141-e90d-4852-a158-4d6a75bf4833/query/json";
const GAS_URL           = "https://script.google.com/macros/s/AKfycbwcMrKyCyop7YYWmr6Rm8XaRXj_V2Li7uVPCAMAhYWibjdcIHqrrYYhbBwRSzk1FwGP/exec";

const DYNAMIC_PARAMS = {
  ghc_mkt02_api: (row) => [
    firstName(row.fullname),
    "+917094956963",
    row.bde || "Shreya Pandey"
  ],
};

function firstName(full) {
  return String(full||"there").trim().split(/\s+/)[0];
}

export default async function handler(req, res) {
  const isCron   = req.headers["x-vercel-cron"] === "1";
  const isManual = req.method === "POST" &&
    req.headers["authorization"] === `Bearer ${process.env.WEBHOOK_SECRET}`;
  if (!isCron && !isManual) return res.status(401).json({ error:"Unauthorized" });

  const startTime = Date.now();

  // ── STEP 1: Load everything in parallel (3 calls total) ──────
  let leads=[], activeRules=[], campaignMap={}, dedupSet=new Set();

  try {
    const [mbRes, rulesData, campsData, dedupData] = await Promise.all([
      fetch(METABASE_URL),
      getAllRules(),
      getCampaigns(),
      gasGetDedup(),
    ]);

    leads = await mbRes.json();
    if (!Array.isArray(leads)) throw new Error("Bad Metabase response");

    activeRules = rulesData.filter(r => r.active===true || r.active==="TRUE");
    campsData.filter(c=>c.active).forEach(c => campaignMap[c.campaign_name]=c);

    // build dedup set in memory: "phone|campaign" → sentAt timestamp
    dedupData.forEach(row => {
      if (row.phone && row.campaign && row.sent_at) {
        const key = `${row.phone}|${row.campaign}`;
        const existing = dedupSet[key];
        if (!existing || new Date(row.sent_at) > new Date(existing)) {
          dedupSet[key] = row.sent_at;
        }
      }
    });

  } catch(e) {
    await addLog({ campaign:"cron", status:"error", note:"Init failed: "+e.message });
    return res.status(500).json({ error: e.message });
  }

  if (!activeRules.length) {
    await addLog({ campaign:"cron", status:"skipped", note:"No active rules" });
    return res.status(200).json({ message:"No active rules" });
  }

  // ── STEP 2: Process all leads in memory ───────────────────────
  const results     = { sent:0, skipped_dedup:0, skipped_no_match:0, failed:0 };
  const newLogs     = [];
  const newDedup    = [];
  const now         = Date.now();
  const dedupWindow = 24 * 60 * 60 * 1000; // 24h

  // Send all matched leads via Smartping (parallel batches of 10)
  const toSend = [];

  for (const row of leads) {
    const phone = normalizePhone(row.mobile||"");
    const name  = row.fullname||"User";
    if (!phone) { results.skipped_no_match++; continue; }

    const matchedRule = activeRules.find(rule => {
      const filters = Array.isArray(rule.filters_json) ? rule.filters_json :
                      Array.isArray(rule.filters) ? rule.filters : [];
      return applyFilters([row], filters).length > 0;
    });
    if (!matchedRule) { results.skipped_no_match++; continue; }

    const campaign = campaignMap[matchedRule.campaign];
    if (!campaign) {
      newLogs.push({ campaign:matchedRule.campaign, status:"error", note:"Campaign not in sheet", phone });
      results.failed++; continue;
    }

    // dedup check in memory
    const dedupKey  = `${phone}|${matchedRule.campaign}`;
    const lastSent  = dedupSet[dedupKey];
    if (lastSent && (now - new Date(lastSent).getTime()) < dedupWindow) {
      results.skipped_dedup++;
      newLogs.push({ campaign:matchedRule.campaign, rule:matchedRule.name, phone, status:"skipped", note:"dedup" });
      continue;
    }

    const dynamicFn       = DYNAMIC_PARAMS[matchedRule.campaign];
    const templateParams  = dynamicFn
      ? dynamicFn(row)
      : (campaign.template_params||[]);

    toSend.push({ row, phone, name, matchedRule, campaign, templateParams });
  }

  // ── STEP 3: Send in batches of 10 (parallel) ──────────────────
  const BATCH = 10;
  for (let i=0; i<toSend.length; i+=BATCH) {
    const batch = toSend.slice(i, i+BATCH);
    await Promise.all(batch.map(async ({row, phone, name, matchedRule, campaign, templateParams}) => {
      const payload = {
        apiKey:       SMARTPING_API_KEY,
        campaignName: matchedRule.campaign,
        destination:  phone,
        userName:     name,
        templateParams,
        source:       "cron-auto",
        media:        campaign.media_url ? {url:campaign.media_url, filename:"media"} : {},
        buttons:[], carouselCards:[], location:{}, attributes:{},
        paramsFallbackValue: { FirstName: firstName(row.fullname) },
      };
      try {
        const response = await fetch(SMARTPING_URL, {
          method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload)
        });
        if (response.ok) {
          results.sent++;
          newLogs.push({ campaign:matchedRule.campaign, rule:matchedRule.name, phone, name, status:"success", note:"sent" });
          newDedup.push({ phone, campaign:matchedRule.campaign, sent_at:new Date().toISOString() });
        } else {
          const data = await response.json().catch(()=>({}));
          results.failed++;
          newLogs.push({ campaign:matchedRule.campaign, rule:matchedRule.name, phone, status:"error", note:JSON.stringify(data).slice(0,200) });
        }
      } catch(e) {
        results.failed++;
        newLogs.push({ campaign:matchedRule.campaign, rule:matchedRule.name, phone, status:"error", note:e.message });
      }
    }));
  }

  // ── STEP 4: Write all logs + dedup in 2 batch calls ───────────
  const duration = Math.round((Date.now()-startTime)/1000);
  newLogs.push({
    campaign:"cron", status:"success",
    note:`Done in ${duration}s: sent=${results.sent} dedup=${results.skipped_dedup} no_match=${results.skipped_no_match} failed=${results.failed}`
  });

  // write logs and dedup in parallel
  await Promise.all([
    gasBatchLogs(newLogs),
    newDedup.length ? gasBatchDedup(newDedup) : Promise.resolve(),
  ]);

  return res.status(200).json({
    success:true, leads_total:leads.length, duration_seconds:duration, ...results
  });
}

// ── BATCH GAS WRITERS ─────────────────────────────────────────
async function gasGetDedup() {
  try {
    const res  = await fetch(`${GAS_URL}?action=getAllDedup`);
    const data = await res.json();
    return data.rows || [];
  } catch(e) { return []; }
}

async function gasBatchLogs(logs) {
  if (!logs.length) return;
  try {
    await fetch(GAS_URL, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ action:"batchAddLogs", logs })
    });
  } catch(e) { console.error("gasBatchLogs failed:", e.message); }
}

async function gasBatchDedup(entries) {
  if (!entries.length) return;
  try {
    await fetch(GAS_URL, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ action:"batchMarkSent", entries })
    });
  } catch(e) { console.error("gasBatchDedup failed:", e.message); }
}

// ── FILTER ENGINE ─────────────────────────────────────────────
function applyFilters(rows, filterList) {
  if (!filterList?.length) return rows;
  return rows.filter(lead => {
    let result = evalFilter(lead, filterList[0]);
    for (let i=1; i<filterList.length; i++) {
      const test = evalFilter(lead, filterList[i]);
      result = filterList[i].logic==="OR" ? result||test : result&&test;
    }
    return result;
  });
}

function evalFilter(lead, f) {
  const raw  = lead[f.field];
  const cell = String(raw??"").toLowerCase().trim();
  const val  = String(f.val??"").toLowerCase().trim();
  if (f.op==="date_after"||f.op==="date_before"||f.op==="date_between") {
    const d = raw ? new Date(raw) : null;
    if (!d||isNaN(d)) return false;
    if (f.op==="date_after")  return d >= new Date(f.val);
    if (f.op==="date_before") return d <= new Date(f.val+"T23:59:59");
    if (f.op==="date_between") {
      const [from,to]=(f.val||"").split("|");
      return (!from||d>=new Date(from))&&(!to||d<=new Date(to+"T23:59:59"));
    }
  }
  switch(f.op) {
    case "is":           return cell===val;
    case "is_not":       return cell!==val;
    case "contains":     return cell.includes(val);
    case "not_contains": return !cell.includes(val);
    case "has_value":    return raw!==null&&raw!==undefined&&String(raw).trim()!=="";
    case "is_empty":     return raw===null||raw===undefined||String(raw).trim()==="";
    default:             return true;
  }
}

function normalizePhone(raw) {
  if (!raw) return null;
  const d = String(raw).replace(/\D/g,"");
  if (d.length===10)                      return "91"+d;
  if (d.length===12&&d.startsWith("91")) return d;
  if (d.length===11&&d.startsWith("0"))  return "91"+d.slice(1);
  if (d.length>6)                        return d;
  return null;
}
