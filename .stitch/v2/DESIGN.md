# NY RE Exam — Design v2 "Wayfinding"

Mobile PWA for one person cramming for the NYS Real Estate Salesperson exam (Oct 14–15, 2026), studying on an iPhone, often on the subway. Job: get from "where am I weak?" to "answering questions" in one tap, and make progress feel like moving down a line toward a destination.

## Concept
Borrow the language of New York transit wayfinding, not its nostalgia: crisp signage type, colored route bullets, and the line map. Spend the boldness in one place: **every syllabus topic is a route bullet** (colored circle + 1-char code), and progress is drawn as a **line with stations**. Everything else is quiet, native-iOS-grade polish on a dark OLED canvas.

## Color
| Token | Hex | Role |
|---|---|---|
| canvas | #090d16 | page background (OLED) |
| surface | #111725 | cards, sheets |
| raised | #182033 | inputs, segmented track, pressed states |
| hairline | rgba(148,163,184,.16) | 1px borders/dividers only where they encode grouping |
| ink | #f1f5f9 | primary text |
| ink-2 | #a3b1c6 | secondary text (≥4.5:1 on surface) |
| go | #10b981 | primary action, correct, ≥70% |
| stop | #ef4444 | wrong, <70%, fail |
| caution | #f59e0b | flagged, bookmarked, weak-but-close |
| statute | #818cf8 | legal citations only |

Route-bullet palette (topic identity only, never for status):
red #DA291C (1 License law, 2 Agency, 3 Fair housing) · green #00843D (4 Finance, 5 Valuation, 6 Math) · blue #0039A6 (A Title & deeds, C Estates & liens, E Contracts) · orange #FF6319 dark-text (B Land use, D Municipal, F Construction & env, M Insurance) · yellow #FCCC0A dark-text (N Taxes, Q Closing, R Commercial, W Property mgmt) · purple #9B2A92 (7 Condos & co-ops) · lime #6CBE45 dark-text (G Rentals & deal sheets).

## Type
- Display/headings: "Helvetica Neue" (native on iOS) bold, tight tracking (-0.02em), sentence case. Signage feel without a download.
- Body/UI: system UI (-apple-system / SF Pro Text). 17px body, 15px secondary, 13px meta.
- Numbers: tabular, Helvetica Neue bold, large (countdown 44px, score 64px).
- No all-caps eyebrow labels, no middle-dot meta strings, no arrows appended to buttons.

## Shape & space
- Radius by hierarchy: 24 sheets/hero, 18 cards, 14 controls/options, full pills for chips and bullets.
- 4-pt grid; screen gutters 16; section gap 20; in-card gap 12.
- Touch: primary controls ≥56px, all others ≥44px. Primary actions live in a thumb-zone bottom bar.
- Elevation by surface lightness, not shadows. One soft shadow allowed on the floating tab bar.

## Chrome
- Top: compact large-title header (28px Helvetica Neue bold) that sits under the safe area; quiz uses a slim sticky bar with the line-progress.
- Bottom: floating glass capsule tab bar (blur 20, inset 12px from edges, above safe-area) with 5 icon+label tabs; active tab shows a go-colored dot/pill.
- In flows (builder, quiz, results) the tab bar is replaced by a thumb-zone action bar with one dominant go button.

## Signature components
- **Route bullet**: 24–28px circle, bold 1-char code, topic color; always paired with the topic name (decorative, aria-hidden).
- **Line progress**: a 4px track with station dots; passed stations filled go, current station ringed, flagged stations caution.
- **Option row**: full-width 14-radius row, letter in a 32px rounded square, states: neutral → selected (statute outline) → correct (go fill tint + "Correct answer") / wrong (stop tint + "Your answer").
- **Citation drawer**: surface sheet with a statute-colored left rule and the citation set in statute color.

## Motion
Only in answer to the user: option press scale .98, drawer expand, line progress advancing to the next station. One page-load moment on Home: readiness ring draws in. Respect reduced motion.
