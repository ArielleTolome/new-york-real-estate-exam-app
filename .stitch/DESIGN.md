---
name: NY Real Estate Exam Prep
theme: dark
colors:
  canvas: "#090d16"
  surface: "#121826"
  border: "#1f293d"
  text: "#e5e7eb"
  text-muted: "#94a3b8"
  correct: "#10b981"
  missed: "#ef4444"
  weak: "#f59e0b"
  citation: "#6366f1"
typography:
  font-family: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, 'Segoe UI', Roboto, sans-serif"
  display: { size: 32px, weight: 700, line-height: 1.15, letter-spacing: -0.02em }
  title: { size: 20px, weight: 600, line-height: 1.3 }
  body: { size: 16px, weight: 400, line-height: 1.5 }
  label: { size: 13px, weight: 600, line-height: 1.3, letter-spacing: 0.02em }
  caption: { size: 12px, weight: 500, line-height: 1.4 }
radii:
  card: 14px
  button: 12px
  chip: 999px
spacing:
  gap: 12px
  page-x: 16px
  section: 24px
sizing:
  touch-target-min: 52px
layout:
  bottom-action-bar: sticky, thumb zone, padding-bottom env(safe-area-inset-bottom)
  top-bar: sticky, padding-top env(safe-area-inset-top)
  safe-area: respect env(safe-area-inset-*) on all edges
---

# NY Real Estate Exam Prep — Design System

Mobile-first PWA for the NYS Real Estate Salesperson exam. Dark OLED theme, built for
one-handed drilling on a phone.

## Color
| Token | Hex | Use |
|---|---|---|
| canvas | `#090d16` | Page background (near-black, OLED friendly) |
| surface | `#121826` | Cards, sheets, option rows |
| border | `#1f293d` | 1px card/option borders, dividers |
| text | `#e5e7eb` | Primary text |
| text-muted | `#94a3b8` | Secondary labels, metadata |
| correct (emerald) | `#10b981` | Correct answers, readiness, pass, primary CTA |
| missed (crimson) | `#ef4444` | Wrong answers, fail badges, mistake bank |
| weak (amber) | `#f59e0b` | Bookmarks, flags, weak topics (<70%) |
| citation (indigo) | `#6366f1` | Statutory citations (RPL, 19 NYCRR, Exec Law) |

Semantic accents carry meaning; never use them decoratively. Tinted fills use the accent at
~12% opacity with a 1px accent border.

## Typography
System font stack (`-apple-system`, Inter fallback). Tabular numerals for scores, timers,
counters. Scale: display 32 / title 20 / body 16 / label 13 / caption 12.

## Shape & Spacing
- Cards: 14px radius, 1px `border`, `surface` fill, no drop shadows.
- Buttons: 12px radius, min height 52px. Chips: pill.
- 12px gap between stacked elements; 16px page gutter; 24px between sections.

## Touch & Layout
- Every interactive target ≥ 52px tall.
- Primary actions live in a sticky bottom action bar (thumb zone) that pads for
  `env(safe-area-inset-bottom)`. Top bars pad for `env(safe-area-inset-top)`.
- Answer options are full-width stacked rows, never grids.

## Do / Don't
- Do: one primary emerald CTA per screen; muted secondary buttons with border.
- Do: show pass line (70%) explicitly wherever a score appears.
- Don't: gradients, glassmorphism, emoji, pure #000 cards, more than one accent per element.
