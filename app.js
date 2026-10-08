'use strict';

const EXAM_AT = new Date('2026-10-14T08:30:00-04:00');
const PASS = 0.7;
const SECS_PER_Q = 72; // 75 questions -> 90 minutes, same pace as the state exam
const KEY = 'nyre.v1';
const LETTERS = 'ABCD';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pct = (x) => Math.round(x * 100);
const today = (d = new Date()) => d.toLocaleDateString('en-CA');

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------- state ---------- */

const fresh = () => ({
  attempts: {}, // qid -> {n, c, last}
  bookmarks: {}, // qid -> 1
  mistakes: {}, // qid -> {streak, at}
  history: [],
  streak: { day: null, count: 0 },
  active: null,
  imported: [],
  config: null,
});

function load() {
  try {
    return { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return fresh();
  }
}

let S = load();
const save = () => localStorage.setItem(KEY, JSON.stringify(S));

/* ---------- question bank ---------- */

let BANK = { topics: [], questions: [] };
let byId = new Map();
let topicName = {};

function validQuestion(q) {
  return q && typeof q.id === 'string' && typeof q.topic === 'string' && typeof q.q === 'string' &&
    Array.isArray(q.options) && q.options.length === 4 && q.options.every((o) => typeof o === 'string') &&
    Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4;
}

function indexBank(base) {
  const topics = [...base.topics];
  const questions = [...base.questions];
  const seen = new Set(questions.map((q) => q.id));
  for (const q of S.imported) {
    if (!validQuestion(q) || seen.has(q.id)) continue;
    seen.add(q.id);
    questions.push(q);
    if (!topics.some((t) => t.id === q.topic)) topics.push({ id: q.topic, name: q.topic });
  }
  BANK = { topics, questions, base };
  byId = new Map(questions.map((q) => [q.id, q]));
  topicName = Object.fromEntries(topics.map((t) => [t.id, t.name]));
}

/* ---------- progress ---------- */

function bumpStreak() {
  const t = today();
  if (S.streak.day === t) return;
  const y = new Date();
  y.setDate(y.getDate() - 1);
  S.streak = { day: t, count: S.streak.day === today(y) ? S.streak.count + 1 : 1 };
}

function record(qid, correct) {
  const a = (S.attempts[qid] ||= { n: 0, c: 0 });
  a.n++;
  if (correct) a.c++;
  a.last = correct ? 1 : 0;
  if (!correct) S.mistakes[qid] = { streak: 0, at: Date.now() };
  else if (S.mistakes[qid] && ++S.mistakes[qid].streak >= 2) delete S.mistakes[qid];
  bumpStreak();
}

function topicStats() {
  const t = Object.fromEntries(BANK.topics.map((x) => [x.id, { n: 0, c: 0, total: 0, seen: 0 }]));
  for (const q of BANK.questions) {
    const s = t[q.topic];
    s.total++;
    const a = S.attempts[q.id];
    if (a) { s.n += a.n; s.c += a.c; s.seen++; }
  }
  return t;
}

function overall() {
  let n = 0, c = 0, seen = 0;
  for (const a of Object.values(S.attempts)) { n += a.n; c += a.c; seen++; }
  const ts = Object.values(topicStats());
  // Readiness: mean topic accuracy where untouched topics count as 0 -> rewards full coverage.
  const readiness = ts.length ? ts.reduce((s, x) => s + (x.n ? x.c / x.n : 0), 0) / ts.length : 0;
  return { n, c, seen, acc: n ? c / n : 0, readiness };
}

const weakTopics = () => Object.entries(topicStats()).filter(([, s]) => s.n && s.c / s.n < PASS).map(([id]) => id);

/* ---------- quizzes ---------- */

const FILTERS = {
  all: () => true,
  unseen: (q) => !S.attempts[q.id],
  bookmarked: (q) => !!S.bookmarks[q.id],
  mistakes: (q) => !!S.mistakes[q.id],
};

function pool(cfg) {
  if (cfg.qids) return cfg.qids.map((id) => byId.get(id)).filter(Boolean);
  const set = new Set(cfg.topics);
  return BANK.questions.filter((q) => set.has(q.topic) && FILTERS[cfg.filter || 'all'](q));
}

function startQuiz(cfg) {
  let qs = shuffle(pool(cfg)).slice(0, cfg.count || Infinity);
  if (!qs.length) return toast('No questions match those settings.');
  if (cfg.shuffleQ === false) {
    const order = new Map(BANK.questions.map((q, i) => [q.id, i]));
    qs.sort((a, b) => order.get(a.id) - order.get(b.id));
  }
  S.active = {
    id: Date.now().toString(36),
    title: cfg.title || 'Custom Quiz',
    mode: cfg.mode,
    qids: qs.map((q) => q.id),
    perm: qs.map(() => (cfg.shuffleO === false ? [0, 1, 2, 3] : shuffle([0, 1, 2, 3]))),
    answers: {},
    flags: {},
    i: 0,
    started: Date.now(),
    deadline: cfg.mode === 'exam' ? Date.now() + qs.length * SECS_PER_Q * 1000 : null,
  };
  save();
  go('quiz');
}

function answer(display) {
  const A = S.active;
  const orig = A.perm[A.i][display];
  if (A.mode === 'study') {
    if (A.answers[A.i] !== undefined) return;
    A.answers[A.i] = orig;
    const q = byId.get(A.qids[A.i]);
    record(q.id, orig === q.answer);
  } else {
    A.answers[A.i] = orig;
  }
  save();
  render();
}

function submit() {
  const A = S.active;
  if (!A) return;
  const byTopic = {};
  let correct = 0;
  A.qids.forEach((id, i) => {
    const q = byId.get(id);
    if (!q) return;
    const ok = A.answers[i] === q.answer;
    if (A.mode === 'exam' && A.answers[i] !== undefined) record(id, ok);
    if (ok) correct++;
    const t = (byTopic[q.topic] ||= { c: 0, t: 0 });
    t.t++;
    if (ok) t.c++;
  });
  const total = A.qids.length;
  const h = {
    id: A.id, date: Date.now(), title: A.title, mode: A.mode, total, correct,
    answered: Object.keys(A.answers).length, score: total ? correct / total : 0,
    secs: Math.round((Date.now() - A.started) / 1000), byTopic, qids: A.qids, answers: A.answers,
  };
  h.passed = h.score >= PASS;
  S.history.unshift(h);
  S.active = null;
  save();
  go('results/' + h.id);
}

const quickDrill = () => startQuiz({ title: 'Quick 10-Question Drill', mode: 'study', count: 10, topics: BANK.topics.map((t) => t.id) });
const mockExam = () => startQuiz({ title: 'Mock NYS State Exam', mode: 'exam', count: 75, topics: BANK.topics.map((t) => t.id) });

/* ---------- builder config ---------- */

function cfgGet() {
  return S.config ||= { topics: BANK.topics.map((t) => t.id), count: 25, mode: 'study', filter: 'all', shuffleQ: true, shuffleO: true };
}

/* ---------- rendering helpers ---------- */

const icon = {
  home: '<path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  build: '<path d="M4 6h16M4 12h10M4 18h6"/><circle cx="18" cy="16" r="3"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  bank: '<path d="M12 3l9 4-9 4-9-4 9-4zM3 12l9 4 9-4M3 17l9 4 9-4"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  star: '<path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4 6.5 20.3l1-6.2L3 9.7l6.2-.9z"/>',
};
const svg = (name, extra = '') => `<svg class="ic ${extra}" viewBox="0 0 24 24" aria-hidden="true">${icon[name]}</svg>`;

function tabs(active) {
  const t = [['home', 'Home', 'home'], ['build', 'Build', 'build'], ['history', 'Stats', 'chart'], ['mistakes', 'Mistakes', 'bank'], ['more', 'More', 'more']];
  return `<nav class="tabs" aria-label="Main">${t.map(([r, label, ic]) =>
    `<a href="#/${r}" class="tab${active === r ? ' on' : ''}"${active === r ? ' aria-current="page"' : ''}>${svg(ic)}<span>${label}</span></a>`).join('')}</nav>`;
}

const brand = (title) => `<div class="brand"><img src="icons/logo.svg" alt="" width="28" height="28"><h1>${esc(title)}</h1></div>`;

function fmtDur(ms) {
  if (ms <= 0) return 'Exam day';
  const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60;
  return `${d}d ${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`;
}

function fmtClock(s) {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function gauge(v) {
  const r = 52, C = 2 * Math.PI * r;
  const passAngle = PASS * 360 - 90;
  const px = 60 + r * Math.cos((passAngle * Math.PI) / 180), py = 60 + r * Math.sin((passAngle * Math.PI) / 180);
  return `<svg class="gauge" viewBox="0 0 120 120" role="img" aria-label="Readiness ${pct(v)} percent; pass line 70 percent">
    <circle cx="60" cy="60" r="${r}" class="g-track"/>
    <circle cx="60" cy="60" r="${r}" class="g-val ${v >= PASS ? 'ok' : 'low'}" stroke-dasharray="${C * v} ${C}" transform="rotate(-90 60 60)"/>
    <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4" class="g-pass"/>
    <text x="60" y="58" class="g-num">${pct(v)}%</text><text x="60" y="76" class="g-lbl">readiness</text></svg>`;
}

const bar = (v, n) => `<div class="bar" role="img" aria-label="${n ? pct(v) + ' percent' : 'no attempts'}"><i class="${!n ? '' : v >= PASS ? 'ok' : 'low'}" style="width:${n ? pct(v) : 0}%"></i></div>`;

/* ---------- views ---------- */

function vHome() {
  const o = overall();
  const A = S.active;
  return {
    top: brand('NY RE Exam'),
    main: `
    <section class="card hero" aria-labelledby="cd-h">
      <p class="eyebrow" id="cd-h">NYS Salesperson Exam · Oct 14 &amp; 15</p>
      <p class="countdown" id="countdown">${fmtDur(EXAM_AT - Date.now())}</p>
      <p class="muted">75 questions · 90 minutes · pass at 70% (53/75)</p>
    </section>
    <section class="card readiness">
      ${gauge(o.readiness)}
      <dl class="stats">
        <div><dt>Study streak</dt><dd id="st-streak">${S.streak.count} day${S.streak.count === 1 ? '' : 's'}</dd></div>
        <div><dt>Questions seen</dt><dd id="st-seen">${o.seen} / ${BANK.questions.length}</dd></div>
        <div><dt>Accuracy</dt><dd id="st-acc">${o.n ? pct(o.acc) + '%' : '—'}</dd></div>
      </dl>
    </section>
    <section class="actions">
      ${A ? `<button class="btn primary" data-action="resume">Resume ${esc(A.title)} · Q ${A.i + 1} of ${A.qids.length}</button>` : ''}
      <button class="btn ${A ? '' : 'primary'}" data-action="drill">Quick 10-Question Drill</button>
      <button class="btn" data-action="mock">Mock 75-Question NYS State Exam</button>
      <a class="btn" href="#/build">Custom Quiz Builder</a>
      ${weakTopics().length ? `<button class="btn warn" data-action="weak">Retest Weak Areas (${weakTopics().length})</button>` : ''}
    </section>`,
    bottom: tabs('home'),
  };
}

function vBuild() {
  const c = cfgGet();
  const avail = pool(c).length;
  const n = Math.min(c.count, avail);
  const ts = topicStats();
  const seg = (key, opts) => `<div class="seg" role="group">${opts.map(([v, label]) =>
    `<button data-action="set" data-key="${key}" data-val="${v}" aria-pressed="${String(c[key]) === String(v)}">${label}</button>`).join('')}</div>`;
  const filterCount = (f) => BANK.questions.filter((q) => c.topics.includes(q.topic) && FILTERS[f](q)).length;
  return {
    top: brand('Custom Quiz Builder'),
    main: `
    <section class="card">
      <div class="row"><h2>Topics <span class="muted">(${c.topics.length}/${BANK.topics.length})</span></h2>
        <span><button class="link" data-action="topics-all">All</button> · <button class="link" data-action="topics-none">None</button></span></div>
      <div class="chips" role="group" aria-label="Topics">${BANK.topics.map((t) =>
        `<button class="chip" data-action="topic" data-id="${esc(t.id)}" aria-pressed="${c.topics.includes(t.id)}">${esc(t.name)} <small>${ts[t.id].total}</small></button>`).join('')}</div>
    </section>
    <section class="card">
      <h2>Questions</h2>
      ${seg('count', [[10, '10'], [25, '25'], [50, '50'], [75, '75 · Full']])}
      <label class="field">Custom count <input id="count" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" value="${c.count}" data-action="count"></label>
    </section>
    <section class="card">
      <h2>Mode</h2>
      ${seg('mode', [['study', 'Tutor / Study'], ['exam', 'Exam / Timed']])}
      <p class="muted small">${c.mode === 'study' ? 'Instant feedback with the legal citation after every answer.' : `Answers hidden until you submit. ${fmtClock(Math.max(1, n) * SECS_PER_Q)} clock (90:00 for 75 questions).`}</p>
    </section>
    <section class="card">
      <h2>Question pool</h2>
      ${seg('filter', [['all', `All ${filterCount('all')}`], ['unseen', `Unseen ${filterCount('unseen')}`], ['bookmarked', `Bookmarked ${filterCount('bookmarked')}`], ['mistakes', `Mistakes ${filterCount('mistakes')}`]])}
      <label class="switch"><input type="checkbox" data-action="toggle" data-key="shuffleQ" ${c.shuffleQ ? 'checked' : ''}><span>Shuffle question order</span></label>
      <label class="switch"><input type="checkbox" data-action="toggle" data-key="shuffleO" ${c.shuffleO ? 'checked' : ''}><span>Shuffle answer positions (A–D)</span></label>
    </section>`,
    bottom: `<div class="actionbar"><button class="btn primary grow" id="start" data-action="start" ${n ? '' : 'disabled'}>${n ? `Start ${n}-question ${c.mode === 'exam' ? 'exam' : 'quiz'}` : 'No questions match'}</button></div>`,
  };
}

function vQuiz() {
  const A = S.active;
  if (!A) return go('home');
  const q = byId.get(A.qids[A.i]);
  if (!q) { S.active = null; save(); return go('home'); }
  const chosen = A.answers[A.i];
  const revealed = A.mode === 'study' && chosen !== undefined;
  const last = A.i === A.qids.length - 1;
  const opts = A.perm[A.i].map((orig, d) => {
    let cls = '';
    if (revealed) cls = orig === q.answer ? 'correct' : orig === chosen ? 'wrong' : 'dim';
    else if (orig === chosen) cls = 'selected';
    return `<button class="opt ${cls}" role="radio" data-action="answer" data-d="${d}" aria-checked="${orig === chosen}" ${revealed ? 'aria-disabled="true"' : ''}>
      <b>${LETTERS[d]}</b><span>${esc(q.options[orig])}${cls === 'correct' ? '<small class="tag">✓ Correct answer</small>' : cls === 'wrong' ? '<small class="tag">✕ Your answer</small>' : ''}</span></button>`;
  }).join('');
  const answered = Object.keys(A.answers).length;
  return {
    top: `<div class="qtop">
      <div class="row"><strong id="qpos">Q ${A.i + 1} of ${A.qids.length}</strong>
        ${A.mode === 'exam' ? `<span class="timer" id="timer" role="timer" aria-label="Time remaining">${fmtClock((A.deadline - Date.now()) / 1000)}</span>` : `<span class="muted small">${answered} answered</span>`}
        <button class="iconbtn${S.bookmarks[q.id] ? ' on' : ''}" data-action="bookmark" aria-pressed="${!!S.bookmarks[q.id]}" aria-label="Bookmark question">${svg('star')}</button>
        <button class="link" data-action="end">${A.mode === 'exam' ? 'Submit' : 'End'}</button></div>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${A.qids.length}" aria-valuenow="${A.i + 1}"><i style="width:${((A.i + 1) / A.qids.length) * 100}%"></i></div>
      <span class="badge">${esc(topicName[q.topic] || q.topic)}</span>${A.flags[A.i] ? ' <span class="badge warn">Flagged</span>' : ''}</div>`,
    main: `
    <article class="card qcard"><p class="qtext" id="qtext">${esc(q.q)}</p></article>
    <div class="opts" role="radiogroup" aria-label="Answer choices" aria-describedby="qtext">${opts}</div>
    ${revealed ? `<p class="feedback ${chosen === q.answer ? 'ok' : 'bad'}" id="feedback">${chosen === q.answer ? 'Correct' : `Incorrect — answer: ${LETTERS[A.perm[A.i].indexOf(q.answer)]}`}</p>
    <details class="drawer" open><summary>Legal Citation &amp; Rationale</summary>
      <p class="cite" id="cite">${esc(q.citation || 'General NYS real estate principle')}</p><p>${esc(q.explanation || '')}</p></details>` : ''}
    ${A.mode === 'exam' ? `<details class="card qmap"><summary>Question map · ${answered}/${A.qids.length} answered</summary><div class="grid">${A.qids.map((_, i) =>
      `<button data-action="jump" data-i="${i}" class="${A.answers[i] !== undefined ? 'done' : ''}${A.flags[i] ? ' flag' : ''}${i === A.i ? ' cur' : ''}" aria-label="Question ${i + 1}">${i + 1}</button>`).join('')}</div></details>` : ''}`,
    bottom: `<div class="actionbar">
      <button class="btn" data-action="prev" ${A.i ? '' : 'disabled'}>Previous</button>
      <button class="btn${A.flags[A.i] ? ' warn' : ''}" data-action="flag" aria-pressed="${!!A.flags[A.i]}">${A.flags[A.i] ? 'Flagged' : 'Flag'}</button>
      <button class="btn primary" data-action="${last ? 'end' : 'next'}" id="next">${last ? (A.mode === 'exam' ? 'Submit Exam' : 'Finish') : 'Next'}</button></div>`,
  };
}

function vResults(id) {
  const h = S.history.find((x) => x.id === id);
  if (!h) return go('history');
  const missed = h.qids.filter((qid, i) => h.answers[i] !== byId.get(qid)?.answer);
  return {
    top: brand('Results'),
    main: `
    <section class="card hero center">
      <p class="eyebrow">${esc(h.title)} · ${h.mode === 'exam' ? 'Exam mode' : 'Study mode'}</p>
      <p class="score" id="score">${pct(h.score)}%</p>
      <span class="badge big ${h.passed ? 'ok' : 'bad'}" id="verdict">${h.passed ? 'PASS' : 'FAIL'}</span>
      <p class="muted">${h.correct} / ${h.total} correct · ${h.answered} answered · ${fmtClock(h.secs)}</p>
    </section>
    <section class="card"><h2>By topic</h2>${Object.entries(h.byTopic).map(([t, s]) =>
      `<div class="trow"><span>${esc(topicName[t] || t)}</span><span class="muted">${s.c}/${s.t}</span>${bar(s.c / s.t, s.t)}</div>`).join('')}</section>
    <section class="card"><h2>Review</h2>${h.qids.map((qid, i) => {
      const q = byId.get(qid);
      if (!q) return '';
      const ok = h.answers[i] === q.answer;
      return `<details class="review ${ok ? 'ok' : 'bad'}"><summary>${i + 1}. ${esc(q.q)}</summary>
        <p>Your answer: ${h.answers[i] === undefined ? '<em>none</em>' : esc(q.options[h.answers[i]])}</p>
        <p class="ok-t">Correct: ${esc(q.options[q.answer])}</p><p class="cite">${esc(q.citation || '')}</p><p class="muted">${esc(q.explanation || '')}</p></details>`;
    }).join('')}</section>`,
    bottom: `<div class="actionbar">${missed.length ? `<button class="btn warn grow" data-action="retest" data-id="${esc(h.id)}">Retest ${missed.length} missed</button>` : ''}<a class="btn grow" href="#/home">Home</a></div>`,
  };
}

function vHistory() {
  const ts = topicStats();
  const rows = BANK.topics.map((t) => ({ ...t, ...ts[t.id], acc: ts[t.id].n ? ts[t.id].c / ts[t.id].n : 0 }));
  const weak = weakTopics();
  return {
    top: brand('Performance'),
    main: `
    <section class="card"><h2>Weak topic heatmap</h2><p class="muted small">Red &lt; 70% · Green ≥ 70% · Gray not attempted</p>
      <div class="heat" id="heatmap">${rows.map((r) =>
        `<div class="cell ${!r.n ? 'none' : r.acc >= PASS ? 'ok' : 'low'}" title="${esc(r.name)}"><span>${esc(r.name)}</span><b>${r.n ? pct(r.acc) + '%' : '—'}</b></div>`).join('')}</div>
      <button class="btn warn block" data-action="weak" ${weak.length ? '' : 'disabled'}>${weak.length ? `Retest Weak Areas (${weak.length} topics)` : 'No weak topics yet'}</button></section>
    <section class="card"><h2>Accuracy by topic</h2>${[...rows].sort((a, b) => (b.n ? 1 : 0) - (a.n ? 1 : 0) || a.acc - b.acc).map((r) =>
      `<div class="trow"><span>${esc(r.name)}</span><span class="muted">${r.n ? `${r.c}/${r.n}` : '—'}</span>${bar(r.acc, r.n)}</div>`).join('')}</section>
    <section class="card"><h2>Quiz log</h2>${S.history.length ? `<ul class="log" id="log">${S.history.map((h) =>
      `<li><a href="#/results/${esc(h.id)}"><span><strong>${esc(h.title)}</strong><small class="muted">${new Date(h.date).toLocaleString()} · ${h.mode === 'exam' ? 'Exam' : 'Study'} · ${h.correct}/${h.total}</small></span>
        <span class="badge ${h.passed ? 'ok' : 'bad'}">${pct(h.score)}% ${h.passed ? 'PASS' : 'FAIL'}</span></a></li>`).join('')}</ul>` : '<p class="muted">No quizzes yet.</p>'}</section>`,
    bottom: tabs('history'),
  };
}

function vMistakes() {
  const items = Object.entries(S.mistakes).filter(([id]) => byId.has(id)).sort((a, b) => b[1].at - a[1].at);
  return {
    top: brand('Mistake Bank'),
    main: `
    <section class="card"><p>${items.length} question${items.length === 1 ? '' : 's'} to fix. Answer one correctly <strong>twice in a row</strong> to clear it.</p>
      <button class="btn primary block" data-action="review-mistakes" ${items.length ? '' : 'disabled'}>Review mistakes</button></section>
    <ul class="mlist" id="mlist">${items.map(([id, m]) => {
      const q = byId.get(id);
      return `<li class="card"><span class="badge">${esc(topicName[q.topic] || q.topic)}</span><p>${esc(q.q)}</p>
        <div class="row"><span class="dots" aria-label="${m.streak} of 2 correct">${[0, 1].map((k) => `<i class="${k < m.streak ? 'on' : ''}"></i>`).join('')} <small class="muted">${m.streak}/2</small></span>
        <button class="link" data-action="clear-mistake" data-id="${esc(id)}">Clear</button></div></li>`;
    }).join('')}</ul>`,
    bottom: tabs('mistakes'),
  };
}

function vMore() {
  const ts = topicStats();
  return {
    top: brand('More'),
    main: `
    <section class="card"><h2>Install on iPhone</h2><p class="muted">Open in Safari → Share → <strong>Add to Home Screen</strong>. Works fully offline after the first load.</p></section>
    <section class="card"><h2>Your data</h2>
      <button class="btn block" data-action="export">Export study history (JSON)</button>
      <label class="btn block file">Import study history<input type="file" accept="application/json,.json" data-action="import-progress" hidden></label>
      <label class="btn block file">Import question batch (JSON)<input type="file" accept="application/json,.json" data-action="import-questions" hidden></label>
      <p class="muted small">Question batch format: array of {id, topic, q, options[4], answer 0-3, explanation, citation}. ${S.imported.length} imported.</p>
      <button class="btn bad block" data-action="reset">Reset all progress</button></section>
    <section class="card"><h2>Question bank · ${BANK.questions.length}</h2>${BANK.topics.map((t) =>
      `<div class="trow"><span>${esc(t.name)}</span><span class="muted">${ts[t.id].total}</span></div>`).join('')}</section>
    <p class="muted small center">Independent study aid. Not affiliated with NYS DOS.</p>`,
    bottom: tabs('more'),
  };
}

/* ---------- router ---------- */

const ROUTES = { home: vHome, build: vBuild, quiz: vQuiz, results: vResults, history: vHistory, mistakes: vMistakes, more: vMore };

function go(route) {
  if (location.hash === '#/' + route) render();
  else location.hash = '#/' + route;
}

let lastRoute = '';
function render() {
  const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
  const v = (ROUTES[name] || vHome)(arg);
  if (!v) return;
  $('#top').innerHTML = v.top;
  $('#view').innerHTML = v.main;
  $('#bottom').innerHTML = v.bottom;
  document.body.dataset.route = name || 'home';
  const route = location.hash;
  if (route !== lastRoute) { window.scrollTo(0, 0); lastRoute = route; }
}

/* ---------- events ---------- */

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2600);
}

function download(name, data) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const ACTIONS = {
  resume: () => go('quiz'),
  drill: quickDrill,
  mock: mockExam,
  weak: () => startQuiz({ title: 'Weak Areas Retest', mode: 'study', count: 25, topics: weakTopics() }),
  topic: (el) => {
    const c = cfgGet();
    const id = el.dataset.id;
    c.topics = c.topics.includes(id) ? c.topics.filter((t) => t !== id) : [...c.topics, id];
  },
  'topics-all': () => { cfgGet().topics = BANK.topics.map((t) => t.id); },
  'topics-none': () => { cfgGet().topics = []; },
  set: (el) => {
    const v = el.dataset.val;
    cfgGet()[el.dataset.key] = el.dataset.key === 'count' ? Number(v) : v;
  },
  toggle: (el) => { cfgGet()[el.dataset.key] = el.checked; },
  start: () => {
    const c = cfgGet();
    startQuiz({ ...c, title: c.mode === 'exam' ? 'Custom Timed Exam' : 'Custom Study Quiz' });
  },
  answer: (el) => answer(Number(el.dataset.d)),
  prev: () => { S.active.i = Math.max(0, S.active.i - 1); },
  next: () => { S.active.i = Math.min(S.active.qids.length - 1, S.active.i + 1); },
  jump: (el) => { S.active.i = Number(el.dataset.i); },
  flag: () => { const A = S.active; A.flags[A.i] = !A.flags[A.i]; },
  bookmark: () => {
    const id = S.active.qids[S.active.i];
    if (S.bookmarks[id]) delete S.bookmarks[id]; else S.bookmarks[id] = 1;
  },
  end: submit,
  retest: (el) => {
    const h = S.history.find((x) => x.id === el.dataset.id);
    startQuiz({ title: 'Missed Questions Retest', mode: 'study', qids: h.qids.filter((qid, i) => h.answers[i] !== byId.get(qid)?.answer) });
  },
  'review-mistakes': () => startQuiz({ title: 'Mistake Bank Review', mode: 'study', topics: BANK.topics.map((t) => t.id), filter: 'mistakes' }),
  'clear-mistake': (el) => { delete S.mistakes[el.dataset.id]; },
  export: () => download(`ny-re-exam-progress-${today()}.json`, S),
  reset: () => {
    if (!confirm('Erase all progress, history, bookmarks and mistakes?')) return;
    S = fresh();
    indexBank(BANK.base);
  },
};

const ASYNC_SKIP = new Set(['answer', 'end', 'drill', 'mock', 'weak', 'start', 'retest', 'review-mistakes', 'resume', 'export']);

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.matches('input') || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
  const name = el.dataset.action;
  const fn = ACTIONS[name];
  if (!fn) return;
  e.preventDefault();
  fn(el);
  if (!ASYNC_SKIP.has(name)) { save(); render(); }
});

document.addEventListener('change', async (e) => {
  const el = e.target;
  const name = el.dataset.action;
  if (name === 'toggle') { ACTIONS.toggle(el); save(); render(); return; }
  if (name === 'count') {
    const n = Math.max(1, Math.min(BANK.questions.length, parseInt(el.value, 10) || 1));
    cfgGet().count = n;
    save();
    render();
    return;
  }
  if (!el.files?.[0]) return;
  let data;
  try { data = JSON.parse(await el.files[0].text()); } catch { return toast('That file is not valid JSON.'); }
  if (name === 'import-progress') {
    if (!data || typeof data.attempts !== 'object' || !Array.isArray(data.history)) return toast('Not a study-history export.');
    S = { ...fresh(), ...data };
    toast('Study history imported.');
  } else if (name === 'import-questions') {
    const list = Array.isArray(data) ? data : data.questions;
    if (!Array.isArray(list)) return toast('Expected an array of questions.');
    const good = list.filter(validQuestion);
    const known = new Set(BANK.questions.map((q) => q.id));
    const added = good.filter((q) => !known.has(q.id));
    S.imported.push(...added);
    toast(`Imported ${added.length} new question${added.length === 1 ? '' : 's'}${list.length - good.length ? `, rejected ${list.length - good.length} invalid` : ''}.`);
  }
  indexBank(BANK.base);
  save();
  render();
});

document.addEventListener('keydown', (e) => {
  if (!S.active || document.body.dataset.route !== 'quiz' || e.target.matches('input')) return;
  const k = e.key.toUpperCase();
  if ('ABCD'.includes(k) && k.length === 1) answer('ABCD'.indexOf(k));
  else if (e.key === 'ArrowRight' && S.active.i < S.active.qids.length - 1) { ACTIONS.next(); save(); render(); }
  else if (e.key === 'ArrowLeft') { ACTIONS.prev(); save(); render(); }
});

setInterval(() => {
  const cd = $('#countdown');
  if (cd) cd.textContent = fmtDur(EXAM_AT - Date.now());
  const A = S.active;
  if (A?.deadline) {
    const left = (A.deadline - Date.now()) / 1000;
    const t = $('#timer');
    if (t) { t.textContent = fmtClock(left); t.classList.toggle('low', left < 300); }
    if (left <= 0) { toast("Time's up — exam submitted."); submit(); }
  }
}, 1000);

window.addEventListener('hashchange', render);

/* ---------- boot ---------- */

(async function boot() {
  $('#view').innerHTML = '<p class="muted center">Loading question bank…</p>';
  try {
    const res = await fetch('questions.json');
    const data = await res.json();
    indexBank({ topics: data.topics, questions: data.questions.filter(validQuestion) });
  } catch {
    $('#view').innerHTML = '<p class="card">Could not load the question bank. Connect once to cache it for offline use.</p>';
    return;
  }
  window.__app = { get state() { return S; }, get bank() { return BANK; } };
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
