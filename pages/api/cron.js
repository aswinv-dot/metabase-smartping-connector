// pages/api/cron.js
import { getAllRules, getCampaigns, isDuplicate, markSent, addLog } from "../../lib/gas";

const SMARTPING_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY3NmU5MTQ2ZjJjOGUzMGJlY2FlMDVkYiIsIm5hbWUiOiJUZXJyYXRlcm4iLCJhcHBOYW1lIjoiQWlTZW5zeSIsImNsaWVudElkIjoiNjc2ZTkxNDZmMmM4ZTMwYmVjYWUwNWNlIiwiYWN0aXZlUGxhbiI6IlBST19NT05USExZIiwiaWF0IjoxNzY5Njc2MzQ2fQ.Oj6veBiRUaPtWZ1yaVgTAp-q_JvCfXC8zuU42_T4rM4";
const SMARTPING_URL     = "https://backend.api-wa.co/campaign/smartping/api/v2";
const METABASE_URL      = "https://metabase.terratern.com/api/public/card/7e84f141-e90d-4852-a158-4d6a75bf4833/query/json";

// ── DYNAMIC PARAM MAPPINGS ────────────────────────────────────
// For campaigns that need per-lead dynamic values
// Return null to fall back to static params from Google Sheet
const DYNAMIC_PARAMS = {
  ghc_mkt02_api: (row, staticParams) => [
    firstName(row.fullname),   // {{1}} first name
    "+917094956963",           // {{2}} TerraTern call number
    row.bde || "Shreya Pandey" // {{3}} assigned advisor
  ],
};

function firstName(fullname) {
  if (!fullname) return "there";
  return String(fullname).trim().split(/\s+/)[0];
}

export default async function handler(req, res) {
  const isCron   = req.headers["x-vercel-cron"] === "1";
  const isManual = req.method === "POST" &&
    req.headers["authorization"] === `Bearer ${process.env.WEBHOOK_SECRET}`;
  if (!isCron && !isManual) return res.status(401).json({ error: "Unauthorized" });

  await addLog({ campaign:"cron", status:"success", note:"Cron started" });

  // 1. Fetch leads from Metabase
  let leads = [];
  try {
    const mbRes = await fetch(METABASE_URL);
    leads = await mbRes.json();
    if (!Array.isArray(leads)) throw new Error("Bad Metabase response");
  } catch(e) {
    await addLog({ campaign:"cron", status:"error", note:"Metabase failed: "+e.message });
    return res.status(500).json({ error: e.message });
  }

  // 2. Load active rules + campaigns from sheet
  const [allRules, allCampaigns] = await Promise.all([getAllRules(), getCampaigns()]);
  const activeRules = allRules.filter(r => r.active===true || r.active==="TRUE");
  const campaignMap = {};
  allCampaigns.forEach(c => { if(c.active) campaignMap[c.campaign_name] = c; });

  if (!activeRules.length) {
    await addLog({ campaign:"cron", status:"skipped", note:"No active rules" });
    return res.status(200).json({ message:"No active rules" });
  }

  const results = { sent:0, skipped_dedup:0, skipped_no_match:0, failed:0 };

  for (const row of leads) {
    const phone = normalizePhone(row.mobile || "");
    const name  = row.fullname || "User";
    if (!phone) { results.skipped_no_match++; continue; }

    // find first matching active rule
    const matchedRule = activeRules.find(rule => {
      const filters = Array.isArray(rule.filters_json) ? rule.filters_json : [];
      return applyFilters([row], filters).length > 0;
    });
    if (!matchedRule) { results.skipped_no_match++; continue; }

    // get campaign config
    const campaign = campaignMap[matchedRule.campaign];
    if (!campaign) {
      await addLog({ campaign:matchedRule.campaign, status:"error", note:"Campaign not in sheet" });
      results.failed++; continue;
    }

    // dedup check
    const alreadySent = await isDuplicate(phone, matchedRule.campaign);
    if (alreadySent) {
      results.skipped_dedup++;
      await addLog({ campaign:matchedRule.campaign, rule:matchedRule.name, phone, status:"skipped", note:"dedup" });
      continue;
    }

    // build template params — dynamic mapping takes priority over sheet static params
    const dynamicFn = DYNAMIC_PARAMS[matchedRule.campaign];
    const templateParams = dynamicFn
      ? dynamicFn(row, campaign.template_params || [])
      : (campaign.template_params || []);

    const payload = {
      apiKey:       SMARTPING_API_KEY,
      campaignName: matchedRule.campaign,
      destination:  phone,
      userName:     name,
      templateParams,
      source:       "cron-auto",
      media:        campaign.media_url ? { url:campaign.media_url, filename:"media" } : {},
      buttons:      [],
      carouselCards:[],
      location:     {},
      attributes:   {},
      paramsFallbackValue: { FirstName: firstName(row.fullname) },
    };

    try {
      const response = await fetch(SMARTPING_URL, {
        method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload)
      });
      if (response.ok) {
        await markSent(phone, matchedRule.campaign);
        await addLog({ campaign:matchedRule.campaign, rule:matchedRule.name, phone, name, status:"success", note:"sent" });
        results.sent++;
      } else {
        const data = await response.json().catch(()=>({}));
        await addLog({ campaign:matchedRule.campaign, rule:matchedRule.name, phone, status:"error", note:JSON.stringify(data).slice(0,200) });
        results.failed++;
      }
    } catch(e) {
      await addLog({ campaign:matchedRule.campaign, rule:matchedRule.name, phone, status:"error", note:e.message });
      results.failed++;
    }
  }

  await addLog({ campaign:"cron", status:"success", note:`Done: sent=${results.sent} dedup=${results.skipped_dedup} no_match=${results.skipped_no_match} failed=${results.failed}` });
  return res.status(200).json({ success:true, leads_total:leads.length, ...results });
}

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
  // date operators
  if(f.op==="date_after"||f.op==="date_before"||f.op==="date_between"){
    const d = raw ? new Date(raw) : null;
    if(!d||isNaN(d)) return false;
    if(f.op==="date_after")  return d >= new Date(f.val);
    if(f.op==="date_before") return d <= new Date(f.val+"T23:59:59");
    if(f.op==="date_between"){
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
