// lib/supabase.js
const SUPABASE_URL = "https://oagsgovnxgiszofgytre.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZ3Nnb3ZueGdpc3pvZmd5dHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MzA1MjgsImV4cCI6MjA5NjEwNjUyOH0.V3eNIE3PXAcMuS3Gv0tBb3kqjVRAI25tSj8ED5W7vmI";

const headers = {
  "Content-Type":  "application/json",
  "apikey":        SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
};

const headersInsert = {
  "Content-Type":  "application/json",
  "apikey":        SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
  "Prefer":        "return=minimal",
};

const headersUpsert = {
  "Content-Type":  "application/json",
  "apikey":        SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
  "Prefer":        "return=representation,resolution=merge-duplicates",
};

async function sb(path, method="GET", body=null, params="", hdrs=null) {
  const url  = `${SUPABASE_URL}/rest/v1/${path}${params}`;
  const opts = { method, headers: hdrs||headers };
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch(url, opts);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase ${method} ${path}: ${err}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

// ── CAMPAIGNS ─────────────────────────────────────────────────
export async function getCampaigns() {
  return sb("campaigns", "GET", null, "?order=created_at.asc");
}

export async function saveCampaign(c) {
  return sb("campaigns", "POST", {
    campaign_name:   c.campaign_name,
    template_params: c.template_params||[],
    test_params:     c.test_params||[],
    media_url:       c.media_url||"",
    media_type:      c.media_type||"",
    active:          c.active!==false,
    updated_at:      new Date().toISOString(),
  }, "?on_conflict=campaign_name", headersUpsert);
}

export async function updateCampaign(name, patch) {
  return sb("campaigns", "PATCH", { ...patch, updated_at: new Date().toISOString() },
    `?campaign_name=eq.${encodeURIComponent(name)}`);
}

export async function deleteCampaign(name) {
  return sb("campaigns", "DELETE", null, `?campaign_name=eq.${encodeURIComponent(name)}`);
}

// ── SENT LOG ──────────────────────────────────────────────────
export async function batchAddSentLog(entries) {
  if (!entries.length) return;
  return sb("sent_log", "POST", entries, "", headersInsert);
}

export async function getSentPhones(campaign) {
  // returns set of phones already successfully sent for this campaign
  const rows = await sb("sent_log", "GET", null,
    `?campaign=eq.${encodeURIComponent(campaign)}&status=eq.success&select=phone`);
  return new Set(rows.map(r => r.phone));
}

export async function getPhoneSendCounts() {
  // returns map of phone → total send count across all campaigns
  const rows = await sb("phone_send_counts", "GET", null, "?select=phone,send_count");
  const map  = {};
  rows.forEach(r => map[r.phone] = parseInt(r.send_count)||0);
  return map;
}

// ── REACTIVATED LIST ──────────────────────────────────────────
export async function getReactivatedPhones() {
  const rows = await sb("reactivated_list","GET",null,"?select=phone");
  return new Set(rows.map(r=>r.phone));
}

export async function batchAddReactivated(entries) {
  if (!entries.length) return;
  return sb("reactivated_list","POST",entries,"?on_conflict=phone",headersUpsert);
}

// ── FAILED LIST ───────────────────────────────────────────────
export async function getFailedPhones(campaign) {
  const rows = await sb("failed_list","GET",null,
    `?campaign=eq.${encodeURIComponent(campaign)}&select=phone`);
  return new Set(rows.map(r=>r.phone));
}

export async function batchAddFailed(entries) {
  if (!entries.length) return;
  return sb("failed_list","POST",entries,"?on_conflict=phone,campaign",headersUpsert);
}

// ── CAP REACHED LIST ──────────────────────────────────────────
export async function getCapReachedPhones() {
  const rows = await sb("cap_reached_list","GET",null,"?select=phone");
  return new Set(rows.map(r=>r.phone));
}

export async function batchAddCapReached(entries) {
  if (!entries.length) return;
  return sb("cap_reached_list","POST",entries,"?on_conflict=phone",headersUpsert);
}

// ── CAMPAIGN SCHEDULE ─────────────────────────────────────────
export async function getSchedules() {
  return sb("campaign_schedule", "GET", null, "?order=created_at.asc");
}

export async function saveSchedule(schedule) {
  return sb("campaign_schedule", "POST", {
    id:           schedule.id || Date.now().toString(36),
    name:         schedule.name,
    start_date:   schedule.start_date,
    filters_json: schedule.filters_json || [],
    // FIX: configurable send times (replaces fixed 5/6/7 PM). Always exactly 3, "HH:MM" 24h IST.
    send_times:   Array.isArray(schedule.send_times) && schedule.send_times.length === 3
                    ? schedule.send_times
                    : ['17:00','18:00','19:00'],
    r1_campaign:  schedule.r1_campaign,
    r1_days:      schedule.r1_days || 8,
    gap1_days:    schedule.gap1_days || 1,
    r2_campaign:  schedule.r2_campaign,
    r2_days:      schedule.r2_days || 8,
    gap2_days:    schedule.gap2_days || 1,
    r3_campaign:  schedule.r3_campaign,
    r3_days:      schedule.r3_days || 8,
    active:       schedule.active !== false,
    updated_at:   new Date().toISOString(),
  }, "?on_conflict=id", headersUpsert);
}

export async function updateSchedule(id, patch) {
  return sb("campaign_schedule", "PATCH",
    { ...patch, updated_at: new Date().toISOString() },
    `?id=eq.${id}`
  );
}

export async function deleteSchedule(id) {
  return sb("campaign_schedule", "DELETE", null, `?id=eq.${id}`);
}

// ── PHASE HELPER ──────────────────────────────────────────────
export function getCurrentPhase(schedule) {
  const start    = new Date(schedule.start_date);
  const today    = new Date();
  today.setHours(0,0,0,0);
  start.setHours(0,0,0,0);
  const dayNum   = Math.floor((today - start) / (1000*60*60*24)) + 1;

  const r1End    = schedule.r1_days;
  const gap1End  = r1End + schedule.gap1_days;
  const r2End    = gap1End + schedule.r2_days;
  const gap2End  = r2End + schedule.gap2_days;
  const r3End    = gap2End + schedule.r3_days;

  if (dayNum < 1)           return { phase: 'NOT_STARTED', dayNum };
  if (dayNum <= r1End)      return { phase: 'R1', dayNum, campaign: schedule.r1_campaign };
  if (dayNum <= gap1End)    return { phase: 'GAP', dayNum };
  if (dayNum <= r2End)      return { phase: 'R2', dayNum, campaign: schedule.r2_campaign };
  if (dayNum <= gap2End)    return { phase: 'GAP', dayNum };
  if (dayNum <= r3End)      return { phase: 'R3', dayNum, campaign: schedule.r3_campaign };
  return { phase: 'DONE', dayNum };
}

// ── SENT LOG WITH PHASE ───────────────────────────────────────
export async function getSentPhonesByPhase(scheduleId, phase) {
  const rows = await sb("sent_log", "GET", null,
    `?schedule_id=eq.${scheduleId}&phase=eq.${phase}&status=eq.success&select=phone`
  );
  return new Set(rows.map(r => r.phone));
}

export async function batchAddSentLogWithPhase(entries) {
  if (!entries.length) return;
  return sb("sent_log", "POST", entries, "", headersInsert);
}
