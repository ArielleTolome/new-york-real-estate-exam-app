'use strict';
// View: #/results. Globals (state, helpers) come from app.js; called at render time.

function vResults(id) {
  const h = S.history.find((x) => x.id === id);
  if (!h) return go('history');
  const missed = h.qids.filter((qid, i) => h.answers[i] !== byId.get(qid)?.answer);
  const s = (n) => (n === 1 ? '' : 's');
  const gap = Math.abs(h.correct - Math.ceil((pct(PASS) * h.total) / 100)); // correct answers away from the pass line
  const topics = Object.entries(h.byTopic).sort(([, a], [, b]) => a.c / a.t - b.c / b.t || b.t - a.t);
  return {
    top: header('Results', { sub: `${h.title}, ${h.mode === 'exam' ? 'exam' : 'study'} mode`, back: ['#/history', 'Stats'] }),
    main: `
    <div class="rs-side"><section class="sheet rs-hero ${h.passed ? 'pass' : 'fail'}">
      <div class="rs-top"><p class="rs-score num" id="score">${pct(h.score)}%</p><span class="badge big ${h.passed ? 'ok' : 'bad'}" id="verdict">${h.passed ? 'PASS' : 'FAIL'}</span></div>
      <div class="rs-line" role="img" aria-label="${pct(h.score)} percent against the ${pct(PASS)} percent pass line"><i style="width:${pct(h.score)}%"></i><b><span>Pass line ${pct(PASS)}%</span></b></div>
      <p class="rs-gap">${h.passed ? (gap ? `${gap} correct answer${s(gap)} above the pass line` : 'Passed with no answers to spare') : `${gap} correct answer${s(gap)} short of passing`}</p>
      <dl class="rs-stats">
        <div><dt>Correct</dt><dd class="num">${h.correct} of ${h.total}</dd></div>
        <div><dt>Answered</dt><dd class="num">${h.answered}</dd></div>
        <div><dt>Time</dt><dd class="num">${fmtClock(h.secs)}</dd></div>
      </dl>
    </section>
    <section class="card rs-topics">
      <div class="section-title"><h2>By topic</h2><span class="meta">Weakest first</span></div>
      <ul class="ac">${topics.map(([t, x]) =>
        `<li class="ac-row">${topicLabel(t)}<span class="ac-n${x.c / x.t >= PASS ? ' ok' : ''}">${x.c}/${x.t}</span>${bar(x.c / x.t, x.t)}</li>`).join('')}</ul>
    </section></div>
    <section class="card rv">
      <div class="section-title"><h2>Review</h2><span class="meta">${missed.length} missed</span></div>
      ${h.qids.map((qid, i) => {
        const q = byId.get(qid);
        if (!q) return '';
        const a = h.answers[i], ok = a === q.answer;
        return `<details class="review ${ok ? 'ok' : 'bad'}"><summary><span class="rv-mark" role="img" aria-label="${ok ? 'Correct' : 'Missed'}">${svg(ok ? 'check' : 'x')}</span>
          <span class="rv-h"><span class="rv-meta">Q ${i + 1} ${bullet(q.topic)} ${esc(topicName[q.topic] || q.topic)}</span><span class="rv-q">${esc(q.q)}</span></span></summary>
          ${ok ? '' : `<p class="rv-ans bad"><span>Your answer</span>${a === undefined ? 'No answer' : esc(q.options[a])}</p>`}
          <p class="rv-ans ok"><span>Correct answer</span>${esc(q.options[q.answer])}</p>
          ${q.citation || q.explanation ? `<div class="rv-cite"><p class="cite">${esc(q.citation || '')}</p><p>${esc(q.explanation || '')}</p></div>` : ''}</details>`;
      }).join('')}
    </section>`,
    bottom: `<div class="actionbar"><a class="btn${missed.length ? '' : ' primary'}" href="#/home">Home</a>${missed.length ? `<button class="btn primary" data-action="retest" data-id="${esc(h.id)}">Retest ${missed.length} missed</button>` : ''}</div>`,
  };
}
