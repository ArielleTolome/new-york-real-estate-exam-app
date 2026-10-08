# New York Real Estate Exam App

Offline-first PWA for the New York State Real Estate Salesperson licensing exam.

**Live:** https://nyrealestate.pfsend.com (alias https://nyrealestate.pigeonfi.com)

- **430 questions** across all 19 NYS syllabus topics (`questions.json`, built from `data/topics/*.json`), each with a rationale and a statutory citation (NY RPL, 19 NYCRR, Executive Law § 296, RESPA/TRID, …).
- **Custom quiz builder:** pick topics, count (10/25/50/75/custom), Tutor mode (instant green/red plus a citation drawer) or timed Exam mode (90:00 for 75 questions, answers hidden until you submit), pool filters (all / unseen / bookmarked / mistakes), and shuffling of questions and answer positions.
- **Readiness dashboard:** countdown to Oct 14–15 2026, readiness gauge against the 70% pass line, streak, coverage, and accuracy.
- **Analytics:** quiz log with pass/fail, per-topic accuracy bars, a weak-topic heatmap (<70%), and one-tap "Retest Weak Areas".
- **Mistake bank:** every miss is saved there. Answer a question correctly twice in a row to clear it.
- **Offline & data:** a service worker precaches everything. Progress lives in `localStorage`. You can export or import your history, and import extra question batches as JSON.

## Install on iPhone

Open the live URL in Safari → Share → **Add to Home Screen**. After the first load it works with no connection.

## Develop

No build step for the app. Plain HTML, CSS, and JS.

- `app.js`: state, quiz logic, router, and the shared UI helpers (`header`, `bullet`/`topicLabel` route bullets, `lineProgress`, `gauge`, `bar`, `svg` icons).
- `views/<screen>.js`: one global `vX()` per screen that returns `{ top, main, bottom }` HTML. Each is loaded before `app.js`.
- `app.css`: the design tokens and shared components. `styles/<screen>.css` holds styles scoped to a single screen.
- Design: the "Wayfinding" direction lives in `.stitch/v2/DESIGN.md`, with the Google Stitch mockups in `.stitch/v2/*.png|html`. Each topic is an NYC-style route bullet, and progress is drawn as a line with stations.
- `node tests/shot.js <home|build|quiz-study|quiz-study-answered|quiz-exam|results|history|mistakes|more> out.png [--full]` screenshots a single screen with realistic seeded progress.

```bash
npm run serve          # http://localhost:8080
npm run build          # validate data/topics/*.json and regenerate questions.json
npm install && npx playwright install chromium
npm test               # E2E (8 checks) + chaos (100+ random actions) + visual QA at 393x852
```

| Test tier | File | What it proves |
|---|---|---|
| E2E | `test-e2e.js [url]` | dashboard, 300+ bank integrity, topic-filtered quizzes, study feedback/citation, exam timer and scoring, mistake bank, bookmark persistence, offline service worker |
| Tester army | `tests/chaos.js [url]` | 5 custom quizzes, 100 random actions, and a 148-click navigation burst with zero errors, no frame over 1 s, and no heap/DOM growth |
| Visual QA | `tests/visual.js [url]` | iPhone 15 Pro screenshots in `qa/`; checks tap targets (≥52 px for primary controls), WCAG 4.5:1 contrast, no horizontal overflow, docked bars |
| CUA Driver | `tests/cua-am1.py <safari_pid>` | `cua-driver mcp` AX audit (roles, labels, tap targets) and a token-clicked 10-question drill in real Safari; report in `qa/cua-am1-report.json` |

Question schema (`data/topics/<topic>.json` or an imported batch):

```json
{"id": "agency-001", "topic": "agency", "q": "…", "options": ["…", "…", "…", "…"], "answer": 2, "explanation": "…", "citation": "NY RPL § 443"}
```

Options are shuffled at runtime, so never write "all of the above" or refer to answers by letter. `npm run build` rejects both.

## Deploy

`deploy/deploy.sh` rsyncs the static files to pigeonfi (`/data/nyrealestate`). The site is served by a pinned `nginx:alpine` behind Coolify's Traefik (`deploy/traefik-nyrealestate.yaml`). Cloudflare proxies the domain with the `*.pfsend.com` origin certificate, and the script purges the CDN after each deploy.

## Disclaimer

This is an independent study aid. It is not affiliated with or endorsed by the NYS Department of State, and it is not legal advice. Check current rules before your exam.

License: MIT
