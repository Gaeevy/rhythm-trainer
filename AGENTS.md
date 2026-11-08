# Working instructions

## Context and scope

- At session start, recursively list Markdown in
  `${CODEX_HOME:-$HOME/.codex}/context/` and read task-relevant preferences.
- Read [docs/development.md](docs/development.md) before architecture/check changes
  and [docs/lessons.md](docs/lessons.md) before lesson/notation changes.
  [docs/practice.md](docs/practice.md) describes current user behavior.
- Keep current guides accurate in the same change. History under `docs/history/`
  is context, not an active plan; do not append routine per-turn logs. For a new
  multi-step feature, track the agreed plan and checks separately while active.
- Document durable facts and non-obvious reasons, especially past failure modes.
  Omit dated check notes, routine change narration and redundant contrasts such
  as "now A, not B". Keep each explanation in one guide and link to it elsewhere;
  record routine verification in the PR or handoff.
- Use `docs/plans/` for active agreed work only. On completion, compact the plan
  into a dated `docs/history/` summary, update its index and fix incoming links.
  Keep current behavior in the guides; historical approval notes are not active
  instructions. Git retains intermediate plans and detailed review logs.
- The user knows Python and practices jazz on an MPS-850 in Chrome on macOS.
  Favor simple code and consistent terms: lesson, track, lane, bar, beat, note,
  hit, tick, early, on time, late, missed, extra. One beat is a quarter note;
  a track is lesson data/behavior and a lane is its visual representation.
- Keep the app static and deployable to GitHub Pages. Use small JavaScript ES
  modules, HTML/CSS and JSON. No framework, backend, database, auth or external
  runtime service unless an accepted requirement needs it. Python tools may use
  the standard library; read
  `${CODEX_HOME:-$HOME/.codex}/context/python.md` when writing Python.

## Data and behavior

- Add lessons as JSON files in `lessons/` only. Follow the documented schema and
  integer ticks. Never edit/commit `generated/lesson-catalog.js` or `_site/`.
  Do not add a lesson importer/editor without a new requirement.
- Build tracks/lanes from lesson data with the reusable `Track` class. Keep data,
  input, audio, assessment and rendering separate. Prefer plain functions and
  small modules over inheritance or speculative abstractions.
- Preserve both views, version 1 compatibility, saved controls/custom keys and
  existing performance ticks. Storage migrations belong at the storage boundary.
- Use `config/drumkits/mps-850.json` as the sole MIDI mapping source. Automatically
  connect all available inputs as MPS-850 inputs; retain permission/error retry.
  Do not restore MIDI Learn, selectors or browser mapping overrides without a
  new requirement. Only explicit closed/open/pedal hi-hat tracks are supported.
- Reserve Space for transport. Ignore repeats and playing shortcuts while typing
  or activating controls. Apply disabled instruments consistently to guide sound
  and assessment; keep their visual representation dimmed. Track changes reset
  practice, while volume/mute and view changes preserve playback.
- Schedule audio on the Web Audio clock. Convert original input timestamps to
  that clock for assessment. Animation never schedules notes or decides hit
  timing. Match simultaneous instruments independently and each note at most once.
  Do not quantize hits or silently drop/round notes during notation conversion.
- Guide drums use local recordings only; load/decode before scheduling and leave
  Start stopped with a retryable error on failure. Preserve the metronome sound,
  hi-hat choking, cancellation and asset licenses/source records.
- Before changing notation layout, read [the layout policy](docs/development.md#notation-layout).
  Keep layout selection in `lessonNotation()` in `src/notation/model.js`; the
  renderer only engraves its result. Preserve quarter-ride protection and the
  documented grid fallbacks. Do not add per-song exceptions or extra layout
  settings without an agreed requirement.
- Use `src/instruments.js` for shared labels and `src/music-time.js` for timing
  constants. Keep MIDI, audio and staff-position configuration separate.

## Verification and delivery

- After completing a task and before committing, review the affected docs against
  the final implementation. Write back changes to behavior, setup, lesson format,
  architecture and checks in the relevant current guides; fix stale claims and
  links. Do not commit code with out-of-date documentation. If no doc update is
  needed, confirm that review in the handoff. Keep history summaries compact.
- Keep startup as `python3 scripts/site.py`, with no external service required.
  Use the Node version in `.node-version` (`fnm install` / `fnm use`).
- Run `npm test` for code changes and `npm run test:tools` for Python/catalog/
  packaging changes. For browser checks, run `npm ci` then `npm run test:browser`
  with Chrome installed. Use checks appropriate to the change; documentation-only
  work needs link/example validation, not a full audio/browser rerun.
- Test relevant boundaries: triplets/thirty-seconds, simultaneous and duplicate
  hits, misses/extras, clocks/latency, loop edges, disabled tracks and restart.
  Keep browser coverage for keyboard, simulated MIDI, rendering and recovery.
- Use disposable browser profiles. Do not access the user's Chrome profile.
  State hardware/listening limitations separately from automated checks.
- Preserve relative asset URLs and verify root plus `/rhythm-trainer/`. Package
  only runtime assets and their notices. Update setup/release instructions in
  `docs/development.md` when needed. Local checks do not establish live acceptance.
- Do not edit/remove unrelated user files, including IDE settings. Commit and
  release only within the user's authorization; do not treat local acceptance
  as permission to merge or deploy.
