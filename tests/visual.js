// Visual QA at iPhone 15 Pro (393x852 @3x): screenshots every screen into qa/ and checks layout invariants.
const { chromium, devices } = require('playwright');
const serve = require('./serve');
const { mkdirSync } = require('node:fs');
const path = require('node:path');

let BASE;
const OUT = path.join(__dirname, '..', 'qa');

const audit = () => {
  const lum = (rgb) => {
    const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const parse = (c) => (c.match(/[\d.]+/g) || []).map(Number);
  const bgOf = (el) => {
    for (let e = el; e; e = e.parentElement) {
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c.length === 3 || (c.length === 4 && c[3] > 0.5)) return c.slice(0, 3);
    }
    return [9, 13, 22];
  };
  const issues = [];
  const vw = innerWidth;
  if (document.documentElement.scrollWidth > vw) issues.push(`horizontal overflow ${document.documentElement.scrollWidth}px`);
  for (const el of document.querySelectorAll('button, a.btn, a.tab, label.btn, .switch, summary, input[type=text], input[type=number]')) {
    const r = el.getBoundingClientRect();
    if (!r.width || getComputedStyle(el).visibility === 'hidden') continue;
    const min = el.matches('.btn, .opt, .switch, .drawer summary') ? 52 : 44;
    if (Math.round(r.height) < min) issues.push(`tap target ${Math.round(r.height)}px < ${min}px: ${el.className || el.tagName} "${el.textContent.trim().slice(0, 30)}"`);
  }
  for (const el of document.querySelectorAll('p, span, strong, b, h1, h2, dt, dd, button, a, summary, small')) {
    if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || +cs.opacity < 0.9 || el.closest('[disabled], .dim')) continue;
    const fg = lum(parse(cs.color).slice(0, 3)), bg = lum(bgOf(el));
    const ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
    if (ratio < 4.5) issues.push(`contrast ${ratio.toFixed(2)} < 4.5: "${el.textContent.trim().slice(0, 30)}"`);
  }
  const bar = document.querySelector('#bottom').getBoundingClientRect();
  if (Math.abs(bar.bottom - innerHeight) > 1) issues.push(`bottom bar not docked (${bar.bottom} vs ${innerHeight})`);
  const top = document.querySelector('#top').getBoundingClientRect();
  if (top.top !== 0) issues.push('top bar not at top');
  // Tablets must use the extra width instead of a stretched phone column.
  if (innerWidth >= 700) {
    const w = document.querySelector('main').getBoundingClientRect().width;
    if (w < Math.min(innerWidth, 1040) * 0.8) issues.push(`main only ${Math.round(w)}px wide on a ${innerWidth}px tablet`);
  }
  return [...new Set(issues)];
};

const DEVICES = {
  phone: { ...devices['iPhone 15 Pro'], viewport: { width: 393, height: 852 } },
  'ipad-mini': devices['iPad Mini'], // 768 x 1024 portrait, smallest tablet layout
  'ipad-landscape': devices['iPad Pro 11 landscape'], // 1194 x 834, wide layout
};

async function run(browser, device) {
  const dir = path.join(OUT, device);
  mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext(DEVICES[device]);
  const page = await ctx.newPage();
  const shots = [];
  const shot = async (name) => {
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(dir, `${name}.png`) });
    shots.push([`${device}/${name}`, await page.evaluate(audit)]);
  };

  await page.goto(BASE + '/#/home');
  await page.waitForSelector('#countdown');
  await shot('01-home');
  await page.goto(BASE + '/#/build');
  await page.waitForSelector('.chip');
  await shot('02-builder');
  await page.click('[data-key="mode"][data-val="study"]');
  await page.click('#start');
  await page.waitForSelector('.qcard');
  await shot('03-quiz-study');
  await page.click('.opt[data-d="1"]');
  await shot('04-quiz-study-answered');
  for (let i = 0; i < 6; i++) { await page.click('#next'); await page.click(`.opt[data-d="${i % 4}"]`); }
  await page.click('[data-action="end"]');
  await page.waitForSelector('#score');
  await shot('05-results');
  await page.goto(BASE + '/#/home');
  await page.click('[data-action="mock"]');
  await page.waitForSelector('#timer');
  await page.click('.opt[data-d="2"]');
  await page.click('[data-action="flag"]');
  await shot('06-quiz-exam');
  await page.click('[data-action="end"]'); // exam Submit needs a confirming second tap
  await page.click('[data-action="end"]');
  await page.goto(BASE + '/#/history');
  await shot('07-history');
  await page.goto(BASE + '/#/mistakes');
  await shot('08-mistakes');
  await page.goto(BASE + '/#/more');
  await shot('09-more');
  await page.goto(BASE + '/#/home');
  await shot('10-home-after');
  await page.goto(BASE + '/#/study');
  await page.waitForSelector('#chapters');
  await shot('11-study');
  await page.goto(BASE + '/#/study/math');
  await page.waitForSelector('#cram');
  await shot('12-study-cram');
  await page.goto(BASE + '/#/study/math/notes');
  await page.waitForSelector('#notes');
  await shot('13-study-notes');
  await page.goto(BASE + '/#/cards');
  await page.waitForSelector('#fc-hub');
  await shot('14-cards');
  await page.goto(BASE + '/#/cards/due');
  await page.waitForSelector('#fc-card');
  await page.click('#fc-card');
  await page.waitForSelector('#fc-card.on');
  await shot('15-cards-back');
  await page.goto(BASE + '/#/search/habendum');
  await page.waitForSelector('mark.sr-hit');
  await shot('16-search');
  await page.goto(BASE + '/#/examday');
  await page.waitForSelector('.ed-cb');
  await shot('17-examday');
  await ctx.close();
  return shots;
}

(async () => {
  const server = await serve();
  BASE = server.url;
  const browser = await chromium.launch();
  const only = process.argv[3]; // optional: node tests/visual.js "" ipad-mini
  const shots = [];
  for (const device of Object.keys(DEVICES)) if (!only || only === device) shots.push(...(await run(browser, device)));
  await browser.close();
  server.close();
  let bad = 0;
  for (const [name, issues] of shots) {
    console.log(`${issues.length ? 'FAIL' : 'PASS'}  ${name}${issues.length ? '\n      ' + issues.join('\n      ') : ''}`);
    bad += issues.length ? 1 : 0;
  }
  console.log(`\n${shots.length - bad}/${shots.length} screens clean · screenshots in qa/<device>/`);
  process.exit(bad ? 1 : 0);
})();
