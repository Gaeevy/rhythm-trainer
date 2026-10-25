# Rhythm Trainer MVP

Status: milestones 1–6 completed locally. Basic MPS-850 note mappings are observed;
full real-kit practice/latency acceptance (milestone 7) remains pending.
The cleanup was reviewed and approved for commit on 2026-10-25. It has not been deployed.

## Goal and architecture

Practice short, repeating drum lessons with immediate timing feedback. Prioritize
jazz, the user's Millenium MPS-850, Chrome on macOS, and simple local iteration.

- Extend this repository using static HTML/CSS, small JavaScript ES modules, and
  JSON lessons/config. No framework, build step, backend, account, or database.
- Keep GitHub Pages hosting and relative asset URLs under `/rhythm-trainer/`.
- Serve with `python3 -m http.server 8000`; use pinned Node for checks.
- Use the Web Audio clock for scheduling and timestamped input for assessment.
  Animation draws the timeline; it must not determine hit timing.

## Lessons and lanes

- Version 1 JSON requires `version`, `title`, `bpm`, `time_signature`, `bars`, and
  `tracks`. Each track has `instrument` and `notes` only. Unknown fields fail.
- Meter is 4/4; one beat is a quarter note. Lessons span 1–16 bars.
- Use 96 integer ticks per beat, 384 per bar. Notes are sorted/unique integers
  from zero, strictly before `bars * 384`; preserve lesson/track order.
- Subdivision spacing: quarter 96, eighth 48, sixteenth 24, thirty-second 12,
  eighth-note triplet 32, sixteenth-note triplet 16. Mix subdivisions freely.
- At least one note is required; other tracks may be empty. Simultaneous notes
  on different instruments are allowed. No per-note objects or velocity scoring.
- Supported IDs: `kick`, `snare`, `hi_hat_closed`, `hi_hat_open`, `hi_hat_pedal`,
  `tom_1`–`tom_4`, `crash_1`, `crash_2`, `ride`. There is no generic hi-hat track.
- Straight lessons use closed hi-hat. Jazz swing/mixed lessons use pedal chick.
  Open, closed, and pedal actions are scored independently.
- Generate/edit JSON outside the app, add it to `lessons/`, and register it in
  `src/lesson-catalog.js`. Tests check catalog/file agreement. No lesson importer
  or editor is needed.
- Each track uses the same `Track` class. Build only the lesson's lanes in their
  listed order. Keep an eight-beat window; never squeeze 16 bars onto one screen.
- A fixed playhead, bar lines, quarter lines, and minimal top-lane labels show
  musical position. Actual hits retain precise positions, with color/text feedback.

## Practice controls

- Keep a compact header, centered maximum width of 1440 px, and 96–140 px lanes.
- Desktop toolbar: lesson dropdown, BPM slider, metronome volume, guide volume,
  and Start/Stop on one row. Wrap on narrow screens; use small mute icons.
- Foldable panels: Practice settings (count-in, tolerance, latency), Keyboard setup,
  and MIDI status. Avoid repeated hints, legends, and duplicate old app pages.
- Space starts/stops. D/F/J/K play kick/snare/closed hi-hat/ride. U/H play open
  hi-hat/pedal; Q/W/E/R the toms; A/S the crashes. Remapping swaps occupied keys.
- Ignore key repeats, browser shortcuts, and input while controls have focus.
- BPM range is 20–300 including fractions. Clamp out-of-range lesson defaults with
  a message. Invalid timing settings reopen their panel before Start.
- Tempo/count-in/timing/key changes stop playback. Lesson changes stop; only a
  successful load clears the prior lesson/session. Only the newest load can win.
- Disabling a track keeps its lane dimmed but removes guide notes, hits, and
  misses. Changing enabled tracks stops/resets the session. All-disabled permits
  metronome-only practice. MIDI monitoring remains independent.
- Guide/metronome volume or mute does not restart the loop or change scoring.
- Hiding the tab, audio interruption, or MIDI input loss stops practice. Restoring
  audio or MIDI does not automatically restart the loop.
- Stop freezes totals; Start/successful lesson changes reset. Include counts,
  mean absolute matched-hit error, elapsed time excluding count-in, and loops.
- Save valid practice controls locally: volumes/mute, count-in, tolerance, latency,
  disabled tracks, keyboard bindings, per-lesson tempo, and last lesson. Storage
  failure must not block practice. Preserve existing controls during cleanup;
  migrate removed generic hi-hat settings only at the storage boundary.
- Do not store or upload session activity in this MVP.

## MPS-850 MIDI

- The repository config `config/drumkits/mps-850.json` is the sole mapping source.
  No MIDI Learn, device selector, browser mapping overrides, apply/export UI, or
  multi-kit configuration. Treat all connected inputs as MPS-850 inputs.
- On startup load/validate the config and request MIDI access with `sysex: false`.
  The browser may require first-time approval. Keep one enable/retry button for
  permission/config/port errors. Keyboard practice remains available after errors.
- Automatically attach all connected inputs and later hotplugged ports. Unplugging
  stops playback. Release old handlers/ports; ignore stale async open failures.
  Reconnect inputs without restarting the lesson. Close ports when leaving the page.
- Only nonzero-velocity Note On creates hits. Ignore Note Off, controllers,
  aftertouch, SysEx, clocks, and unmapped notes. Monitor valid Note On separately.
- Preserve original timestamps and velocity, convert to the audio output clock,
  and use the same assessment path as keyboard input. Do not play own-hit audio.
- Observed channel-10 note mappings:

| Instrument | Note |
| --- | ---: |
| Kick / snare | 36 / 38 |
| Hi-hat closed / open / pedal | 42 / 46 / 44 |
| Tom 1 / 2 / 3 / 4 | 48 / 45 / 43 / 41 |
| Crash 1 / 2 / ride | 49 / 57 / 59 |

These come from this user's kit observations on 2026-10-24/25, not factory guesses.
The MIDI Monitor octave convention was anchored by snare D1 = note 38. Its final
Note On column is velocity. The pedal also sends Control/Aftertouch; one chick
Note On creates one hit. Rims and separate bow/edge/bell are excluded for now.

## Assessment and audio

- Match each expected note once, independently per instrument and loop iteration.
  Use exact timestamps; never quantize measured hits to ticks.
- Default on-time tolerance ±30 ms. Matching window at most ±150 ms, limited by
  neighboring-note midpoints including loop edges. A midpoint tie belongs to the
  earlier note; nearest already-matched notes produce extras, not fallback matches.
- Finalize misses after their late window. Delayed events can correct misses using
  original timestamps. Mean absolute error includes matched hits only.
- Ignore count-in taps except eligible early hits for the first lesson note.
- Positive latency offset subtracts time from hits and miss deadlines; negative
  adds it. Prefer audio output timestamps, with render-clock conversion fallback.
- Schedule ahead using absolute audio times, independent of animation. Skip
  elapsed events after delayed callbacks instead of playing a catch-up burst.
- Use twelve bundled CC0 Big Rusty Drums recordings. Preserve license, exact
  source paths, pinned revision, and regeneration instructions in `assets/drums/`.
  The metronome stays synthesized and unchanged. No runtime external sample service.
- Load/decode recordings once before scheduling. Stop invalidates pending Start.
  Failed loads use synthesized guide sounds and can retry on the next Start.
- Choke open hi-hat guide recordings at scheduled closed-hit/pedal time. Stop
  cancels all active/scheduled sounds, including cymbal tails.
- The module supplies the player's drum audio. Verify that the actual audio setup
  lets the user hear module and browser together; USB MIDI carries events only.

## Milestones and progress

| Milestone | Status | Evidence / remaining work |
| --- | --- | --- |
| 1. Lesson model and setup | done | Strict JSON validation and deterministic tests |
| 2. Playback and lanes | done | Native-clock loops, dynamic lanes, mixer, cancellation |
| 3. Keyboard and assessment | done | Precise matching, loop boundaries, misses/extras |
| 4. MIDI input | done locally | Simulated MIDI plus observed basic pad note mappings |
| 5. Practice controls and repo lessons | done | Persistence, remapping, repository catalog |
| 6. Browser verification and release preparation | done locally | Root/subpath checks; no live release verification |
| 7. Real-kit acceptance | pending | Full practice, audio routing, latency, reconnect |

Implementation checkpoints (full development history is in Git):

- `3901742`: lesson model and looping playback. Native timer receiver bug fixed.
- `d7736f9`: keyboard/timing assessment and IDE ignore rules.
- `685b8b5`: initial MIDI implementation; now simplified to fixed-kit connection.
- `acb52f3`: saved controls and repository lesson workflow.
- `a35d858`: project-owned isolated Chrome checks and deployment instructions.
- `47c53df`: reviewed compact practice view, track controls, Space transport.
- `e140e3c`: expanded instruments and observed MPS-850 mapping config.
- `775102a`: recorded acoustic guide drums with loading/retry and hi-hat closure.
- **2026-10-25 cleanup, reviewed:** user requests removal of MIDI Learn,
  generic hi-hat, manual kit setup, and leftovers. Migrated lessons to explicit
  actions; removed browser MIDI mapping state and duplicate metronome app; auto
  attaches inputs using the fixed config. Practice settings migrate without reset.
  README/MVP condensed to current behavior. **Verification:** 93 Node tests
  pass. All eight browser scenarios pass at both root and `/rhythm-trainer/`,
  including automatic multi-input mapping, ignored old browser mappings, startup
  reconnection, permission/port retries, late hotplug, strict hi-hat scoring,
  sample fallback/cancellation, and existing keyboard/transport controls. Desktop
  (1440×1000) and narrow (390×844) screenshots were inspected with simulated
  MIDI; no horizontal overflow. The old metronome files, MIDI mapping store,
  learning/profile UI, and unused styles/tests are removed. OS/Python cache
  files are ignored without deleting unrelated user files.
  **Delivery:** user reviewed the cleanup and approved committing it on 2026-10-25.

## Verification and next steps

Run `npm test` and `npm run test:browser` with pinned Node and Chrome installed.
Tests must cover validation, subdivisions, simultaneous notes, duplicates,
misses/extras, latency, loop edges, native timers, and stop/restart. Browser checks
use disposable profiles, simulated MIDI, and temporary servers at both `/` and
`/rhythm-trainer/`. Do not claim real-kit timing from simulated events.

Before publishing, review/commit, push `main`, confirm Pages deployment, then
check live lesson loading, count-in, keyboard/MIDI input, mute, and stop/restart.
A local release candidate is not a verified live deployment.

Real-kit acceptance: hear module/browser audio together; practice simultaneous
hits and several loops; check automatic connection, unplug/reconnect, and latency
adjustment. Basic note observations do not replace this acceptance.

Later work, only when requested: more articulations/dynamics/meters, variable
swing, lesson editor/YAML authoring, accounts/progress storage, and MCP lesson
creation. A Python backend/Railway can be considered when server features need it.
