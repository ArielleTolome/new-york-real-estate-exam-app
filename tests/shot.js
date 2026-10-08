// Screenshot one screen at iPhone 15 Pro size with realistic seeded progress.
// Usage: node tests/shot.js <home|build|quiz-study|quiz-study-answered|quiz-exam|results|history|mistakes|more> <out.png> [--full]
const { chromium, devices } = require('playwright');
const serve = require('./serve');
const bank = require('../questions.json');

const [shot, out, full] = process.argv.slice(2);
if (!shot || !out) { console.error('usage: node tests/shot.js <shot> <out.png> [--full]'); process.exit(2); }

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// Per-topic skill so the analytics show strong, weak, and untouched lines.
const skill = { 'license-law': .86, agency: .74, 'fair-housing': .9, finance: .55, valuation: .62, math: .48, 'title-deeds': .78, 'estates-liens': .66, contracts: .81, 'land-use': .7, municipal: .58, insurance: .76, taxes: .64, closing: .72, commercial: .5, 'condo-coop': .83 };
const state = { attempts: {}, bookmarks: {}, mistakes: {}, history: [], streak: { day: new Date().toLocaleDateString('en-CA'), count: 4 }, active: null, imported: [], config: null };
for (const q of bank.questions) {
  const p = skill[q.topic];
  if (p === undefined || rnd() > .55) continue;
  const n = 1 + Math.floor(rnd() * 3);
  let c = 0;
  for (let k = 0; k < n; k++) if (rnd() < p) c++;
  state.attempts[q.id] = { n, c, last: c === n ? 1 : 0 };
  if (c < n && Object.keys(state.mistakes).length < 9) state.mistakes[q.id] = { streak: Math.floor(rnd() * 2), at: Date.now() - Math.floor(rnd() * 864e5) };
}
Object.keys(state.attempts).slice(0, 3).forEach((id) => { state.bookmarks[id] = 1; });
const mk = (title, mode, n, acc, daysAgo) => {
  const qs = bank.questions.filter(() => rnd() < .3).slice(0, n);
  const answers = {};
  let correct = 0, byTopic = {};
  qs.forEach((q, i) => {
    const ok = rnd() < acc;
    answers[i] = ok ? q.answer : (q.answer + 1) % 4;
    if (ok) correct++;
    const t = (byTopic[q.topic] ||= { c: 0, t: 0 }); t.t++; if (ok) t.c++;
  });
  const score = correct / n;
  return { id: `seed${daysAgo}${n}`, date: Date.now() - daysAgo * 864e5, title, mode, total: n, correct, answered: n, score, passed: score >= .7, secs: n * 55, byTopic, qids: qs.map((q) => q.id), answers };
};
state.history = [mk('Mock NYS State Exam', 'exam', 75, .74, 0), mk('Quick 10-Question Drill', 'study', 10, .6, 1), mk('Custom Study Quiz', 'study', 25, .68, 2), mk('Mock NYS State Exam', 'exam', 75, .63, 3)];

(async () => {
  const server = await serve(''); // argv[2] is the shot name here, not a base URL
  const BASE = server.url;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 15 Pro'], viewport: { width: 393, height: 852 } });
  await ctx.addInitScript((s) => { if (!localStorage.getItem('nyre.v1')) localStorage.setItem('nyre.v1', s); }, JSON.stringify(state));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const go = async (hash) => { await page.goto(`${BASE}/#/${hash}`); await page.waitForSelector('#view > *:not(.muted)'); };
  const pickWrong = () => page.evaluate(() => {
    const A = window.__app.state.active;
    const q = window.__app.bank.questions.find((x) => x.id === A.qids[A.i]);
    return (A.perm[A.i].indexOf(q.answer) + 1) % 4;
  });

  if (shot === 'home') {
    await go('home');
    await page.click('[data-action="drill"]');
    await page.click('#next');
    await go('home');
  } else if (shot.startsWith('quiz')) {
    await go('home');
    await page.click(`[data-action="${shot === 'quiz-exam' ? 'mock' : 'drill'}"]`);
    await page.waitForSelector('.qcard');
    if (shot === 'quiz-study-answered') await page.click(`.opt[data-d="${await pickWrong()}"]`, { force: true });
    if (shot === 'quiz-exam') {
      for (let i = 0; i < 3; i++) { await page.click(`.opt[data-d="${i % 4}"]`); await page.click('#next'); }
      await page.click('[data-action="flag"]');
    }
  } else if (shot === 'results') {
    await go(`results/${state.history[0].id}`);
  } else {
    await go(shot);
  }
  await page.waitForTimeout(400);
  await page.screenshot({ path: out, fullPage: full === '--full' });
  await browser.close();
  server.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log(out);
})();
