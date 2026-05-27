// lib/kv.js — Vercel KV wrapper
import { kv } from "@vercel/kv";

// ── RULES ─────────────────────────────────────────────────────

export async function getAllRules() {
  const ids = await kv.get("rules:index") || [];
  if (!ids.length) return [];
  const rules = await Promise.all(ids.map(id => kv.get(`rules:${id}`)));
  return rules.filter(Boolean);
}

export async function getRule(id) {
  return await kv.get(`rules:${id}`);
}

export async function saveRule(rule) {
  const ids = await kv.get("rules:index") || [];
  if (!ids.includes(rule.id)) {
    await kv.set("rules:index", [...ids, rule.id]);
  }
  await kv.set(`rules:${rule.id}`, rule);
  return rule;
}

export async function updateRule(id, patch) {
  const rule = await kv.get(`rules:${id}`);
  if (!rule) return null;
  const updated = { ...rule, ...patch, updated_at: new Date().toISOString() };
  await kv.set(`rules:${id}`, updated);
  return updated;
}

export async function deleteRule(id) {
  const ids = await kv.get("rules:index") || [];
  await kv.set("rules:index", ids.filter(i => i !== id));
  await kv.del(`rules:${id}`);
}

// ── DEDUP ─────────────────────────────────────────────────────

// Returns true if this phone+campaign was already sent within windowHours
export async function isDuplicate(phone, campaign, windowHours = 24) {
  const key  = `sent:${phone}:${campaign}`;
  const last = await kv.get(key);
  if (!last) return false;
  const diff = (Date.now() - new Date(last).getTime()) / 1000 / 3600;
  return diff < windowHours;
}

export async function markSent(phone, campaign) {
  const key = `sent:${phone}:${campaign}`;
  await kv.set(key, new Date().toISOString(), { ex: 60 * 60 * 48 }); // auto-expire in 48h
}

// ── LOGS ──────────────────────────────────────────────────────

export async function addLog(entry) {
  const logs = await kv.get("logs:list") || [];
  logs.unshift({ id: Date.now().toString(36), timestamp: new Date().toISOString(), ...entry });
  const trimmed = logs.slice(0, 500);
  await kv.set("logs:list", trimmed);
}

export async function getLogs({ campaign = null, limit = 100 } = {}) {
  const logs = await kv.get("logs:list") || [];
  const filtered = campaign
    ? logs.filter(l => l.campaign && l.campaign.toLowerCase().includes(campaign.toLowerCase()))
    : logs;
  return filtered.slice(0, limit);
}

export async function getLogStats() {
  const logs = await kv.get("logs:list") || [];
  return {
    total:   logs.length,
    success: logs.filter(l => l.status === "success").length,
    failed:  logs.filter(l => l.status === "error").length,
    skipped: logs.filter(l => l.status === "skipped").length,
  };
}

export async function clearLogs() {
  await kv.set("logs:list", []);
}
