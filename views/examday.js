'use strict';
// View: #/examday. Exam day guide for Ariel's sitting (EXAM_AT). Every factual line comes from a source in
// ED_SOURCES, listed at the foot of the page. Globals (state, helpers) come from app.js; called at render time.

const ED_KEY = 'nyre.examday'; // packing checklist, {itemId: true}

const ED_BRING = [
  ['id', 'Unexpired government photo ID', "Driver's license, non-driver ID, IDNYC or passport all count. It must show your signature and exactly the name you booked under (middle names aside)."],
  ['summary', 'Printed Summary of Your Submission', 'The eAccessNY page with your candidate number. Lost it? Your details are under View Scheduled Exam Details.'],
  ['calc', 'Silent calculator, battery or solar', 'Optional. Nonprinting, with no alphabetic keyboard. No PDAs.'],
];

const ED_SOURCES = [
  ['NYS DOS: Become a Real Estate Salesperson', 'What to bring, site rules, exam time, results, fees, applying', 'https://dos.ny.gov/real-estate-agent'],
  ['NYS DOS: Exam Scheduling Policy', 'ID name match, rescheduling, cancelling, lateness', 'https://dos.ny.gov/exam-scheduling-policy'],
  ['NYS DOS: Real Estate Salesperson Exam Sites', 'Start-time rule, New York City site, weather cancellations', 'https://dos.ny.gov/real-estate-salesperson-exam-sites'],
  ['NYS DOS: Real Estate Salesperson FAQ', 'eAccessNY steps for booking, results and applying', 'https://dos.ny.gov/real-estate-salesperson-frequently-asked-questions'],
  ['NYS DOS: Requesting an Examination Review', 'Reviews within 60 days of a failed exam', 'https://dos.ny.gov/examination-review-request'],
  ['NYS DOS: Photo ID', "DMV photo for the license if you have no NYS driver's license or non-driver ID", 'https://dos.ny.gov/photo-id'],
  ['Spada, New York Real Estate for Salespersons, rev. 6th ed. (2019)', '75 questions and a 70% pass grade; DOS publishes neither', ''],
  ['CDC: About Sleep', 'Sleep hours and habits for adults', 'https://www.cdc.gov/sleep/about/index.html'],
  ['Your eAccessNY exam confirmation', 'Exam date, time and site', 'https://appext20.dos.ny.gov/nydos/nydoslogin.do?header=true'],
];

// Not in app.js's icon set.
const ED_MOON = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

function edChecks() {
  try { return JSON.parse(localStorage.getItem(ED_KEY)) || {}; } catch { return {}; }
}
const edPacked = (s) => `${ED_BRING.filter(([id]) => s[id]).length} of ${ED_BRING.length} packed`;

// Real checkboxes, saved on change; no re-render, so focus stays put.
document.addEventListener('change', (e) => {
  const cb = e.target;
  if (!cb.matches('.ed-cb')) return;
  const s = edChecks();
  if (cb.checked) s[cb.dataset.id] = true; else delete s[cb.dataset.id];
  localStorage.setItem(ED_KEY, JSON.stringify(s));
  document.getElementById('ed-count').textContent = edPacked(s);
});

function vExamDay() {
  if (S.read.examday !== today()) { S.read.examday = today(); save(); } // feeds Today's plan on Home
  const s = edChecks();
  const nb = (str) => str.replace(/\s/g, '\u00a0'); // keep "9:00 AM" and "Fri, Oct 9" on one line
  const time = nb(EXAM_AT.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }));
  const cutoff = nb(new Date(EXAM_AT - 6 * 864e5).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));
  const G = guides(); // null until loaded; guides() re-renders once they arrive
  const due = G ? cardsSummary(G).due : 0;
  const head = (id, title, right = '') => `<div class="ed-head"><h2 id="${id}">${title}</h2>${right}</div>`;
  const row = (ic, tone, title, sub) => `<li class="ed-row"><span class="ed-ic ${tone}">${ic}</span><span><b>${title}</b><small>${sub}</small></span></li>`;
  const cram = (href, mark, title, sub, end = svg('chevron')) =>
    `<li><a class="ed-link" href="${href}">${mark}<span class="ed-t"><b>${title}</b><small>${sub}</small></span>${end}</a></li>`;
  const stop = (title, sub) => `<li><b>${title}</b><small>${sub}</small></li>`;
  return {
    top: header('Exam day guide', { sub: EXAM_AT.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }), back: ['#/home', 'Home'] }),
    main: `<section class="card ed-arrive" aria-label="Arrival">
      <div class="ed-arrive-top"><span class="ed-dot" aria-hidden="true"></span><b>No entry after ${time}</b>
        <span class="ed-cd"><span class="sr-only">Starts in </span><span id="countdown" role="timer">${fmtDurHtml(EXAM_AT - Date.now())}</span></span></div>
      <p>New York City exam site, 123 William Street, 2nd floor. The NYS Department of State runs this exam itself; you book it in eAccessNY.</p>
    </section>
    <div class="ed-layout">
      <section class="card" aria-labelledby="ed-bring">
        ${head('ed-bring', 'What to bring', `<span class="meta" id="ed-count" aria-live="polite">${edPacked(s)}</span>`)}
        <ul class="ed-rows">${ED_BRING.map(([id, title, sub]) => `<li><label class="ed-item">
          <input class="ed-cb sr-only" type="checkbox" data-id="${id}"${s[id] ? ' checked' : ''}><span class="ed-box">${svg('check')}</span>
          <span><b>${title}</b><small>${sub}</small></span></label></li>`).join('')}</ul>
      </section>
      <section class="card" aria-labelledby="ed-no">
        ${head('ed-no', 'Not allowed')}
        <ul class="ed-rows">
          ${row(svg('x'), 'stop', 'Books, notes and dictionaries', 'No reference material of any kind')}
          ${row(svg('x'), 'stop', 'Large bags and briefcases', "There's nowhere at the site to store them")}
          ${row(svg('x'), 'stop', 'Food and drinks', "No eating, drinking or smoking. You'll be asked to throw out any food or drinks before going in.")}
          ${row(svg('x'), 'stop', 'Guests, children and firearms', 'Not permitted at the exam site')}
        </ul>
      </section>
      <section class="card" aria-labelledby="ed-during">
        ${head('ed-during', 'During the exam')}
        <ul class="ed-rows">
          ${row(svg('clock'), 'go', '90 minutes, multiple choice', 'The clock starts when the instructions end. Questions follow the 77-hour course.')}
          ${row(svg('target'), 'statute', '75 questions, 70% to pass (unofficial)', 'From the Spada textbook; DOS publishes neither number. It reports only pass or fail, with no numeric score.')}
          ${row(svg('bolt'), 'caution', 'Phone and electronics off', 'For the whole exam')}
          ${row(svg('flag'), 'stop', 'No notes, no help', 'Using aids, giving or getting help, or taking exam material out gets you dismissed')}
        </ul>
      </section>
      <section class="card" aria-labelledby="ed-24">
        ${head('ed-24', 'The last 24 hours')}
        <ul class="ed-rows">
          ${row(svg('book'), 'statute', 'Light review of key numbers', 'The cram sheets and due flashcards below. No new material.')}
          ${row(svg('check'), 'go', 'Pack tonight', 'ID, printed Summary of Your Submission and calculator')}
          ${row(ED_MOON, 'statute', 'Sleep 7 hours or more', 'Screens off 30 minutes before bed, and no caffeine after noon')}
          ${row(svg('compass'), 'go', 'Eat, then leave early', `No food inside, and no entry after ${time}. Arriving late forfeits the $15 fee.`)}
          ${row(svg('info'), 'caution', 'Bad weather?', "DOS posts exam cancellations on Facebook and X. Don't call the exam site.")}
        </ul>
      </section>
      <section class="card" aria-labelledby="ed-cram">
        ${head('ed-cram', 'Last-hour cram')}
        <ul class="ed-links">
          ${cram('#/study/license-law', bullet('license-law'), 'License law numbers', 'Ages, fees, deadlines and terms')}
          ${cram('#/study/agency', bullet('agency'), 'Agency', 'Fiduciary duties and §443 disclosure')}
          ${cram('#/study/math', bullet('math'), 'Math formulas', 'Transfer tax, points, prorations')}
          ${cram('#/cards/due', `<span class="ed-fc" aria-hidden="true">${svg('cards')}</span>`, 'Due flashcards', 'Spaced review of the cram sheets',
            due ? `<span class="badge ok">${due} due</span>` : svg('chevron'))}
        </ul>
      </section>
      <section class="card" aria-labelledby="ed-res">
        ${head('ed-res', 'Results')}
        <ul class="ed-rows">
          ${row(svg('chart'), 'statute', 'Pass or fail, in eAccessNY', "View Exam Results shows Waiting for Score until it's graded. No numeric score, and none by phone.")}
          ${row(svg('refresh'), 'caution', "Didn't pass? Book again", 'Apply to Take an Exam in eAccessNY, $15 each time. You can request a review within 60 days.')}
          ${row(svg('calendar'), 'stop', "Can't make it?", `Reschedule at least 6 days ahead (${cutoff}) under View Scheduled Exam Details. Cancelling, missing it or arriving late forfeits the $15.`)}
        </ul>
      </section>
      <section class="card" aria-labelledby="ed-after">
        ${head('ed-after', 'After you pass')}
        <ol class="ed-line">
          ${stop('Apply in eAccessNY', 'Apply for Initial Salesperson License (qualifying by Exam only), $65')}
          ${stop('Name your sponsoring broker', 'Their license number (UID), then your school and course completion date')}
          ${stop('Your broker authorizes it', 'From their own eAccessNY account')}
          ${stop('License by mail', 'DOS reviews the application, then mails the license to your business address')}
        </ol>
        <p class="meta ed-note">A passed exam stays valid for 2 years. Licensing also needs a current NYS driver's license or non-driver ID, or a photo taken at a NYS DMV office.</p>
      </section>
      <section aria-labelledby="ed-src">
        <div class="section-title"><h2 id="ed-src">Sources</h2><span class="meta">Checked Oct 8, 2026</span></div>
        <ul class="card ed-src">${ED_SOURCES.map(([title, covers, url]) => (url
          ? `<li><a href="${url}" target="_blank" rel="noopener"><b>${title}</b><small>${covers}</small></a></li>`
          : `<li><span><b>${title}</b><small>${covers}</small></span></li>`)).join('')}</ul>
      </section>
    </div>`,
    bottom: tabs('home'),
  };
}
