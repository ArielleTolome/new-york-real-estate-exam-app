// Merge data/topics/*.json into questions.json and fail loudly on any malformed question.
import { readFileSync, writeFileSync } from 'node:fs';

const TOPICS = [
  ['license-law', 'License Law & Article 12-A'],
  ['agency', 'Law of Agency'],
  ['title-deeds', 'Legal Issues & Land Title'],
  ['estates-liens', 'Estates & Encumbrances'],
  ['contracts', 'Real Estate Contracts'],
  ['finance', 'Real Estate Finance'],
  ['land-use', 'Land Use Regulations'],
  ['construction-env', 'Construction & Environment'],
  ['valuation', 'Valuation & Market Analysis'],
  ['fair-housing', 'Human Rights & Fair Housing'],
  ['math', 'Real Estate Math'],
  ['municipal', 'Municipal Agencies'],
  ['insurance', 'Property Insurance'],
  ['taxes', 'Taxes & Assessments'],
  ['condo-coop', 'Condos & Co-ops'],
  ['commercial', 'Commercial Real Estate'],
  ['property-mgmt', 'Property Management'],
  ['rentals-dealsheet', 'Rentals & Deal Sheets'],
  ['closing', 'Closing & Settlement'],
];
const BANNED = /\b(all|none) of the above\b|\bboth [a-d] and [a-d]\b|\b[a-d] and [a-d] only\b/i;

const errors = [];
const questions = [];
const ids = new Set();
for (const [topic] of TOPICS) {
  const list = JSON.parse(readFileSync(new URL(`../data/topics/${topic}.json`, import.meta.url)));
  for (const q of list) {
    const where = `${topic}/${q.id}`;
    if (q.topic !== topic) errors.push(`${where}: topic mismatch`);
    if (ids.has(q.id)) errors.push(`${where}: duplicate id`);
    ids.add(q.id);
    if (typeof q.q !== 'string' || q.q.length < 10) errors.push(`${where}: bad stem`);
    if (!Array.isArray(q.options) || q.options.length !== 4 || new Set(q.options).size !== 4) errors.push(`${where}: need 4 distinct options`);
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) errors.push(`${where}: bad answer index`);
    if (!q.explanation || !q.citation) errors.push(`${where}: missing explanation/citation`);
    if ([q.q, ...(q.options || [])].some((s) => BANNED.test(s))) errors.push(`${where}: shuffle-unsafe option wording`);
    questions.push({ id: q.id, topic, q: q.q, options: q.options, answer: q.answer, explanation: q.explanation, citation: q.citation });
  }
}

// Near-duplicates: same keyed answer and ≥85% overlapping stem words. Different numbers in a math stem are
// different tokens, so variants of a computation with new inputs are not flagged.
const words = (s) => new Set(s.toLowerCase().replace(/[^a-z0-9$%.\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2));
const norm = (s) => s.toLowerCase().replace(/\W+/g, ' ').trim();
const sig = questions.map((q) => ({ id: q.id, w: words(q.q), a: norm(q.options[q.answer]) }));
for (let i = 0; i < sig.length; i++) {
  for (let j = i + 1; j < sig.length; j++) {
    if (sig[i].a !== sig[j].a) continue;
    let inter = 0;
    for (const w of sig[i].w) if (sig[j].w.has(w)) inter++;
    if (inter / (sig[i].w.size + sig[j].w.size - inter) >= 0.85) errors.push(`${sig[i].id} ~ ${sig[j].id}: near-duplicate question`);
  }
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
const topics = TOPICS.map(([id, name]) => ({ id, name }));
writeFileSync(new URL('../questions.json', import.meta.url), JSON.stringify({ version: new Date().toISOString().slice(0, 10), topics, questions }));
console.log(`questions.json: ${questions.length} questions`);
for (const [id] of TOPICS) console.log(`  ${id}: ${questions.filter((q) => q.topic === id).length}`);
