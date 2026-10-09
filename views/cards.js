'use strict';
// View: #/cards (hub), #/cards/due, #/cards/all and #/cards/<topic> (review sessions).
// Cards come from the cram sheets in guides.json. Scheduling is a Leitner system compressed for the last week:
// boxes 0-4, 'Got it' moves a card up one box, 'Still learning' sends it back to box 1, due again today.
// Globals (state, helpers, guides(), rich()) come from app.js; called at render time.

const NEW_PER_DAY = 60;
const FC_DAYS = [0, 1, 2, 4, 7]; // a card promoted into box b comes back in FC_DAYS[b] days
const FC_STOPS = ['New', '1 day', '2 days', '4 days', '7 days'];
const FC_BLANK = '<span class="fc-blank"><span aria-hidden="true">_____</span><span class="sr-only">blank</span></span>';
// Card type -> [label, source item => [prompt HTML, answer HTML]].
const FC_KINDS = {
  n: ['Key number', (x) => [rich(x.label), `<span class="fc-big num">${rich(x.value)}</span>`]],
  m: ['Must know', (s) => [rich(s.replace(/\*\*(.+?)\*\*/g, '_____')).replaceAll('_____', FC_BLANK), rich(s)]],
  t: ['Trap', (x) => [rich(x.trap), `<strong class="fc-false">False.</strong> ${rich(x.truth)}`]],
  f: ['Formula', (x) => [rich(x.name), `<span class="fc-formula">${rich(x.formula)}</span><span class="fc-ex">Example: ${rich(x.example)}</span>`]],
  k: ['Memory aid', (x) => [rich(x.name), rich(x.meaning)]],
};

// Review session: {deck: 'due' | 'all' | topic id, queue: [card], i, flipped, stats: ['done' | 'flag' per rated card]}.
// It lives while its route is open, so re-renders keep the place; leaving the route ends it.
let FC = null;
window.addEventListener('hashchange', () => { if (FC && location.hash !== `#/cards/${FC.deck}`) FC = null; });

// Cards in chapter order, derived once per guides object: {id: `${topic}:${type}${index}`, topic, type, x: source item}.
let FC_DECK = null;
function fcDeck(G) {
  if (FC_DECK?.G === G) return FC_DECK;
  const cards = [], byTopic = {};
  for (const { id: topic } of BANK.topics) {
    const c = G[topic]?.cram;
    if (!c) continue;
    const list = (byTopic[topic] = []);
    const add = (type, items, keep = () => true) => (items || []).forEach((x, i) => keep(x) && list.push({ id: `${topic}:${type}${i}`, topic, type, x }));
    add('n', c.numbers);
    add('m', c.mustKnow, (s) => /\*\*.+?\*\*/.test(s));
    add('t', c.traps);
    add('f', c.formulas);
    add('k', c.mnemonics);
    cards.push(...list);
  }
  return (FC_DECK = { G, cards, byTopic });
}

// Topic ids in chapter order, with weak chapters (quiz accuracy under the pass mark) first, weakest first.
function fcOrder(byTopic) {
  const ts = topicStats();
  const acc = (id) => (ts[id]?.n && ts[id].c / ts[id].n < PASS ? ts[id].c / ts[id].n : 1);
  return Object.keys(byTopic).sort((a, b) => acc(a) - acc(b));
}

// Today's work: cards due today or earlier, then new cards in fcOrder up to NEW_PER_DAY a day. Cards first seen
// today (S.cards[id].added) use up the allowance, so finishing today's cards really empties the due list.
function fcPlan(G) {
  const { cards, byTopic } = fcDeck(G);
  const t = today();
  const boxes = [0, 0, 0, 0, 0], reviews = [], fresh = [];
  let room = NEW_PER_DAY;
  for (const c of cards) {
    const e = S.cards[c.id];
    if (!e) { boxes[0]++; continue; }
    boxes[e.b]++;
    if (e.due <= t) reviews.push(c);
    if (e.added === t) room--;
  }
  if (room > 0 && boxes[0]) {
    for (const id of fcOrder(byTopic)) for (const c of byTopic[id]) if (fresh.length < room && !S.cards[c.id]) fresh.push(c);
  }
  return { cards, byTopic, boxes, reviews, fresh };
}

// {due, total, learned, boxes: [new, box 1..4]} for the Study list, Today's plan and the hub. Learned = box 3 or 4.
function cardsSummary(G) {
  if (!G) return { due: 0, total: 0, learned: 0, boxes: [0, 0, 0, 0, 0] };
  const { cards, boxes, reviews, fresh } = fcPlan(G);
  return { due: reviews.length + fresh.length, total: cards.length, learned: boxes[3] + boxes[4], boxes };
}

function fcRate(card, got) {
  const t = today(), e = S.cards[card.id];
  const b = got ? Math.min(4, (e?.b || 0) + 1) : 1;
  const d = new Date();
  d.setDate(d.getDate() + (got ? FC_DAYS[b] : 0));
  S.cards[card.id] = { ...(e || { added: t }), b, due: today(d) };
  S.cardLog[t] = (S.cardLog[t] || 0) + 1;
}

// Rate the current card; 'Still learning' also queues it once more at the end of this session.
function fcAnswer(got) {
  if (!FC?.flipped) return false;
  const c = FC.queue[FC.i];
  fcRate(c, got);
  if (!got && FC.queue.indexOf(c) === FC.i) FC.queue.push(c);
  FC.stats[FC.i++] = got ? 'done' : 'flag';
  FC.flipped = false;
  scrollTo(0, 0);
}

// Due sessions take today's work; Review all and chapter sessions take every card, least learned first.
function fcStart(G, key) {
  const p = fcPlan(G);
  const box = (c) => S.cards[c.id]?.b || 0;
  const queue = key === 'due' ? [...p.reviews, ...p.fresh]
    : (key === 'all' ? fcOrder(p.byTopic).flatMap((id) => p.byTopic[id]) : [...p.byTopic[key]]).sort((a, b) => box(a) - box(b));
  return { deck: key, queue, i: 0, flipped: false, stats: [] };
}

const fcCount = (n, word = 'card') => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;
const fcIn = (days) => (days < 1 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`);

// "42 cards tomorrow": the first day after today with scheduled cards, or '' when nothing is scheduled.
function fcNext(cards) {
  const t = today();
  let next = '', n = 0;
  for (const c of cards) {
    const d = S.cards[c.id]?.due;
    if (!d || d <= t || (next && d > next)) continue;
    if (d !== next) { next = d; n = 0; }
    n++;
  }
  return next && `${fcCount(n)} ${fcIn(Math.round((Date.parse(next) - Date.parse(t)) / 864e5))}`;
}

function vCards(arg) {
  const G = guides();
  if (!G) return { top: header('Flashcards', { back: ['#/study', 'Study guides'] }), main: '<p class="muted center">Loading flashcards…</p>', bottom: tabs('study') };
  return arg === 'due' || arg === 'all' || Object.hasOwn(fcDeck(G).byTopic, arg ?? '') ? fcSession(G, arg) : fcHub(G);
}

function fcHub(G) {
  const { cards, byTopic, boxes, reviews, fresh } = fcPlan(G);
  const due = reviews.length + fresh.length;
  const num = (x) => x.toLocaleString('en-US');
  const learned = {};
  for (const c of cards) if (S.cards[c.id]?.b >= 3) learned[c.topic] = (learned[c.topic] || 0) + 1;
  const next = due ? '' : fcNext(cards);
  const hero = due ? `
      <div class="fc-due"><div><h2>Due today</h2><p class="meta">${[reviews.length && fcCount(reviews.length, 'review'), fresh.length && fcCount(fresh.length, 'new card')].filter(Boolean).join(' and ')}</p></div>
        <strong class="num fc-due-n" id="fc-due">${num(due)}</strong></div>
      <a class="btn primary block" href="#/cards/due" id="fc-review">Review ${fcCount(due)}</a>`
    : `
      <div class="fc-due"><div><h2>All caught up</h2><p class="meta">${next ? `Next due: ${next}` : 'Nothing else is due today'}</p></div><span class="fc-ok">${svg('check')}</span></div>
      <div class="fc-two"><a class="btn primary" href="#/cards/all" id="fc-review">Review all</a><button class="btn" data-action="toc" data-target="fc-chapters">Pick a chapter</button></div>`;
  const stops = FC_STOPS.map((s, b) => `<li class="fc-b${b}"><span>${s}</span><b class="num">${num(boxes[b])}<span class="sr-only"> cards</span></b></li>`).join('');
  const rows = Object.keys(byTopic).map((id) => {
    const total = byTopic[id].length, l = learned[id] || 0;
    return `<li><a class="fc-row" href="#/cards/${esc(id)}">${bullet(id)}<span class="fc-row-t"><strong>${esc(topicName[id] || id)}</strong>
      <span class="bar" aria-hidden="true"><i class="ok" style="width:${pct(l / total)}%"></i></span><small class="meta">${l} of ${total} learned</small></span>${svg('chevron')}</a></li>`;
  }).join('');
  return {
    top: header('Flashcards', { sub: `${num(cards.length)} cards from the ${Object.keys(byTopic).length} cram sheets`, back: ['#/study', 'Study guides'] }),
    main: `<div class="fc-hub" id="fc-hub">
      <section class="card fc-hero">${hero}
        <ol class="fc-stops" aria-label="Cards at each stop">${stops}</ol>
        <p class="meta fc-learned"><strong>${num(boxes[3] + boxes[4])} of ${num(cards.length)} learned.</strong> Got it moves a card one stop along the line. Cards at the 4 and 7 day stops count as learned.</p>
      </section>
      <section class="fc-chs" id="fc-chapters"><h2>Chapters</h2><ul class="fc-list">${rows}</ul></section>
    </div>`,
    bottom: tabs('study'),
  };
}

const fcBar = () => `<div class="actionbar fc-actions">
  <button class="btn fc-again" id="fc-again" data-action="card-rate" data-got="0"${FC.flipped ? '' : ' disabled'}><i class="fc-dot" aria-hidden="true"></i>Still learning</button>
  <button class="btn primary" id="fc-got" data-action="card-rate" data-got="1"${FC.flipped ? '' : ' disabled'}>Got it</button></div>`;

function fcSession(G, key) {
  if (FC?.deck !== key) FC = fcStart(G, key);
  const { queue, i, stats, flipped } = FC;
  const close = `<a class="iconbtn fc-close" id="fc-close" href="#/cards" aria-label="Close flashcards">${svg('x')}</a>`;
  // "Card i of n" says the same as the line, whose built-in label reads "Question", so the line is hidden from AT.
  const line = (cur) => `<div class="fc-line" aria-hidden="true">${lineProgress(queue.length, cur, queue.map((_, k) => stats[k] || ''))}</div>`;
  if (i >= queue.length) return fcDone(G, close, line);
  const c = queue[i];
  const [label, faces] = FC_KINDS[c.type];
  const [q, a] = faces(c.x);
  const head = `<span class="fc-head">${topicLabel(c.topic)}<span class="badge">${label}</span></span>`;
  return {
    top: `<div class="fc-bar">${close}<strong class="fc-pos" id="fc-pos">Card ${i + 1} of ${queue.length}</strong></div>${line(i)}`,
    main: `<div class="fc-session">
      <button class="fc-card${flipped ? ' on' : ''}" id="fc-card" data-action="card-flip"><span class="fc-inner">
        <span class="fc-face fc-front">${head}<span class="fc-body">${c.type === 't' ? '<span class="fc-kick">True or false?</span>' : ''}<span class="fc-q">${q}</span></span>
          <span class="fc-foot">Tap to flip</span></span>
        <span class="fc-face fc-back">${head}<span class="fc-body">${c.type === 'm' ? '' : `<span class="fc-p">${q}</span>`}<span class="fc-a">${a}</span></span>
          <span class="fc-foot">Got it brings it back ${fcIn(FC_DAYS[Math.min(4, (S.cards[c.id]?.b || 0) + 1)])}</span></span>
      </span></button>
      <p class="fc-keys"><span><kbd>Space</kbd> flip</span><span><kbd>1</kbd> still learning</span><span><kbd>2</kbd> got it</span></p>
    </div>`,
    bottom: fcBar(),
  };
}

function fcDone(G, close, line) {
  const n = FC.stats.length, got = FC.stats.filter((s) => s === 'done').length;
  const due = cardsSummary(G).due;
  const next = due ? ['Still due today', fcCount(due)] : ['Next due', fcNext(fcDeck(G).cards) || 'nothing scheduled'];
  return {
    top: `<div class="fc-bar">${close}<strong class="fc-pos" id="fc-pos">Flashcards</strong></div>${n ? line(FC.queue.length - 1) : ''}`,
    main: `<div class="fc-session"><section class="card fc-done" id="fc-done">${n ? `
      <h1>Session complete</h1>
      <dl class="fc-tally"><div><dt>Reviewed</dt><dd class="num">${n}</dd></div><div class="ok"><dt>Got it</dt><dd class="num">${got}</dd></div><div class="warn"><dt>Still learning</dt><dd class="num">${n - got}</dd></div></dl>`
      : '<h1>All caught up</h1><p class="muted">No cards are due right now.</p>'}
      <p class="fc-next">${svg('calendar')}<span>${next[0]}: <strong>${next[1]}</strong></span></p></section></div>`,
    bottom: `<div class="actionbar fc-actions"><a class="btn" href="#/study">Back to Study</a>
      <button class="btn primary" id="fc-more" data-action="card-more">${n || FC.deck !== 'due' ? 'Review more' : 'Review all'}</button></div>`,
  };
}

const CARDS_ACTIONS = {
  // Flip in place so the CSS transform animates; the rating buttons unlock while the answer shows.
  'card-flip': () => {
    const card = $('#fc-card');
    if (!FC || !card) return false;
    FC.flipped = !FC.flipped;
    card.classList.toggle('on', FC.flipped);
    $('#bottom').innerHTML = fcBar();
    return false;
  },
  'card-rate': (el) => fcAnswer(el.dataset.got === '1'),
  // A fresh session of the same deck, or of every card once nothing is due.
  'card-more': () => {
    const key = !FC || (FC.deck === 'due' && !cardsSummary(guides()).due) ? 'all' : FC.deck;
    FC = null;
    go(`cards/${key}`);
    return false;
  },
};

// Hardware keyboard (iPad Magic Keyboard / desktop): Space flips, 1 and 2 rate once the answer shows.
document.addEventListener('keydown', (e) => {
  if (!FC || !$('#fc-card') || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
  if (e.key === ' ' && !e.target.closest('button, a, input, textarea, select')) { e.preventDefault(); CARDS_ACTIONS['card-flip'](); }
  else if ((e.key === '1' || e.key === '2') && fcAnswer(e.key === '2') !== false) { save(); render(); }
});
