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
    main: `
    <section class="sheet hm-board" aria-labelledby="hm-dest">
      <div class="hm-panel">
        <p class="hm-dest"><span id="hm-dest">NYS salesperson exam</span><span>Oct 14 &amp; 15</span></p>
        <p class="hm-cd" id="countdown" role="timer">${fmtDurHtml(EXAM_AT - Date.now())}</p>
      </div>
      <p class="hm-spec">Pass with 53 of 75 correct in 90 minutes.</p>
    </section>
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
      <button class="btn primary" data-action="drill">Quick 10-Question Drill</button>
      <button class="btn hm-act" data-action="mock">${svg('clock')}<span><span class="hm-act-t">Mock 75-Question NYS State Exam</span><span class="hm-act-s">75 questions in 90 minutes, timed</span></span></button>
      <a class="btn hm-act" href="#/build">${svg('build')}<span><span class="hm-act-t">Custom Quiz Builder</span><span class="hm-act-s">Pick topics, length and mode</span></span></a>
    </section>
    ${weak.length ? `<section aria-labelledby="hm-weak-h">
      <div class="section-title"><h2 id="hm-weak-h">Weakest lines</h2><span class="meta">${weak.length} under 70%</span></div>
      <div class="card hm-weak">
        <ul>${weak.slice(0, 3).map((id) => `<li>${bullet(id)}<span class="hm-weak-name">${esc(topicName[id])}</span>${bar(acc(id), ts[id].n)}<span class="hm-weak-pct num">${pct(acc(id))}%</span></li>`).join('')}</ul>
        <button class="btn block" data-action="weak">Retest Weak Areas</button>
      </div>
    </section>` : ''}`,
    bottom: tabs('home'),
  };
}
