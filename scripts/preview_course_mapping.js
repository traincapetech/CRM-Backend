/**
 * DRY RUN ONLY - READ-ONLY. Matches existing Sale.course text to the certification
 * catalog and writes a CSV report for human review. Performs NO database writes.
 *
 * Usage: node scripts/preview_course_mapping.js <output.csv>
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const mongoose = require('mongoose');
const { matchCourse } = require('../utils/certificationMatcher');

const out = process.argv[2] || 'course_mapping_report.csv';
const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const rows = await mongoose.connection.db
    .collection('sales')
    .aggregate([{ $group: { _id: '$course', count: { $sum: 1 } } }, { $sort: { count: -1 } }])
    .toArray();

  const lines = ['status,sales_count,raw_text,matched_code,matched_name,vendor,other_candidates'];
  const stat = { exact: 0, probable: 0, ambiguous: 0, none: 0 };
  const salesStat = { exact: 0, probable: 0, ambiguous: 0, none: 0 };

  rows.forEach((r) => {
    const m = matchCourse(r._id);
    stat[m.status]++;
    salesStat[m.status] += r.count;
    const e = m.entry || (m.candidates && m.candidates[0]) || {};
    const others = m.candidates ? m.candidates.map((c) => c.code).join(' | ') : '';
    lines.push([m.status, r.count, q(r._id), q(e.code), q(e.name), q(e.vendor), q(others)].join(','));
  });

  fs.writeFileSync(out, lines.join('\n'));
  console.log(`Raw strings: ${rows.length}`);
  console.log('By distinct strings:', stat);
  console.log('By number of sales :', salesStat);
  console.log(`Report written to ${out}`);
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

