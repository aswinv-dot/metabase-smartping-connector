const cron   = require('node-cron');
const fetch  = require('node-fetch');
const http   = require('http');

// ── CONFIG ────────────────────────────────────────────────────
const SMARTPING_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY3NmU5MTQ2ZjJjOGUzMGJlY2FlMDVkYiIsIm5hbWUiOiJUZXJyYXRlcm4iLCJhcHBOYW1lIjoiQWlTZW5zeSIsImNsaWVudElkIjoiNjc2ZTkxNDZmMmM4ZTMwYmVjYWUwNWNlIiwiYWN0aXZlUGxhbiI6IlBST19NT05USExZIiwiaWF0IjoxNzY5Njc2MzQ2fQ.Oj6veBiRUaPtWZ1yaVgTAp-q_JvCfXC8zuU42_T4rM4";
const SMARTPING_URL     = "https://backend.api-wa.co/campaign/smartping/api/v2";
const METABASE_URL      = "https://metabase.terratern.com/api/public/card/7e84f141-e90d-4852-a158-4d6a75bf4833/query/json";
const SUPABASE_URL      = "https://oagsgovnxgiszofgytre.supabase.co";
const SUPABASE_KEY      = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZ3Nnb3ZueGdpc3pvZmd5dHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MzA1MjgsImV4cCI6MjA5NjEwNjUyOH0.V3eNIE3PXAcMuS3Gv0tBb3kqjVRAI25tSj8ED5W7vmI";
const PORT              = process.env.PORT || 3001;

const DYNAMIC_PARAMS = {
  overseas_jobupdate_api: (row) => [firstName(row.fullname)],
  update_overseas_api:    (row) => [firstName(row.fullname)],
  hiring_jobupdate_api:   (row) => [firstName(row.fullname)],
};

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

// ── SUPABASE ──────────────────────────────────────────────────
const sbHeaders = { 'Content-Type':'application/json', 'apikey':SUPABASE_KEY, 'Authorization':`Bearer ${SUPABASE_KEY}` };
async function sbGet(path, params='') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}${params}`, { headers: sbHeaders });
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}
async function sbPost(path, data, params='') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}${params}`, {
    method:'POST', headers:{...sbHeaders,'Prefer':'return=minimal'}, body:JSON.stringify(data)
  });
  return res.ok;
}
async function sbPatch(path, data, params='') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}${params}`, {
    method:'PATCH', headers:{...sbHeaders,'Prefer':'return=minimal'}, body:JSON.stringify(data)
  });
  return res.ok;
}

async function getSchedules()         { return sbGet('campaign_schedule','?active=eq.true'); }
async function getCampaigns()         { return sbGet('campaigns','?active=eq.true'); }
async function getReactivatedPhones() { const r=await sbGet('reactivated_list','?select=phone'); return new Set(r.map(x=>x.phone)); }
async function getCapReachedPhones()  { const r=await sbGet('cap_reached_list','?select=phone'); return new Set(r.map(x=>x.phone)); }
async function getFailedPhones(campaign) { const r=await sbGet('failed_list',`?campaign=eq.${encodeURIComponent(campaign)}&select=phone`); return new Set(r.map(x=>x.phone)); }

// FIX: fetch sent phones across ALL schedule IDs for the same campaign name (handles renamed/duplicate schedules)
async function getSentPhones(schedId, phase, scheduleName) {
  // Primary: by schedule_id
  const r1 = await sbGet('sent_log',`?schedule_id=eq.${schedId}&phase=eq.${phase}&status=eq.success&select=phone`);
  const phones = new Set(r1.map(x=>x.phone));
  // Fallback: also fetch by rule_name to catch sends from old schedule IDs
  if (scheduleName) {
    const r2 = await sbGet('sent_log',`?rule_name=eq.${encodeURIComponent(scheduleName)}&phase=eq.${phase}&status=eq.success&select=phone`);
    r2.forEach(x => phones.add(x.phone));
  }
  log(`getSentPhones(${schedId}, ${phase}): ${phones.size} phones (including name-matched)`);
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
async function runCron(timeSlot) {
  const startTime = Date.now();
  log(`=== CRON START: ${timeSlot} ===`);
  const result = { slot:timeSlot, sent:0, failed:0, skipped:0, schedules:[] };

  try {
    const [mbRes, schedules, allCampaigns, reactivatedPhones, capReachedPhones] = await Promise.all([
      fetch(METABASE_URL),
      getSchedules().catch(()=>[]),
      getCampaigns().catch(()=>[]),
      getReactivatedPhones().catch(()=>new Set()),
      getCapReachedPhones().catch(()=>new Set()),
    ]);

    const leads = await mbRes.json();
    if (!Array.isArray(leads)) throw new Error('Bad Metabase response');
    log(`Fetched ${leads.length} leads`);

    const campaignMap = {};
    allCampaigns.forEach(c => campaignMap[c.campaign_name]=c);
    const activeSchedules = schedules.filter(s=>s.active);
    if (!activeSchedules.length) { log('No active schedules'); return result; }

    for (const schedule of activeSchedules) {
      const {phase,dayNum,campaign:campaignName} = getCurrentPhase(schedule);
      log(`Schedule: ${schedule.name} | Phase: ${phase} | Day: ${dayNum}`);
      if (phase==='GAP'||phase==='NOT_STARTED'||phase==='DONE') { log(`Skipping — ${phase}`); continue; }

      const campaign = campaignMap[campaignName];
      if (!campaign) { log(`Campaign not found: ${campaignName}`); continue; }

      const filters   = Array.isArray(schedule.filters_json)?schedule.filters_json:[];
      const matched   = applyFilters(leads,filters);
      const phaseDays = phase==='R1'?schedule.r1_days:phase==='R2'?schedule.r2_days:schedule.r3_days;
      const batchSize = Math.ceil(matched.length/phaseDays);
      const perSlot   = Math.ceil(batchSize/3);
      log(`Matched: ${matched.length} | Batch/day: ${batchSize} | Per slot: ${perSlot}`);

      const prevPhase = phase==='R2'?'R1':phase==='R3'?'R2':null;
      const [sentPhones, failedPhones, prevPhaseSent] = await Promise.all([
        getSentPhones(schedule.id, phase, schedule.name).catch(()=>new Set()),
        getFailedPhones(campaignName).catch(()=>new Set()),
        prevPhase ? getSentPhones(schedule.id, prevPhase, schedule.name).catch(()=>new Set()) : Promise.resolve(new Set()),
      ]);

      // FIX: if prevPhaseSent is empty for R2/R3, warn and skip the gate rather than blocking all sends
      const prevPhaseEmpty = prevPhase && prevPhaseSent.size === 0;
      if (prevPhaseEmpty) {
        log(`WARNING: prevPhaseSent(${prevPhase}) returned 0 phones — R2 gate disabled for this run to prevent blocking all sends`);
      }

      const toSend=[], newReactivated=[];
      for (const row of matched) {
        if (toSend.length>=perSlot) break;
        const phone=normalizePhone(row.mobile||'');
        if (!phone) continue;
        if (isReactivated(row)) { if(!reactivatedPhones.has(phone)){newReactivated.push({phone,campaign:campaignName,utm_campaign:row.latest_utm_campaign});reactivatedPhones.add(phone);} result.skipped++; continue; }
        if (capReachedPhones.has(phone)||sentPhones.has(phone)||failedPhones.has(phone)) { result.skipped++; continue; }
        // FIX: only apply prev-phase gate if we actually have prev phase data
        if (!prevPhaseEmpty) {
          if (phase==='R2'&&!prevPhaseSent.has(phone)) continue;
          if (phase==='R3'&&!prevPhaseSent.has(phone)) continue;
        }
        toSend.push(row);
      }

      log(`Sending to ${toSend.length} leads`);
      if (newReactivated.length) await sbPost('reactivated_list',newReactivated,'?on_conflict=phone');

      const BATCH=20, newSentLog=[], newFailLog=[];
      let sent=0,failed=0;

      for (let i=0;i<toSend.length;i+=BATCH) {
        const batch=toSend.slice(i,i+BATCH);
        await Promise.all(batch.map(async (row)=>{
          const phone=normalizePhone(row.mobile||'');
          const dynFn=DYNAMIC_PARAMS[campaignName];
          const params=dynFn?dynFn(row):(campaign.template_params||[]);
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
            // FIX: capture message_id from Smartping response
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
    const istMin=(new Date().getUTCHours()*60+new Date().getUTCMinutes())+330;
    const istH=Math.floor(istMin/60)%24;
    const slot = istH===17?'5:00PM':istH===18?'6:00PM':istH===19?'7:00PM':'manual';
    res.writeHead(200);
    res.end(JSON.stringify({success:true,message:`Cron triggered: ${slot}`}));
    runCron(slot).catch(console.error);
    return;
  }

  // FIX: Smartping delivery callback endpoint
  if (req.method==='POST'&&req.url==='/smartping-callback') {
    let body='';
    req.on('data',chunk=>body+=chunk);
    req.on('end',async()=>{
      try {
        const data = JSON.parse(body);
        log(`Smartping callback: ${JSON.stringify(data)}`);
        const messageId = data?.msgid || data?.messageId || data?.id;
        const status    = data?.status || data?.deliveryStatus;
        if (messageId && status) {
          const deliveryStatus = String(status).toLowerCase().includes('deliver') ? 'delivered'
            : String(status).toLowerCase().includes('read') ? 'read'
            : String(status).toLowerCase().includes('fail') ? 'failed' : status;
          await sbPatch('sent_log',
            { delivery_status: deliveryStatus, delivered_at: new Date().toISOString() },
            `?message_id=eq.${encodeURIComponent(messageId)}`
          );
          log(`Updated delivery_status=${deliveryStatus} for message_id=${messageId}`);
        }
        res.writeHead(200);
        res.end(JSON.stringify({success:true}));
      } catch(e) {
        log(`Callback error: ${e.message}`);
        res.writeHead(200); // always 200 to Smartping
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
log('Scheduled: 7:00 PM IST daily');

cron.schedule('30 13 * * *', () => runCron('7:00PM'), { timezone:'UTC' });

log('Service running — waiting for scheduled times...');
