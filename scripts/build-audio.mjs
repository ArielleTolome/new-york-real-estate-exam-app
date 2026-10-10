// Narrate every study guide with ElevenLabs: two MP3s per chapter (cram sheet, full notes) plus audio/audio.json,
// which holds a timestamp for every Listen-mode item so the app can highlight and skip while the MP3 plays.
// Usage: ELEVENLABS_API_KEY=… node scripts/build-audio.mjs [--dry] [--only=topic,topic]
// Idempotent: each narrated chunk is cached in .audio-cache/ by a hash of its text and voice settings, so a rerun
// only pays for chunks whose text changed.
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const VOICE = 'XrExE9yKIg1WjnnlVkGX'; // Matilda: knowledgeable, professional, American
const MODEL = 'eleven_multilingual_v2';
const FORMAT = 'mp3_44100_64';
const SETTINGS = { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: 1 };
const CHUNK = 3500; // characters per request; the model allows 10k, shorter keeps timestamps tight and retries cheap
const PARALLEL = 9; // tracks narrated at once (Pro allows 10 concurrent requests)
const dry = process.argv.includes('--dry');
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const KEY = process.env.ELEVENLABS_API_KEY;
if (!dry && !KEY) throw new Error('ELEVENLABS_API_KEY is not set');

const { guides } = JSON.parse(fs.readFileSync('guides.json', 'utf8'));
const topics = JSON.parse(fs.readFileSync('questions.json', 'utf8')).topics;

// Reuse the app's own queue builder so MP3 timestamps line up with the [data-ls] items Listen mode highlights.
const ctx = { window: { addEventListener() {} }, localStorage: { getItem: () => null }, document: { getElementById: () => null, addEventListener() {} } };
vm.createContext(ctx);
vm.runInContext(`${fs.readFileSync('views/listen.js', 'utf8')}; this.lsQueue = lsQueue;`, ctx);

const SAY = [
  [/(\d)\s*[–-]\s*(\d)/g, '$1 to $2'], // ranges: 1–4 family -> 1 to 4 family
  [/\bvs\.?\s/g, 'versus '], [/\be\.g\.,?\s/g, 'for example, '], [/\bi\.e\.,?\s/g, 'that is, '],
  [/≥/g, ' at least '], [/≤/g, ' at most '], [/→/g, ' then '], [/[–—]/g, ', '],
];
const speak = (s) => SAY.reduce((t, [re, to]) => t.replace(re, to), s).replace(/\s+/g, ' ').trim().replace(/([^.!?:;])$/, '$1.');

// One track = ordered items; item i is spoken as its text, with group and chapter announcements folded in.
function track(g, n, notes) {
  const items = ctx.lsQueue(g, notes);
  let last = '';
  return items.map((it, i) => {
    let text = speak(it.parts.join(' '));
    const grp = notes ? '' : it.pos.replace(/ \d+ of \d+$/, '');
    if (grp && grp !== last && grp !== 'Overview') text = `${grp}. ${text}`;
    last = grp;
    if (i === 0) text = `Chapter ${n}: ${g.title}. ${notes ? 'Full notes' : 'Cram sheet'}. ${text}`;
    if (i === items.length - 1) text += ` That's the end of the chapter ${n} ${notes ? 'full notes' : 'cram sheet'}.`;
    return text;
  });
}

function chunks(items) {
  const out = [];
  items.forEach((t, i) => {
    const c = out.at(-1);
    if (c && c.text.length + t.length + 1 <= CHUNK) { c.starts.push([i, c.text.length + 1]); c.text += ` ${t}`; }
    else out.push({ text: t, starts: [[i, 0]] });
  });
  return out;
}

async function narrate(text, prev) {
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}/with-timestamps?output_format=${FORMAT}`, {
      method: 'POST',
      headers: { 'xi-api-key': KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ text, model_id: MODEL, voice_settings: SETTINGS, previous_request_ids: prev.slice(-3) }),
    });
    if (r.ok) return { json: await r.json(), id: r.headers.get('request-id') };
    const body = await r.text();
    if (attempt >= 5 || ![429, 500, 502, 503, 504].includes(r.status)) throw new Error(`ElevenLabs ${r.status}: ${body.slice(0, 300)}`);
    await new Promise((res) => setTimeout(res, 2000 * attempt));
  }
}

const duration = (f) => +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString();

async function build(topic, n, kind) {
  const g = guides.find((x) => x.topic === topic);
  const items = track(g, n, kind === 'notes');
  const cs = chunks(items);
  if (dry) return { chars: cs.reduce((a, c) => a + c.text.length, 0), requests: cs.length };
  fs.mkdirSync('.audio-cache', { recursive: true });
  const parts = [];
  const marks = new Array(items.length);
  let t0 = 0;
  const prev = [];
  for (const [k, c] of cs.entries()) {
    const h = crypto.createHash('sha1').update(JSON.stringify([VOICE, MODEL, FORMAT, SETTINGS, c.text])).digest('hex').slice(0, 16);
    const base = `.audio-cache/${topic}-${kind}-${k}-${h}`;
    if (!fs.existsSync(`${base}.json`)) {
      const { json, id } = await narrate(c.text, prev);
      fs.writeFileSync(`${base}.mp3`, Buffer.from(json.audio_base64, 'base64'));
      fs.writeFileSync(`${base}.json`, JSON.stringify({ id, starts: json.alignment.character_start_times_seconds }));
      process.stdout.write('.');
    }
    const { id, starts } = JSON.parse(fs.readFileSync(`${base}.json`, 'utf8'));
    if (id) prev.push(id);
    for (const [i, at] of c.starts) marks[i] = +(t0 + (starts[at] ?? starts[at + 1] ?? 0)).toFixed(2);
    t0 += duration(`${base}.mp3`);
    parts.push(`${base}.mp3`);
  }
  const file = `audio/${topic}-${kind}.mp3`;
  const list = `.audio-cache/${topic}-${kind}.txt`;
  fs.writeFileSync(list, parts.map((p) => `file '${process.cwd()}/${p}'`).join('\n'));
  const label = kind === 'notes' ? 'Full notes' : 'Cram sheet';
  // Re-encode instead of stream-copying: one clean header means correct duration and seeking in every player.
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c:a', 'libmp3lame', '-b:a', '64k', '-ar', '44100', '-ac', '1',
    '-metadata', `title=${String(n).padStart(2, '0')} ${g.title}: ${label}`, '-metadata', 'album=NY Real Estate Salesperson Exam: Audio Study Guides',
    '-metadata', 'artist=NY RE Exam', '-metadata', `track=${n * 2 - (kind === 'cram' ? 1 : 0)}`, file]);
  return { file, bytes: fs.statSync(file).size, dur: +duration(file).toFixed(1), marks };
}

const jobs = [];
topics.forEach((t, i) => { if (!only.length || only.includes(t.id)) for (const kind of ['cram', 'notes']) jobs.push([t.id, i + 1, kind]); });
fs.mkdirSync('audio', { recursive: true });
const manifestPath = 'audio/audio.json';
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { tracks: {} };
let total = { chars: 0, requests: 0 };
const queue = [...jobs];
await Promise.all(Array.from({ length: PARALLEL }, async () => {
  while (queue.length) {
    const [topic, n, kind] = queue.shift();
    const r = await build(topic, n, kind);
    if (dry) { total.chars += r.chars; total.requests += r.requests; continue; }
    (manifest.tracks[topic] ||= {})[kind] = r;
    console.log(`\n${r.file}: ${(r.bytes / 1e6).toFixed(1)} MB, ${(r.dur / 60).toFixed(1)} min, ${r.marks.length} marks`);
  }
}));
if (dry) console.log(`${jobs.length} tracks, ${total.chars.toLocaleString()} characters, ${total.requests} requests`);
else {
  Object.assign(manifest, { voice: 'Matilda', model: MODEL, format: FORMAT, generated: new Date().toISOString() });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  const all = Object.values(manifest.tracks).flatMap((t) => Object.values(t));
  console.log(`${all.length} tracks, ${(all.reduce((a, t) => a + t.bytes, 0) / 1e6).toFixed(0)} MB, ${(all.reduce((a, t) => a + t.dur, 0) / 3600).toFixed(1)} hours`);
}
