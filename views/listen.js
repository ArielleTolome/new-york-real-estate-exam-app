'use strict';
// Listen mode: reads the open study chapter aloud with the native speechSynthesis.
// One short utterance per queue item (iOS-safe); 'end' or 'error' advances. Queue item i maps to [data-ls="i"] in views/study.js,
// so lsQueue() must walk the guide in the same order studyCram()/studyNotes() render it.

const LS_TTS = 'SpeechSynthesisUtterance' in window ? window.speechSynthesis : null;
const LS_RATES = [0.9, 1, 1.25, 1.5];
const LS_SAY = { RPAPL: 'R-PAPL', NYCRR: 'N.Y.C.R.R.', RPL: 'Real Property Law', GOL: 'General Obligations Law', '§§': 'sections', '§': 'section', '×': 'times', '÷': 'divided by' };
const LS_ICON = {
  prev: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5v14"/><path d="M19 5 9 12l10 7z" fill="currentColor"/></svg>',
  next: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 5v14"/><path d="M5 5l10 7-10 7z" fill="currentColor"/></svg>',
};
const LS = { q: [], i: 0, part: 0, on: false, id: '', tok: 0, u: null, rate: +localStorage.getItem('nyre.listen') };
if (!LS_RATES.includes(LS.rate)) LS.rate = 1;

const lsSay = (s) => String(s ?? '').replace(/\*\*/g, '').replace(/\b(?:RPAPL|NYCRR|RPL|GOL)\b|§§?|[×÷]/g, (m) => ` ${LS_SAY[m]} `).replace(/\s+/g, ' ').trim();

// Safari stalls on long utterances: over 220 chars, split at sentence ends and greedily re-join up to 220.
function lsParts(s) {
  if (s.length <= 220) return [s];
  const out = [];
  for (const x of s.replace(/([.!?])\s+/g, '$1\n').split('\n')) {
    if (out.length && out[out.length - 1].length + x.length < 220) out[out.length - 1] += ` ${x}`;
    else out.push(x);
  }
  return out;
}

function lsQueue(g, notes) {
  const q = [];
  const add = (pos, text) => q.push({ pos, parts: lsParts(lsSay(text)) });
  const group = (label, arr, fn) => (arr || []).forEach((x, k) => add(arr.length > 1 ? `${label} ${k + 1} of ${arr.length}` : label, fn(x)));
  if (notes) {
    g.sections.forEach((s, i) => {
      const pos = `Section ${i + 1} of ${g.sections.length}`;
      add(pos, `Section ${i + 1}. ${s.heading}`);
      if (s.intro) add(pos, s.intro);
      s.points.forEach((p) => add(pos, p));
      if (s.example) { add(pos, s.example.title); s.example.steps.forEach((t) => add(pos, t)); }
    });
    return q;
  }
  const c = g.cram;
  add('Overview', g.overview);
  group('Key numbers', c.numbers, (n) => `${n.value}: ${n.label}`);
  group('Must know', c.mustKnow, (m) => m);
  group('Traps', c.traps, (t) => `Trap: ${t.trap}. Truth: ${t.truth}`);
  group('Formulas', c.formulas, (f) => `${f.name}: ${f.formula}. ${f.example || ''}`);
  group('Memory aids', c.mnemonics, (m) => `${m.name}: ${m.meaning}`);
  return q;
}

// study.js drops this next to the Cram sheet / Full notes toggle; hidden where speech is unavailable.
const lsButton = () => (LS_TTS ? `<button class="btn ls-btn" data-action="ls-start">${svg('speaker')}<span>Listen</span></button>` : '');

const lsVoice = () => {
  const vs = LS_TTS.getVoices();
  // Apple lists novelty en-US voices (Albert, Bad News, Bells…) as local too, so the user's own English default comes first.
  return vs.find((v) => v.default && /^en/i.test(v.lang)) || vs.find((v) => /^en[-_]US$/i.test(v.lang) && v.localService) || vs.find((v) => /^en[-_]US/i.test(v.lang)) || vs.find((v) => /^en/i.test(v.lang)) || null;
};

function lsSpeak() {
  const it = LS.q[LS.i];
  if (!it) return lsFinish();
  if (LS_TTS.speaking || LS_TTS.pending) LS_TTS.cancel();
  if (LS_TTS.paused) LS_TTS.resume(); // cancel() keeps a paused synth paused, and a new utterance would never start
  const tok = ++LS.tok;
  const u = new SpeechSynthesisUtterance(it.parts[LS.part]);
  u.lang = 'en-US';
  u.rate = LS.rate;
  const v = lsVoice();
  if (v) u.voice = v;
  // The token drops events from cancelled utterances (cancel fires 'error'/'end' on them). A real error (e.g. iOS
  // 'not-allowed', 'audio-busy') pauses instead of advancing, or every item would error in turn and race to the end.
  u.onend = () => { if (tok === LS.tok && LS.on) lsAdvance(); };
  u.onerror = () => { if (tok === LS.tok && LS.on) lsPause(); };
  LS.u = u; // keep a reference: Chrome skips 'end' on garbage-collected utterances
  LS_TTS.speak(u);
}

function lsAdvance() {
  if (LS.part < LS.q[LS.i].parts.length - 1) { LS.part++; return lsSpeak(); }
  if (LS.i >= LS.q.length - 1) return lsFinish();
  lsGo(LS.i + 1);
}

function lsGo(i) {
  LS.i = Math.max(0, Math.min(LS.q.length - 1, i));
  LS.part = 0;
  if (LS.on) lsSpeak();
  lsPaint();
  lsTag(true);
}

function lsPlay() { LS.on = true; lsSpeak(); lsPaint(); lsTag(true); }

// Pause = cancel and remember the spot: speechSynthesis.pause() is unreliable on iOS and Android.
function lsPause() {
  LS.on = false;
  LS.tok++;
  LS_TTS.cancel();
  lsPaint();
}

function lsFinish() {
  LS.on = false;
  LS.tok++;
  LS.i = 0;
  LS.part = 0;
  lsPaint();
  lsTag(false);
}

function lsStop() {
  LS.on = false;
  LS.tok++;
  LS.q = [];
  LS_TTS?.cancel();
  document.getElementById('ls-player')?.remove();
  document.querySelectorAll('.ls-now').forEach((e) => e.classList.remove('ls-now'));
}

// Puts 'ls-now' on the current item; scrolls only when it sits behind the top bar or the player.
function lsTag(scroll) {
  document.querySelectorAll('.ls-now').forEach((e) => e.classList.remove('ls-now'));
  const el = LS.q.length && document.querySelector(`#view [data-ls="${LS.i}"]`);
  if (!el) return;
  el.classList.add('ls-now');
  if (!scroll) return;
  const r = el.getBoundingClientRect();
  const top = document.getElementById('top')?.getBoundingClientRect().bottom || 0;
  const bottom = document.getElementById('ls-player')?.getBoundingClientRect().top || innerHeight;
  if (r.top < top || r.bottom > bottom) el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

function lsPaint() {
  const p = document.getElementById('ls-player');
  if (!p) return;
  p.querySelector('.ls-pos').textContent = LS.q[LS.i]?.pos || '';
  const b = p.querySelector('.ls-play');
  b.innerHTML = svg(LS.on ? 'pause' : 'play');
  b.setAttribute('aria-label', LS.on ? 'Pause' : 'Play');
  const r = p.querySelector('.ls-rate');
  r.textContent = `${LS.rate}x`;
  r.setAttribute('aria-label', `Speed ${LS.rate}x`);
}

// First item visible below the top bar, or the top of the page when it is barely scrolled.
function lsFirstVisible() {
  if (scrollY < 40) return 0;
  const top = document.getElementById('top')?.getBoundingClientRect().bottom || 0;
  const el = [...document.querySelectorAll('#view [data-ls]')].find((e) => e.getBoundingClientRect().bottom > top + 8);
  return el ? +el.dataset.ls : 0;
}

function lsStart() {
  const [name, id, sub] = location.hash.replace(/^#\/?/, '').split('/');
  const g = name === 'study' && id && guides()?.[id];
  if (!g || !LS_TTS) return;
  LS.q = lsQueue(g, sub === 'notes');
  LS.id = id;
  // The player lives on <body>, outside #view, so app re-renders never destroy it.
  let p = document.getElementById('ls-player');
  if (!p) {
    p = document.createElement('div');
    p.id = 'ls-player';
    p.className = 'ls-player';
    p.setAttribute('role', 'region');
    p.setAttribute('aria-label', 'Listen player');
    document.body.append(p);
  }
  p.innerHTML = `${bullet(id)}<p class="ls-txt"><b class="ls-pos"></b><span class="ls-title">${esc(g.title)}</span></p>
    <button class="iconbtn ls-prev" data-action="ls-prev" aria-label="Previous">${LS_ICON.prev}</button>
    <button class="ls-play" data-action="ls-toggle"></button>
    <button class="iconbtn ls-next" data-action="ls-next" aria-label="Next">${LS_ICON.next}</button>
    <button class="chip ls-rate" data-action="ls-rate"></button>
    <button class="iconbtn ls-close" data-action="ls-close" aria-label="Close player">${svg('x')}</button>`;
  LS.i = lsFirstVisible();
  LS.part = 0;
  lsPlay();
}

// Any route change (including another chapter or the other guide view) ends playback.
window.addEventListener('hashchange', () => { if (document.getElementById('ls-player')) lsStop(); });

// iOS (and some Androids) silently stop speech in the background; show that as paused. Elsewhere it keeps playing.
document.addEventListener('visibilitychange', () => {
  if (!LS.on) return;
  setTimeout(() => { if (LS.on && (!(LS_TTS.speaking || LS_TTS.pending) || LS_TTS.paused)) lsPause(); }, 1500);
});

// Re-renders of the chapter (toc, toggles, resize) replace #view's children; re-apply the highlight.
const lsView = document.getElementById('view');
if (lsView) new MutationObserver(() => lsTag(false)).observe(lsView, { childList: true });

// Every action returns false so the page never re-renders mid-speech.
const LISTEN_ACTIONS = {
  'ls-start': () => { lsStart(); return false; },
  'ls-toggle': () => { (LS.on ? lsPause : lsPlay)(); return false; },
  'ls-prev': () => { lsGo(LS.i - 1); return false; },
  'ls-next': () => { lsGo(LS.i + 1); return false; },
  'ls-rate': () => {
    LS.rate = LS_RATES[(LS_RATES.indexOf(LS.rate) + 1) % LS_RATES.length];
    localStorage.setItem('nyre.listen', LS.rate);
    if (LS.on) lsSpeak(); // restart the current part at the new speed
    lsPaint();
    return false;
  },
  'ls-close': () => { lsStop(); return false; },
};
