# Practice code cleanup

Agreed 2026-11-06. Branch: `codex/simplify-practice-code`.

Preserve both views, input/audio timing, assessment, saved settings and notation
layout. No feature removals or new runtime dependencies.

- [x] Share notation session/bar resets; retain engraving on instrument toggles.
- [x] Render the drum key only when open; reuse it until the lesson changes.
- [x] Replace the single-caller generic lesson loader with one explicit loader.
- [x] Share slider keyboard handling while preserving individual conversions.
- [x] Split browser scenarios by feature, keeping one runner and shared helpers.
- [x] Update current docs; run unit, tools and full browser checks at both mounts.

Review reset/restart, disabled tracks, lazy drum key/retry, lesson load races and
failure recovery, slider keys, feedback/overlays and existing targeted test flags.

Verification: 140 Node tests, 7 tools tests and 34 browser scenarios pass. Focused
cleanup checks pass at both mounts. Added coverage measures engraving reuse,
lazy key lifecycle/retry, late lesson successes/failures and slider boundaries.
The full-kit check now waits for the lazily rendered key before checking it.
Current development guide and local documentation links reviewed/updated.

Status: local user review passed; approved for commit, push and deployment.
