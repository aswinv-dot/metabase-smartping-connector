// pages/api/cron.js
import {
  getAllRules, getCampaigns,
  batchAddSentLog, getSentPhones, getPhoneSendCounts,
  getReactivatedPhones, batchAddReactivated,
  getFailedPhones, batchAddFailed,
  getCapReachedPhones, batchAddCapReached,
} from "../../lib/supabase";

const SMARTPING_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY3NmU5MTQ2ZjJjOGUzMGJlY2FlMDVkYiIsIm5hbWUiOiJUZXJyYXRlcm4iLCJhcHBOYW1lIjoiQWlTZW5zeSIsImNsaWVudElkIjoiNjc2ZTkxNDZmMmM4ZTMwYmVjYWUwNWNlIiwiYWN0aXZlUGxhbiI6IlBST19NT05USExZIiwiaWF0IjoxNzY5Njc2MzQ2fQ.Oj6veBiRUaPtWZ1yaVgTAp-q_JvCfXC8zuU42_T4rM4";
const SMARTPING_URL     = "https://backend.api-wa.co/campaign/smartping/api/v2";
const METABASE_URL      = "https://metabase.terratern.com/api/public/card/7e84f141-e90d-4852-a158-4d6a75bf4833/query/json";
const SEND_CAP          = 3;

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

function getTimeSlot() {
  const h = new Date().getUTCHours();
  const istH = (h + 5) % 24 + (new Date().getUTCMinutes() >= 30 ? 0.5 : 0);
  if (istH >= 8.5  && istH < 10)  return "9AM";
  if (istH >= 12.5 && istH < 14)  return "1PM";
  if (istH >= 16.5 && istH < 17.5) return "5PM";
  if (istH >= 17.5 && istH < 18.5) return "6PM";
  if (istH >= 18.5 && istH < 19.5) return "7PM";
  return "other";
}

export default async function handler(req, res) {
  const isCron   = req.headers["x-vercel-cron"] === "1";
  const isManual = req.method === "POST" &&
    req.headers["authorization"] === `Bearer ${process.env.WEBHOOK_SECRET}`;
  if (!isCron && !isManual) return res.status(401).json({ error:"Unauthorized" });

  const startTime = Date.now();
  const timeSlot  = getTimeSlot();

  // ── STEP 1: Load everything in parallel ───────────────────────
  let leads=[], activeRules=[], campaignMap={};
  let reactivatedPhones, capReachedPhones;

  try {
    const [mbRes, rulesData, campsData, reactivated, capReached] = await Promise.all([
      fetch(METABASE_URL),
      getAllRules(),
      getCampaigns(),
      getReactivatedPhones(),
      getCapReachedPhones(),
    ]);

    leads           = await mbRes.json();
    if (!Array.isArray(leads)) throw new Error("Bad Metabase response");
    activeRules     = rulesData.filter(r => r.active===true);
    campsData.filter(c=>c.active).forEach(c => campaignMap[c.campaign_name]=c);
    reactivatedPhones = reactivated;
    capReachedPhones  = capReached;

  } catch(e) {
    return res.status(500).json({ error:"Init failed: "+e.message });
  }

  if (!activeRules.length) return res.status(200).json({ message:"No active rules" });

  const results = { sent:0, skipped_dedup:0, skipped_reactivated:0, skipped_cap:0, skipped_no_match:0, failed:0 };

  // process each rule separately with its own batch_size
  for (const rule of activeRules) {
    const campaign = campaignMap[rule.campaign];
    if (!campaign) continue;

    const batchSize  = rule.batch_size || 500;
    const filters    = Array.isArray(rule.filters_json) ? rule.filters_json : [];

    // get already sent + failed for this campaign
    const [sentPhones, failedPhones, sendCounts] = await Promise.all([
      getSentPhones(rule.campaign),
      getFailedPhones(rule.campaign),
      getPhoneSendCounts(),
    ]);

    // filter leads
    const matched = applyFilters(leads, filters);

    // classify and build today's batch
    const toSend          = [];
    const newReactivated  = [];
    const newFailed       = [];
    const newCapReached   = [];

    for (const row of matched) {
      const phone = normalizePhone(row.mobile||"");
      if (!phone) { results.skipped_no_match++; continue; }

      // reactivated check
      if (row.latest_utm_campaign && String(row.latest_utm_campaign).trim() !== "") {
        if (!reactivatedPhones.has(phone)) {
          newReactivated.push({ phone, campaign:rule.campaign, utm_campaign:row.latest_utm_campaign });
          reactivatedPhones.add(phone);
        }
        results.skipped_reactivated++;
        continue;
      }

      // cap reached check
      if (capReachedPhones.has(phone)) { results.skipped_cap++; continue; }

      // send count check
      const count = sendCounts[phone] || 0;
      if (count >= SEND_CAP) {
        newCapReached.push({ phone, send_count: count });
        capReachedPhones.add(phone);
        results.skipped_cap++;
        continue;
      }

      // already sent for this campaign
      if (sentPhones.has(phone)) { results.skipped_dedup++; continue; }

      // failed for this campaign
      if (failedPhones.has(phone)) { results.skipped_no_match++; continue; }

      toSend.push(row);
      if (toSend.length >= batchSize) break;
    }

    // write new reactivated + cap reached to Supabase
    await Promise.all([
      newReactivated.length ? batchAddReactivated(newReactivated) : Promise.resolve(),
      newCapReached.length  ? batchAddCapReached(newCapReached)   : Promise.resolve(),
    ]);

    // ── STEP 2: Send in parallel batches of 10 ────────────────
    const newSentLog = [];
    const newFailLog = [];
    const BATCH      = 10;

    for (let i=0; i<toSend.length; i+=BATCH) {
      const batch = toSend.slice(i, i+BATCH);
      await Promise.all(batch.map(async (row) => {
        const phone  = normalizePhone(row.mobile||"");
        const name   = row.fullname||"User";
        const dynFn  = DYNAMIC_PARAMS[rule.campaign];
        const params = dynFn ? dynFn(row) : (campaign.template_params||[]);

        const payload = {
          apiKey:         SMARTPING_API_KEY,
          campaignName:   rule.campaign,
          destination:    phone,
          userName:       name,
          templateParams: params,
          source:         "cron-auto",
          media:          campaign.media_url ? {url:campaign.media_url, filename:"media"} : {},
          buttons:[], carouselCards:[], location:{}, attributes:{},
          paramsFallbackValue: { FirstName: firstName(row.fullname) },
        };

        try {
          const response = await fetch(SMARTPING_URL, {
            method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload)
          });

          if (response.ok) {
            results.sent++;
            newSentLog.push({
              phone, campaign:rule.campaign, rule_name:rule.name,
              sent_at: new Date().toISOString(), time_slot: timeSlot, status:"success"
            });
          } else {
            const data = await response.json().catch(()=>({}));
            results.failed++;
            newFailLog.push({ phone, campaign:rule.campaign, error:JSON.stringify(data).slice(0,200) });
          }
        } catch(e) {
          results.failed++;
          newFailLog.push({ phone, campaign:rule.campaign, error:e.message });
        }
      }));
    }

    // ── STEP 3: Write logs to Supabase ────────────────────────
    await Promise.all([
      newSentLog.length ? batchAddSentLog(newSentLog)   : Promise.resolve(),
      newFailLog.length ? batchAddFailed(newFailLog)    : Promise.resolve(),
    ]);
  }

  const duration = Math.round((Date.now()-startTime)/1000);
  return res.status(200).json({
    success:true, leads_total:leads.length,
    time_slot:timeSlot, duration_seconds:duration, ...results
  });
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
