# Practice toolbar

Status: implemented and approved for release on `codex/practice-toolbar`.
Scope agreed and reviewed 2026-11-05.

- Remove the repeated lesson title/details/badge; retain the lesson dropdown.
- Remove routine prompts/status below the score; retain accessible feedback and
  visible errors. Move Drum key into Practice settings, available from either view.
- Double BPM slider travel width and shorten audio sliders to about two-thirds.
- Join bar staves without card borders/gutters; use small numbers and standard
  thin bar lines. Fit up to three bars per row according to density and width.
- Move Lanes/Notation to Practice settings. Default new/missing view preferences
  to Notation, preserving an explicitly saved view.
- Place a small accessible lesson-tempo reset icon beside BPM, before metronome.
- Use logarithmic slider travel for integer 20–300 BPM, with precise keyboard
  adjustments. Round legitimate old fractional tempo overrides at storage load.
- Add a shared master slider/mute on the toolbar: 0–200%, default 150%. Preserve
  guide/metronome levels and the metronome oscillator/envelope.

Completion checks: deterministic tempo mapping and migrations; master signal
routing/boost/mute; browser default/settings selection, tempo reset/rounding,
keyboard changes, persistence, mixer changes during playback, compact desktop
row and narrow layout. Retain existing keyboard/MIDI, loop and score checks.
Review the current guides against the final implementation. Physical loudness
and audio balance still require a listening check.

Verification: clean `npm ci`, 132 JavaScript tests and 26 browser scenarios pass
at root and `/rhythm-trainer/`. Checks cover all integer BPM round-trips, log
travel, pointer/keyboard changes, reset, old fractional settings, saved view and
mixer persistence, master gain/mute without session restart, default Notation,
folded view/key selection, seamless staff edges, density-based three/two/one-bar
rows, bounded native playback with three columns, preserved visible errors and
desktop/narrow layout. Screenshots inspected. Current
practice, lesson and development guides are updated. Listen with the real kit
to choose the preferred master level.
