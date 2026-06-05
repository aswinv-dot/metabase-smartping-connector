// pages/api/cron.js
import {
  getSchedules, getCurrentPhase,
  getCampaigns,
  batchAddSentLogWithPhase,
  getSentPhonesByPhase,
  getReactivatedPhones, batchAddReactivated,
  getFailedPhones, batchAddFailed,
  getCapReachedPhones,
} from "../../lib/supabase";

const SMARTPING_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY3NmU5MTQ2ZjJjOGUzMGJlY2FlMDVkYiIsIm5hbWUiOiJUZXJyYXRlcm4iLCJhcHBOYW1lIjoiQWlTZW5zeSIsImNsaWVudElkIjoiNjc2ZTkxNDZmMmM4ZTMwYmVjYWUwNWNlIiwiYWN0aXZlUGxhbiI6IlBST19NT05USExZIiwiaWF0IjoxNzY5Njc2MzQ2fQ.Oj6veBiRUaPtWZ1yaVgTAp-q_JvCfXC8zuU42_T4rM4";
const SMARTPING_URL     = "https://backend.api-wa.co/campaign/smartping/api/v2";
const METABASE_URL      = "https://metabase.terratern.com/api/public/card/7e84f141-e90d-4852-a158-4d6a75bf4833/query/json";

// Dynamic param mappings per campaign
const DYNAMIC_PARAMS = {
  overseas_jobupdate_api: (row) => [firstName(row.fullname)],
  update_overseas_api:    (row) => [firstName(row.fullname)],
  hiring_jobupdate_api:   (row) => [firstName(row.fullname)],
};

function firstName(full) {
  return String(full||"there").trim().split(/\s+/)[0];
}

function getTimeSlot() {
  const now     = new Date();
  const utcH    = now.getUTCHours();
  const utcM    = now.getUTCMinutes();
  const totalM  = utcH * 60 + utcM;
  // IST = UTC + 5:30
  const istTotalM = totalM + 330;
  const istH    = Math.floor(istTotalM / 60) % 24;
  const istMin  = istTotalM % 60;

  // 4:30 PM IST = 16:30
  if (istH === 16 && istMin >= 25 && istMin <= 40) return "4:30PM";
  // 6:00 PM IST = 18:00
  if (istH === 18 && istMin >= 0  && istMin <= 10) return "6:00PM";
  // 7:30 PM IST = 19:30
  if (istH === 19 && istMin >= 25 && istMin <= 45) return "7:30PM";
  // fallback — return actual IST time string
  const h12  = istH % 12 || 12;
  const ampm = istH >= 12 ? 'PM' : 'AM';
  const mm   = String(istMin).padStart(2,'0');
  return `${h12}:${mm}${ampm}`;
}

// Reactivated = utm_campaign contains whatsapp/sms/email/ivr
function isReactivated(row) {
  const utm = String(row.latest_utm_campaign||"").toLowerCase().trim();
  if (!utm) return false;
  return utm.includes("whatsapp") || utm.includes("sms") ||
         utm.includes("email")    || utm.includes("ivr");
}

export default async function handler(req, res) {
  // Allow Vercel cron (GET with x-vercel-cron header), manual POST with secret, or any GET
  const isManual = req.method === "POST" &&
    req.headers["authorization"] !== `Bearer ${process.env.WEBHOOK_SECRET}`;
  if (isManual) return res.status(401).json({ error:"Unauthorized" });

  const startTime = Date.now();
  const timeSlot  = getTimeSlot();
  const summary   = [];

  // ── STEP 1: Load everything in parallel ───────────────────────
  let leads=[], schedules=[], campaignMap={};
  let reactivatedPhones, capReachedPhones;

  try {
    const [mbRes, schedulesData, campsData, reactivated, capReached] = await Promise.all([
      fetch(METABASE_URL),
      getSchedules().catch(()=>[]),
      getCampaigns().catch(()=>[]),
      getReactivatedPhones().catch(()=>new Set()),
      getCapReachedPhones().catch(()=>new Set()),
    ]);

    leads             = await mbRes.json();
    if (!Array.isArray(leads)) throw new Error("Bad Metabase response");
    schedules         = schedulesData.filter(s => s.active);
    campsData.forEach(c => campaignMap[c.campaign_name] = c);
    reactivatedPhones = reactivated;
    capReachedPhones  = capReached;

  } catch(e) {
    return res.status(500).json({ error:"Init failed: "+e.message });
  }

  if (!schedules.length) {
    return res.status(200).json({ message:"No active schedules" });
  }

  // ── STEP 2: Process each active schedule ──────────────────────
  for (const schedule of schedules) {
    const { phase, dayNum, campaign: campaignName } = getCurrentPhase(schedule);

    // GAP or NOT_STARTED or DONE → skip
    if (phase === "GAP" || phase === "NOT_STARTED" || phase === "DONE") {
      summary.push({ schedule: schedule.name, phase, dayNum, skipped: true });
      continue;
    }

    const campaign = campaignMap[campaignName];
    if (!campaign) {
      summary.push({ schedule: schedule.name, phase, error: "Campaign not found: "+campaignName });
      continue;
    }

    // Calculate batch size: total leads / phase days
    const filters     = Array.isArray(schedule.filters_json) ? schedule.filters_json : [];
    const matchedAll  = applyFilters(leads, filters);
    const phaseDays   = phase==="R1" ? schedule.r1_days : phase==="R2" ? schedule.r2_days : schedule.r3_days;
    const batchSize   = Math.ceil(matchedAll.length / phaseDays);
    const perRunCap   = Math.ceil(batchSize / 3); // split across 3 daily slots

    // Load all needed phone sets upfront in parallel
    const prevPhase = phase==="R2" ? "R1" : phase==="R3" ? "R2" : null;
    const [sentPhones, failedPhones, prevPhaseSent] = await Promise.all([
      getSentPhonesByPhase(schedule.id, phase).catch(()=>new Set()),
      getFailedPhones(campaignName).catch(()=>new Set()),
      prevPhase ? getSentPhonesByPhase(schedule.id, prevPhase).catch(()=>new Set()) : Promise.resolve(new Set()),
    ]);

    // Build today's batch
    const toSend         = [];
    const newReactivated = [];
    const results        = { sent:0, skipped_reactivated:0, skipped_cap:0, skipped_dedup:0, skipped_failed:0, failed:0 };

    for (const row of matchedAll) {
      if (toSend.length >= perRunCap) break;

      const phone = normalizePhone(row.mobile||"");
      if (!phone) continue;

      // reactivated check
      if (isReactivated(row)) {
        if (!reactivatedPhones.has(phone)) {
          newReactivated.push({ phone, campaign:campaignName, utm_campaign:row.latest_utm_campaign });
          reactivatedPhones.add(phone);
        }
        results.skipped_reactivated++;
        continue;
      }

      // cap reached
      if (capReachedPhones.has(phone)) { results.skipped_cap++; continue; }

      // already sent in this phase
      if (sentPhones.has(phone)) { results.skipped_dedup++; continue; }

      // failed for this campaign
      if (failedPhones.has(phone)) { results.skipped_failed++; continue; }

      // R2/R3 eligibility — checked via prevPhaseSent loaded upfront
      if (phase === "R2" && !prevPhaseSent.has(phone)) continue;
      if (phase === "R3" && !prevPhaseSent.has(phone)) continue;

      toSend.push(row);
    }

    // Write new reactivated
    if (newReactivated.length) await batchAddReactivated(newReactivated);

    // ── STEP 3: Send in batches of 10 ─────────────────────────
    const newSentLog = [];
    const newFailLog = [];
    const BATCH      = 20;

    for (let i=0; i<toSend.length; i+=BATCH) {
      const batch = toSend.slice(i, i+BATCH);
      await Promise.all(batch.map(async (row) => {
        const phone  = normalizePhone(row.mobile||"");
        const name   = row.fullname||"User";
        const dynFn  = DYNAMIC_PARAMS[campaignName];
        const params = dynFn ? dynFn(row) : (campaign.template_params||[]);

        const payload = {
          apiKey:         SMARTPING_API_KEY,
          campaignName,
          destination:    phone,
          userName:       name,
          templateParams: params,
          source:         `cron-${phase.toLowerCase()}`,
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
              phone, campaign:campaignName, rule_name:schedule.name,
              sent_at:new Date().toISOString(),
              time_slot:timeSlot, status:"success",
              phase, schedule_id:schedule.id
            });
          } else {
            const data = await response.json().catch(()=>({}));
            results.failed++;
            newFailLog.push({ phone, campaign:campaignName, error:JSON.stringify(data).slice(0,200) });
          }
        } catch(e) {
          results.failed++;
          newFailLog.push({ phone, campaign:campaignName, error:e.message });
        }
      }));
    }

    // Write logs
    await Promise.all([
      newSentLog.length ? batchAddSentLogWithPhase(newSentLog) : Promise.resolve(),
      newFailLog.length ? batchAddFailed(newFailLog)           : Promise.resolve(),
    ]);

    summary.push({
      schedule: schedule.name, phase, dayNum,
      campaign: campaignName, batch_size: batchSize,
      ...results
    });
  }

  const duration = Math.round((Date.now()-startTime)/1000);
  return res.status(200).json({
    success:true, leads_total:leads.length,
    time_slot:timeSlot, duration_seconds:duration, summary
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
