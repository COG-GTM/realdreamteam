require('dotenv').config({ override: true });
const { pool } = require('./db');
const { integrityReport } = require('../lib/category-admin');

async function main() {
  const report = await integrityReport();
  console.log(JSON.stringify(report, null, 2));
  if (report.unmatchedLots.length || report.unmatchedPreferences.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Category check failed: ${error.message}`);
  process.exitCode = 1;
}).finally(() => pool.end());
