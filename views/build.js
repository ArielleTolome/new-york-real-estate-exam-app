'use strict';
// View: #/build. "Plan your trip": topics as a strip map of route bullets grouped by subway line,
// then length, mode and pool. Layout references: .stitch/v2/build.png (phone), tablet-build.png
// (iPad: .bd splits into map + settings panes). Globals come from app.js.

function vBuild() {
  const c = cfgGet();
  const on = new Set(c.topics);
  const avail = pool(c).length;
  const n = Math.min(c.count, avail);
  const exam = c.mode === 'exam';
  const clock = fmtClock(n * SECS_PER_Q);
  const presets = [10, 25, 50, 75];
  const custom = !presets.includes(c.count);
  const btn = (key, v, html, cls = '') => `<button${cls ? ` class="${cls}"` : ''} data-action="set" data-key="${key}" data-val="${v}" aria-pressed="${String(c[key]) === String(v)}">${html}</button>`;
  const filterCount = (f) => BANK.questions.filter((q) => on.has(q.topic) && FILTERS[f](q)).length;

  // Station counts follow the active pool filter, so "Mistakes" shows where the mistakes are.
  const inPool = FILTERS[c.filter || 'all'];
  const perTopic = {};
  for (const q of BANK.questions) if (inPool(q)) perTopic[q.topic] = (perTopic[q.topic] || 0) + 1;

  // Group topics into lines in TOPIC_LINE order; topics without a line (imported) trail on a grey line.
  const keys = Object.keys(TOPIC_LINE);
  const rank = (id) => (keys.indexOf(id) + 1) || keys.length + 1;
  const lines = [];
  for (const t of [...BANK.topics].sort((a, b) => rank(a.id) - rank(b.id))) {
    const L = TOPIC_LINE[t.id] || { line: '', color: '#64748b' };
    if (lines.at(-1)?.line !== L.line) lines.push({ line: L.line, color: L.color, topics: [] });
    lines.at(-1).topics.push(t);
  }
  const station = (t) => `<button class="chip bd-stn" data-action="topic" data-id="${esc(t.id)}" aria-pressed="${on.has(t.id)}">${bullet(t.id)}<span class="bd-name">${esc(t.name)}</span><span class="bd-n">${perTopic[t.id] || 0}<span class="sr-only"> questions</span></span>${svg('check', 'bd-tick')}</button>`;
  const mode = (v, ic, title, desc) => btn('mode', v, `${svg(ic)}<span class="bd-mt">${title}</span><span class="bd-md">${desc}</span>${c.mode === v ? `<span class="bd-ck">${svg('check')}</span>` : ''}`, 'bd-mode');

  return {
    top: header('Custom quiz', { sub: avail === 1 ? '1 question matches' : `${avail} questions match` }),
    main: `<div class="bd">
    <section aria-labelledby="bd-t">
      <div class="section-title bd-th"><h2 id="bd-t">Topics <span class="bd-of">${c.topics.length} of ${BANK.topics.length}</span></h2>
        <div><button class="link" data-action="topics-all">All</button><button class="link" data-action="topics-none">None</button></div></div>
      <div class="card bd-map" role="group" aria-labelledby="bd-t">${lines.map((l) =>
        `<div class="bd-line" style="--b:${l.color}">${l.topics.map(station).join('')}</div>`).join('')}</div>
    </section>
    <div class="bd-set">
    <section aria-labelledby="bd-q">
      <h2 id="bd-q">Questions</h2>
      <div class="bd-len">
        <div class="seg bd-seg" role="group" aria-labelledby="bd-q">${presets.map((v) => btn('count', v, v)).join('')}</div>
        <label class="bd-custom${custom ? ' on' : ''}"><span>Custom<span class="sr-only"> count</span></span><input id="count" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="–" value="${custom ? c.count : ''}" data-action="count"></label>
      </div>
    </section>
    <section aria-labelledby="bd-m">
      <h2 id="bd-m">Mode</h2>
      <div class="bd-modes" role="group" aria-labelledby="bd-m">
        ${mode('study', 'book', 'Tutor', 'Instant feedback and the legal citation after each answer.')}
        ${mode('exam', 'clock', 'Timed exam', `Answers stay hidden until you submit.${n ? ` ${clock} on the clock.` : ''}`)}
      </div>
    </section>
    <section aria-labelledby="bd-p">
      <h2 id="bd-p">Question pool</h2>
      <div class="seg bd-seg bd-pool" role="group" aria-labelledby="bd-p">${[['all', 'All'], ['unseen', 'Unseen'], ['bookmarked', 'Bookmarked'], ['mistakes', 'Mistakes']].map(([v, label]) =>
        btn('filter', v, `${label} <b>${filterCount(v)}</b>`)).join('')}</div>
      <div class="card bd-opts">
        <label class="switch"><input type="checkbox" data-action="toggle" data-key="shuffleQ"${c.shuffleQ ? ' checked' : ''}><span>Shuffle question order</span></label>
        <label class="switch"><input type="checkbox" data-action="toggle" data-key="shuffleO"${c.shuffleO ? ' checked' : ''}><span>Shuffle answer positions (A–D)</span></label>
      </div>
    </section>
    </div></div>`,
    bottom: `<div class="actionbar bd-bar">${exam && n ? `<span class="bd-clock">${svg('clock')}<span class="sr-only">Time limit </span><span class="num">${clock}</span></span>` : ''}<button class="btn primary grow" id="start" data-action="start"${n ? '' : ' disabled'}>${n ? `Start ${n}-question ${exam ? 'exam' : 'quiz'}` : 'No questions match'}</button></div>`,
  };
}
