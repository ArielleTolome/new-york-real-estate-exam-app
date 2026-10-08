'use strict';
// View: #/quiz (study + exam). Globals (state, helpers) come from app.js; called at render time.

function vQuiz() {
  const A = S.active;
  if (!A) return go('home');
  const q = byId.get(A.qids[A.i]);
  if (!q) { S.active = null; save(); return go('home'); }
  const exam = A.mode === 'exam';
  const total = A.qids.length;
  const chosen = A.answers[A.i];
  const revealed = !exam && chosen !== undefined;
  const last = A.i === total - 1;
  const flagged = !!A.flags[A.i];
  const answered = Object.keys(A.answers).length;
  const left = exam ? (A.deadline - Date.now()) / 1000 : 0;

  const opts = A.perm[A.i].map((orig, d) => {
    const cls = revealed ? (orig === q.answer ? 'correct' : orig === chosen ? 'wrong' : 'dim') : orig === chosen ? 'selected' : '';
    const tag = cls === 'correct' ? '<small class="tag">✓ Correct answer</small>' : cls === 'wrong' ? '<small class="tag">✕ Your answer</small>' : '';
    return `<button class="opt ${cls}" role="radio" data-action="answer" data-d="${d}" aria-checked="${orig === chosen}"${revealed ? ' aria-disabled="true"' : ''}><b>${LETTERS[d]}</b><span>${esc(q.options[orig])}${tag}</span></button>`;
  }).join('');

  const reveal = revealed ? `
    <p class="qz-fb ${chosen === q.answer ? 'ok' : 'bad'}" id="feedback">${chosen === q.answer ? '<strong>Correct.</strong>'
      : `<strong>Incorrect.</strong> The correct answer is ${LETTERS[A.perm[A.i].indexOf(q.answer)]}.`}</p>
    <details class="drawer qz-sheet qz-law" open><summary>Legal Citation &amp; Rationale${svg('chevron')}</summary>
      <p class="cite" id="cite">${esc(q.citation || 'General NYS real estate principle')}</p>${q.explanation ? `<p class="qz-why">${esc(q.explanation)}</p>` : ''}</details>` : '';

  const qmap = exam ? `
    <details class="qmap qz-sheet"><summary>Question map<span class="meta">${answered} of ${total} answered</span>${svg('chevron')}</summary>
      <div class="qz-grid">${A.qids.map((_, i) => {
        const done = A.answers[i] !== undefined;
        return `<button data-action="jump" data-i="${i}" class="${done ? 'done' : ''}${A.flags[i] ? ' flag' : ''}${i === A.i ? ' cur' : ''}"${i === A.i ? ' aria-current="step"' : ''} aria-label="Question ${i + 1}${done ? ', answered' : ''}${A.flags[i] ? ', flagged' : ''}">${i + 1}</button>`;
      }).join('')}</div>
      <p class="qz-legend"><span class="done">Answered</span><span class="flag">Flagged</span><span class="cur">Current</span></p></details>` : '';

  return {
    top: `<div class="qz-bar">
      <strong class="qz-pos" id="qpos">Q ${A.i + 1} of ${total}</strong>
      ${exam ? `<span class="qz-clock">${svg('clock')}<span id="timer" class="${left < 300 ? 'low' : ''}" role="timer" aria-label="Time remaining">${fmtClock(left)}</span></span>`
        : `<span class="meta qz-count">${answered} answered</span>`}
      <button class="iconbtn" data-action="bookmark" aria-pressed="${!!S.bookmarks[q.id]}" aria-label="Bookmark question">${svg('star')}</button>
      <button class="link" data-action="end"${exam ? ' data-confirm="Confirm"' : ''}>${exam ? 'Submit' : 'End'}</button></div>
      <div class="qz-line">${lineProgress(total, A.i, A.qids.map((_, i) => (A.flags[i] ? 'flag' : A.answers[i] !== undefined ? 'done' : '')))}</div>`,
    main: `
    <article class="qcard">
      <p class="qz-topic">${topicLabel(q.topic)}</p>
      <h1 class="qtext" id="qtext">${esc(q.q)}</h1>
    </article>
    <div class="opts" role="radiogroup" aria-label="Answer choices" aria-describedby="qtext">${opts}</div>${reveal}${qmap}`,
    bottom: `<div class="actionbar qz-actions">
      <button class="btn qz-prev" data-action="prev" aria-label="Previous question"${A.i ? '' : ' disabled'}>${svg('chevron')}</button>
      <button class="btn qz-flag${flagged ? ' warn' : ''}" data-action="flag" aria-pressed="${flagged}">${svg('flag')}${flagged ? 'Flagged' : 'Flag'}</button>
      <button class="btn primary" data-action="${last ? 'end' : 'next'}" id="next">${last ? (exam ? 'Submit Exam' : 'Finish') : 'Next'}</button></div>`,
  };
}
