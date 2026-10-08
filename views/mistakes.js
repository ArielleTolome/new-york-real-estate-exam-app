'use strict';
// View: #/mistakes. Globals (state, helpers) come from app.js; called at render time.

function vMistakes() {
  const items = Object.entries(S.mistakes).filter(([id]) => byId.has(id)).sort((a, b) => b[1].at - a[1].at);
  const n = items.length;
  const hero = n
    ? `<section class="sheet mk-hero">
        <p class="mk-count"><span class="num">${n}</span><span>question${n === 1 ? '' : 's'} to clear</span></p>
        <p class="muted small">Answer one correctly <strong>twice in a row</strong> to clear it.</p>
        <button class="btn primary block" data-action="review-mistakes">Review mistakes</button></section>`
    : `<section class="sheet mk-hero mk-empty">
        <span class="mk-empty-ic">${svg('check')}</span>
        <h2>Nothing to clear</h2>
        <p class="muted small">Questions you miss land here until you answer them correctly twice in a row. A quick drill is the fastest way to find the next ones.</p>
        <button class="btn primary block" data-action="drill">Start a quick drill</button>
        <button class="btn ghost block" data-action="review-mistakes" disabled>Review mistakes</button></section>`;
  return {
    top: header('Mistakes'),
    main: `<div class="mk-layout${n ? ' mk-split' : ''}">${hero}
    <section class="mk-list">${n ? '<div class="section-title"><h2>Missed questions</h2><span class="meta">Newest first</span></div>' : ''}
    <ul class="mlist" id="mlist">${items.map(([id, m]) => {
      const q = byId.get(id);
      return `<li class="card mk-item">${topicLabel(q.topic)}<p class="mk-q">${esc(q.q)}</p>
        <div class="row"><span class="dots" role="img" aria-label="${m.streak} of 2 correct"><i class="${m.streak ? 'on' : ''}"></i><i></i><small>${m.streak} of 2</small></span>
        <button class="link mk-clear" data-action="clear-mistake" data-id="${esc(id)}">Clear</button></div></li>`;
    }).join('')}</ul></section></div>`,
    bottom: tabs('mistakes'),
  };
}
