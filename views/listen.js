'use strict';
// Listen mode: plays the chapter's ElevenLabs narration (audio/<topic>-<cram|notes>.mp3, built by scripts/build-audio.mjs).
// audio/audio.json holds one timestamp per queue item, so the player highlights, skips and resumes by item; a real <audio>
// element keeps playing with the screen locked and shows lock-screen controls. If a track is missing or can't load
// (offline and not saved), Listen falls back to the device's speechSynthesis, one short utterance per item.
// Queue item i maps to [data-ls="i"] in views/study.js, so lsQueue() must walk the guide in the order studyCram()/studyNotes()
// render it; the audio build evaluates this same function, so changing it means rebuilding the audio.

const LS_TTS = typeof window.SpeechSynthesisUtterance === 'function' ? window.speechSynthesis : null;
const LS_RATES = [0.9, 1, 1.25, 1.5];
const LS_SAY = { RPAPL: 'R-PAPL', NYCRR: 'N.Y.C.R.R.', RPL: 'Real Property Law', GOL: 'General Obligations Law', '§§': 'sections', '§': 'section', '×': 'times', '÷': 'divided by' };
const LS_ICON = {
  prev: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5v14"/><path d="M19 5 9 12l10 7z" fill="currentColor"/></svg>',
  next: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 5v14"/><path d="M5 5l10 7-10 7z" fill="currentColor"/></svg>',
};
const LS = { q: [], i: 0, part: 0, on: false, id: '', kind: '', tok: 0, u: null, mode: 'tts', marks: [], rate: +localStorage.getItem('nyre.listen') };
if (!LS_RATES.includes(LS.rate)) LS.rate = 1;

// The manifest is small and precached; it loads up front so a Listen tap can call audio.play() synchronously
// (iOS only allows playback inside the tap's own task).
const LS_AUDIO = { manifest: null, el: typeof Audio === 'function' ? new Audio() : null };
const LS_CACHE = 'nyre-audio'; // Cache Storage bucket the service worker serves audio from (with Range support)
const lsTrack = (id, kind) => LS_AUDIO.manifest?.tracks?.[id]?.[kind] || null;
const lsUrl = (id, kind) => new URL(`audio/${id}-${kind}.mp3?v=${encodeURIComponent(LS_AUDIO.manifest?.generated || '')}`, location.href).href;

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

// study.js drops these next to the Cram sheet / Full notes toggle.
const lsButton = () => (LS_AUDIO.el || LS_TTS ? `<button class="btn ls-btn" data-action="ls-start">${svg('speaker')}<span>Listen</span></button>` : '');
const lsSaveButton = () => (LS_AUDIO.el && 'caches' in window
  ? `<button class="iconbtn ls-save" data-action="ls-save" aria-label="Save this chapter's audio for offline" hidden>${svg('download')}</button>` : '');

/* ---------- narrated MP3 playback ---------- */

function lsMp3Load(id, kind) {
  const el = LS_AUDIO.el;
  // #t= starts at the item on screen without waiting for metadata, which iOS needs before it honours currentTime.
  el.src = `${lsUrl(id, kind)}#t=${LS.marks[LS.i] || 0}`;
  el.playbackRate = LS.rate;
  if ('mediaSession' in navigator) {
    const g = guides()?.[id];
    navigator.mediaSession.metadata = new MediaMetadata({
      title: `${g?.title || ''}: ${kind === 'notes' ? 'Full notes' : 'Cram sheet'}`,
      artist: 'NY RE Exam', album: 'Audio study guides',
      artwork: [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
    });
  }
}

// The current item is the last mark at or before the playhead.
function lsMarkAt(t) {
  let i = 0;
  while (i + 1 < LS.marks.length && LS.marks[i + 1] <= t + 0.05) i++;
  return i;
}

if (LS_AUDIO.el) {
  const el = LS_AUDIO.el;
  el.addEventListener('timeupdate', () => {
    if (LS.mode !== 'mp3' || !LS.q.length) return;
    const i = lsMarkAt(el.currentTime);
    if (i !== LS.i) { LS.i = i; lsPaint(); lsTag(true); }
  });
  el.addEventListener('ended', () => { if (LS.mode === 'mp3') lsFinish(); });
  // Lock-screen and headphone controls pause/resume the element directly; keep the player in sync.
  el.addEventListener('pause', () => { if (LS.mode === 'mp3' && LS.on && !el.ended) { LS.on = false; lsPaint(); } });
  el.addEventListener('play', () => { if (LS.mode === 'mp3' && !LS.on) { LS.on = true; lsPaint(); } });
  el.addEventListener('error', () => {
    if (LS.mode !== 'mp3' || !LS.q.length || !el.getAttribute('src')) return;
    LS.mode = 'tts';
    if (!LS_TTS) { lsPause(); return toast('The narration could not load. Save chapters for offline from this page while online.'); }
    toast('Narration unavailable offline for this chapter, so the device voice is reading it.');
    if (LS.on) lsSpeak();
  });
  if ('mediaSession' in navigator) {
    const ms = navigator.mediaSession;
    const on = (a, fn) => { try { ms.setActionHandler(a, fn); } catch { /* unsupported action */ } };
    on('play', () => lsPlay());
    on('pause', () => lsPause());
    on('previoustrack', () => lsGo(LS.i - 1));
    on('nexttrack', () => lsGo(LS.i + 1));
    on('seekbackward', () => { el.currentTime = Math.max(0, el.currentTime - 15); });
    on('seekforward', () => { el.currentTime += 15; });
  }
  fetch('audio/audio.json').then((r) => (r.ok ? r.json() : null)).then((m) => { LS_AUDIO.manifest = m; lsMarkSaved(); lsOfflineStatus(); }).catch(() => {});
}

/* ---------- device speech fallback ---------- */

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

/* ---------- shared controls ---------- */

function lsGo(i) {
  LS.i = Math.max(0, Math.min(LS.q.length - 1, i));
  LS.part = 0;
  if (LS.mode === 'mp3') LS_AUDIO.el.currentTime = LS.marks[LS.i];
  else if (LS.on) lsSpeak();
  lsPaint();
  lsTag(true);
}

function lsPlay() {
  LS.on = true;
  if (LS.mode === 'mp3') LS_AUDIO.el.play().catch(() => { LS.on = false; lsPaint(); });
  else lsSpeak();
  lsPaint();
  lsTag(true);
}

// Pause = cancel and remember the spot for speech: speechSynthesis.pause() is unreliable on iOS and Android.
function lsPause() {
  LS.on = false;
  LS.tok++;
  if (LS.mode === 'mp3') LS_AUDIO.el.pause();
  else LS_TTS?.cancel();
  lsPaint();
}

function lsFinish() {
  LS.on = false;
  LS.tok++;
  LS.i = 0;
  LS.part = 0;
  if (LS.mode === 'mp3') { LS_AUDIO.el.pause(); LS_AUDIO.el.currentTime = 0; }
  lsPaint();
  lsTag(false);
}

function lsStop() {
  LS.on = false;
  LS.tok++;
  LS.q = [];
  LS_TTS?.cancel();
  if (LS_AUDIO.el?.getAttribute('src')) { LS_AUDIO.el.pause(); LS_AUDIO.el.removeAttribute('src'); LS_AUDIO.el.load(); }
  document.getElementById('ls-player')?.remove();
  document.querySelectorAll('.ls-now').forEach((e) => e.classList.remove('ls-now'));
}

// Puts 'ls-now' on the current item; scrolls only when it sits behind the top bar or the player.
function lsTag(scroll) {
  document.querySelectorAll('.ls-now').forEach((e) => e.classList.remove('ls-now'));
  const el = LS.q.length && document.querySelector(`#view [data-ls="${LS.i}"]`);
  if (!el) return;
  el.classList.add('ls-now');
  if (!scroll || document.hidden) return;
  const r = el.getBoundingClientRect();
  const top = document.getElementById('top')?.getBoundingClientRect().bottom || 0;
  const bottom = document.getElementById('ls-player')?.getBoundingClientRect().top || innerHeight;
  if (r.top < top || r.bottom > bottom) el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

function lsPaint() {
  if ('mediaSession' in navigator && LS.q.length) navigator.mediaSession.playbackState = LS.on ? 'playing' : 'paused';
  const p = document.getElementById('ls-player');
  if (!p) return;
  p.querySelector('.ls-pos').textContent = LS.q[LS.i]?.pos || '';
  p.querySelector('.ls-voice').textContent = LS.mode === 'mp3' ? 'Narrated' : 'Device voice';
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
  if (!g) return;
  const kind = sub === 'notes' ? 'notes' : 'cram';
  LS.q = lsQueue(g, kind === 'notes');
  LS.id = id;
  LS.kind = kind;
  const tr = lsTrack(id, kind);
  // A track whose marks don't match the queue was built from older guide text: use the device voice instead.
  LS.mode = LS_AUDIO.el && tr?.marks?.length === LS.q.length ? 'mp3' : 'tts';
  if (LS.mode === 'tts' && !LS_TTS) return toast('Audio is not available on this device.');
  LS.marks = LS.mode === 'mp3' ? tr.marks : [];
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
  p.innerHTML = `${bullet(id)}<p class="ls-txt"><b class="ls-pos"></b><span class="ls-title">${esc(g.title)}</span><span class="ls-voice"></span></p>
    <button class="iconbtn ls-prev" data-action="ls-prev" aria-label="Previous">${LS_ICON.prev}</button>
    <button class="ls-play" data-action="ls-toggle"></button>
    <button class="iconbtn ls-next" data-action="ls-next" aria-label="Next">${LS_ICON.next}</button>
    <button class="chip ls-rate" data-action="ls-rate"></button>
    <button class="iconbtn ls-close" data-action="ls-close" aria-label="Close player">${svg('x')}</button>`;
  LS.i = lsFirstVisible();
  LS.part = 0;
  if (LS.mode === 'mp3') lsMp3Load(id, kind);
  lsPlay();
}

/* ---------- offline audio (Cache Storage, served by sw.js) ---------- */

// Saved = every track of the chapter is in the audio cache at the current manifest version.
async function lsSaved(id) {
  if (!('caches' in window) || !LS_AUDIO.manifest?.tracks?.[id]) return false;
  const c = await caches.open(LS_CACHE);
  return (await Promise.all(['cram', 'notes'].map((k) => c.match(lsUrl(id, k))))).every(Boolean);
}

// Downloads the chapters' tracks one at a time; older versions of the same files are dropped. onStep(done, total).
async function lsSave(ids, onStep = () => {}) {
  const c = await caches.open(LS_CACHE);
  const urls = ids.flatMap((id) => ['cram', 'notes'].filter((k) => lsTrack(id, k)).map((k) => lsUrl(id, k)));
  const stale = (await c.keys()).filter((r) => !urls.includes(r.url) && urls.some((u) => u.split('?')[0] === r.url.split('?')[0]));
  await Promise.all(stale.map((r) => c.delete(r)));
  let done = 0;
  for (const u of urls) {
    if (!(await c.match(u))) {
      const res = await fetch(u, { cache: 'no-store' });
      if (!res.ok) throw new Error(`${res.status} ${u}`);
      await c.put(u, res);
    }
    onStep(++done, urls.length);
  }
}

// Total bytes for a set of chapters, from the manifest.
const lsBytes = (ids) => ids.reduce((a, id) => a + ['cram', 'notes'].reduce((b, k) => b + (lsTrack(id, k)?.bytes || 0), 0), 0);
const lsMB = (b) => `${Math.round(b / 1e6)} MB`;

// Chapter page: show the save button with its state once the manifest and cache answer.
async function lsMarkSaved() {
  const b = document.querySelector('#view .ls-save');
  const id = location.hash.split('/')[2];
  if (!b || !id || !lsTrack(id, 'cram')) return;
  const saved = await lsSaved(id);
  b.hidden = false;
  b.classList.toggle('on', saved);
  b.innerHTML = svg(saved ? 'check' : 'download');
  b.setAttribute('aria-label', saved ? 'Chapter audio saved for offline' : `Save this chapter's audio for offline (${lsMB(lsBytes([id]))})`);
}

/* ---------- lifecycle ---------- */

// Any route change (another chapter or the other guide view) ends playback; the lock screen keeps playing in place.
window.addEventListener('hashchange', () => { if (document.getElementById('ls-player')) lsStop(); });

// iOS (and some Androids) silently stop speech in the background; show that as paused. Narrated audio keeps playing.
document.addEventListener('visibilitychange', () => {
  if (!LS.on || LS.mode !== 'tts') return;
  setTimeout(() => { if (LS.on && LS.mode === 'tts' && (!(LS_TTS.speaking || LS_TTS.pending) || LS_TTS.paused)) lsPause(); }, 1500);
});

// Re-renders of the chapter (toc, toggles, resize) replace #view's children; re-apply the highlight and save state.
const lsView = document.getElementById('view');
if (lsView) new MutationObserver(() => { lsTag(false); lsMarkSaved(); lsOfflineStatus(); }).observe(lsView, { childList: true });

// Every action returns false so the page never re-renders mid-playback.
const LISTEN_ACTIONS = {
  'ls-start': () => { lsStart(); return false; },
  'ls-toggle': () => { (LS.on ? lsPause : lsPlay)(); return false; },
  'ls-prev': () => {
    // Like a music player: early in an item, go back one; otherwise restart the current item.
    if (LS.mode === 'mp3' && LS_AUDIO.el.currentTime - LS.marks[LS.i] > 2) lsGo(LS.i);
    else lsGo(LS.i - 1);
    return false;
  },
  'ls-next': () => { lsGo(LS.i + 1); return false; },
  'ls-rate': () => {
    LS.rate = LS_RATES[(LS_RATES.indexOf(LS.rate) + 1) % LS_RATES.length];
    localStorage.setItem('nyre.listen', LS.rate);
    if (LS.mode === 'mp3') LS_AUDIO.el.playbackRate = LS.rate;
    else if (LS.on) lsSpeak(); // restart the current part at the new speed
    lsPaint();
    return false;
  },
  'ls-close': () => { lsStop(); return false; },
  'ls-save': (el) => {
    const id = location.hash.split('/')[2];
    if (el.classList.contains('on') || el.disabled) return false;
    el.disabled = true;
    lsSave([id], (d, n) => el.setAttribute('aria-label', `Saving ${d} of ${n}`))
      .then(() => toast('Chapter audio saved. It plays offline now.'))
      .catch(() => toast('Could not save the audio. Try again with a connection.'))
      .finally(() => { el.disabled = false; lsMarkSaved(); });
    return false;
  },
  'ls-save-all': (el) => {
    if (el.disabled) return false;
    el.disabled = true;
    const ids = BANK.base.topics.map((t) => t.id).filter((id) => lsTrack(id, 'cram'));
    const meta = el.querySelector('.meta');
    lsSave(ids, (d, n) => { meta.textContent = `${d} of ${n} files`; })
      .then(() => toast('All chapter audio saved for offline.'))
      .catch(() => toast('Saving stopped. Try again with a connection; finished files are kept.'))
      .finally(() => { el.disabled = false; lsOfflineStatus(); });
    return false;
  },
  'ls-unsave': () => {
    caches.delete(LS_CACHE).then(() => { toast('Saved audio removed.'); lsOfflineStatus(); });
    return false;
  },
};

// More page: fills the offline section once the manifest and cache answer.
async function lsOfflineStatus() {
  const box = document.getElementById('ls-offline');
  if (!box) return;
  const m = LS_AUDIO.manifest;
  if (!m || !('caches' in window)) { box.querySelector('.ls-off-audio').textContent = 'Narrated audio needs a connection to load once.'; return; }
  const ids = BANK.base.topics.map((t) => t.id).filter((id) => lsTrack(id, 'cram'));
  const saved = (await Promise.all(ids.map(lsSaved))).filter(Boolean).length;
  const est = await navigator.storage?.estimate?.();
  box.querySelector('.ls-off-audio').textContent = `Narrated audio: ${saved} of ${ids.length} chapters saved (${lsMB(lsBytes(ids))} for all)`;
  box.querySelector('.ls-off-store').textContent = est ? `Using ${lsMB(est.usage)} of device storage` : '';
  const all = box.querySelector('[data-action="ls-save-all"]');
  all.hidden = saved === ids.length;
  all.querySelector('.meta').textContent = lsMB(lsBytes(ids));
  box.querySelector('[data-action="ls-unsave"]').hidden = saved === 0;
}
