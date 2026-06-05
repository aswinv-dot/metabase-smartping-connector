// pages/api/cron.js
// Reads pre-built batch from send_queue → sends → logs
// Heavy lifting done by /api/cron-warmup

import { batchAddSentLogWithPhase, batchAddFailed } from "../../lib/supabase";

const SMARTPING_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY3NmU5MTQ2ZjJjOGUzMGJlY2FlMDVkYiIsIm5hbWUiOiJUZXJyYXRlcm4iLCJhcHBOYW1lIjoiQWlTZW5zeSIsImNsaWVudElkIjoiNjc2ZTkxNDZmMmM4ZTMwYmVjYWUwNWNlIiwiYWN0aXZlUGxhbiI6IlBST19NT05USExZIiwiaWF0IjoxNzY5Njc2MzQ2fQ.Oj6veBiRUaPtWZ1yaVgTAp-q_JvCfXC8zuU42_T4rM4";
const SMARTPING_URL     = "https://backend.api-wa.co/campaign/smartping/api/v2";
const SUPABASE_URL      = "https://oagsgovnxgiszofgytre.supabase.co";
const SUPABASE_KEY      = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZ3Nnb3ZueGdpc3pvZmd5dHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MzA1MjgsImV4cCI6MjA5NjEwNjUyOH0.V3eNIE3PXAcMuS3Gv0tBb3kqjVRAI25tSj8ED5W7vmI";

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
  const istTotalM = (now.getUTCHours()*60 + now.getUTCMinutes()) + 330;
  const istH    = Math.floor(istTotalM/60)%24;
  const istMin  = istTotalM%60;
  if (istH===16&&istMin>=25&&istMin<=40) return "4:30PM";
  if (istH===18&&istMin>=0 &&istMin<=10) return "6:00PM";
  if (istH===19&&istMin>=25&&istMin<=45) return "7:30PM";
  const h12=istH%12||12; const ampm=istH>=12?'PM':'AM';
  return `${h12}:${String(istMin).padStart(2,'0')}${ampm}`;
}

export default async function handler(req, res) {
  const startTime = Date.now();
  const timeSlot  = getTimeSlot();

  // ── STEP 1: Read pending batch from send_queue ────────────
  const queueRes = await fetch(
    `${SUPABASE_URL}/rest/v1/send_queue?status=eq.pending&slot=eq.${encodeURIComponent(timeSlot)}&order=id.asc`,
    { headers: { apikey:SUPABASE_KEY, Authorization:`Bearer ${SUPABASE_KEY}` } }
  );
  let queue = await queueRes.json();

  if (!Array.isArray(queue) || !queue.length) {
    return res.status(200).json({ message:`No pending queue for slot ${timeSlot}`, slot:timeSlot });
  }

  // ── STEP 2: Send in batches of 20 ─────────────────────────
  const results   = { sent:0, failed:0 };
  const newSentLog= [];
  const newFailLog= [];
  const sentIds   = [];
  const failedIds = [];
  const BATCH     = 20;

  for (let i=0; i<queue.length; i+=BATCH) {
    const batch = queue.slice(i, i+BATCH);
    await Promise.all(batch.map(async (item) => {
      const dynFn = DYNAMIC_PARAMS[item.campaign];
      const params = dynFn ? dynFn({fullname:item.fullname, bde:item.bde}) : [];

      const payload = {
        apiKey:         SMARTPING_API_KEY,
        campaignName:   item.campaign,
        destination:    item.phone,
        userName:       item.fullname||"User",
        templateParams: params,
        source:         `cron-${item.phase?.toLowerCase()||'auto'}`,
        media:          {},
        buttons:[], carouselCards:[], location:{}, attributes:{},
        paramsFallbackValue: { FirstName: firstName(item.fullname) },
      };

      try {
        const response = await fetch(SMARTPING_URL, {
          method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload)
        });
        if (response.ok) {
          results.sent++;
          sentIds.push(item.id);
          newSentLog.push({
            phone:item.phone, campaign:item.campaign, rule_name:item.schedule_id,
            sent_at:new Date().toISOString(), time_slot:timeSlot,
            status:"success", phase:item.phase, schedule_id:item.schedule_id
          });
        } else {
          results.failed++;
          failedIds.push(item.id);
          newFailLog.push({ phone:item.phone, campaign:item.campaign, error:"Smartping error" });
        }
      } catch(e) {
        results.failed++;
        failedIds.push(item.id);
      }
    }));
  }

  // ── STEP 3: Update queue status + log ─────────────────────
  await Promise.all([
    // mark sent
    sentIds.length ? fetch(`${SUPABASE_URL}/rest/v1/send_queue?id=in.(${sentIds.join(',')})`, {
      method:"PATCH",
      headers:{"Content-Type":"application/json","apikey":SUPABASE_KEY,"Authorization":`Bearer ${SUPABASE_KEY}`,"Prefer":"return=minimal"},
      body: JSON.stringify({ status:"sent", sent_at:new Date().toISOString() })
    }) : Promise.resolve(),
    // mark failed
    failedIds.length ? fetch(`${SUPABASE_URL}/rest/v1/send_queue?id=in.(${failedIds.join(',')})`, {
      method:"PATCH",
      headers:{"Content-Type":"application/json","apikey":SUPABASE_KEY,"Authorization":`Bearer ${SUPABASE_KEY}`,"Prefer":"return=minimal"},
      body: JSON.stringify({ status:"failed" })
    }) : Promise.resolve(),
    // log to sent_log
    newSentLog.length ? batchAddSentLogWithPhase(newSentLog) : Promise.resolve(),
    // log to failed_list
    newFailLog.length ? batchAddFailed(newFailLog) : Promise.resolve(),
  ]);

  const duration = Math.round((Date.now()-startTime)/1000);
  return res.status(200).json({
    success:true, slot:timeSlot, queue_size:queue.length,
    duration_seconds:duration, ...results
  });
}
