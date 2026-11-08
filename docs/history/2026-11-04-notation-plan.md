# 2026-11-04 — Notation history

Historical summary of the notation plan created on 2026-11-04. Current usage,
authoring and architecture are documented in [practice](../practice.md),
[lessons](../lessons.md) and [development](../development.md). Git retains the
full original plan, intermediate reviews and implementation logs.

## Goal and decisions

Add standard drum notation for reading practice, alongside Lanes, while sharing
lesson data, the audio clock, keyboard/MIDI input, assessment and totals.

- Bundle pinned VexFlow/fonts locally; keep the app static and deployable to Pages.
- Add version 2 feel/triplet metadata without changing performance ticks.
  Swing writes eighths long–short; explicit triplets remain literal.
- Keep every note's instrument, source tick/index and loop identity through SVG
  rendering and independent feedback. Unsupported notation falls back to Lanes.
- Use a proof page first, then integrate the main app. Retire the proof once
  main-app checks cover it.

## Milestones and checkpoints

| Work | Outcome / commit |
| --- | --- |
| 1. Static proof | Bundled engraving/fonts; accepted — `4e86fad` |
| 2. Conversion and feel | Version 2, Swing and triplet references — `70cef0d` |
| 3. App integration | View selection, controls, persistence and recovery — `d9f9cd6` |
| 4. Following | Audio-clock marker and cached geometry — `391e14e` |
| 5. Feedback | Independent heads, precise errors and extra-hit overlays — `a42c3e6` |
| 6. Coverage | All lessons, full kit, thirty-seconds/sixteenth triplets and versioned assets — `d6f9466` |
| Readability | Shared stems, necessary rests and a continuous repeating sheet — `8418cd7` |
| Simplification | Bar/view separation, changed-result updates, shared facts, recordings-only guides; proof retired — `544b25c` |

The original current/upcoming bar swap was replaced after user review: bars now
stay in rows, with new loops below. Six rows are retained for indefinite practice.
Compatible rhythms share stems; independent voices remain for conflicting grids.

Printing, editing, variable swing, arbitrary tuplets/meters and dynamics remain
outside this iteration. Use current guides for the supported format and behavior.
