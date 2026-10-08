'use strict';
// View: #/more. Globals (state, helpers) come from app.js; called at render time.

function vMore() {
  const ts = topicStats();
  const step = (n, ic, text) => `<li class="bk-step"><span class="bk-step-ic">${ic}</span><span class="meta">Step ${n}</span><span>${text}</span></li>`;
  const file = (action, ic, text, meta) =>
    `<label class="bk-row file"><span class="bk-row-ic">${ic}</span><span class="bk-row-t">${text}</span><span class="meta">${meta}</span><input class="sr-only" type="file" accept="application/json,.json" data-action="${action}"></label>`;
  return {
    top: header('More'),
    main: `
    <section><h2>Install on iPhone</h2>
      <div class="card bk-install"><ol class="bk-steps">
        ${step(1, svg('compass'), 'Open in Safari')}${step(2, svg('share'), 'Tap Share')}${step(3, svg('plusSquare'), 'Add to Home Screen')}</ol>
        <p class="bk-note">${svg('check')}<span>Works fully offline after the first load, so you can study underground.</span></p></div></section>
    <section><h2>Your data</h2>
      <div class="bk-list">
        <button class="bk-row" data-action="export"><span class="bk-row-ic">${svg('download')}</span><span class="bk-row-t">Export study history</span><span class="meta">JSON</span></button>
        ${file('import-progress', svg('upload'), 'Import study history', 'Restore')}
        ${file('import-questions', svg('filePlus'), 'Import question batch', `${S.imported.length} added`)}
      </div>
      <p class="meta bk-caption">Question batch format: a JSON array of {id, topic, q, options[4], answer 0-3, explanation, citation}.</p>
      <div class="bk-list"><button class="bk-row bk-danger" data-action="reset"><span class="bk-row-ic">${svg('trash')}</span><span class="bk-row-t">Reset all progress</span></button></div></section>
    <section><div class="section-title"><h2>Question bank</h2><span class="meta">${BANK.questions.length} questions</span></div>
      <ul class="bk-list bk-bank">${BANK.topics.map((t) =>
        `<li class="bk-row">${topicLabel(t.id)}<span class="num">${ts[t.id].total}</span></li>`).join('')}</ul></section>
    <p class="meta bk-disclaimer">Independent study aid. Not affiliated with or endorsed by the NYS Department of State. Check the official DOS license law and syllabus before exam day.</p>`,
    bottom: tabs('more'),
  };
}
