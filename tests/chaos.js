// "Tester army": 100+ rapid random actions; fails on any page error, a frame stall > 1s, or heap/DOM growth.
const { chromium, devices } = require('playwright');
const serve = require('./serve');

let BASE;
const rnd = (n) => Math.floor(Math.random() * n);

(async () => {
  const server = await serve();
  BASE = server.url;
  const browser = await chromium.launch({ args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  const ctx = await browser.newContext({ ...devices['iPhone 15 Pro'], viewport: { width: 393, height: 852 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(BASE + '/#/home');
  await page.waitForSelector('#countdown');

  const heap = () => page.evaluate(() => { window.gc?.(); return performance.memory.usedJSHeapSize; });
  const frame = () => page.evaluate(() => new Promise((r) => { const t = performance.now(); requestAnimationFrame(() => r(performance.now() - t)); }));
  const heap0 = await heap();
  let worstFrame = 0;
  const log = {};
  const tally = (k) => { log[k] = (log[k] || 0) + 1; };

  // 5 custom quizzes in succession with random settings.
  for (let q = 0; q < 5; q++) {
    await page.goto(BASE + '/#/build');
    await page.click('[data-action="topics-none"]');
    const chips = await page.$$eval('.chip', (els) => els.map((e) => e.dataset.id));
    for (let k = 0; k < 1 + rnd(4); k++) await page.click(`.chip[data-id="${chips[rnd(chips.length)]}"]`);
    if (!(await page.$$('.chip[aria-pressed="true"]')).length) await page.click('.chip');
    await page.click(`[data-key="count"][data-val="${[10, 25, 50, 75][rnd(4)]}"]`);
    await page.click(`[data-key="mode"][data-val="${['study', 'exam'][rnd(2)]}"]`);
    await page.click('[data-key="filter"][data-val="all"]');
    await page.click('#start');
    await page.waitForSelector('.qcard');
    tally('quizzes created');
  }

  // 100 random actions on the active quiz and the builder.
  const actions = [
    async () => { if (await page.$('.opt')) await page.click(`.opt[data-d="${rnd(4)}"]`, { force: true }); tally('option taps'); },
    async () => { if (await page.$('#next[data-action="next"]')) await page.click('#next'); tally('next'); },
    async () => { if (await page.$('[data-action="prev"]:not([disabled])')) await page.click('[data-action="prev"]'); tally('prev'); },
    async () => { if (await page.$('[data-action="flag"]')) await page.click('[data-action="flag"]'); tally('flag'); },
    async () => { if (await page.$('[data-action="bookmark"]')) await page.click('[data-action="bookmark"]'); tally('bookmark'); },
    async () => {
      await page.goto(BASE + '/#/build');
      for (const f of ['unseen', 'bookmarked', 'mistakes', 'all']) await page.click(`[data-key="filter"][data-val="${f}"]`);
      await page.click('[data-key="mode"][data-val="exam"]');
      await page.click('[data-key="mode"][data-val="study"]');
      await page.goto(BASE + '/#/quiz');
      tally('filter toggles');
    },
    async () => { await page.goto(BASE + `/#/${['history', 'mistakes', 'home', 'more'][rnd(4)]}`); await page.goto(BASE + '/#/quiz'); tally('tab hops'); },
  ];
  for (let i = 0; i < 100; i++) {
    if (!(await page.$('.qcard'))) { await page.goto(BASE + '/#/home'); await page.click('[data-action="drill"]'); await page.waitForSelector('.qcard'); }
    await actions[i < 40 ? rnd(2) : rnd(actions.length)]();
    worstFrame = Math.max(worstFrame, await frame());
  }
  // Rapid sequential navigation burst on a fresh 75-question quiz.
  await page.goto(BASE + '/#/home');
  await page.click('[data-action="mock"]');
  await page.waitForSelector('.qcard');
  for (let i = 0; i < 74; i++) await page.click('#next');
  if ((await page.textContent('#qpos')) !== 'Q 75 of 75') errors.push('navigation burst did not reach Q 75');
  for (let i = 0; i < 74; i++) await page.click('[data-action="prev"]');
  if ((await page.textContent('#qpos')) !== 'Q 1 of 75') errors.push('navigation burst did not return to Q 1');
  log['nav burst clicks'] = 148;
  await page.click('[data-action="end"]'); // exam Submit needs a confirming second tap
  await page.click('[data-action="end"]');
  await page.waitForSelector('#score');

  const heapGrowthMB = ((await heap()) - heap0) / 1048576;
  const domNodes = await page.evaluate(() => document.getElementsByTagName('*').length);
  await browser.close();
  server.close();

  console.log('actions:', log);
  console.log(`worst frame: ${worstFrame.toFixed(1)} ms · heap growth: ${heapGrowthMB.toFixed(2)} MB · DOM nodes: ${domNodes}`);
  const fails = [...errors];
  if (worstFrame > 1000) fails.push(`UI freeze: ${worstFrame} ms frame`);
  if (heapGrowthMB > 15) fails.push(`heap grew ${heapGrowthMB.toFixed(1)} MB`);
  if (domNodes > 4000) fails.push(`DOM has ${domNodes} nodes`);
  console.log(fails.length ? `CHAOS FAIL\n${fails.join('\n')}` : 'CHAOS PASS: zero errors, no freezes, no leaks');
  process.exit(fails.length ? 1 : 0);
})();
