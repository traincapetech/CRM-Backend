/**
 * Shared helper: match a free-text course string against the certification catalog.
 * Pure function, no DB access.
 *
 * Returns { status, entry?, candidates? }
 *   exact     - normalized text equals a code/alias
 *   probable  - text contains a code/alias plus extra words (e.g. "AZ-900 with exam")
 *   ambiguous - several catalog entries match equally
 *   none      - nothing matched
 */
const catalog = require('../data/certificationCatalog');

const NOISE = new Set(['microsoft', 'comptia', 'certification', 'certified', 'training', 'exam', 'course', 'the', 'pmi', 'isaca', 'cisco', 'azure_']);

const tokenize = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/\+/g, '+ ')
    .replace(/[^a-z0-9+\s]/g, ' ')
    .replace(/\s*\+\s*/g, '+ ')
    .split(/\s+/)
    .filter((t) => t && !NOISE.has(t));

const compact = (tokens) => tokens.join('');

// Pre-compute keys per catalog entry
const keyed = catalog.map((entry) => {
  const aliasList = [entry.code, ...entry.aliases].map((a) => {
    const tokens = tokenize(a);
    return { tokens, compact: compact(tokens) };
  });
  return { entry, aliasList };
});

function matchCourse(raw) {
  const tokens = tokenize(raw);
  const comp = compact(tokens);
  if (!comp) return { status: 'none' };

  const exact = [];
  const probable = [];

  keyed.forEach(({ entry, aliasList }) => {
    let best = null;
    for (const a of aliasList) {
      if (!a.compact) continue;
      if (a.compact === comp) {
        best = 'exact';
        break;
      }
      // alias tokens are a subset of input tokens, or compact alias appears inside compact input
      const subset = a.tokens.every((t) => tokens.includes(t));
      const inside = a.compact.length >= 5 && comp.includes(a.compact);
      if ((subset && a.tokens.length >= 2) || inside || (subset && a.tokens.length === 1 && a.compact.length >= 3)) {
        best = best || 'probable';
      }
    }
    if (best === 'exact') exact.push(entry);
    else if (best === 'probable') probable.push(entry);
  });

  const pick = (list, status) => {
    if (list.length === 1) return { status, entry: list[0] };
    // prefer the most specific (longest code) when one entry is a superset
    const sorted = [...list].sort((a, b) => b.code.length - a.code.length);
    return { status: 'ambiguous', candidates: sorted };
  };

  if (exact.length) return pick(exact, 'exact');
  if (probable.length) return pick(probable, 'probable');
  return { status: 'none' };
}

module.exports = { matchCourse, tokenize };

