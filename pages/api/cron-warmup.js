// pages/api/cron-warmup.js
// Runs 5 mins before each slot — fetches leads, builds batch, stores in send_queue

import {
  getSchedules, getCurrentPhase, getCampaigns,
  getSentPhonesByPhase, getReactivatedPhones,
  getFailedPhones, getCapReachedPhones,
  batchAddReactivated,
} from "../../lib/supabase";

const METABASE_URL = "https://metabase.terratern.com/api/public/card/7e84f141-e90d-4852-a158-4d6a75bf4833/query/json";
const SUPABASE_URL = "https://oagsgovnxgiszofgytre.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZ3Nnb3ZueGdpc3pvZmd5dHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MzA1MjgsImV4cCI6MjA5NjEwNjUyOH0.V3eNIE3PXAcMuS3Gv0tBb3kqjVRAI25tSj8ED5W7vmI";

const DYNAMIC_PARAMS = {
  overseas_jobupdate_api: (row) => [firstName(row.fullname)],
  update_overseas_api:    (row) => [firstName(row.fullname)],
  hiring_jobupdate_api:   (row) => [firstName(row.fullname)],
};

function firstName(full) {
  return String(full||"there").trim().split(/\s+/)[0];
}

function getNextSlot() {
  const now    = new Date();
  const istMin = (now.getUTCHours() * 60 + now.getUTCMinutes()) + 330;
  const istH   = Math.floor(istMin / 60) % 24;
  const istM   = istMin % 60;
  const total  = istH * 60 + istM;
  // return next slot name based on current time
  if (total < 16*60+30) return "4:30PM";
  if (total < 18*60+0)  return "6:00PM";
  if (total < 19*60+30) return "7:30PM";
  return "4:30PM"; // next day
}

function isReactivated(row) {
  const utm = String(row.latest_utm_campaign||"").toLowerCase().trim();
  if (!utm) return false;
  return utm.includes("whatsapp")||utm.includes("sms")||utm.includes("email")||utm.includes("ivr");
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

export default async function handler(req, res) {
  const startTime = Date.now();
  const slot      = getNextSlot();

  // ── STEP 1: Clear old pending for this slot ────────────────
  await fetch(`${SUPABASE_URL}/rest/v1/send_queue?slot=eq.${encodeURIComponent(slot)}&status=eq.pending`, {
    method: "DELETE",
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
    }
  });

  // ── STEP 2: Load everything in parallel ───────────────────
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

  if (!schedules.length) return res.status(200).json({ message:"No active schedules" });

  const results = { slot, queued:0, skipped:0, schedules:[] };

  // ── STEP 3: Build batch for each schedule ─────────────────
  for (const schedule of schedules) {
    const { phase, dayNum, campaign: campaignName } = getCurrentPhase(schedule);
    if (phase==="GAP"||phase==="NOT_STARTED"||phase==="DONE") continue;

    const campaign  = campaignMap[campaignName];
    if (!campaign) continue;

    const filters   = Array.isArray(schedule.filters_json) ? schedule.filters_json : [];
    const matchedAll= applyFilters(leads, filters);
    const phaseDays = phase==="R1"?schedule.r1_days:phase==="R2"?schedule.r2_days:schedule.r3_days;
    const batchSize = Math.ceil(matchedAll.length / phaseDays);
    const perSlot   = Math.ceil(batchSize / 3);

    const prevPhase = phase==="R2"?"R1":phase==="R3"?"R2":null;
    const [sentPhones, failedPhones, prevPhaseSent] = await Promise.all([
      getSentPhonesByPhase(schedule.id, phase).catch(()=>new Set()),
      getFailedPhones(campaignName).catch(()=>new Set()),
      prevPhase ? getSentPhonesByPhase(schedule.id, prevPhase).catch(()=>new Set()) : Promise.resolve(new Set()),
    ]);

    const batch          = [];
    const newReactivated = [];

    for (const row of matchedAll) {
      if (batch.length >= perSlot) break;
      const phone = normalizePhone(row.mobile||"");
      if (!phone) continue;

      if (isReactivated(row)) {
        if (!reactivatedPhones.has(phone)) {
          newReactivated.push({ phone, campaign:campaignName, utm_campaign:row.latest_utm_campaign });
          reactivatedPhones.add(phone);
        }
        results.skipped++;
        continue;
      }

      if (capReachedPhones.has(phone))     { results.skipped++; continue; }
      if (sentPhones.has(phone))           { results.skipped++; continue; }
      if (failedPhones.has(phone))         { results.skipped++; continue; }
      if (phase==="R2"&&!prevPhaseSent.has(phone)) continue;
      if (phase==="R3"&&!prevPhaseSent.has(phone)) continue;

      batch.push({
        phone,
        fullname: row.fullname||"User",
        bde:      row.bde||"",
        campaign: campaignName,
        phase,
        schedule_id: schedule.id,
        slot,
        status: "pending",
      });
    }

    // Write batch to send_queue
    if (batch.length) {
      await fetch(`${SUPABASE_URL}/rest/v1/send_queue`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`,
          "Prefer": "return=minimal",
        },
        body: JSON.stringify(batch)
      });
      results.queued += batch.length;
    }

    if (newReactivated.length) await batchAddReactivated(newReactivated);

    results.schedules.push({
      schedule: schedule.name, phase, dayNum,
      campaign: campaignName, queued: batch.length
    });
  }

  const duration = Math.round((Date.now()-startTime)/1000);
  return res.status(200).json({ success:true, slot, duration_seconds:duration, leads_total:leads.length, ...results });
}

function applyFilters(rows, filterList) {
  if (!filterList?.length) return rows;
  return rows.filter(lead => {
    let result = evalFilter(lead, filterList[0]);
    for (let i=1;i<filterList.length;i++) {
      const test=evalFilter(lead,filterList[i]);
      result=filterList[i].logic==="OR"?result||test:result&&test;
    }
    return result;
  });
}

function evalFilter(lead, f) {
  const raw=lead[f.field]; const cell=String(raw??"").toLowerCase().trim(); const val=String(f.val??"").toLowerCase().trim();
  if(f.op==="date_after"||f.op==="date_before"||f.op==="date_between"){
    const d=raw?new Date(raw):null; if(!d||isNaN(d)) return false;
    if(f.op==="date_after")  return d>=new Date(f.val);
    if(f.op==="date_before") return d<=new Date(f.val+"T23:59:59");
    if(f.op==="date_between"){const[from,to]=(f.val||"").split("|");return(!from||d>=new Date(from))&&(!to||d<=new Date(to+"T23:59:59"));}
  }
  switch(f.op){
    case "is":           return cell===val;
    case "is_not":       return cell!==val;
    case "contains":     return cell.includes(val);
    case "not_contains": return !cell.includes(val);
    case "has_value":    return raw!==null&&raw!==undefined&&String(raw).trim()!=="";
    case "is_empty":     return raw===null||raw===undefined||String(raw).trim()==="";
    default:             return true;
  }
}
