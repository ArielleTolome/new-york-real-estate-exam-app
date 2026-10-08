'use strict';
// View: #/history (Stats tab). Globals (state, helpers) come from app.js; called at render time.

function vHistory() {
  const ts = topicStats();
  const o = overall();
  const weak = weakTopics();
  const rows = BANK.topics.map((t) => ({ id: t.id, name: t.name, n: ts[t.id].n, c: ts[t.id].c, acc: ts[t.id].n ? ts[t.id].c / ts[t.id].n : 0 }));
  const tested = rows.filter((r) => r.n).sort((a, b) => a.acc - b.acc || b.n - a.n);
  const untested = rows.filter((r) => !r.n);
  // The map reads like a subway status board: topics grouped by route line (TOPIC_LINE order).
  const line = Object.keys(TOPIC_LINE), at = (id) => line.indexOf(id) + 1 || line.length + 1;
  const map = [...rows].sort((a, b) => at(a.id) - at(b.id));
  const state = (r) => (!r.n ? 'none' : r.acc >= PASS ? 'ok' : 'low');
  const day = (t) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  // Cells left in the map's last row at 3 (phone), 6 (tablet), 8 (wide) columns; tablet needs 3 for legend + Retest, else a full row.
  const fill = (cols, min = 1) => { const n = cols - (map.length % cols); return n < min ? cols : n; };
  return {
    top: header('Performance', { sub: o.n ? `${o.n} answer${o.n === 1 ? '' : 's'}, ${pct(o.acc)}% right` : 'Your map fills in as you answer questions' }),
    main: `
    <section>
      <div class="section-title"><h2>Weak topic heatmap</h2><span class="meta">${tested.length} of ${rows.length} tested</span></div>
      <div class="hm" id="heatmap">${map.map((r) =>
        `<div class="hm-cell ${state(r)}">${bullet(r.id)}<span class="hm-name">${esc(r.name).replace(/-/g, '\u2011')}</span><b class="num">${r.n ? pct(r.acc) + '%' : '—'}</b></div>`).join('')}
        <div class="hm-foot" style="--k3:${fill(3)};--k6:${fill(6, 3)};--k8:${fill(8, 3)}"><p class="hm-key"><span class="ok">${pct(PASS)}% and up</span><span class="low">Under ${pct(PASS)}%</span><span class="none">Not tested</span></p>
        ${weak.length ? `<button class="btn primary" data-action="weak">Retest weak areas<span class="hm-pill">${weak.length} topic${weak.length === 1 ? '' : 's'}</span></button>`
          : '<button class="btn primary" data-action="weak" disabled>No weak topics yet</button>'}</div></div>
    </section>
    <div class="pf-cols">${tested.length ? `<section class="card">
      <div class="section-title"><h2>Accuracy by topic</h2><span class="meta">Weakest first</span></div>
      <ul class="ac">${tested.map((r) =>
        `<li class="ac-row">${topicLabel(r.id)}<span class="ac-n"><b class="num ${state(r)}">${pct(r.acc)}%</b> ${r.c}/${r.n}</span>${bar(r.acc, r.n)}</li>`).join('')}</ul>
      ${untested.length ? `<p class="ac-un-h meta">Not tested yet</p><ul class="ac-un">${untested.map((r) => `<li>${topicLabel(r.id)}</li>`).join('')}</ul>` : ''}
    </section>` : ''}
    <section class="card">
      <div class="section-title"><h2>Quiz log</h2>${S.history.length ? '<span class="meta">Newest first</span>' : ''}</div>
      ${S.history.length ? `<ul id="log">${S.history.map((h) =>
        `<li><a href="#/results/${esc(h.id)}"><span class="badge ${h.passed ? 'ok' : 'bad'}">${h.passed ? 'PASS' : 'FAIL'}</span>
          <span class="lg-t"><strong>${esc(h.title)}</strong><small>${day(h.date)}, ${h.correct}/${h.total} correct</small></span>
          <b class="num ${h.passed ? 'ok' : 'low'}">${pct(h.score)}%</b>${svg('chevron')}</a></li>`).join('')}</ul>`
        : '<p class="muted">No quizzes yet. Finished quizzes land here with their score.</p>'}
    </section></div>`,
    bottom: tabs('history'),
  };
}
