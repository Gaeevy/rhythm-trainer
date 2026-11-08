# 2026-11-06 — Practice code cleanup

Historical summary of [PR #11](https://github.com/Gaeevy/rhythm-trainer/pull/11).
Current architecture and checks are in [Development](../development.md).

- Explicit notation session/bar reset methods replaced duplicated cleanup.
  Instrument toggles kept cached engraving and refreshed feedback separately.
- The folded drum key became lazy, reused until the lesson changed, with retry
  available by closing/reopening it.
- One explicit lesson loader replaced a single-caller generic wrapper, keeping
  late-response guards and previous-lesson recovery.
- Slider keyboard stepping was shared; BPM/volume retained their own scale
  conversions, saved values and playback behavior.
- Browser scenarios moved into feature modules with shared helpers and one
  runner. Existing targeted commands and disposable-profile checks remained.
