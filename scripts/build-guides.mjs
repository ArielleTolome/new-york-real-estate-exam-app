// Merge data/guides/<topic>.json into guides.json and fail loudly on any malformed chapter guide.
// Text fields are plain text; **double asterisks** mark bold. No HTML.
import { readFileSync, writeFileSync } from 'node:fs';

const bank = JSON.parse(readFileSync(new URL('../questions.json', import.meta.url)));
const errors = [];
const str = (v, where, min = 1) => (typeof v === 'string' && v.trim().length >= min) || errors.push(`${where}: expected text`);
const arr = (v, where, min) => (Array.isArray(v) && v.length >= min) || errors.push(`${where}: expected at least ${min} items`);
const noHtml = (v, where) => /<[a-z/!]/i.test(JSON.stringify(v)) && errors.push(`${where}: HTML is not allowed`);

const guides = [];
for (const { id, name } of bank.topics) {
  let g;
  try { g = JSON.parse(readFileSync(new URL(`../data/guides/${id}.json`, import.meta.url))); } catch (e) { errors.push(`${id}: ${e.message}`); continue; }
  const w = (s) => `${id}${s}`;
  if (g.topic !== id) errors.push(w(': topic mismatch'));
  if (g.title !== name) errors.push(w(`: title must be "${name}"`));
  str(g.overview, w('.overview'), 40);
  const c = g.cram || {};
  arr(c.numbers, w('.cram.numbers'), 6);
  (c.numbers || []).forEach((n, i) => { str(n.value, w(`.cram.numbers[${i}].value`)); str(n.label, w(`.cram.numbers[${i}].label`)); });
  arr(c.mustKnow, w('.cram.mustKnow'), 15);
  (c.mustKnow || []).forEach((s, i) => str(s, w(`.cram.mustKnow[${i}]`), 10));
  arr(c.traps, w('.cram.traps'), 6);
  (c.traps || []).forEach((t, i) => { str(t.trap, w(`.cram.traps[${i}].trap`)); str(t.truth, w(`.cram.traps[${i}].truth`)); });
  (c.mnemonics || []).forEach((m, i) => { str(m.name, w(`.cram.mnemonics[${i}].name`)); str(m.meaning, w(`.cram.mnemonics[${i}].meaning`)); });
  (c.formulas || []).forEach((f, i) => { str(f.name, w(`.cram.formulas[${i}].name`)); str(f.formula, w(`.cram.formulas[${i}].formula`)); });
  arr(g.sections, w('.sections'), 6);
  (g.sections || []).forEach((s, i) => {
    const at = w(`.sections[${i}]`);
    str(s.heading, `${at}.heading`);
    arr(s.points, `${at}.points`, 3);
    (s.points || []).forEach((p, k) => str(p, `${at}.points[${k}]`, 10));
    if (s.table) {
      arr(s.table.head, `${at}.table.head`, 2);
      arr(s.table.rows, `${at}.table.rows`, 2);
      (s.table.rows || []).forEach((r, k) => Array.isArray(r) && r.length === s.table.head.length || errors.push(`${at}.table.rows[${k}]: needs ${s.table.head?.length} cells`));
    }
    if (s.example) { str(s.example.title, `${at}.example.title`); arr(s.example.steps, `${at}.example.steps`, 2); }
  });
  arr(g.sources, w('.sources'), 2);
  noHtml(g, id);
  guides.push(g);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
writeFileSync(new URL('../guides.json', import.meta.url), JSON.stringify({ version: new Date().toISOString().slice(0, 10), guides }));
const words = (g) => JSON.stringify(g).split(/\s+/).length;
console.log(`guides.json: ${guides.length} chapters`);
for (const g of guides) console.log(`  ${g.topic}: ${g.sections.length} sections, ${g.cram.mustKnow.length} must-know, ~${words(g)} words`);
