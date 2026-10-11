const http = require('http');
const db = require('../db.cjs');

// 1. Check SQLite labor query
const labor = db.query("SELECT * FROM resources WHERE category = 'Labor'");
console.log(`[Check 1] Found ${labor.length} labor resources in DB:`, labor.map(l => l.description));
if (labor.length === 0) throw new Error("No labor resources found in DB");

// 2. Check schedules_4d table
db.run("INSERT OR REPLACE INTO schedules_4d (id, project_id, data, updated_at) VALUES ('test_proj', 'test_proj', ?, CURRENT_TIMESTAMP)", [
  JSON.stringify([{ id: 'task-test', workDesc: 'Self-check task', startDate: '2026-10-01', endDate: '2026-10-05', progress: 50 }])
]);
const row = db.get("SELECT data FROM schedules_4d WHERE project_id = 'test_proj'");
const parsed = JSON.parse(row.data);
console.log(`[Check 2] Successfully saved & retrieved 4D schedule from DB:`, parsed[0].workDesc);

// Cleanup test project row
db.run("DELETE FROM schedules_4d WHERE id = 'test_proj'");

console.log("[All self-checks passed!]");
