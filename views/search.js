'use strict';
// View: #/search/<query>. One search across the study guides (cram sheets + full notes) and the question bank.
// The index is built once, after guides() and BANK have loaded; matching is a plain substring-AND loop
// (~6,800 guide lines + 2,060 questions, a few ms per query). Typing re-renders only #sr-results so the input keeps focus.

let srQ = ''; // current query; mirrored to #/search/<encoded> with replaceState so a reload keeps it
let srF = 'all'; // filter chip: all | guides | questions
let srIdx = null; // {bank, guide: [{topic, kind, sec, text, norm}], qs: [{q, norm, stem}]}
const srMore = new Set(); // groups opened with "Show all"
const srOpen = new Set(); // question ids expanded inline
const SR_PAGE = 8;
const SR_TIPS = ['habendum', 'escrow', 'blockbusting', 'transfer tax', 'dual agency', 'commission'];
// Cram entry kind -> [anchor id on the cram sheet (views/study.js), label].
const SR_CRAM = { num: ['st-c-num', 'Key numbers'], must: ['st-c-must', 'Must know'], trap: ['st-c-trap', 'Exam traps'],
  truth: ['st-c-trap', 'Exam traps'], form: ['st-c-form', 'Formulas'], mnem: ['st-c-mnem', 'Memory aids'] };
const SR_GROUPS = [['cram', 'Cram sheets'], ['notes', 'Full notes'], ['qs', 'Questions']];
const SR_FINE = matchMedia('(hover: hover) and (pointer: fine)'); // desktop / trackpad: autofocus is safe (no keyboard pop-up)

const srPlain = (s) => String(s ?? '').replace(/\*\*/g, '');

function srIndex(G) {
  if (srIdx?.bank === BANK) return srIdx;
  const guide = [];
  const add = (topic, kind, sec, s) => { const text = srPlain(s); if (text) guide.push({ topic, kind, sec, text, norm: text.toLowerCase() }); };
  for (const g of Object.values(G)) {
    const c = g.cram, t = g.topic;
    c.numbers.forEach((n) => add(t, 'num', 'cram', `${n.value}: ${n.label}`));
    c.mustKnow.forEach((m) => add(t, 'must', 'cram', m));
    c.traps.forEach((x) => { add(t, 'trap', 'cram', x.trap); add(t, 'truth', 'cram', x.truth); });
    c.formulas?.forEach((f) => add(t, 'form', 'cram', `${f.name}: ${f.formula}${f.example ? `. ${f.example}` : ''}`));
    c.mnemonics?.forEach((m) => add(t, 'mnem', 'cram', `${m.name}: ${m.meaning}`));
    g.sections.forEach((s, i) => {
      add(t, 'heading', i, s.heading);
      add(t, 'intro', i, s.intro);
      s.points.forEach((p) => add(t, 'point', i, p));
      s.table?.rows.forEach((r) => add(t, 'row', i, r.join('; ')));
      if (s.example) { add(t, 'example', i, s.example.title); s.example.steps.forEach((st) => add(t, 'step', i, st)); }
    });
  }
  const qs = BANK.questions.map((q) => ({ q, stem: q.q.toLowerCase(), norm: [q.q, ...q.options, q.explanation].join('\n').toLowerCase() }));
  return (srIdx = { bank: BANK, guide, qs });
}

const srTerms = () => srPlain(srQ).toLowerCase().split(/\s+/).filter(Boolean);

// Every term must appear. Rank 0: match in a heading (section heading, question stem); 1: text starts with a term; 2: elsewhere.
function srSearch(idx, terms) {
  const all = (s) => { for (const t of terms) if (!s.includes(t)) return false; return true; };
  const starts = (s) => terms.some((t) => s.startsWith(t));
  const out = { cram: [], notes: [], qs: [] };
  for (const e of idx.guide) {
    if (!all(e.norm)) continue;
    (e.sec === 'cram' ? out.cram : out.notes).push({ e, r: e.kind === 'heading' ? 0 : starts(e.norm) ? 1 : 2 });
  }
  for (const e of idx.qs) if (all(e.norm)) out.qs.push({ e, r: all(e.stem) ? 0 : starts(e.stem) ? 1 : 2 });
  for (const k in out) out[k] = out[k].sort((a, b) => a.r - b.r).map((x) => x.e); // stable: chapter order within a rank
  return out;
}

// Highlight on the raw text's match ranges, escaping every piece, so no query or data text is ever injected unescaped.
function srHl(text, terms) {
  const low = text.toLowerCase(), r = [];
  for (const t of terms) for (let i = low.indexOf(t); i >= 0; i = low.indexOf(t, i + t.length)) r.push([i, i + t.length]);
  r.sort((a, b) => a[0] - b[0]);
  let out = '', at = 0;
  for (const [s, e] of r) {
    if (e <= at) continue;
    const s2 = Math.max(s, at);
    out += `${esc(text.slice(at, s2))}<mark class="sr-hit">${esc(text.slice(s2, e))}</mark>`;
    at = e;
  }
  return out + esc(text.slice(at));
}

// ~140-char window around the first match, snapped to word boundaries.
function srSnip(text, terms, len = 140) {
  if (text.length <= len) return srHl(text, terms);
  const low = text.toLowerCase();
  const first = Math.min(...terms.map((t) => { const i = low.indexOf(t); return i < 0 ? Infinity : i; }));
  const hit = Number.isFinite(first) ? first : 0;
  let start = Math.max(0, Math.min(hit - 60, text.length - len));
  if (start > 0) { const sp = text.indexOf(' ', start); if (sp >= 0 && sp < hit) start = sp + 1; }
  let end = Math.min(text.length, start + len);
  if (end < text.length) { const sp = text.lastIndexOf(' ', end); if (sp > hit) end = sp; }
  return `${start > 0 ? '…' : ''}${srHl(text.slice(start, end), terms)}${end < text.length ? '…' : ''}`;
}

function srGuideRow(G, e, terms) {
  const g = G[e.topic];
  const cram = e.sec === 'cram';
  const [anchor, label] = cram ? SR_CRAM[e.kind] : [`sec-${e.sec}`, null];
  const where = cram ? esc(label) : `${e.sec + 1}. ${srHl(srPlain(g.sections[e.sec].heading), terms)}`;
  return `<li><a class="card sr-row" href="#/study/${esc(e.topic)}${cram ? '' : '/notes'}" data-action="search-open" data-target="${anchor}">
    ${topicLabel(e.topic)}
    <span class="sr-sec">${where}</span>
    ${e.kind === 'heading' ? '' : `<span class="sr-snip">${srSnip(e.text, terms)}</span>`}</a></li>`;
}

function srQuestionRow(e, terms) {
  const q = e.q, id = esc(q.id), open = srOpen.has(q.id);
  const has = (s) => terms.some((t) => s.toLowerCase().includes(t));
  // Stem has no hit: show where the match is (an answer option or the explanation).
  let extra = '';
  if (!has(q.q)) {
    const opt = q.options.find(has);
    extra = `<span class="sr-snip"><span class="meta">${opt ? 'In an answer option' : 'In the explanation'}</span> ${srSnip(opt || q.explanation || '', terms)}</span>`;
  }
  return `<li class="card sr-q">
    <button class="sr-qrow" data-action="search-toggle" data-id="${id}" aria-expanded="${open}" aria-controls="sr-a-${id}">
      ${topicLabel(q.topic)}
      <span class="sr-qtext">${srSnip(q.q, terms)}</span>${extra}
    </button>
    <button class="btn sr-practice" data-action="search-practice" data-id="${id}">Practice</button>
    <div class="sr-ans" id="sr-a-${id}"${open ? '' : ' hidden'}>
      <p class="sr-key">${svg('check')}<span><span class="sr-only">Answer: </span>${srHl(q.options[q.answer], terms)}</span></p>
      ${q.explanation ? `<p class="muted">${srHl(q.explanation, terms)}</p>` : ''}
      ${q.citation ? `<p class="meta">${esc(q.citation)}</p>` : ''}
    </div></li>`;
}

const srTips = (lead) => `<div class="sr-empty"><p class="muted">${lead}</p>
  <div class="chips">${SR_TIPS.map((t) => `<button class="chip" data-action="search-suggest" data-q="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>`;

// Body below the field: filter chips + grouped results, or a helpful empty / short / no-match state.
function srBody() {
  const G = guides();
  const q = srQ.trim();
  if (!q) return srTips(`Look up any term across ${Object.keys(G).length} study guides and ${BANK.questions.length.toLocaleString()} questions. Try:`);
  const terms = srTerms();
  if (q.length < 2 || !terms.length) return srTips('Type at least 2 characters, or try:');
  const r = srSearch(srIndex(G), terms);
  const nG = r.cram.length + r.notes.length, nQ = r.qs.length;
  if (!nG && !nQ) return srTips(`No matches for “${esc(q)}”. Check the spelling, use fewer words, or try:`);
  const chip = (f, label, n) => `<button class="chip" data-action="search-filter" data-f="${f}" aria-pressed="${srF === f}">${label} <span class="sr-n">${n}</span></button>`;
  const groups = SR_GROUPS.filter(([k]) => r[k].length && (srF === 'all' || (srF === 'qs') === (k === 'qs'))).map(([k, title]) => {
    const list = r[k], shown = srMore.has(k) ? list : list.slice(0, SR_PAGE);
    return `<section class="sr-group" id="sr-g-${k}">
      <div class="sr-ghead"><h2>${title}</h2><span class="meta">${list.length} ${list.length === 1 ? 'match' : 'matches'}</span></div>
      <ul class="sr-list">${shown.map((e) => (k === 'qs' ? srQuestionRow(e, terms) : srGuideRow(G, e, terms))).join('')}</ul>
      ${shown.length < list.length ? `<button class="btn block sr-more" data-action="search-more" data-g="${k}">Show all ${list.length}</button>` : ''}
    </section>`;
  }).join('');
  return `<div class="chips sr-filters" role="group" aria-label="Filter results">${chip('all', 'All', nG + nQ)}${chip('guides', 'Study guides', nG)}${chip('qs', 'Questions', nQ)}</div>
    ${groups || '<p class="muted sr-none">Nothing in this filter. Choose All to see every match.</p>'}`;
}

const srHash = () => `#/search${srQ ? `/${encodeURIComponent(srQ)}` : ''}`;

// Re-render only the results (never the input), mirror the query to the URL, and optionally restore focus.
function srRefresh(focusSel) {
  // Safari throws SecurityError past 100 history calls per 10 s (fast typing); the URL mirror is best-effort.
  try { if (location.hash !== srHash()) history.replaceState(null, '', srHash()); } catch {}
  const box = document.getElementById('sr-results');
  if (!box) return;
  box.innerHTML = srBody();
  document.querySelector('.sr-clear').hidden = !srQ;
  const n = box.querySelectorAll('.sr-filters .sr-n')[0]?.textContent;
  document.getElementById('sr-status').textContent = srQ.trim().length < 2 ? '' : `${n || 'No'} ${n === '1' ? 'match' : 'matches'}`;
  if (focusSel) box.querySelector(focusSel)?.focus();
}

function vSearch(arg) {
  const G = guides();
  if (!G || !BANK.questions.length) return { top: header('Search', { back: ['#/study', 'Study guides'] }), main: '<p class="muted center">Loading study guides…</p>', bottom: tabs('study') };
  if (arg !== undefined) { try { srQ = decodeURIComponent(arg); } catch { srQ = arg; } } else if (srQ) history.replaceState(null, '', srHash());
  if (SR_FINE.matches) setTimeout(() => { const i = document.getElementById('sr-input'); if (i && document.activeElement === document.body) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } });
  return {
    top: `${header('Search', { back: ['#/study', 'Study guides'] })}
      <div class="sr-field" role="search">
        ${svg('search')}
        <input id="sr-input" type="search" value="${esc(srQ)}" placeholder="Search guides and questions" aria-label="Search guides and questions"
          autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="search">
        <button class="iconbtn sr-clear" data-action="search-clear" aria-label="Clear search"${srQ ? '' : ' hidden'}>${svg('x')}</button>
      </div>`,
    main: `<p id="sr-status" class="sr-only" aria-live="polite"></p><div id="sr-results">${srBody()}</div>`,
    bottom: tabs('study'),
  };
}

document.addEventListener('input', (e) => {
  if (e.target.id !== 'sr-input') return;
  srQ = e.target.value;
  srMore.clear();
  srOpen.clear();
  srRefresh();
});
// Enter / Search on a phone keyboard: dismiss the keyboard so the results are visible.
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'sr-input') e.target.blur(); });

// Every action updates the page itself and returns false, so app.js skips its full re-render (which would rebuild the input).
const SEARCH_ACTIONS = {
  'search-clear': () => {
    srQ = '';
    srMore.clear();
    const i = document.getElementById('sr-input');
    i.value = '';
    i.focus();
    srRefresh();
    return false;
  },
  'search-suggest': (el) => {
    srQ = el.dataset.q;
    srMore.clear();
    document.getElementById('sr-input').value = srQ;
    srRefresh('.sr-filters .chip');
    return false;
  },
  'search-filter': (el) => { srF = el.dataset.f; srRefresh(`[data-f="${srF}"]`); return false; },
  'search-more': (el) => { srMore.add(el.dataset.g); srRefresh(`#sr-g-${el.dataset.g} .sr-list > li:nth-child(${SR_PAGE + 1}) :is(a, button)`); return false; },
  'search-toggle': (el) => {
    const id = el.dataset.id, open = !srOpen.delete(id);
    if (open) srOpen.add(id);
    el.setAttribute('aria-expanded', open);
    el.closest('li').querySelector('.sr-ans').hidden = !open;
    return false;
  },
  'search-open': (el) => { SCROLL_TO = el.dataset.target; go(el.getAttribute('href').slice(2)); return false; },
  'search-practice': (el) => { startQuiz({ title: 'Search practice', mode: 'study', qids: [el.dataset.id] }); return false; },
};
