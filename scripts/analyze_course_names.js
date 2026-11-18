/**
 * READ-ONLY analysis of Sale.course values.
 * Makes NO writes. Groups spelling variants so an admin can approve a mapping.
 * Usage: node scripts/analyze_course_names.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const STOP = new Set(['microsoft', 'certification', 'certified', 'course', 'training', 'exam', 'the', 'and', 'of', 'in', 'for', 'a']);

const normalize = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w))
    .sort()
    .join(' ');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const col = mongoose.connection.db.collection('sales');
  const rows = await col
    .aggregate([{ $group: { _id: '$course', count: { $sum: 1 } } }, { $sort: { count: -1 } }])
    .toArray();

  const groups = {};
  rows.forEach((r) => {
    const key = normalize(r._id) || '(empty)';
    (groups[key] = groups[key] || { total: 0, variants: [] });
    groups[key].total += r.count;
    groups[key].variants.push({ value: r._id, count: r.count });
  });

  const out = Object.entries(groups)
    .map(([key, g]) => ({ key, ...g }))
    .sort((a, b) => b.total - a.total);

  console.log(`Distinct raw course strings: ${rows.length}`);
  console.log(`Proposed normalized groups:  ${out.length}\n`);
  out.forEach((g, i) => {
    console.log(`${String(i + 1).padStart(3)}. [${g.total} sales] ${g.key}`);
    if (g.variants.length > 1) g.variants.forEach((v) => console.log(`       - "${v.value}" x${v.count}`));
  });

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

