// lib/supabase.js
const SUPABASE_URL = "https://oagsgovnxgiszofgytre.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZ3Nnb3ZueGdpc3pvZmd5dHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MzA1MjgsImV4cCI6MjA5NjEwNjUyOH0.V3eNIE3PXAcMuS3Gv0tBb3kqjVRAI25tSj8ED5W7vmI";

const headers = {
  "Content-Type":  "application/json",
  "apikey":        SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
  "Prefer":        "return=representation",
};

async function sb(path, method="GET", body=null, params="") {
  const url = `${SUPABASE_URL}/rest/v1/${path}${params}`;
  const opts = { method, headers };
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
  }, "?on_conflict=campaign_name");
}

export async function updateCampaign(name, patch) {
  return sb("campaigns", "PATCH", { ...patch, updated_at: new Date().toISOString() },
    `?campaign_name=eq.${encodeURIComponent(name)}`);
}

export async function deleteCampaign(name) {
  return sb("campaigns", "DELETE", null, `?campaign_name=eq.${encodeURIComponent(name)}`);
}

// ── RULES ─────────────────────────────────────────────────────
export async function getAllRules() {
  return sb("rules", "GET", null, "?order=created_at.asc");
}

export async function saveRule(rule) {
  return sb("rules", "POST", {
    id:           rule.id||Date.now().toString(36),
    name:         rule.name,
    campaign:     rule.campaign,
    filters_json: rule.filters||rule.filters_json||[],
    batch_size:   rule.batch_size||500,
    active:       rule.active!==false,
    updated_at:   new Date().toISOString(),
  }, "?on_conflict=id");
}

export async function updateRule(id, patch) {
  if (patch.filters) patch.filters_json = patch.filters;
  return sb("rules", "PATCH", { ...patch, updated_at: new Date().toISOString() },
    `?id=eq.${id}`);
}

export async function deleteRule(id) {
  return sb("rules", "DELETE", null, `?id=eq.${id}`);
}

// ── SENT LOG ──────────────────────────────────────────────────
export async function batchAddSentLog(entries) {
  if (!entries.length) return;
  return sb("sent_log", "POST", entries);
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
  return sb("reactivated_list","POST",entries,"?on_conflict=phone");
}

// ── FAILED LIST ───────────────────────────────────────────────
export async function getFailedPhones(campaign) {
  const rows = await sb("failed_list","GET",null,
    `?campaign=eq.${encodeURIComponent(campaign)}&select=phone`);
  return new Set(rows.map(r=>r.phone));
}

export async function batchAddFailed(entries) {
  if (!entries.length) return;
  return sb("failed_list","POST",entries,"?on_conflict=phone,campaign");
}

// ── CAP REACHED LIST ──────────────────────────────────────────
export async function getCapReachedPhones() {
  const rows = await sb("cap_reached_list","GET",null,"?select=phone");
  return new Set(rows.map(r=>r.phone));
}

export async function batchAddCapReached(entries) {
  if (!entries.length) return;
  return sb("cap_reached_list","POST",entries,"?on_conflict=phone");
}
