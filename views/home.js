'use strict';
// View: #/home. Globals (state, helpers) come from app.js; called at render time.

function vHome() {
  const o = overall();
  const A = S.active;
  const ts = topicStats();
  const acc = (id) => ts[id].c / ts[id].n;
  const weak = weakTopics().sort((a, b) => acc(a) - acc(b));
  return {
    top: header('NY RE Exam', { logo: true }),
    main: `<div class="hm-grid">
    <section class="sheet hm-board" aria-labelledby="hm-dest">
      <div class="hm-panel">
        <p class="hm-dest"><span id="hm-dest">NYS salesperson exam</span><span>${EXAM_AT.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${EXAM_AT.toLocaleTimeString('en-US', { hour: 'numeric', ...(EXAM_AT.getMinutes() ? { minute: '2-digit' } : {}) })}</span></p>
        <p class="hm-cd" id="countdown" role="timer">${fmtDurHtml(EXAM_AT - Date.now())}</p>
      </div>
      <p class="hm-spec">Pass with 53 of 75 correct in 90 minutes.</p>
    </section>
    ${tdPlan()}
    <section class="card hm-ready" aria-label="Readiness">
      ${gauge(o.readiness)}
      <dl class="hm-stats">
        <div><dt>Study streak</dt><dd id="st-streak">${streakNow()} day${streakNow() === 1 ? '' : 's'}</dd></div>
        <div><dt>Questions seen</dt><dd id="st-seen">${o.seen} / ${BANK.questions.length}</dd></div>
        <div><dt>Accuracy</dt><dd id="st-acc">${o.n ? pct(o.acc) + '%' : '—'}</dd></div>
      </dl>
    </section>
    ${A ? `<section class="card hm-resume" aria-labelledby="hm-resume-t">
      <div class="hm-resume-head">
        <div><h2 id="hm-resume-t">${esc(A.title)}</h2>
          <p>Question ${A.i + 1} of ${A.qids.length}, ${A.mode === 'exam' ? 'timed exam' : 'study mode'}</p></div>
        <button class="hm-resume-btn" data-action="resume">Resume</button>
      </div>
      ${lineProgress(A.qids.length, A.i, A.qids.map((_, i) => (A.flags[i] ? 'flag' : A.answers[i] !== undefined ? 'done' : '')))}
    </section>` : ''}
    <section class="hm-actions" aria-label="Practice">
      <button class="btn primary" data-action="drill">${svg('bolt')}Quick 10-Question Drill</button>
      <button class="btn hm-act" data-action="mock">${svg('clock')}<span><span class="hm-act-t">Mock 75-Question NYS State Exam</span><span class="hm-act-s">75 questions in 90 minutes, timed</span></span></button>
      <a class="btn hm-act" href="#/build">${svg('build')}<span><span class="hm-act-t">Custom Quiz Builder</span><span class="hm-act-s">Pick topics, length and mode</span></span></a>
    </section>
    ${weak.length ? `<section class="hm-lines" aria-labelledby="hm-weak-h">
      <div class="section-title"><h2 id="hm-weak-h">Weakest lines</h2><span class="meta">${weak.length} under 70%</span></div>
      <div class="card hm-weak">
        <ul>${weak.slice(0, 3).map((id) => `<li>${bullet(id)}<span class="hm-weak-name">${esc(topicName[id])}</span>${bar(acc(id), ts[id].n)}<span class="hm-weak-pct num">${pct(acc(id))}%</span></li>`).join('')}</ul>
        <button class="btn block" data-action="weak">Retest Weak Areas</button>
      </div>
    </section>` : ''}
    </div>`,
    bottom: tabs('home'),
  };
}

/* ---------- Today's plan: 3–5 tasks picked from her stats, drawn as stations on one line ---------- */

const tdDay = (s) => Date.parse(s) / 864e5; // 'YYYY-MM-DD' parses as UTC midnight, so differences are whole days
const tdAgo = (date) => tdDay(today()) - tdDay(date);
const tdAgoText = (n) => (n === 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`);

// Drill and read topics are picked once per day so the plan doesn't shift while she works through it.
function tdPicks() {
  if (S.plan?.date === today()) return S.plan;
  const ts = topicStats();
  const ids = BANK.topics.map((t) => t.id);
  const acc = (id) => ts[id].c / ts[id].n;
  const drill = ids.filter((id) => ts[id].n >= 5).sort((a, b) => acc(a) - acc(b))[0]
    || [...ids].sort((a, b) => ts[a].seen - ts[b].seen)[0];
  // Only built-in topics have study guides, so imported topics are never picked to read.
  const guided = new Set(BANK.base.topics.map((t) => t.id));
  const weak = weakTopics().filter((id) => guided.has(id)).sort((a, b) => acc(a) - acc(b));
  const lastRead = (id) => S.read[id] || '';
  // Prefer a different chapter than the drill so the two tasks cover more ground.
  const read = weak.find((id) => id !== drill && (!S.read[id] || tdAgo(S.read[id]) >= 3))
    || [...weak, ...ids.filter((id) => guided.has(id) && !weak.includes(id))].filter((id) => id !== drill).sort((a, b) => lastRead(a).localeCompare(lastRead(b)))[0]
    || drill;
  S.plan = { date: today(), drill, read };
  save();
  return S.plan;
}

function tdPlan() {
  const t = today();
  const p = tdPicks();
  const G = guides(); // null until loaded; guides() re-renders once they arrive
  const due = G ? cardsSummary(G).due : null;
  const reviewed = S.cardLog[t] || 0;
  const mock = S.history.find((h) => h.mode === 'exam'); // history is newest first
  const mockAgo = mock ? tdAgo(today(new Date(mock.date))) : null;
  const items = [
    { href: '#/cards/due', title: due ? `Review ${due} due flashcard${due === 1 ? '' : 's'}` : G ? 'Review flashcards' : 'Flashcards',
      sub: reviewed ? `${reviewed} reviewed today` : '', done: reviewed > 0 && due === 0 },
    { action: 'td-drill', title: `Drill your weakest line: ${esc(topicName[p.drill])}`, line: p.drill, sub: '15 questions in study mode',
      done: S.history.some((h) => h.title === 'Weak line: ' + topicName[p.drill] && today(new Date(h.date)) === t) },
    { href: '#/study/' + esc(p.read), title: `Read the ${esc(topicName[p.read])} cram sheet`, line: p.read,
      sub: S.read[p.read] ? `Last read ${tdAgoText(tdAgo(S.read[p.read]))}` : 'Not read yet', done: S.read[p.read] === t },
  ];
  if (mockAgo === null || mockAgo === 0 || mockAgo > 2) {
    items.push({ action: 'mock', title: 'Take a timed mock exam', sub: mock ? `Last mock: ${tdAgoText(mockAgo)}` : 'No mock yet', done: mockAgo === 0 });
  }
  if (tdDay(today(EXAM_AT)) - tdDay(t) <= 3) items.push({ href: '#/examday', title: 'Read the exam day guide', done: S.read.examday === t });

  const n = items.length, d = items.filter((x) => x.done).length;
  const next = items.findIndex((x) => !x.done);
  const row = (x, i) => {
    const cls = `td-item${x.done ? ' done' : i === next ? ' next' : ''}`;
    const body = `<span class="td-st">${x.done ? svg('check') : ''}</span>
      <span class="td-txt"><span class="td-t">${x.done ? '<span class="sr-only">Done: </span>' : ''}${x.title}</span>${x.sub ? `<span class="td-s">${x.sub}</span>` : ''}</span>
      ${x.line ? bullet(x.line) : ''}${svg('chevron', 'td-chev')}`;
    return `<li>${x.href ? `<a class="${cls}" href="${x.href}">${body}</a>` : `<button class="${cls}" data-action="${x.action}">${body}</button>`}</li>`;
  };
  return `<section class="card td-plan" id="td-plan" aria-labelledby="td-h">
      <div class="td-head"><h2 id="td-h">Today's plan</h2><span class="meta">${d} of ${n} done</span></div>
      <div class="td-segs" aria-hidden="true">${items.map((_, i) => `<i${i < d ? ' class="on"' : ''}></i>`).join('')}</div>
      ${d === n ? '<p class="td-fin">Plan done. Rest or do a quick drill.</p>' : ''}
      <ol class="td-list">${items.map(row).join('')}</ol>
    </section>`;
}

const TODAY_ACTIONS = {
  'td-drill': () => {
    const id = tdPicks().drill;
    startQuiz({ title: 'Weak line: ' + topicName[id], mode: 'study', count: 15, topics: [id] });
    return false; // startQuiz saves and navigates
  },
};
