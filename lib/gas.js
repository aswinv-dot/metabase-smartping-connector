// lib/gas.js — Google Apps Script proxy
const GAS_URL = "https://script.google.com/macros/s/AKfycbwqA9phseoKP-IGXoV9Efx-NtCLmmMpZiZ2N1ZAAH3D4DhD_MMGr9Hv2CRVAPTU_zy4/exec";

export async function gasGet(params = {}) {
  const qs  = new URLSearchParams(params).toString();
  const res = await fetch(`${GAS_URL}?${qs}`);
  return res.json();
}

export async function gasPost(body = {}) {
  const res = await fetch(GAS_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  return res.json();
}

// ── RULES ─────────────────────────────────────────────────────
export async function getAllRules() {
  const data = await gasGet({ action: "getRules" });
  return data.rules || [];
}

export async function saveRule(rule) {
  return gasPost({ action: "saveRule", rule });
}

export async function updateRule(id, patch) {
  return gasPost({ action: "updateRule", id, patch });
}

export async function deleteRule(id) {
  return gasPost({ action: "deleteRule", id });
}

// ── LOGS ──────────────────────────────────────────────────────
export async function getLogs() {
  return gasGet({ action: "getLogs" });
}

export async function addLog(entry) {
  return gasPost({ action: "addLog", entry });
}

// ── DEDUP ─────────────────────────────────────────────────────
export async function isDuplicate(phone, campaign) {
  const data = await gasGet({ action: "checkDedup", phone, campaign });
  return data.isDuplicate === true;
}

export async function markSent(phone, campaign) {
  return gasPost({ action: "markSent", phone, campaign });
}
