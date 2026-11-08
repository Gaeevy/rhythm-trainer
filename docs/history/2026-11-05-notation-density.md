# 2026-11-05 — Cleaner dense notation

Historical summary. The current selection algorithm and fallbacks are documented
in [Development: Notation layout](../development.md#notation-layout).

- Separate voices protected quarter-note cymbals. Dense eighth-or-shorter cymbals
  could share a downward-stem voice only when conversion succeeded without adding
  rests. Selection stayed in `lessonNotation()`, with no per-song exceptions.
- Fascination Street lost 35 redundant rests while swing ride/snare rhythms
  remained independent. Combined stems/beams were lighter; heads/bar lines stayed
  dark. Every original note identity and performance tick was preserved.
- Longest aligned binary durations within each beat/half-beat allowed mixed
  eighth/sixteenth/thirty-second beam groups. Leading and explicit triplet rests
  remained. VexFlow beam width was reduced to 3 px.
- Californication and Chop Suey lost subdivision rests; Come Undone retained its
  explicit triplet rest. These were general conversion rules, not song settings.
- Native-clock browser assertions gained a test-only 0.25 ms anchor-sampling
  allowance. Production timestamps, tolerances and exact unit checks were unchanged.
