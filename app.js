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

const yesterday = () => { const y = new Date(); y.setDate(y.getDate() - 1); return today(y); };

function bumpStreak() {
  const t = today();
  if (S.streak.day === t) return;
  S.streak = { day: t, count: S.streak.day === yesterday() ? S.streak.count + 1 : 1 };
}

// Current streak for display: a streak whose last day is before yesterday has lapsed.
const streakNow = () => (S.streak.day === today() || S.streak.day === yesterday() ? S.streak.count : 0);

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
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  build: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  chart: '<path d="M4 20V11M10 20V5M16 20v-6M2 20h20"/>',
  bank: '<path d="m12 3 9 4.5-9 4.5-9-4.5z"/><path d="m3 12 9 4.5 9-4.5M3 16.5 12 21l9-4.5"/>',
  more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  star: '<path d="m12 3 2.8 5.8 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.7l6.2-.9z"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5M8 7h7"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4"/>',
  download: '<path d="M12 4v11m-5-5 5 5 5-5M4 20h16"/>',
  upload: '<path d="M12 16V5m-5 5 5-5 5 5M4 20h16"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  share: '<path d="M12 3v12M8 7l4-4 4 4M5 12v8h14v-8"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  plusSquare: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/>',
  filePlus: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 11.5v6M9 14.5h6"/>',
};
const svg = (name, extra = '') => `<svg class="ic ${extra}" viewBox="0 0 24 24" aria-hidden="true">${icon[name]}</svg>`;

function tabs(active) {
  const t = [['home', 'Home', 'home'], ['study', 'Study', 'book'], ['build', 'Build', 'build'], ['history', 'Stats', 'chart'], ['mistakes', 'Mistakes', 'bank'], ['more', 'More', 'more']];
  return `<nav class="tabs" aria-label="Main">${t.map(([r, label, ic]) =>
    `<a href="#/${r}" class="tab${active === r ? ' on' : ''}"${active === r ? ' aria-current="page"' : ''}>${svg(ic)}<span>${label}</span></a>`).join('')}</nav>`;
}

// Chapter study guides (cram sheet + full notes) are ~0.5 MB, so they load on the first visit to Study.
let GUIDES = null;
let guidesLoading = null;
function guides() {
  if (GUIDES) return GUIDES;
  guidesLoading ||= fetch('guides.json')
    .then((r) => r.json())
    .then((d) => { GUIDES = Object.fromEntries(d.guides.map((g) => [g.topic, g])); render(); })
    .catch(() => { guidesLoading = null; toast('Study guides need one online visit before they work offline.'); });
  return null;
}
// Guide text is plain text with **bold** as the only markup. Parenthetical citations such as "(RPL §443)" are
// rendered muted so the rule reads first; a parenthetical containing ** is left alone so tags never cross.
const CITE = /§|NYCRR|CFR|U\.S\.C|\bv\. |\b(Law|Act|Code|Charter|Reg|Regulation|RPL|RPAPL|GOL|RPTL|EPTL|IRC|BCL|PHL|GML|EDPL|ECL|SCPA|CPLR|GBL)\b/;
const rich = (s) => esc(s)
  .replace(/\((?:[^()]|\([^()]*\))*\)/g, (m) => (CITE.test(m) && !m.includes('**') ? `<span class="cite-i">${m}</span>` : m))
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

// Large-title header. opts: { sub: plain-text subtitle, right: trusted HTML (e.g. a button), logo: bool,
// back: [href, label] for screens below a tab root, so every screen has a visible way back }
function header(title, { sub = '', right = '', logo = false, back = null } = {}) {
  return `${back ? `<a class="hdr-back" href="${back[0]}">${svg('chevron')}<span>${esc(back[1])}</span></a>` : ''}<div class="hdr">${logo ? '<img class="hdr-logo" src="icons/logo.svg" alt="" width="32" height="32">' : ''}
    <div class="hdr-t"><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div>${right}</div>`;
}

// Topic identity as NYC-style route bullets (see .stitch/v2/DESIGN.md). dark = dark glyph on light bullet.
const LINE = { red: ['#DA291C'], green: ['#00843D'], blue: ['#0039A6'], orange: ['#FF6319', 1], yellow: ['#FCCC0A', 1], purple: ['#9B2A92'], lime: ['#6CBE45', 1] };
const TOPIC_LINE = Object.fromEntries(Object.entries({
  'license-law': ['1', 'red'], agency: ['2', 'red'], 'fair-housing': ['3', 'red'],
  finance: ['4', 'green'], valuation: ['5', 'green'], math: ['6', 'green'],
  'title-deeds': ['A', 'blue'], 'estates-liens': ['C', 'blue'], contracts: ['E', 'blue'],
  'land-use': ['B', 'orange'], municipal: ['D', 'orange'], 'construction-env': ['F', 'orange'], insurance: ['M', 'orange'],
  taxes: ['N', 'yellow'], closing: ['Q', 'yellow'], commercial: ['R', 'yellow'], 'property-mgmt': ['W', 'yellow'],
  'condo-coop': ['7', 'purple'], 'rentals-dealsheet': ['G', 'lime'],
}).map(([id, [code, line]]) => [id, { code, line, color: LINE[line][0], dark: !!LINE[line][1] }]));

function bullet(topicId) {
  const t = TOPIC_LINE[topicId] || { code: '•', color: '#64748b' };
  return `<span class="bullet${t.dark ? ' dark' : ''}" style="--b:${t.color}" aria-hidden="true">${t.code}</span>`;
}
const topicLabel = (topicId) => `<span class="topic">${bullet(topicId)}<span>${esc(topicName[topicId] || topicId)}</span></span>`;

// Line-with-stations progress. states[i]: '' | 'done' | 'flag'. Over 15 stations they shrink to beads (.dense);
// over 40 only the current and flagged stations are drawn.
function lineProgress(total, current, states = []) {
  const at = (i) => (total > 1 ? (i / (total - 1)) * 100 : 0);
  const dots = total <= 40 ? states.map((s, i) => `<b class="st ${s}${i === current ? ' cur' : ''}" style="left:${at(i)}%"></b>`).join('')
    : states.map((s, i) => (s === 'flag' || i === current ? `<b class="st ${s}${i === current ? ' cur' : ''}" style="left:${at(i)}%"></b>` : '')).join('');
  return `<div class="line${total > 15 ? ' dense' : ''}" role="progressbar" aria-label="Question ${current + 1} of ${total}" aria-valuemin="1" aria-valuemax="${total}" aria-valuenow="${current + 1}">
    <i class="line-fill" style="width:${at(current)}%"></i>${dots}</div>`;
}

function fmtDur(ms) {
  if (ms <= 0) return 'Exam day';
  const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60;
  return `${d}d ${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`;
}
// Same text as fmtDur, with each number wrapped in <b> so the home board can size digits vs units.
const fmtDurHtml = (ms) => fmtDur(ms).replace(/\d+/g, '<b>$&</b>');

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
    ${v > 0 ? `<circle cx="60" cy="60" r="${r}" class="g-val ${v >= PASS ? 'ok' : 'low'}" stroke-dasharray="${C * v} ${C}" transform="rotate(-90 60 60)"/>` : ''}
    <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4" class="g-pass"/>
    <text x="60" y="58" class="g-num">${pct(v)}%</text><text x="60" y="76" class="g-lbl">readiness</text></svg>`;
}

const bar = (v, n) => `<div class="bar" role="img" aria-label="${n ? pct(v) + ' percent' : 'no attempts'}"><i class="${!n ? '' : v >= PASS ? 'ok' : 'low'}" style="width:${n ? pct(v) : 0}%"></i></div>`;

/* ---------- router ---------- */

const ROUTES = { home: vHome, study: vStudy, build: vBuild, quiz: vQuiz, results: vResults, history: vHistory, mistakes: vMistakes, more: vMore };

function go(route) {
  if (location.hash === '#/' + route) render();
  else location.hash = '#/' + route;
}

let lastRoute = '';
function render() {
  const [name, arg, sub] = location.hash.replace(/^#\/?/, '').split('/');
  const v = (ROUTES[name] || vHome)(arg, sub);
  if (!v) return;
  $('#top').innerHTML = v.top;
  $('#view').innerHTML = v.main;
  $('#bottom').innerHTML = v.bottom;
  document.body.dataset.route = name || 'home';
  // Scroll to top on a new route or a new question (Next/Prev/jump re-render the same route).
  const at = location.hash + (name === 'quiz' && S.active ? `/${S.active.id}/${S.active.i}` : '');
  if (at !== lastRoute) { window.scrollTo(0, 0); lastRoute = at; }
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
  end: (el) => {
    // A stray tap on the top-bar Submit must not end a timed exam: first tap arms, second submits.
    if (el.dataset.confirm && !el.dataset.armed) {
      el.dataset.armed = '1';
      el.textContent = el.dataset.confirm;
      toast('Tap again to submit your exam.');
      setTimeout(() => { if (el.isConnected) { delete el.dataset.armed; el.textContent = 'Submit'; } }, 4000);
      return;
    }
    $('#toast').classList.remove('show'); // drop the "tap again" hint once the exam is submitted
    submit();
  },
  // Leave a quiz without ending it: progress stays in S.active and Home shows Resume.
  exit: () => {
    save();
    toast(S.active?.deadline ? 'Exam saved. The clock keeps running; resume from Home.' : 'Quiz saved. Resume it from Home.');
    go('home');
  },
  retest: (el) => {
    const h = S.history.find((x) => x.id === el.dataset.id);
    startQuiz({ title: 'Missed Questions Retest', mode: 'study', qids: h.qids.filter((qid, i) => h.answers[i] !== byId.get(qid)?.answer) });
  },
  'review-mistakes': () => startQuiz({ title: 'Mistake Bank Review', mode: 'study', topics: BANK.topics.map((t) => t.id), filter: 'mistakes' }),
  'clear-mistake': (el) => { delete S.mistakes[el.dataset.id]; },
  'practice-topic': (el) => startQuiz({ title: `${topicName[el.dataset.id] || 'Chapter'} practice`, mode: 'study', count: 25, topics: [el.dataset.id] }),
  toc: (el) => document.getElementById(el.dataset.target)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
  export: () => download(`ny-re-exam-progress-${today()}.json`, S),
  reset: () => {
    if (!confirm('Erase all progress, history, bookmarks and mistakes?')) return;
    S = fresh();
    indexBank(BANK.base);
  },
};

const ASYNC_SKIP = new Set(['answer', 'end', 'exit', 'drill', 'mock', 'weak', 'start', 'retest', 'review-mistakes', 'resume', 'export', 'practice-topic', 'toc']);

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

// Hardware keyboard (iPad Magic Keyboard / desktop): A–D or 1–4 answer, ←/→ move, F flags.
document.addEventListener('keydown', (e) => {
  if (!S.active || document.body.dataset.route !== 'quiz' || e.target.matches('input')) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return; // leave ⌘C, ⌘R etc. to the browser
  const k = e.key.toUpperCase();
  const pick = 'ABCD'.indexOf(k) >= 0 ? 'ABCD'.indexOf(k) : '1234'.indexOf(k);
  if (k.length === 1 && pick >= 0) answer(pick);
  else if (e.key === 'ArrowRight' && S.active.i < S.active.qids.length - 1) { ACTIONS.next(); save(); render(); }
  else if (e.key === 'ArrowLeft') { ACTIONS.prev(); save(); render(); }
  else if (k === 'F') { ACTIONS.flag(); save(); render(); }
});

setInterval(() => {
  const cd = $('#countdown');
  if (cd) cd.innerHTML = fmtDurHtml(EXAM_AT - Date.now());
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
  window.__app = { get state() { return S; }, get bank() { return BANK; }, get guides() { return GUIDES; } };
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
