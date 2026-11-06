# 2026-11-06 — Spatial notehead feedback

Historical summary of [PR #10](https://github.com/Gaeevy/rhythm-trainer/pull/10).
Current behavior is in [Practice](../practice.md#views-and-feedback) and
[Development](../development.md#notehead-timing-feedback).

- Matched heads moved left/right with signed error while stems, beams, engraving
  anchors, audio clocks and assessment remained fixed. Cached templates and loop
  copies kept independent results; on-time heads stayed attached.
- The initial motion was halved after practice review: sensitivity became
  0.175 px/ms, capped at 9 px and by neighboring notes/SVG edges.
- A new miss shook vertically once and stayed dimmed. Historical misses did not
  replay on reconstruction; delayed corrections restored matched feedback.
- Extras became hollow heads at their actual timing and instrument staff
  position. The same drum-key/stave mapping served printed and extra notes.
  Overlays faded within their existing 900 ms lifetime.
- Reduced motion retained static feedback. CSS handled effects without new JS
  timers, markers, scoring categories or input quantization.

Checkpoints included 140 Node tests and 32 browser scenarios; the user reviewed
the local result. [Analytics](2026-11-06-practice-analytics.md) later added a
second horizontal animation level without changing matching or movement caps.
