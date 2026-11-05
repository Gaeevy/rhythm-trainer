# Cleaner dense drum notation

Scope agreed 2026-11-05. Branch: `codex/cleaner-drum-notation`. Approved for release.

Goal: recover the clean Fascination Street score while preserving independent
ride/snare rhythms in the swing exercises.

- Build the separate rhythm first. Protect every played quarter-note cymbal.
- If all played cymbal notes are eighth notes or shorter, try one shared voice.
  Keep it only if conversion succeeds and adds no rests. Apply one rule to the
  whole lesson; add no per-lesson options or special cases.
- Preserve every original note identity/tick and existing triplet fallback.
- Compare Fascination Street, other songs, swing exercises and a straight
  quarter-ride/offbeat-snare case. Check both site mounts and score feedback.

Initial result: Fascination Street goes from two voices and 35 rests over four
bars to one voice and zero rests. Swing exercises 7/13 retain separate voices.

Verification: 136 JavaScript tests and 28 browser scenarios pass at root and
/rhythm-trainer/. Tests cover all 23 lessons, quarter-ride protection in both
feels, dense song rest counts, incompatible grids and note identity preservation.
Fascination Street and swing screenshots inspected; current guides and local
links are updated. Playback, scoring and lesson data are unchanged.

Status: approved; mixed-duration follow-up below completes the change.

Maintenance handoff: the full policy, internal strategy flags, fallback order,
examples and regression tests are documented in Development: Notation layout.
AGENTS.md links to that section; model.js comments explain why each strategy
exists. Lesson docs link to the policy rather than duplicating its algorithm.

## Shared voice appearance

Use downward stems for the combined voice, placing its beams below the staff.
Lighten only combined stems/beams with CSS; keep noteheads, timing-feedback
colors and bar lines distinct. Mark the selected model on the SVG for styling;
keep all layout selection in lessonNotation. Separate swing voices are unchanged.
No lesson data, playback changes or new layout options.

Verification: 136 JavaScript tests and the full 28-scenario browser suite pass.
Focused catalog checks also pass at both mounts, asserting lighter combined
stems/beams and dark noteheads/bar lines. Fascination Street, Californication,
Chop Suey and swing screenshots inspected. Current guides explain the style;
layout selection rules remain unchanged. Approved for release.

## Mixed durations and thinner beams

Reviewed work committed as `e72204c`. This follow-up uses 3 px beams and mixed
written durations. Approved follow-up:

- Emit the longest aligned binary duration before the next written hit, bounded
  by its beat/half-beat. Keep leading gaps as rests and triplet slots unchanged.
- Use mixed eighth/sixteenth/thirty-second values in existing beam groups.
  No new layout strategy, JSON setting, dotted value or tie support.
- Set VexFlow beamWidth to 3 px and check rendered beam geometry.
- Check hits/identities, four-beat totals, mixed groups, leading/internal rests,
  triplets, swing, thirty-seconds and source song notation at both mounts.

Result: Californication and Chop Suey now have zero subdivision rests;
Come Undone retains its one explicit triplet rest. All original hit ticks and
identities remain. 138 JavaScript tests and 28 browser scenarios pass; focused
catalog checks at both mounts also verify rendered 3 px beam geometry. Song
screenshots inspected and current guides/links updated. Approved for release.
