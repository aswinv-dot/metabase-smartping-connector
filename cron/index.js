const cron   = require('node-cron');
const fetch  = require('node-fetch');
const http   = require('http');
// ── CONFIG ────────────────────────────────────────────────────
const SMARTPING_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY3NmU5MTQ2ZjJjOGUzMGJlY2FlMDVkYiIsIm5hbWUiOiJUZXJyYXRlcm4iLCJhcHBOYW1lIjoiQWlTZW5zeSIsImNsaWVudElkIjoiNjc2ZTkxNDZmMmM4ZTMwYmVjYWUwNWNlIiwiYWN0aXZlUGxhbiI6IlBST19NT05USExZIiwiaWF0IjoxNzY5Njc2MzQ2fQ.Oj6veBiRUaPtWZ1yaVgTAp-q_JvCfXC8zuU42_T4rM4";
const SMARTPING_URL     = "https://backend.api-wa.co/campaign/smartping/api/v2";
const METABASE_URL      = "https://metabase.terratern.com/api/public/card/7e84f141-e90d-4852-a158-4d6a75bf4833/query/json";
const SUPABASE_URL      = "https://oagsgovnxgiszofgytre.supabase.co";
const SUPABASE_KEY      = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZ3Nnb3ZueGdpc3pvZmd5dHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MzA1MjgsImV4cCI6MjA5NjEwNjUyOH0.V3eNIE3PXAcMuS3Gv0tBb3kqjVRAI25tSj8ED5W7vmI";
const PORT               = process.env.PORT || 3001;

function resolveParam(str, row) {
  const m = String(str).match(/^\{field:(\w+)\}$/);
  if (!m) return str;
  const key = m[1];
  if (key === 'fullname') return firstName(row.fullname);
  return row[key] ?? '';
}
function firstName(full) { return String(full||'there').trim().split(/\s+/)[0]; }
function normalizePhone(raw) {
  if (!raw) return null;
  const d = String(raw).replace(/\D/g,'');
  if (d.length===10)                      return '91'+d;
  if (d.length===12&&d.startsWith('91')) return d;
  if (d.length===11&&d.startsWith('0'))  return '91'+d.slice(1);
  if (d.length>6)                        return d;
  return null;
}
function isReactivated(row) {
  const utm = String(row.latest_utm_campaign||'').toLowerCase().trim();
  if (!utm) return false;
  return utm.includes('whatsapp')||utm.includes('sms')||utm.includes('email')||utm.includes('ivr');
}
function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }
function nowIST() { return new Date(Date.now() + 330 * 60000); }
function istHHMM(d) {
  const h = String(d.getUTCHours()).padStart(2,'0');
  const m = String(d.getUTCMinutes()).padStart(2,'0');
  return `${h}:${m}`;
}
function toMinutes(hhmm) {
  const [h,m] = String(hhmm||'0:0').split(':').map(Number);
  return (h||0)*60 + (m||0);
}

// ── SUPABASE ──────────────────────────────────────────────────
const sbHeaders = { 'Content-Type':'application/json', 'apikey':SUPABASE_KEY, 'Authorization':`Bearer ${SUPABASE_KEY}` };

async function fetchWithRetry(url, opts={}, retries=3) {
  for (let i=0; i<retries; i++) {
    try {
      const res = await fetch(url, opts);
      return res;
    } catch(e) {
      if (i === retries-1) throw e;
      const wait = 1000 * (i+1);
      log(`Retry ${i+1}/${retries-1} for ${url.split('/rest/v1/')[1]||url} — ${e.message} — waiting ${wait}ms`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

async function sbGet(path, params='') {
  const url = `${SUPABASE_URL}/rest/v1/${path}${params}`;
  for (let i=0; i<3; i++) {
    try {
      const res = await fetch(url, { headers: sbHeaders });
      const text = await res.text();
      return text ? JSON.parse(text) : [];
    } catch(e) {
      if (i===2) throw e;
      const wait = 1000*(i+1);
      log(`sbGet retry ${i+1}/2 for ${path} — ${e.message} — waiting ${wait}ms`);
      await new Promise(r=>setTimeout(r, wait));
    }
  }
}

// FIX 1: sbPost now has retry logic — sent_log writes won't fail silently
async function sbPost(path, data, params='') {
  const url = `${SUPABASE_URL}/rest/v1/${path}${params}`;
  for (let i=0; i<3; i++) {
    try {
      const res = await fetch(url, {
        method:'POST', headers:{...sbHeaders,'Prefer':'return=minimal'}, body:JSON.stringify(data)
      });
      return res.ok;
    } catch(e) {
      if (i===2) { log(`sbPost failed after 3 attempts for ${path}: ${e.message}`); throw e; }
      const wait = 1000*(i+1);
      log(`sbPost retry ${i+1}/2 for ${path} — ${e.message} — waiting ${wait}ms`);
      await new Promise(r=>setTimeout(r, wait));
    }
  }
}

async function sbPatch(path, data, params='') {
  const url = `${SUPABASE_URL}/rest/v1/${path}${params}`;
  for (let i=0; i<3; i++) {
    try {
      const res = await fetch(url, {
        method:'PATCH', headers:{...sbHeaders,'Prefer':'return=minimal'}, body:JSON.stringify(data)
      });
      return res.ok;
    } catch(e) {
      if (i===2) throw e;
      await new Promise(r=>setTimeout(r,1000*(i+1)));
    }
  }
}

// ── CACHE ─────────────────────────────────────────────────────
const CACHE_TTL = 30 * 60 * 1000;
const _cache = {};
function cacheGet(key) {
  const c = _cache[key];
  if (!c) return null;
  if (Date.now() - c.ts > CACHE_TTL) { delete _cache[key]; return null; }
  return c.data;
}
function cacheSet(key, data) { _cache[key] = { data, ts: Date.now() }; }
function cacheClear(key) { delete _cache[key]; }

async function getReactivatedPhones() {
  const r = await sbGet('reactivated_list','?select=phone');
  return new Set(r.map(x=>x.phone));
}
async function getCapReachedPhones() {
  const cached = cacheGet('cap_reached');
  if (cached) { log('Cache hit: cap_reached'); return cached; }
  const r = await sbGet('cap_reached_list','?select=phone');
  const data = new Set(r.map(x=>x.phone));
  cacheSet('cap_reached', data);
  return data;
}
async function getFailedPhones(campaign) {
  const r = await sbGet('failed_list',`?campaign=eq.${encodeURIComponent(campaign)}&select=phone`);
  return new Set(r.map(x=>x.phone));
}
async function getSentPhones(schedId, phase, scheduleName) {
  const r1 = await sbGet('sent_log',`?schedule_id=eq.${schedId}&phase=eq.${phase}&status=eq.success&select=phone`);
  const phones = new Set(r1.map(x=>x.phone));
  if (scheduleName) {
    const r2 = await sbGet('sent_log',`?rule_name=eq.${encodeURIComponent(scheduleName)}&phase=eq.${phase}&status=eq.success&select=phone`);
    r2.forEach(x => phones.add(x.phone));
  }
  log(`getSentPhones(${schedId}, ${phase}): ${phones.size} phones`);
  return phones;
}

// ── FILTER ENGINE ─────────────────────────────────────────────
function applyFilters(rows, filterList) {
  if (!filterList?.length) return rows;
  return rows.filter(lead => {
    let result = evalFilter(lead, filterList[0]);
    for (let i=1;i<filterList.length;i++) {
      const test=evalFilter(lead,filterList[i]);
      result=filterList[i].logic==='OR'?result||test:result&&test;
    }
    return result;
  });
}
function evalFilter(lead, f) {
  const raw=lead[f.field]; const cell=String(raw??'').toLowerCase().trim(); const val=String(f.val??'').toLowerCase().trim();
  if(f.op==='date_after'||f.op==='date_before'||f.op==='date_between'){
    const d=raw?new Date(raw):null; if(!d||isNaN(d)) return false;
    if(f.op==='date_after')  return d>=new Date(f.val);
    if(f.op==='date_before') return d<=new Date(f.val+'T23:59:59');
    if(f.op==='date_between'){const[from,to]=(f.val||'').split('|');return(!from||d>=new Date(from))&&(!to||d<=new Date(to+'T23:59:59'));}
  }
  switch(f.op){
    case 'is':return cell===val; case 'is_not':return cell!==val;
    case 'contains':return cell.includes(val); case 'not_contains':return !cell.includes(val);
    case 'has_value':return raw!==null&&raw!==undefined&&String(raw).trim()!=='';
    case 'is_empty':return raw===null||raw===undefined||String(raw).trim()==='';
    default:return true;
  }
}
function getCurrentPhase(s) {
  const start=new Date(s.start_date); start.setHours(0,0,0,0);
  const today=new Date(); today.setHours(0,0,0,0);
  const dayNum=Math.floor((today-start)/(1000*60*60*24))+1;
  const r1End=s.r1_days,gap1End=r1End+s.gap1_days,r2End=gap1End+s.r2_days,gap2End=r2End+s.gap2_days,r3End=gap2End+s.r3_days;
  if(dayNum<1)        return {phase:'NOT_STARTED',dayNum,campaign:null};
  if(dayNum<=r1End)   return {phase:'R1',dayNum,campaign:s.r1_campaign};
  if(dayNum<=gap1End) return {phase:'GAP',dayNum,campaign:null};
  if(dayNum<=r2End)   return {phase:'R2',dayNum,campaign:s.r2_campaign};
  if(dayNum<=gap2End) return {phase:'GAP',dayNum,campaign:null};
  if(dayNum<=r3End)   return {phase:'R3',dayNum,campaign:s.r3_campaign};
  return {phase:'DONE',dayNum,campaign:null};
}

// ── MAIN CRON JOB ─────────────────────────────────────────────
async function runCron(timeSlot, onlyScheduleIds = null) {
  const startTime = Date.now();
  log(`=== CRON START: ${timeSlot} ===`);
  const result = { slot:timeSlot, sent:0, failed:0, skipped:0, schedules:[] };
  try {
    // Fetch schedules + campaigns from Supabase (UI controls active/pause)
    const [sbSchedules, sbCampaigns] = await Promise.all([
      sbGet('campaign_schedule','?active=eq.true').catch(()=>[]),
      sbGet('campaigns','?active=eq.true').catch(()=>[]),
    ]);
    const schedules = sbSchedules;
    const campaignMap = {};
    sbCampaigns.forEach(c => campaignMap[c.campaign_name] = c);

    const reactivatedPhones = await getReactivatedPhones().catch(()=>new Set());
    const capReachedPhones  = await getCapReachedPhones().catch(()=>new Set());

    let leads = cacheGet('leads');
    if (leads) {
      log(`Using cached leads: ${leads.length}`);
    } else {
      log('No cached leads — fetching Metabase now...');
      for (let i=0; i<3; i++) {
        try {
          const mbRes = await fetch(METABASE_URL, { timeout: 120000, headers: { 'Accept-Encoding': 'identity' } });
          const data = await mbRes.json();
          if (!Array.isArray(data)) throw new Error('Bad Metabase response');
          leads = data;
          cacheSet('leads', leads);
          log(`Fetched ${leads.length} leads`);
          break;
        } catch(e) {
          if (i===2) throw new Error(`Metabase failed after 3 attempts: ${e.message}`);
          log(`Metabase retry ${i+1}/2 — ${e.message} — waiting ${(i+1)*2000}ms`);
          await new Promise(r=>setTimeout(r,(i+1)*2000));
        }
      }
    }

    const isManual = timeSlot.includes('(manual)');
    let activeSchedules = schedules.filter(s=>s.active && (isManual || s.send_times.includes(timeSlot)));
    if (onlyScheduleIds) activeSchedules = activeSchedules.filter(s=>onlyScheduleIds.has(s.id));
    if (!activeSchedules.length) { log(`No schedules configured for slot ${timeSlot}`); return result; }

    for (const schedule of activeSchedules) {
      const {phase,dayNum,campaign:campaignName} = getCurrentPhase(schedule);
      log(`Schedule: ${schedule.name} | Phase: ${phase} | Day: ${dayNum}`);
      if (phase==='GAP'||phase==='NOT_STARTED'||phase==='DONE') { log(`Skipping — ${phase}`); continue; }

      const campaign = campaignMap[campaignName];
      if (!campaign) { log(`Campaign not found: ${campaignName}`); continue; }

      const filters   = Array.isArray(schedule.filters_json)?schedule.filters_json:[];
      const matched   = applyFilters(leads,filters);
      const phaseDays = phase==='R1'?schedule.r1_days:phase==='R2'?schedule.r2_days:schedule.r3_days;
      const slotCount = Array.isArray(schedule.send_times)&&schedule.send_times.length ? schedule.send_times.length : 1;
      const batchSize = Math.ceil(matched.length/phaseDays);
      const perSlot   = Math.ceil(batchSize/slotCount);
      log(`Matched: ${matched.length} | Batch/day: ${batchSize} | Slots: ${slotCount} | Per slot: ${perSlot}`);

      const [sentPhones, failedPhones] = await Promise.all([
        getSentPhones(schedule.id, phase, schedule.name).catch(()=>new Set()),
        getFailedPhones(campaignName).catch(()=>new Set()),
      ]);

      // FIX 2: Daily batch cap — skip if today's batch already fully sent
      if (sentPhones.size >= batchSize) {
        log(`Skipping ${schedule.name} — daily batch already sent (${sentPhones.size}/${batchSize})`);
        result.skipped += sentPhones.size;
        continue;
      }

      // Sort consistently by lead_id for stable daily batching
      matched.sort((a,b) => String(a.lead_id||a.id||'').localeCompare(String(b.lead_id||b.id||'')));

      // Check reactivation on FULL pool first
      const newReactivated = [];
      for (const row of matched) {
        const phone = normalizePhone(row.mobile||'');
        if (!phone) continue;
        if (isReactivated(row) && !reactivatedPhones.has(phone)) {
          newReactivated.push({phone, campaign:campaignName, utm_campaign:row.latest_utm_campaign});
          reactivatedPhones.add(phone);
        }
      }
      if (newReactivated.length) {
        await sbPost('reactivated_list', newReactivated, '?on_conflict=phone');
        log(`Added ${newReactivated.length} reactivated phones`);
      }

      // Offset-based batching — skip already-sent, take next batchSize
      const toSend = [];
      let skippedCount = 0;
      for (const row of matched) {
        if (toSend.length >= batchSize) break;
        const phone = normalizePhone(row.mobile||'');
        if (!phone) continue;
        if (reactivatedPhones.has(phone)||capReachedPhones.has(phone)||failedPhones.has(phone)) { result.skipped++; continue; }
        if (sentPhones.has(phone)) { skippedCount++; continue; }
        toSend.push(row);
      }
      log(`Offset: ${skippedCount} already sent | Sending to ${toSend.length} leads`);

      const BATCH=20, newSentLog=[], newFailLog=[];
      let sent=0,failed=0;
      for (let i=0;i<toSend.length;i+=BATCH) {
        const batch=toSend.slice(i,i+BATCH);
        await Promise.all(batch.map(async (row)=>{
          const phone=normalizePhone(row.mobile||'');
          const params=(campaign.template_params||[]).map(p=>resolveParam(p,row));
          const payload={
            apiKey:SMARTPING_API_KEY, campaignName, destination:phone,
            userName:row.fullname||'User', templateParams:params,
            source:`railway-${phase.toLowerCase()}`,
            media:campaign.media_url?{url:campaign.media_url,filename:'media'}:{},
            buttons:[],carouselCards:[],location:{},attributes:{},
            paramsFallbackValue:{FirstName:firstName(row.fullname)},
          };
          try {
            const r=await fetch(SMARTPING_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
            const rJson = await r.json().catch(()=>({}));
            const messageId = rJson?.msgid || rJson?.messageId || rJson?.id || null;
            if(r.ok){
              sent++;
              newSentLog.push({
                phone, campaign:campaignName, rule_name:schedule.name,
                sent_at:new Date().toISOString(), time_slot:timeSlot,
                status:'success', phase, schedule_id:schedule.id,
                message_id:messageId, delivery_status:'sent'
              });
            } else {
              failed++;
              newFailLog.push({phone,campaign:campaignName,error:'Smartping error: '+(rJson?.message||r.status)});
            }
          }catch(e){failed++;newFailLog.push({phone,campaign:campaignName,error:e.message});}
        }));
        log(`Progress: ${Math.min(i+BATCH,toSend.length)}/${toSend.length}`);
      }

      // FIX 1: sent_log written with retry — no more silent failures
      if (newSentLog.length) await sbPost('sent_log',newSentLog);
      if (newFailLog.length) await sbPost('failed_list',newFailLog,'?on_conflict=phone,campaign');

      result.sent+=sent; result.failed+=failed;
      result.schedules.push({schedule:schedule.name,phase,dayNum,campaign:campaignName,sent,failed});
      log(`Schedule done: sent=${sent} failed=${failed}`);
    }
  } catch(e) {
    log(`ERROR: ${e.message}`);
    console.error(e);
    result.error = e.message;
  }
  const duration=Math.round((Date.now()-startTime)/1000);
  result.duration_seconds=duration;
  log(`=== CRON END: ${timeSlot} | sent=${result.sent} failed=${result.failed} duration=${duration}s ===`);
  return result;
}

// ── HTTP SERVER ───────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type','application/json');
  res.setHeader('Access-Control-Allow-Origin','*');
  if (req.method==='GET'&&req.url==='/health') {
    res.writeHead(200);
    res.end(JSON.stringify({status:'ok',service:'terratern-cron',time:new Date().toISOString()}));
    return;
  }
  if (req.method==='POST'&&req.url==='/trigger') {
    cacheClear('schedules'); cacheClear('campaigns'); cacheClear('cap_reached');
    const slot = istHHMM(nowIST())+' (manual)';
    res.writeHead(200);
    res.end(JSON.stringify({success:true,message:`Cron triggered: ${slot}`}));
    runCron(slot).catch(console.error);
    return;
  }
  if (req.method==='POST'&&req.url==='/smartping-callback') {
    let body='';
    req.on('data',chunk=>body+=chunk);
    req.on('end',async()=>{
      try {
        const data = JSON.parse(body);
        const topic = data?.topic;
        const msg   = data?.data?.message || {};
        const isOurCampaign = msg.campaign !== null && msg.campaign !== undefined;
        if (topic === 'message.status.updated' && !isOurCampaign) {
          res.writeHead(200);
          res.end(JSON.stringify({success:true}));
          return;
        }
        log(`Smartping callback: topic=${topic} campaign=${msg.campaign?.name||'null'}`);
        const messageId = msg.messageId || msg.id || data?.msgid || data?.messageId || null;
        const rawStatus = msg.status    || data?.status || data?.deliveryStatus || null;
        if (messageId && rawStatus && isOurCampaign) {
          const status = String(rawStatus).toLowerCase();
          const deliveryStatus = status.includes('deliver') ? 'delivered'
            : status.includes('read') ? 'read'
            : status.includes('fail') ? 'failed' : status;
          await sbPatch('sent_log',
            { delivery_status: deliveryStatus, delivered_at: new Date().toISOString() },
            `?message_id=eq.${encodeURIComponent(messageId)}`
          );
          log(`Updated delivery_status=${deliveryStatus} for message_id=${messageId}`);
        }
        if (topic === 'message.sender.user') {
          const phone = msg.phone_number || msg.phoneNumber || null;
          const text  = msg.message_content?.text || msg.message_content?.caption || '';
          const sentMs = msg.sent_at || Date.now();
          const repliedAt = new Date(Number(sentMs)).toISOString();
          if (phone) {
            let campaign = null;
            try {
              const recent = await sbGet('sent_log', `?phone=eq.${encodeURIComponent(phone)}&status=eq.success&order=sent_at.desc&limit=1&select=campaign`);
              campaign = recent?.[0]?.campaign || null;
            } catch (e) { log(`Reply campaign lookup failed: ${e.message}`); }
            await sbPost('reply_log', [{phone, message_text:text, replied_at:repliedAt, campaign}]);
            log(`Logged reply from ${phone} (campaign=${campaign})`);
          }
        }
        res.writeHead(200);
        res.end(JSON.stringify({success:true}));
      } catch(e) {
        log(`Callback error: ${e.message}`);
        res.writeHead(200);
        res.end(JSON.stringify({success:true}));
      }
    });
    return;
  }
  res.writeHead(404);
  res.end(JSON.stringify({error:'Not found'}));
});
server.listen(PORT, () => log(`HTTP server listening on port ${PORT}`));

// ── SCHEDULE ──────────────────────────────────────────────────
log('TerraTern Cron Service started');

async function preFetchLeads() {
  log('Pre-fetching Metabase leads...');
  for (let i=0; i<3; i++) {
    try {
      const res = await fetch(METABASE_URL, { timeout: 120000, headers: { 'Accept-Encoding': 'identity' } });
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('Bad response');
      cacheSet('leads', data);
      log(`Pre-fetch complete: ${data.length} leads cached`);
      return;
    } catch(e) {
      if (i===2) { log(`Pre-fetch failed after 3 attempts: ${e.message}`); return; }
      log(`Pre-fetch retry ${i+1}/2 — ${e.message} — waiting ${(i+1)*2000}ms`);
      await new Promise(r=>setTimeout(r,(i+1)*2000));
    }
  }
}

// Fixed send times derived from known schedule config
// Update these when schedule send_times change in Supabase UI
const uniqueSendTimes = ['07:00','10:00'];
log(`Configured send slots (IST): ${uniqueSendTimes.join(', ')}`);

uniqueSendTimes.forEach(timeIST => {
  const [hh, mm] = timeIST.split(':').map(Number);
  const totalMinUTC = hh * 60 + mm - 330;
  const utcH = Math.floor(((totalMinUTC % 1440) + 1440) % 1440 / 60);
  const utcM = ((totalMinUTC % 1440) + 1440) % 1440 % 60;
  const preFetchMinUTC = ((totalMinUTC - 10) % 1440 + 1440) % 1440;
  const pfH = Math.floor(preFetchMinUTC / 60);
  const pfM = preFetchMinUTC % 60;
  log(`Registering: pre-fetch at ${pfH}:${String(pfM).padStart(2,'0')} UTC → slot ${timeIST} IST at ${utcH}:${String(utcM).padStart(2,'0')} UTC`);
  cron.schedule(`${pfM} ${pfH} * * *`, preFetchLeads, { timezone:'UTC' });
  cron.schedule(`${utcM} ${utcH} * * *`, () => runCron(timeIST).catch(console.error), { timezone:'UTC' });
});

log('Service running — waiting for scheduled times...');
