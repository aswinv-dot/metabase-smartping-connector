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

export function getStats() {
  const total   = logs.length;
  const success = logs.filter(l => l.status === 'success').length;
  const failed  = logs.filter(l => l.status === 'error').length;
  return { total, success, failed };
}

export function clearLogs() {
  logs = [];
}
