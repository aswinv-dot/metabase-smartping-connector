// pages/api/schedules-config.js
// Single source of truth for hardcoded schedule config
// Mirrors HARDCODED_SCHEDULES in cron/index.js — keep in sync

const SCHEDULES_CONFIG = [
  { id:'mr1u9lay', name:'GOC_July',  send_times:['07:00'] },
  { id:'mr1qhbuw', name:'GHC_July',  send_times:['07:00'] },
  { id:'mr33dzgm', name:'AUSB_July', send_times:['07:00'] },
  { id:'mr1wazu4', name:'APR_July',  send_times:['10:00'] },
  { id:'mr1wgqou', name:'Canada_July', send_times:['10:00'] },
];

export default function handler(req, res) {
  res.status(200).json({ schedules: SCHEDULES_CONFIG });
}
