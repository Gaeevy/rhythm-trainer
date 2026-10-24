# Rhythm Trainer MVP

Status: milestones 1–6 complete locally; milestone 7 next, 2026-10-24.
The release candidate has not been pushed or verified on the live site.
This document specifies the next version; it does not describe features already
implemented in the current metronome.

## Goal

Practice short, repeating drum lessons with separate instrument lanes and
immediate timing feedback. Prioritize jazz practice and an easy local workflow
that an agent can run and test.

## Architecture and deployment

- Extend this repository with a new practice engine.
- Use static HTML, CSS, JavaScript ES modules, and JSON lessons.
- Keep GitHub Pages deployment. No Flask or Railway is needed for the MVP.
- Serve locally over HTTP, for example `python3 -m http.server 8000`.
  Open `http://localhost:8000`; do not rely on opening `index.html` as a file.
- Schedule audio in advance with Web Audio. Render with requestAnimationFrame.
- Use the same musical timeline for lesson playback, assessment, and display.
- Python can be introduced for development tools and later backend features.
  Accounts and saved server-side activity can justify Flask and Railway later.

## Tracks and display

- Initial instruments: kick, snare, hi-hat, ride.
- Use stable instrument IDs: `kick`, `snare`, `hi_hat`, `ride`.
- Each track uses one reusable `Track` component/class. Create lanes from the
  tracks present in the lesson and preserve their listed order.
- Support subsets of the four instruments; do not require four tracks per lesson.
- New instruments can be registered later without rewriting lane rendering.
- Use a fixed playhead with upcoming notes scrolling toward it.
- Display actual hits over their corresponding lane, with color plus a text or
  shape cue for early, on time, and late. Keep the display minimal.
- Show bar position, BPM, and a small session summary.
- Do not squeeze an entire 16-bar lesson into one screen. Display a useful
  time window and scroll continuously across loop boundaries.

- Use a compact header, a centered layout capped at 1440 px, and moderately sized
  lanes (96–140 px, depending on viewport height and track count).
- Show stronger bar lines and lighter quarter-note lines; no subdivision grid.
  Show bar/beat labels only along the top lane.
- Keep lesson selection, BPM slider, metronome volume, guide volume, and Start/Stop
  on one desktop row, wrapping on small screens. Use icon mute buttons.
- Put count-in, on-time tolerance, and latency offset in a collapsed Practice
  settings panel, alongside Keyboard setup and MIDI setup. Remove repeated
  footer shortcuts and timing legends; retain results and accessible labels.
- Each lane has a disable/enable control. Disabled tracks stay visible and dimmed,
  but have no guide sound or assessment, including misses and extras. MIDI monitor
  remains independent. Changing tracks stops playback and resets the session.
  Save disabled instruments with practice preferences; all disabled is valid for
  metronome-only practice. Keep lesson JSON unchanged.

## Musical scope

- Lessons contain 1–16 bars, initially in 4/4.
- One beat is one quarter note. One bar contains four beats.
- Support straight eighth, sixteenth, and thirty-second notes, plus eighth-note
  triplets and sixteenth-note triplets, including mixtures in one lesson.
- Basic swing can be encoded explicitly with triplet-position notes.
  Triplet swing is an initial practice target; jazz swing is not always an exact
  2:1 ratio. Adjustable swing feel is a later feature.
- Loop until stopped. Provide an optional one-bar count-in and adjustable BPM.
- Lesson positions are independent of BPM; changing tempo changes playback time.
- Playback controls support 20–300 BPM. Changing tempo, count-in, or lesson stops
  playback; Start begins from the start with the selected count-in. Volume and
  mute changes do not restart playback. Hiding the tab or an audio interruption
  stops playback and requires an explicit restart.

## Lesson format, version 1

Use JSON directly in the browser. No YAML dependency or conversion step is needed.
An authoring tool can add YAML support later while producing the same JSON data.

Use 96 ticks per quarter-note beat, a fixed resolution for version 1.
Positions are zero-based absolute ticks from the start of the lesson.
This supports all required subdivisions with integer positions:

| Subdivision | Ticks between notes |
| --- | ---: |
| Quarter note | 96 |
| Eighth note | 48 |
| Eighth-note triplet | 32 |
| Sixteenth note | 24 |
| Sixteenth-note triplet | 16 |
| Thirty-second note | 12 |

There are 384 ticks in a 4/4 bar. The example below is a one-bar ride and
hi-hat exercise; kick and snare tracks are present but have no expected notes.
Hi-hat notes on beats 2 and 4 can be practiced with the pedal.

```json
{
  "version": 1,
  "title": "Swing ride and hi-hat",
  "bpm": 80,
  "time_signature": [4, 4],
  "bars": 1,
  "tracks": [
    {"instrument": "ride", "notes": [0, 96, 160, 192, 288, 352]},
    {"instrument": "hi_hat", "notes": [96, 288]},
    {"instrument": "snare", "notes": []},
    {"instrument": "kick", "notes": []}
  ]
}
```

For multiple bars, add 384 to each note's tick for every following bar.
Do not repeat an end-of-loop note at tick `bars * 384`; it belongs at tick 0
of the next iteration.

Validate before playback: supported version and meter, nonempty title, finite
positive BPM, integer bar count 1–16, at least one track, supported unique
instrument IDs, and sorted unique integer note positions in the lesson range.
Allow empty tracks, but require at least one expected note across the lesson.
Show a useful error and do not partially start an invalid lesson.
Version 1 rejects unknown fields at lesson and track level rather than silently
ignoring them. Validation preserves track order and does not sort or repair data.

Velocity scoring, separate articulations, and arbitrary tuplets are outside MVP.
Do not add per-note objects until a concrete requirement needs extra fields.

## Practice controls and lesson behavior

- Generate lessons with an AI model or edit JSON, commit them to `lessons/`, and
  register each lesson in `src/lesson-catalog.js`, then deploy. No browser file
  importer or lesson editor is required. Tests check that files and catalog agree.
- Validate before replacing the active lesson. Starting a lesson change stops
  playback; failed loading/validation keeps the prior lesson, selection, and
  totals usable. Only the latest asynchronous load can change the active lesson.
- Show module-loading failures with a reload action instead of leaving the app
  indefinitely on “Loading lessons…”.
- Persist disabled instruments, count-in, timing tolerance, latency offset, keyboard bindings,
  guide/metronome volumes and mute, last bundled selection, and per-lesson tempo
  overrides in a separate versioned practice-settings key. MIDI profiles are
  unchanged. Use lesson tempo clears the override. Only valid numeric edits are saved.
- Report unavailable/corrupt preference storage without breaking practice.
  Fractional tempo/timing values are allowed within the existing UI ranges.
  A JSON BPM outside 20–300 remains valid lesson data; the slider limits its
  initial tempo to the nearest endpoint and shows an explicit status message.
  Start opens Practice settings if a timing field is invalid.
- Space starts/stops the loop and cannot be assigned to a drum. Keyboard setup
  supports letters and digits. Assigning an occupied key
  swaps the two instruments. Update input, lane labels, and accessible/visible
  hints together. Reset keys restores only keyboard defaults. Key changes stop
  playback; saved MIDI mappings are unaffected.
- The session summary includes elapsed practice time excluding count-in and
  completed loops. Both freeze with counts on Stop and reset on Start or a
  successful lesson change. These activity records remain in memory only.

## Input and device setup

- Target Chrome on macOS with a Millenium MPS-850 over USB MIDI.
- Provide explicit device selection, MIDI permission/error status, and reconnect
  handling. Request ordinary MIDI access; system-exclusive access is unnecessary.
- Do not assume a MIDI channel or the kit's current note assignments.
- Provide a MIDI learn flow: select an instrument, strike the intended pad or
  pedal, and save the mapping locally. Allow several MIDI notes per instrument.
- Hi-hat setup must support the pedal chick for jazz practice, as well as a
  closed hi-hat pad. Ride zones can map to the single ride track for MVP.
- Map only the intended note-on events; ignore note-off, zero-velocity note-on,
  clock, and other unrelated messages. Preserve velocity for sound response if
  useful, but do not score it.
- Keep keyboard input available for testing, with remapping. Initial defaults:
  D = kick, F = snare, J = hi-hat, K = ride.
- Store device/input settings locally, outside lessons.
- MIDI profiles store note/channel pairs per device ID. No factory mappings are
  assumed. A pair belongs to one instrument; learning it elsewhere reassigns it
  with a status message. Each instrument can have several pairs, individually
  removable from setup.
- Request MIDI permission only on Connect MIDI, with `sysex: false`. On first use
  require explicit device selection; after reload, Connect restores the saved
  selection if available. Only the selected input is listened to.
- Learning/mapping/device changes stop playback. Learn consumes one valid Note
  On, never a scoring hit. Start cancels unfinished learn. Unmapped Note On events
  appear in the monitor but are not scored. The monitor also works while stopped.
- Physical disconnect stops playback; reconnect restores the same device's
  mappings without restarting practice. Release old ports on switch/disconnect.
  Report permission/port-open errors and allow explicit retry. Keyboard remains
  usable after MIDI errors. Handle invalid/unavailable local storage without
  breaking input; warn if mappings cannot persist beyond the current page.
- MIDI input shares event-to-audio clock conversion and assessment with keyboard
  input. Preserve velocity in results, without velocity scoring or own-hit audio.
- Real-kit MIDI notes and end-to-end latency must be checked with the user.

## Audio

- Play guide drum sounds for the expected lesson notes.
- Provide an independent guide-volume slider and mute control.
- Provide a metronome with independent volume and mute control.
- Guide mute must not affect timeline movement or scoring.
- Use bundled, licensed samples or synthesized sounds; do not require a remote
  sample service. Record sample licenses if samples are bundled.
- MIDI carries performance events, not the kit's audio. The user must hear the
  kit and browser audio together through a suitable audio connection.
- Browser playback of the player's own hits is optional and should default off
  to avoid doubling the sound produced by the drum module.

## Timing assessment

- Match a hit to an eligible unmatched expected note on the same instrument.
- Distinguish early, on time, late, missed notes, and extra hits.
- Record signed timing error in milliseconds: negative = early, positive = late.
- Preserve the original input timestamp and the latency-corrected hit time.
  Do not snap actual hits to musical ticks. Derive timing error from precise
  timestamps; keep expected-note position, loop iteration, and BPM with matched
  results so later analysis can express errors in milliseconds or beat fractions.
  Keep these session records in memory for MVP; durable history is later work.
- Use a configurable on-time tolerance and a separate bounded matching window.
  Default tolerance is ±30 ms; the maximum matching window is ±150 ms.
  Each note's early/late window is additionally capped at half the distance to
  its previous/next note on the same track, including across loops.
- Choose the nearest expected note on that track, with exact midpoint ties going
  to the earlier note. If that note already has a hit, record an extra hit rather
  than falling through to a different unmatched note. A valid hit is on time
  when its absolute error is within the configured tolerance; other valid hits
  are early or late. All comparisons retain timestamp precision.
- Account for adjacent notes at high tempos so matching does not assign one
  hit twice or match implausibly distant notes.
- Treat loop iterations as distinct expected notes, including near tick 0.
  Keep the prior iteration eligible until its matching window closes.
- Finalize missed notes only after their late matching window closes.
- A delayed input event can correct a missed result if its original timestamp
  lies within the note's window. Browser delivery delay must not worsen timing.
- Ignore count-in taps except eligible early hits for the first expected note.
- Support simultaneous hits on different instruments.
- Provide a documented latency-offset setting with an explicit sign convention.
- Prefer `AudioContext.getOutputTimestamp()` for event/audio clock conversion;
  fall back to contemporaneous performance/audio clock readings before output
  timestamps are available. Positive latency offset subtracts milliseconds from
  the converted hit time; negative adds them. Apply the same offset when deciding
  which note windows have elapsed. UI range is −500 to +500 ms.
- Reset pending events and assessment state correctly on stop/restart.
- Stop freezes current totals without marking future notes missed. Start creates
  a new session; loading a new lesson clears the prior session. The summary shows
  counts of each result and mean absolute error across matched hits only.
- Show session totals and timing feedback; do not persist activity to a server.

## Implementation plan and tracker

Work through the milestones in order. Each milestone should leave the app or its
core logic runnable and verifiable. Keep each change focused enough to review.
Do not start a later milestone to hide an unresolved failure in an earlier one.
Routine technical choices can be resolved during implementation; record changes
to the agreed scope here.

Status values: **not started**, **in progress**, **blocked**, **done**.
Only mark a milestone done when its completion checks pass. The existing
metronome does not count as completion of the new practice engine.

| Milestone | Status | Result |
| --- | --- | --- |
| 1. Lesson model and development setup | done | Validated JSON lessons and repeatable checks |
| 2. Playback and dynamic lanes | done | A visible, audible lesson that loops |
| 3. Keyboard input and timing assessment | done | A playable trainer with precise feedback |
| 4. MIDI input and device setup | done | Configurable kit input with MIDI learn |
| 5. Practice controls and repository lessons | done | Complete everyday practice flow |
| 6. Browser verification and deployment | done | Locally verified release candidate; deployment documented, not published |
| 7. Real-kit acceptance | not started | Verified MPS-850 practice session |

### 1. Lesson model and development setup

- Establish a small ES-module structure and a deterministic test command.
  Prefer Node's built-in test runner for pure JavaScript logic.
- Implement JSON validation and tick-to-time conversion as pure functions.
- Add bundled lessons: basic straight groove, swing ride/hi-hat, and a mixed
  subdivision exercise covering sixteenth-note triplets and thirty-second notes.
- Document local startup and test commands in the README.

Completion checks: valid examples load; invalid lessons produce useful errors;
tests cover the 1/16-bar limits, note ranges, duplicate instruments/notes,
unsupported fields where applicable, and exact subdivision conversion.
The existing app remains runnable while the new engine is established.

### 2. Playback and dynamic lanes

- Implement the shared playback timeline and Web Audio scheduler.
- Implement the reusable `Track` component/class and instrument registry.
- Render lanes from lesson data, notes, beat/bar lines, and a fixed playhead.
- Add guide sounds, metronome, count-in, start/stop, and continuous looping.
- Add independent guide/metronome volume and mute controls alongside playback.
- Define stop/restart and tempo-change behavior; cancel scheduled sounds cleanly.

Completion checks: a four-track lesson plays and scrolls for several loops;
a subset lesson creates only its listed lanes in the listed order; visual time
follows the audio clock; mute preserves playback position; repeated start/stop
does not leave sounds, scheduler callbacks, or animation loops running.
Exercise this flow in the browser, including across bar and loop boundaries.

### 3. Keyboard input and timing assessment

- Normalize keyboard hits with precise event timestamps and convert them into
  the playback clock's time base. Keep input separate from assessment.
- Implement one-to-one note matching, early/on-time/late feedback, missed notes,
  extra hits, and session totals.
- Add configurable tolerance, matching-window rules, and latency offset.
- Store original and corrected hit times without quantization.
- Display hit markers, signed error, and accessible feedback in each lane.

Completion checks: deterministic tests cover clock conversion, tolerance edges,
dense notes, simultaneous hits, duplicate hits, misses, extra hits, loop edges,
latency correction, count-in, and restart. Keyboard practice works in the browser;
held keys and typing in controls do not generate unintended hits. Publish the
chosen matching rules and initial thresholds in this document.

### 4. MIDI input and device setup

- Feed MIDI hits through the same normalized input and assessment path.
- Add explicit connection, device selection, MIDI learn, multiple notes per
  instrument, and local settings storage.
- Handle denied permissions, disconnect/reconnect, and malformed or irrelevant
  MIDI messages with useful status messages.
- Include hi-hat pedal chick and ride-zone mappings without assuming kit defaults
  or requiring channel 10.

Completion checks: simulated MIDI verifies note-on filtering, device selection,
mapping, timestamp handling, reconnect, and settings restoration. Keyboard input
still works. Record actual MPS-850 verification as pending until milestone 7.

### 5. Practice controls and repository lessons

- Load lessons from repository JSON files registered in the lesson catalog.
  Show loading/validation errors and document the AI → JSON → commit workflow.
- Complete BPM, count-in, keyboard remapping, tolerance, and latency controls.
- Stop/reset safely when switching lessons; prevent accidental overlapping runs.
- Finish session summary and small layout/usability adjustments for practice.
- Document creating a custom lesson, instrument mapping, and audio setup.

Completion checks: select and practice a repository multi-bar lesson; reject an
invalid lesson without breaking the current app; practice a 16-bar lesson without shrinking
the visible notes; verify mapping/settings persistence and all practice controls.

### 6. Browser verification and deployment

- Add a repeatable browser smoke test for the complete keyboard practice flow,
  with simulated input where hardware is unavailable.
- Run the core tests and browser checks; fix failures before release.
- Verify assets and lesson loading under `/rhythm-trainer/` as well as localhost.
- Document the current deployment process and real-kit checklist in the README.
- Prepare the release candidate; record whether it has actually been published.
  Do not equate local checks with a verified live deployment.

Completion checks: automated checks pass; a served repository-subpath build loads
with no missing assets or browser errors; start/count-in/hit/loop/mute/stop/restart
and lesson selection work. Record test commands and outcomes in the progress log.
Any published version must also receive a live smoke check.

### 7. Real-kit acceptance

- With the user, connect the MPS-850 to Chrome on macOS and complete MIDI learn
  for kick, snare, hi-hat pedal/pad, and ride.
- Confirm how the user hears both browser guide audio and the drum module.
- Check simultaneous hits, reconnect, several loops, and latency offset against
  the actual practice setup. Adjust mappings or timing behavior if needed.

Completion checks: the user can practice the swing lesson with all four
instruments and useful feedback. Record the tested setup and any limitations.
This milestone requires the kit and user feedback; simulated MIDI is not enough.

### Progress log

Update this log with each implementation milestone or meaningful partial result.
Record the date, milestone/status, what changed, verification evidence, remaining
issues, and the next concrete action. Keep evidence concise; do not paste raw logs.

- **2026-10-24 — Planning:** scope, implementation sequence, and completion checks
  recorded. No MVP implementation milestones are complete. The JSON example was
  parsed and checked for four tracks and in-range notes. Precise hit timestamps
  are retained without snapping to ticks. **Next:** milestone 1, lesson model and
  development setup.
- **2026-10-24 — Milestone 1 done:** added browser-compatible lesson validation,
  JSON parsing with field-specific errors, and tick-to-seconds conversion. Added
  straight, swing, and two-bar mixed-subdivision lessons; documented startup,
  testing, and lesson authoring in the README. Unknown fields are rejected.
  **Verification:** all 32 tests passed with Node 24.22.1 using `node --test`;
  Node was supplied by the Codex runtime because it is not on the shell PATH.
  A local Python HTTP server returned 200 for the existing page/assets, both new
  modules, and all three lessons; fetched JSON passed validation. Existing page,
  stylesheet, metronome script, and sound are unchanged. No browser playback or
  real-kit verification was performed in this milestone. **Remaining:** connect
  the new lesson model to playback and lanes. **Next:** milestone 2.
- **2026-10-24 — Development setup:** installed fnm 1.39.0 and Node 24.22.1
  with npm 11.19.1; enabled fnm automatic version selection in the user's zsh
  configuration. Pinned Node in `.node-version`, aligned `package.json` to Node
  24, ignored `node_modules/`, and documented setup. **Verification:** a fresh
  interactive login zsh selected Node 24.22.1 and `npm test` passed all 32 tests.
  No package dependencies were installed. **Next:** milestone 2.
- **2026-10-24 — Milestone 2 done:** connected bundled lessons to a new playback
  page, reusable `Track` lanes, and an instrument registry. The display follows
  the audio clock through a fixed eight-beat window; a 25 ms scheduler schedules
  sounds up to 120 ms ahead without animation driving playback. Added synthesized
  guide voices, independent guide/metronome volume and mute, optional one-bar
  count-in, and start/stop. Changing lesson, tempo, or count-in stops playback;
  hidden tabs and audio interruptions also stop. Delayed scheduling callbacks
  skip elapsed notes instead of playing a catch-up burst. Original metronome
  remains at `legacy.html` with its existing script and separate stylesheet.
  **Verification:** all 40 Node tests passed, including repeated loops, count-in,
  simultaneous notes, scheduler-window boundaries, dense subdivisions, delayed
  callbacks, and stop/restart cleanup. Headless installed Chrome verified four
  lanes, a three-track subset in lesson order, four loops, independent volume/mute,
  tempo changes, two-bar playback, repeated restart cleanup (sources, timers,
  animation callbacks), visibility handling, pending-start cancellation, invalid
  JSON recovery, and the original metronome page. Desktop/mobile screenshots were
  inspected; no horizontal overflow at 390 px. Offline Web Audio rendering
  confirmed nonzero output for all five voices and independent audio-bus mute.
  No browser errors remained. The browser check used bundled Playwright tooling;
  a project-owned browser smoke test is still milestone 6. **Remaining:** hit
  input/assessment, hardware acceptance, and live deployment are not verified or
  implemented by this milestone. **Next:** milestone 3, keyboard input and timing
  assessment.
- **2026-10-24 — Milestone 2 correction:** the user reported Start failing with
  `Illegal invocation`. Default timer functions had been stored on `Playback`
  and invoked with the wrong receiver. Previous browser instrumentation replaced
  native timers with arrow functions and masked the failure. Wrapped default
  timers so calls retain the global receiver; added a regression test that fails
  on the original code. **Verification:** all 41 Node tests pass. An isolated
  browser with untouched native timers reproduced the original visible error,
  then verified the fix through count-in, multiple loops, stop, and three
  restarts. Future browser smoke checks must include an uninstrumented run.
  No access to the user's Chrome tabs/profile was used. **Next:** user reloads
  the local page to confirm playback in their session; milestone 3 remains next.
- **2026-10-24 — User acceptance of playback:** the user confirmed the loop works
  in their Chrome session after the timer fix. Preserve the metronome sound.
  Improving the synthesized guide drums with licensed samples is deferred until
  after timing assessment. Hardware MIDI acceptance remains pending.
- **2026-10-24 — Checkpoint:** committed milestones 1–2 and the verified native
  timer fix as `3901742` (`Build lesson model and looping drum playback`).
  Unrelated IDE files were excluded. No changes were pushed or deployed.
- **2026-10-24 — Milestone 3 done:** added timestamp-based keyboard input,
  audio output clock conversion, one-to-one note matching, and per-lane feedback
  with actual-hit markers and signed milliseconds. Added early/on-time/late,
  missed and extra totals, mean absolute error, tolerance and latency controls.
  Default keys are Space/F/J/K. Start focuses the lanes; held keys, shortcuts,
  typing, and focused controls do not generate unintended hits. Matching rules,
  count-in behavior, latency sign, delayed-event corrections, and session reset
  behavior are specified above and in the README. Animation follows the audio
  output clock; hit assessment uses original event times, not animation time.
  Original timestamps and unrounded results remain in memory. The metronome
  and synthesized drum voices are unchanged.
  **Verification:** `npm test` passed all 66 tests, including clock conversion,
  signed/tolerance boundaries, dense thirty-second and triplet notes, simultaneous
  hits, duplicate hits, misses/extras, loop boundaries, positive/negative latency,
  delayed event delivery, and new-session reset. An isolated browser with native
  timers verified real keyboard event handling plus precisely timestamped test
  hits through the full DOM input path, count-in exclusion, signed feedback,
  totals, repeat/control filtering, latency/tolerance changes, mute behavior,
  stop/freeze/restart/reset, and bundled lesson loading. Desktop/mobile screenshots
  were inspected; no horizontal overflow at 390 px and no browser errors.
  **Remaining:** user practice feedback, MIDI input/setup, persistent settings,
  live deployment, and real-kit acceptance. Milestone 3 changes are separate from
  the earlier checkpoint commit. **Next:** milestone 4, MIDI input and device setup.

- **2026-10-24 — Milestone 3 checkpoint:** user confirmed keyboard practice works.
  Committed as `d7736f9` (`Add keyboard timing assessment and ignore IDE files`),
  including `.idea/` in `.gitignore`. Nothing was pushed or deployed.
- **2026-10-24 — Milestone 4 done:** added explicit MIDI connection/device
  selection, note/channel-based MIDI learn with multiple notes per instrument,
  reassignment/removal, and a last-hit monitor. Added versioned local device
  profiles and selection restoration after explicit Connect. MIDI hits share
  timestamp conversion and assessment with keyboard hits; velocity is retained
  without being scored. Learn/device/mapping changes stop playback; starting
  cancels unfinished learn. Only the selected input is listened to. Unplug stops
  playback and reconnect restores mappings without restarting the loop. Old
  ports are released; stale async port failures cannot detach a newly selected
  device. Permission denial, busy ports, unsupported MIDI, and unavailable or
  corrupt local storage have visible, nonfatal feedback. MIDI setup disclosure
  keyboard activation does not create practice hits. Metronome and guide sounds
  are unchanged.
  **Verification:** all 83 Node tests passed. Isolated browser checks with
  native timers and simulated MIDI verified explicit permission options, device
  selection/filtering, all four instruments, hi-hat pad/pedal and ride zones,
  learn/cancel/reassign/remove, exact shared scoring and preserved velocity/time,
  keyboard coexistence, unplug/stop/reconnect, per-device profile isolation,
  reload restoration, pending-learn cancellation on Start, permission retry,
  no devices, unsupported API, storage failure, and busy-port recovery. Desktop
  and 390 px mobile screenshots were inspected with no horizontal overflow;
  no browser errors remained. No real MIDI permission or user Chrome profile
  access was used. README includes the setup flow and real-kit checklist.
  **Remaining:** real MPS-850 MIDI assignments, audio routing, and end-to-end
  latency require hardware acceptance in milestone 7. Milestone 4 changes are
  uncommitted for review; the earlier checkpoint is preserved.
  **Next:** user can try MIDI setup locally; milestone 5 adds practice controls
  and the remaining practice controls/settings.
- **2026-10-24 — Milestone 4 checkpoint:** user confirmed the MIDI setup and
  saved mapping restoration work. Committed as `685b8b5` (`Add MIDI learn, device
  profiles, and reconnect handling`). No changes were pushed or deployed.
- **2026-10-24 — Milestone 5 scope corrected:** the initial implementation added
  a local file importer and tab-local lesson catalog. The user clarified that
  lessons will be generated with AI, committed to the repository, and deployed.
  Removed the importer, file reader, and transient custom lesson state. Kept
  repository lesson selection, saved practice settings, keyboard remapping, and
  practice time/completed-loop totals. Documented adding JSON plus a catalog
  entry; tests now check catalog/file agreement without a hard-coded lesson count.
  The user's screenshot showed a failed connection loading an ES module. The
  local server serves that module successfully; the specific connection failure
  has not been reproduced. Added startup failure reporting with a reload action.
  **Verification:** all 89 Node tests pass. Isolated headless Chrome verified
  repository lesson selection, native-timer playback, saved tempo/count-in/volume,
  invalid JSON preserving the previous lesson, a 16-bar lesson with dynamic lanes,
  keyboard remapping/restoration, and an intentionally failed module request
  showing the reload action and recovering after reload. The localhost module URL
  also returns HTTP 200. No user Chrome profile was accessed; the user's original
  connection failure is not explained by these checks.
  **Next:** user reload check, then milestone 6 browser checks and deployment
  preparation. Changes are uncommitted; no live deployment has been performed.

- **2026-10-24 — Milestone 6 done locally:** committed milestone 5 as `acb52f3`.
  Added `npm run test:browser` with pinned development-only Playwright and a
  lockfile. The script starts temporary loopback servers on available ports and
  launches headless Chrome with a disposable profile, without connecting to the
  user's browser. It checks both `/` and `/rhythm-trainer/`; the subpath server
  returns 404 for assets requested outside the mount. Each context starts with
  independent storage. Browsers and servers close on success or failure.
  **Verification:** `npm test` passed all 89 tests. `npm run test:browser` passed
  all six scenarios: practice flow, loading failure recovery, and simulated MIDI
  at each URL path. Practice checks include each repository lesson and lane order,
  count-in, precise signed keyboard errors, real key presses, held-key/control
  filtering, loops/misses/extras, audio scheduling, independent mixer gains,
  stopped scheduling/sources and frozen totals, restart/tempo changes, saved
  preferences/remapping, narrow layout, and the legacy link. Native timers remain
  unchanged. Failure checks cover module connection failure/reload and invalid
  JSON/retry. MIDI checks cover explicit permission, device selection, multi-zone
  learn, precise shared assessment/velocity, zero-velocity filtering, unplug/stop,
  reconnect without auto-start, and saved mappings after reload.
  Read-only GitHub checks confirmed Pages uses `main`, `/`, with HTTPS at
  `https://gaeevy.github.io/rhythm-trainer/`. README records installation, checks,
  the existing push-to-main deployment process, and live/manual acceptance steps.
  **Publication:** no push, deployment, or live smoke check of this candidate was
  performed. Milestone 6 changes remain uncommitted for review.
  **Next:** milestone 7, real-kit practice and audio/latency acceptance with the
  user. Simulated MIDI and scheduled audio do not establish hardware timing or
  audible sound quality.

- **2026-10-24 — Practice-view enhancements complete locally:** committed milestone 6
  as `a35d858`; final real-kit acceptance is deferred at the user's request.
  Added a compact header, wider/taller lanes, stronger bar/quarter grid, top mixer
  with mute icons, track disable controls, and Space start/stop. Default kick is D.
  Existing Space drum bindings migrate to an available letter without resetting
  preferences or MIDI mappings. Disabled instruments are saved independently of
  lesson data, remain visible and dimmed, and are excluded from guide events and
  assessment. Changing tracks stops and clears the session. All tracks can be
  disabled for metronome-only practice. Bar/beat labels use only bar labels on
  narrow lanes to prevent overlap.
  **Verification:** all 93 Node tests pass, including disabled-track scoring and
  scheduling, metronome-only loops, Space filtering, and settings migration.
  `npm run test:browser` passes eight scenarios across `/` and `/rhythm-trainer/`,
  including native Space/repeat handling, disabled keyboard/MIDI hits, saved
  disabled instruments, track re-enabling, metronome-only playback, layout size,
  mixer controls, and existing practice/recovery flows. Desktop (1440×1000) and
  narrow (390×844) screenshots were visually inspected. Corrected the browser
  assertion to check only events from the restarted run rather than prior audio.
  **Remaining:** these enhancements are uncommitted for review. No push or
  deployment was performed. Real-kit acceptance remains deferred.

- **2026-10-24 — Practice-view layout refinement:** reduced the oversized layout
  to a centered maximum width and 96–140 px lanes. Combined lesson selection,
  BPM, metronome/guide volume, and Start/Stop into one desktop row. Added a live
  BPM readout; retained saved tempos and Space transport. Moved count-in,
  tolerance, latency, and storage status into a collapsed Practice settings panel.
  Invalid timing fields reopen that panel on Start. Removed the timing legend,
  shortcut footer, and repeated transport hints; key help stays in Keyboard setup.
  **Verification:** all 93 Node tests and all eight browser scenarios pass at
  `/` and `/rhythm-trainer/`. Browser checks verify the three sliders share one
  desktop row, the reduced lane height, BPM keyboard interaction/readout and
  persistence, collapsed settings after reload, invalid timing reopening the
  panel, and out-of-range lesson tempo limiting. Fresh desktop (1440×1000) and
  narrow (390×844) screenshots were inspected. Controls wrap without horizontal
  overflow on narrow screens. Changes remain uncommitted; real-kit acceptance
  is deferred.

## Verification and acceptance

Milestone 4 user check (2026-10-24): the kit appears as `e-drum` from Medeli
Electronics. The user learned kick 36, snare 38, hi-hat 42, ride 59 on channel 10,
and confirmed saved mappings restore. This verifies setup and persistence;
pedal/ride zones, audio routing, and end-to-end timing remain milestone 7 checks.

- One documented startup command; no account, backend, or cloud service required.
- Deterministic tests for JSON validation and timing assessment, including
  triplets, thirty-second notes, simultaneous hits, misses, extra/duplicate hits,
  latency offset, and loop boundaries.
- Browser smoke test: load lesson, start, count in, keyboard hits, mute/volume,
  loop, stop, and restart. Include simulated MIDI checks.
- Check relative paths under the GitHub Pages repository URL.
- Include a short manual hardware checklist for MPS-850 MIDI learn and latency.
- An agent can complete automated checks without the drum kit, but must not
  report actual hardware integration as verified without a real-kit test.

## Later work

- Clickable lesson editor and optional YAML authoring.
- More instruments, articulations, dynamics, adjustable swing, and other meters.
- User accounts and a database for activity and progress.
- Python backend and Railway deployment when server features are needed.
- MCP lesson creation using the same versioned lesson format and validator.

## Reference checks

- [Web Audio scheduling](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Advanced_techniques)
- [Web MIDI support and permissions](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API)
- [MPS-850 connections](https://milleniumdrums.com/de/electronic-drums/mps-850/)
- [Swing and triplet feel](https://hub.yamaha.com/keyboards/k-how-to/the-difference-between-swing-time-and-straight-time/)
