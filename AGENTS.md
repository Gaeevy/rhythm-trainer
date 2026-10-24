# Project instructions

## Product and scope

- Read `mvp.md` before changing application behavior. It records the agreed MVP.
- Follow the implementation plan in `mvp.md` one milestone at a time. Update its
  status and progress log in the same change as the implementation. Mark a
  milestone done only after its completion checks pass; distinguish automated
  checks from hardware checks. Record blockers and the next concrete action.
- Enhance this repository. Keep the app deployable to GitHub Pages.
- The MVP is a static browser application. Do not add Flask, a database,
  authentication, or a frontend framework unless a new requirement needs it.
- The primary user practices jazz on a Millenium MPS-850 using Chrome on macOS.
- The user knows Python. Use Python for development tools when useful, but keep
  audio scheduling, input timestamps, timing assessment, and animation local to
  the browser. Do not route individual hits through a server.

## Implementation

- Use small JavaScript ES modules, plain HTML, and CSS. Avoid a build step unless
  it solves a concrete problem.
- Represent each lesson track with the same reusable `Track` component/class.
  Build lanes from the lesson's tracks; do not hard-code four lane elements.
- Separate lesson data, audio scheduling, input mapping, timing assessment, and
  rendering. Avoid unnecessary abstractions and inheritance hierarchies.
- Use JSON lesson files and integer musical ticks. Follow the format in `mvp.md`.
- Add lessons as JSON files in `lessons/` and register them in
  `src/lesson-catalog.js`. The user generates lessons with AI, commits, and deploys.
  Do not add a browser lesson importer or editor unless requested.
- Keep keyboard and MIDI mappings in player settings, outside lesson files.
- Use the Web Audio clock for scheduled playback. Use input event timestamps,
  converted to the same time base, for assessment. Animation must not determine
  hit timing. Never compare timestamps from different clocks directly.
- Support simultaneous hits and match each expected note at most once.
- Ignore held-key repeats and playing shortcuts while a text control has focus.
- Use consistent terms: lesson, track, lane, bar, beat, note, hit, tick,
  early, on time, late, missed, extra. A track is lesson data and behavior;
  a lane is its visual representation. One beat means one quarter note in MVP.
- Keep code readable and use descriptive names. If Python is added, also read
  `${CODEX_HOME:-$HOME/.codex}/context/python.md`.

## Verification and delivery

- Keep local startup to one documented command; no external services required.
- Use the Node version in `.node-version` for development checks (`fnm install`
  and `fnm use` after initializing fnm). Run `npm test`; no dependency install is
  currently needed. Keep the README setup instructions current.
- Add meaningful deterministic tests for lesson validation, timing assessment,
  clock conversion, and loop boundaries as those features are implemented.
- Verify the browser flow with keyboard input and simulated MIDI events.
  Hardware behavior still requires a real-kit check; state this limitation.
- Test triplets, thirty-second notes, simultaneous notes, missed/extra hits,
  duplicate hits, and start/stop/restart behavior where affected.
- Use relative asset URLs so deployment under `/rhythm-trainer/` works.
- Do not edit or remove unrelated user files, including IDE settings.
- Document setup, checks, and any remaining hardware verification in the README.
