# Spatial notehead timing feedback

Scope agreed 2026-11-06. Branch: `codex/notehead-timing-feedback`. Approved for commit.

- Move the matched notehead itself: early left, late right, on time attached.
  Keep stems, beams, score anchors, lesson ticks and assessment unchanged.
- Use the existing signed error with visual magnification (0.35 px/ms), capped
  at 18 px, 40% of the nearest engraving-anchor gap and the SVG bounds. Add no
  labels/markers.
- Animate for 180 ms, then hold while that bar copy is displayed. Respect reduced
  motion with the same static displacement. Reset unplayed/disabled heads at once.
- Keep simultaneous heads, loop copies and cached templates independent. Retain
  coloring/tooltips, miss correction and existing extra-hit behavior.
- Check directions/magnitude/caps, actual SVG movement, fixed stems/beams/anchors,
  keyboard and simulated MIDI, stop/restart, loop edges, resize/view changes,
  reduced motion and dense subdivisions at both site mounts.

Verification: 140 JavaScript tests and 30 browser scenarios pass at root and
/rhythm-trainer/. Browser checks observe real CSS transitions and measure glyph
movement while shared stems/beams stay fixed. Keyboard/MIDI, on-time centering,
independent future-loop hits, SVG edge bounds, reduced motion, Stop, view/resize,
restart and disabled resets pass. Existing catalog, dense subdivisions, feedback
and performance checks also pass. Desktop preview inspected; docs/links updated.

Status: user review passed; approved for commit. No push or deployment requested.
Physical kit feedback still needs manual practice.
