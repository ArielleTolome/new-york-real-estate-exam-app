// End-to-end suite: node test-e2e.js [baseUrl]. Without a URL it serves this folder on a free port.
const { chromium, devices } = require('playwright');
const serve = require('./tests/serve');
const assert = require('node:assert/strict');

let BASE;
const results = [];

async function check(name, fn) {
  try {
    await fn();
    results.push([name, true]);
    console.log(`PASS  ${name}`);
  } catch (e) {
    results.push([name, false]);
    console.log(`FAIL  ${name}\n      ${e.message.split('\n').join('\n      ')}`);
  }
}

const state = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__app.state)));
const correctD = (page) => page.evaluate(() => {
  const A = window.__app.state.active;
  const q = window.__app.bank.questions.find((x) => x.id === A.qids[A.i]);
  return A.perm[A.i].indexOf(q.answer);
});
async function pick(page, correct) {
  const d = await correctD(page);
  await page.click(`.opt[data-d="${correct ? d : (d + 1) % 4}"]`);
}

(async () => {
  const server = await serve();
  BASE = server.url;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 15 Pro'], viewport: { width: 393, height: 852 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await check('1. App loads and renders home dashboard with countdown', async () => {
    await page.goto(BASE + '/#/home');
    await page.waitForSelector('#countdown');
    assert.match(await page.textContent('#countdown'), /^(\d+d \d\dh \d\dm|Exam day)$/);
    assert.ok(await page.isVisible('.gauge'));
    for (const label of ['Quick 10-Question Drill', 'Mock 75-Question NYS State Exam', 'Custom Quiz Builder']) {
      assert.ok(await page.getByText(label).isVisible(), `missing ${label}`);
    }
  });

  await check('2. Question bank loads 300+ questions without corruption', async () => {
    const r = await page.evaluate(async () => {
      const data = await (await fetch('questions.json')).json();
      const ids = new Set();
      const bad = data.questions.filter((q) => {
        const dup = ids.has(q.id);
        ids.add(q.id);
        return dup || q.options.length !== 4 || new Set(q.options).size !== 4 || !(q.answer >= 0 && q.answer < 4) || !q.q || !q.citation || !data.topics.some((t) => t.id === q.topic);
      });
      const perTopic = data.topics.map((t) => data.questions.filter((q) => q.topic === t.id).length);
      return { n: data.questions.length, loaded: window.__app.bank.questions.length, bad: bad.map((q) => q.id), topics: data.topics.length, minTopic: Math.min(...perTopic) };
    });
    assert.ok(r.n >= 300, `only ${r.n} questions`);
    assert.equal(r.loaded, r.n);
    assert.deepEqual(r.bad, []);
    assert.equal(r.topics, 19);
    assert.ok(r.minTopic >= 15, `a topic has only ${r.minTopic} questions`);
  });

  await check('3. Custom quiz with Agency + Fair Housing yields only those topics', async () => {
    await page.goto(BASE + '/#/build');
    await page.click('[data-action="topics-none"]');
    assert.ok(await page.isDisabled('#start'));
    await page.click('.chip[data-id="agency"]');
    await page.click('.chip[data-id="fair-housing"]');
    await page.fill('#count', '33'); // custom count input (commits on change/blur)
    await page.press('#count', 'Tab');
    assert.match(await page.textContent('#start'), /^Start 33-question quiz$/);
    await page.click('[data-action="set"][data-key="mode"][data-val="study"]');
    await page.click('[data-action="set"][data-key="filter"][data-val="all"]');
    await page.click('#start');
    await page.waitForSelector('.qcard');
    const s = await state(page);
    const topics = await page.evaluate((ids) => ids.map((id) => window.__app.bank.questions.find((q) => q.id === id).topic), s.active.qids);
    const poolSize = await page.evaluate(() => window.__app.bank.questions.filter((q) => ['agency', 'fair-housing'].includes(q.topic)).length);
    assert.equal(s.active.qids.length, Math.min(33, poolSize));
    assert.ok(poolSize > 10);
    assert.deepEqual([...new Set(topics)].sort(), ['agency', 'fair-housing']);
    assert.match(await page.textContent('#qpos'), /^Q 1 of \d+$/);
  });

  await check('4. Study mode shows instant green/red and reveals the legal citation', async () => {
    assert.equal(await page.locator('#cite').count(), 0);
    await pick(page, false);
    assert.equal(await page.locator('.opt.wrong').count(), 1);
    assert.equal(await page.locator('.opt.correct').count(), 1);
    assert.ok(await page.isVisible('#cite'));
    assert.match(await page.textContent('#feedback'), /Incorrect/);
    await page.click('#next');
    await pick(page, true);
    assert.equal(await page.locator('.opt.correct').count(), 1);
    assert.equal(await page.locator('.opt.wrong').count(), 0);
    assert.match(await page.textContent('#feedback'), /Correct/);
    const before = await page.innerHTML('.opts');
    await page.click('.opt[data-d="0"]', { force: true }); // answers lock after the first tap in study mode
    assert.equal(await page.innerHTML('.opts'), before);
  });

  let examMissed;
  await check('5. Exam mode hides feedback, runs the 90:00 timer, scores on submit', async () => {
    await page.goto(BASE + '/#/home');
    await page.click('[data-action="mock"]');
    await page.waitForSelector('#timer');
    assert.match(await page.textContent('#timer'), /^(90:00|89:5\d)$/);
    const s0 = await state(page);
    assert.equal(s0.active.qids.length, 75);
    assert.equal(s0.active.mode, 'exam');
    const plan = [true, true, true, false, false];
    for (const ok of plan) {
      await pick(page, ok);
      assert.equal(await page.locator('.opt.selected').count(), 1);
      assert.equal(await page.locator('.opt.correct, .opt.wrong, #cite, #feedback').count(), 0);
      await page.click('#next');
    }
    examMissed = s0.active.qids.slice(3, 5);
    await page.waitForFunction(() => /^89:[45]\d$/.test(document.querySelector('#timer').textContent), null, { timeout: 5000 });
    await page.click('[data-action="end"]'); // first tap only arms the top-bar Submit in exam mode
    assert.equal(await page.textContent('[data-action="end"]'), 'Confirm');
    assert.equal(await page.locator('#score').count(), 0);
    await page.click('[data-action="end"]');
    await page.waitForSelector('#score');
    assert.equal(await page.textContent('#score'), `${Math.round((3 / 75) * 100)}%`);
    assert.equal(await page.textContent('#verdict'), 'FAIL');
    const s = await state(page);
    assert.equal(s.history[0].correct, 3);
    assert.equal(s.history[0].answered, 5);
    assert.equal(s.active, null);
  });

  await check('6. Mistake bank collects wrong answers and supports targeted retest', async () => {
    let s = await state(page);
    for (const id of examMissed) assert.ok(s.mistakes[id], `missing mistake ${id}`);
    const n = Object.keys(s.mistakes).length;
    await page.goto(BASE + '/#/mistakes');
    assert.equal(await page.locator('#mlist > li').count(), n);
    await page.click('[data-action="review-mistakes"]');
    await page.waitForSelector('.qcard');
    s = await state(page);
    assert.deepEqual([...s.active.qids].sort(), Object.keys(s.mistakes).sort());
    const target = s.active.qids[0];
    await pick(page, true);
    s = await state(page);
    assert.equal(s.mistakes[target].streak, 1, 'one correct answer must not clear');
    await page.click('[data-action="end"]');
    await page.goto(BASE + '/#/mistakes');
    await page.click('[data-action="review-mistakes"]');
    await page.waitForSelector('.qcard');
    while ((await state(page)).active.qids[(await state(page)).active.i] !== target) await page.click('#next');
    await pick(page, true);
    s = await state(page);
    assert.equal(s.mistakes[target], undefined, 'two consecutive correct answers clear the mistake');
  });

  await check('7. Bookmark toggles and persists across reloads', async () => {
    const id = (await state(page)).active.qids[(await state(page)).active.i];
    await page.click('[data-action="bookmark"]');
    assert.equal(await page.getAttribute('[data-action="bookmark"]', 'aria-pressed'), 'true');
    await page.reload();
    await page.waitForSelector('.qcard');
    assert.equal(await page.getAttribute('[data-action="bookmark"]', 'aria-pressed'), 'true');
    assert.equal((await state(page)).bookmarks[id], 1);
    await page.goto(BASE + '/#/build');
    await page.click('[data-action="topics-all"]');
    assert.match(await page.textContent('[data-key="filter"][data-val="bookmarked"]'), /Bookmarked 1$/);
    await page.goto(BASE + '/#/quiz');
    await page.click('[data-action="bookmark"]');
    await page.reload();
    await page.waitForSelector('.qcard');
    assert.equal(await page.getAttribute('[data-action="bookmark"]', 'aria-pressed'), 'false');
  });

  await check('8. Service worker registers, caches all assets, app works offline', async () => {
    await page.goto(BASE + '/#/home');
    await page.evaluate(() => navigator.serviceWorker.ready);
    const cached = await page.evaluate(async () => {
      const names = await caches.keys();
      if (names.length !== 1) throw new Error(`expected one cache, got ${names}`);
      const c = await caches.open(names[0]);
      return (await c.keys()).map((r) => new URL(r.url).pathname);
    });
    for (const p of ['/', '/index.html', '/app.js', '/app.css', '/questions.json', '/guides.json', '/views/study.js', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png']) {
      assert.ok(cached.includes(p), `not cached: ${p}`);
    }
    await ctx.setOffline(true);
    await page.reload();
    await page.waitForSelector('#countdown');
    await page.click('[data-action="drill"]');
    await page.waitForSelector('.qcard');
    await ctx.setOffline(false);
  });

  await check('9. Study guides: every chapter, cram sheet, full notes, chapter practice', async () => {
    await page.goto(BASE + '/#/study');
    await page.waitForSelector('#chapters');
    const topics = await page.evaluate(() => window.__app.bank.topics.length);
    assert.equal(await page.locator('#chapters .st-row').count(), topics);
    await page.click('a.st-row[href="#/study/agency"]');
    await page.waitForSelector('#cram');
    assert.ok((await page.locator('.st-nums > div').count()) >= 6, 'key numbers');
    assert.ok((await page.locator('.st-must li').count()) >= 15, 'must-know list');
    assert.ok((await page.locator('.st-traps li').count()) >= 6, 'traps');
    assert.equal(await page.locator('strong:has-text("**")').count(), 0, 'bold markup rendered, not shown raw');
    await page.click('.st-seg a[href="#/study/agency/notes"]');
    await page.waitForSelector('#notes');
    const n = await page.locator('.st-sec').count();
    assert.ok(n >= 6, `only ${n} sections`);
    assert.equal(await page.locator('.st-toc [data-action="toc"]').count(), n);
    await page.click('.st-toc summary'); // phones get the section list collapsed
    await page.click('[data-action="toc"][data-target="sec-3"]');
    await page.waitForFunction(() => Math.abs(document.getElementById('sec-3').getBoundingClientRect().top) < 260, null, { timeout: 3000 });
    assert.ok(!(await page.content()).includes('**'), 'no raw ** markup');
    await page.click('[data-action="practice-topic"]');
    await page.waitForSelector('.qcard');
    const s = await state(page);
    const qt = await page.evaluate((ids) => [...new Set(ids.map((id) => window.__app.bank.questions.find((q) => q.id === id).topic))], s.active.qids);
    assert.deepEqual(qt, ['agency']);
    assert.equal(s.active.qids.length, 25);
  });

  await check('10. Every screen has a visible way back to Home; leaving a quiz keeps it resumable', async () => {
    await page.click('[data-action="exit"]'); // the chapter-practice quiz from check 9 is still running
    await page.waitForSelector('[data-action="resume"]');
    assert.ok((await state(page)).active, 'quiz was discarded on exit');
    const resultsId = (await state(page)).history[0].id;
    for (const r of ['home', 'study', 'study/agency', 'study/agency/notes', 'build', 'quiz', 'history', 'mistakes', 'more', `results/${resultsId}`]) {
      await page.goto(BASE + '/#/' + r);
      await page.waitForSelector('#view > *:not(.muted)');
      const ways = page.locator('#bottom a[href="#/home"], .hdr-back, [data-action="exit"]').filter({ visible: true });
      assert.ok((await ways.count()) > 0, `no way back from #/${r}`);
    }
    await page.goto(BASE + '/#/build');
    await page.waitForSelector('#start');
    const [start, tabs] = await Promise.all([page.locator('#start').boundingBox(), page.locator('#bottom .tabs').boundingBox()]);
    assert.ok(start.y + start.height <= tabs.y, 'Start bar overlaps the tab bar');
  });

  await check('No uncaught page errors during the run', async () => {
    assert.deepEqual(errors, []);
  });

  await browser.close();
  server.close();
  const failed = results.filter(([, ok]) => !ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
