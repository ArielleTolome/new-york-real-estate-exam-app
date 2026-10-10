'use strict';
// View: #/study (chapter list), #/study/<topic> (cram sheet), #/study/<topic>/notes (full notes).
// Globals (state, helpers, guides(), rich()) come from app.js; called at render time.

function vStudy(topicId, sub) {
  const G = guides();
  if (!G) return { top: header('Study guides'), main: '<p class="muted center">Loading study guides…</p>', bottom: tabs('study') };
  return topicId ? studyChapter(G, topicId, sub === 'notes') : studyList(G);
}

function studyList(G) {
  const ts = topicStats();
  const rows = BANK.topics.map((t, i) => [t, i]).filter(([t]) => G[t.id]).map(([t, i]) => {
    const s = ts[t.id];
    const acc = s.n ? s.c / s.n : null;
    const g = G[t.id];
    return `<li><a class="st-row" href="#/study/${esc(t.id)}">${bullet(t.id)}
      <span class="st-row-t"><strong>${esc(t.name)}</strong>
        <small class="meta">Chapter ${i + 1}. ${g.sections.length} sections, ${s.total} questions${acc === null ? '' : `, ${pct(acc)}% right`}</small></span>
      ${acc !== null && acc < PASS ? '<span class="badge bad">Weak</span>' : ''}${svg('chevron')}</a></li>`;
  }).join('');
  const fc = cardsSummary(G); // {due, total} from views/cards.js
  return {
    top: header('Study guides', { sub: 'A cram sheet and full notes for every chapter',
      right: `<a class="iconbtn" href="#/search" aria-label="Search guides and questions">${svg('search')}</a>` }),
    main: `<a class="card st-fc" href="#/cards" id="fc-entry">${svg('cards')}<span class="st-fc-t"><strong>Flashcards</strong>
        <small class="meta">${fc.due ? `${fc.due} due today` : 'All caught up today'}, ${fc.total.toLocaleString('en-US')} cards from the cram sheets</small></span>${svg('chevron')}</a>
    <ul class="st-list" id="chapters">${rows}</ul>`,
    bottom: tabs('study'),
  };
}

function studyChapter(G, id, notes) {
  const g = G[id];
  const idx = BANK.topics.findIndex((t) => t.id === id);
  if (!g) {
    return { top: header('Study guides'), main: '<p class="card">There is no study guide for this topic yet.</p>', bottom: tabs('study') };
  }
  if (S.read[id] !== today()) { S.read[id] = today(); save(); } // feeds Today's plan
  const prev = BANK.topics[idx - 1], next = BANK.topics[idx + 1];
  const nav = (t, label) => (t && G[t.id] ? `<a class="st-nav" href="#/study/${esc(t.id)}${notes ? '/notes' : ''}"><small class="meta">${label}</small>${topicLabel(t.id)}</a>` : '<span></span>');
  return {
    top: header(g.title, { sub: `Chapter ${idx + 1} of ${BANK.topics.length}`, back: ['#/study', 'Study guides'],
      right: `<button class="link" data-action="practice-topic" data-id="${esc(id)}">Practice</button>` }),
    main: `
    <div class="ls-bar"><nav class="seg st-seg" aria-label="Guide view">
      <a href="#/study/${esc(id)}" ${notes ? '' : 'aria-current="page"'}>Cram sheet</a>
      <a href="#/study/${esc(id)}/notes" ${notes ? 'aria-current="page"' : ''}>Full notes</a>
    </nav>${lsButton()}${lsSaveButton()}</div>
    ${notes ? studyNotes(g) : studyCram(g, id)}
    <button class="btn primary block st-practice" data-action="practice-topic" data-id="${esc(id)}">Practice this chapter: 25 questions</button>
    <div class="st-pager">${nav(prev, 'Previous chapter')}${nav(next, 'Next chapter')}</div>`,
    bottom: tabs('study'),
  };
}

// In-page jump links; the toc action scrolls to data-target.
const jump = (items) => `<nav class="st-jump" aria-label="Jump to">${items.map(([target, label, n]) =>
  `<button class="chip" data-action="toc" data-target="${target}">${label}${n ? ` <span class="meta">${n}</span>` : ''}</button>`).join('')}</nav>`;

function studyCram(g, id) {
  const c = g.cram;
  let lsN = 0;
  const ls = () => `data-ls="${lsN++}"`; // queue index for views/listen.js; same order as lsQueue()
  return `<div class="st-cram" id="cram">
    <section class="st-intro">${bullet(id)}<p ${ls()}>${rich(g.overview)}</p></section>
    ${jump([['st-c-num', 'Key numbers', c.numbers.length], ['st-c-must', 'Must know', c.mustKnow.length], ['st-c-trap', 'Traps', c.traps.length],
      ...(c.formulas?.length ? [['st-c-form', 'Formulas', c.formulas.length]] : []), ...(c.mnemonics?.length ? [['st-c-mnem', 'Memory aids', c.mnemonics.length]] : [])])}
    <section id="st-c-num" class="st-anchor"><h2>Key numbers</h2><dl class="st-nums">${c.numbers.map((n) =>
      `<div ${ls()}><dt class="num">${rich(n.value)}</dt><dd>${rich(n.label)}</dd></div>`).join('')}</dl></section>
    <section id="st-c-must" class="st-anchor"><h2>Must know</h2><ol class="card st-must">${c.mustKnow.map((m) => `<li ${ls()}>${rich(m)}</li>`).join('')}</ol></section>
    <section id="st-c-trap" class="st-anchor"><h2>Exam traps</h2><ul class="st-traps">${c.traps.map((t) =>
      `<li class="card" ${ls()}><p class="st-trap">${svg('x')}<span><span class="sr-only">Trap: </span>${rich(t.trap)}</span></p><p class="st-truth">${svg('check')}<span><span class="sr-only">Truth: </span>${rich(t.truth)}</span></p></li>`).join('')}</ul></section>
    ${c.formulas?.length ? `<section id="st-c-form" class="st-anchor"><h2>Formulas</h2><ul class="st-formulas">${c.formulas.map((f) =>
      `<li class="card" ${ls()}><strong>${rich(f.name)}</strong><code>${rich(f.formula)}</code>${f.example ? `<small class="meta">${rich(f.example)}</small>` : ''}</li>`).join('')}</ul></section>` : ''}
    ${c.mnemonics?.length ? `<section id="st-c-mnem" class="st-anchor"><h2>Memory aids</h2><ul class="st-mnem">${c.mnemonics.map((m) =>
      `<li class="card" ${ls()}><strong>${rich(m.name)}</strong><span>${rich(m.meaning)}</span></li>`).join('')}</ul></section>` : ''}
  </div>`;
}

// Wide iPads show the section list as an open sticky sidebar; narrower screens get a collapsed "Jump to a section".
const ST_WIDE = matchMedia('(min-width: 1100px)');
ST_WIDE.addEventListener('change', () => { if (document.body.dataset.route === 'study') render(); });

function studyNotes(g) {
  const toc = g.sections.map((s, i) =>
    `<li><button class="link" data-action="toc" data-target="sec-${i}">${i + 1}. ${rich(s.heading)}</button></li>`).join('');
  let lsN = 0;
  const ls = () => `data-ls="${lsN++}"`; // queue index for views/listen.js; same order as lsQueue()
  const sections = g.sections.map((s, i) => `
    <section class="card st-sec st-anchor" id="sec-${i}"><h2 ${ls()}>${i + 1}. ${rich(s.heading)}</h2>
      ${s.intro ? `<p class="st-lead" ${ls()}>${rich(s.intro)}</p>` : ''}
      <ul class="st-points">${s.points.map((p) => `<li ${ls()}>${rich(p)}</li>`).join('')}</ul>
      ${s.table ? `<div class="st-table" role="region" aria-label="${esc(s.heading)} table" tabindex="0"><table>
        <thead><tr>${s.table.head.map((h) => `<th scope="col">${rich(h)}</th>`).join('')}</tr></thead>
        <tbody>${s.table.rows.map((r) => `<tr>${r.map((cell) => `<td>${rich(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}
      ${s.example ? `<div class="st-example"><h3 ${ls()}>${rich(s.example.title)}</h3><ol>${s.example.steps.map((st) => `<li ${ls()}>${rich(st)}</li>`).join('')}</ol></div>` : ''}
    </section>`).join('');
  return `<div class="st-notes" id="notes">
    <details class="card st-toc"${ST_WIDE.matches ? ' open' : ''}><summary><h2>${g.sections.length} sections</h2><span class="meta">Jump to</span>${svg('chevron')}</summary><ol>${toc}</ol></details>
    <div class="st-body">${sections}
      <section class="st-sources"><h2>Sources</h2><ul>${g.sources.map((s) => `<li>${rich(s)}</li>`).join('')}</ul></section></div>
  </div>`;
}
