const MAX_LOGS = 500;
let logs = [];

export function addLog(entry) {
  logs.unshift({
    id:        Date.now().toString(36),
    timestamp: new Date().toISOString(),
    ...entry,
  });
  if (logs.length > MAX_LOGS) logs = logs.slice(0, MAX_LOGS);
}

export function getLogs({ campaign = null, limit = 100 } = {}) {
  let result = logs;
  if (campaign) {
    result = result.filter(l =>
      l.campaign && l.campaign.toLowerCase().includes(campaign.toLowerCase())
    );
  }
  return result.slice(0, limit);
}

export function getCampaignSummary() {
  const map = {};
  for (const log of logs) {
    const key = log.campaign || "unknown";
    if (!map[key]) map[key] = { campaign: key, total: 0, success: 0, failed: 0, last_run: null };
    map[key].total++;
    if (log.status === "success") map[key].success++;
    if (log.status === "error")   map[key].failed++;
    if (!map[key].last_run)       map[key].last_run = log.timestamp;
  }
  return Object.values(map);
}
