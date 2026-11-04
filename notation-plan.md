# Drum notation plan

Status: milestone 1 accepted. Milestone 2 is next; milestones 3–7 have not started.
Created: 2026-11-04.

## Goal

Practice reading standard drum notation while playing the existing lessons.
Keep the current Lanes view and add a Notation view. Both views use the same
lesson, playback clock, MIDI/keyboard input, assessment, and session totals.

Continue the static GitHub Pages architecture. Keep local startup as
`python3 scripts/site.py`. Adding a lesson still means adding one JSON file in
`lessons/`, with automatic discovery. The original scope and timing rules remain
in [mvp.md](mvp.md).

## How we will work

1. Implement one milestone at a time, including its checks and progress entry.
2. Mark it **ready for review** when automated checks pass. Report what changed,
   how to open it locally, what to try, and any limitations.
3. The user verifies the result. Fix review findings within that milestone.
4. Mark it **accepted** only after the user's confirmation, then continue to the
   next milestone when requested. Do not combine several visual milestones into
   one large change before review.
5. Do not infer commit, merge, or deployment approval from acceptance of a local
   milestone. Honor explicit release instructions when given.

Use these statuses: **planned**, **in progress**, **ready for review**,
**accepted**, **blocked**. Record a concrete next action for any blocker.
Automated browser checks use disposable Chrome profiles and simulated MIDI;
they do not access the user's Chrome profile or physical kit.

## Product decisions

- **View:** Lanes or Notation. Keep Lanes as the default during development.
- **Feel:** Straight or Swing, defined by the lesson. Use these terms consistently;
  avoid using Classic to mean both notation appearance and straight timing.
- **Straight:** two eighth notes divide a quarter-note beat equally.
- **Swing:** written eighth-note pairs play long–short at a fixed 2:1 ratio.
  At 96 ticks per beat, the second eighth is played at tick 64, rather than 48.
- Show a swing marking above the staff. Explicit triplets still use brackets and
  a 3; do not rewrite every triplet passage as swung eighth notes.
- Do not add a global Straight/Swing switch that silently changes existing
  lessons. Variable swing ratios and tempo-dependent swing are later work.
- Use one five-line percussion staff with a percussion clef and 4/4 meter.
  Combine instruments on the staff; do not create one staff per lane.
- Show one or two bars at a readable size, depending on density and available
  width. Lessons of up to 16 bars use pages; never shrink a whole lesson to fit.
- Use stable notation positions and a moving playback marker. Include the loop
  position and count-in; keep the existing toolbar and Space transport.
- Keep a small, foldable drum-key legend for learning staff positions.
- Support instrument disabling from either view. Disabled instruments stay
  identifiable and dimmed, and remain excluded from playback and assessment.

## Architecture and data rules

- Use VexFlow for engraving, with SVG output. First verify a small percussion
  example before integrating the library into the application.
- Pin the selected library version; bundle its required runtime, fonts, license,
  and source/version record under `assets/vendor/`. No runtime CDN requirement.
  Report the increase in deployment size. No frontend framework or backend.
- Separate lesson-to-notation conversion from SVG rendering and playback overlay.
  Start with small modules under `src/notation/`; do not introduce a general
  score editor or a new application framework.
- Keep integer performance ticks as the authoritative playback/assessment data.
  Existing lesson notes must retain their exact times and instrument identities.
- Existing version 1 lessons must remain valid and playable. Without explicit
  notation information, render literal rhythms; never guess feel from a title.
- Introduce version 2 only when the notation metadata is needed. Proposed shape:
  the existing lesson fields plus `notation`, containing `feel` and optional
  grouping/voice hints. Finalize and document the exact JSON fields in milestone 2
  using one straight and two swing examples before migrating the catalog.
- Hints reference existing notes by instrument and performance tick. They do not
  define a separate set of playable notes. Validate missing references, duplicate
  references, impossible durations/groups, and inconsistent swing interpretations.
- The derived notation model records written position/duration, voice, instrument,
  and the original performance tick. This supports swung eighths and genuine
  triplets in the same lesson without applying swing twice.
- An expected note's identity includes instrument, performance tick, and loop
  iteration. Preserve this identity through conversion, SVG, and assessment.
- Define one documented staff-position and notehead table for all twelve current
  instruments. Start with conventional upper/lower voices; resolve collisions,
  shared stems, and redundant rests in the converter rather than in lesson timing.
- A renderer error must leave Lanes and practice controls usable, with a clear
  explanation. Do not silently drop unsupported notes or snap arbitrary ticks to
  a convenient notation grid.

## Milestones

| # | Deliverable | Status | User review |
| --- | --- | --- | --- |
| 1 | Static notation proof | accepted | Staff, symbols, spacing, readability |
| 2 | Lesson-to-notation model and feel | planned | Written rhythms and JSON examples |
| 3 | Notation view in the app | planned | View switch, lesson changes, pages, controls |
| 4 | Playback marker and looping | planned | Reading along at several tempos |
| 5 | Timing feedback on notation | planned | Useful feedback without hiding the score |
| 6 | Full lesson coverage and regression checks | planned | Current catalog and difficult patterns |
| 7 | Release and live acceptance | planned | Published app and real-kit practice |

### 1. Static notation proof

Work:
- Add a local preview page with one simple straight groove and Swing 01.
  Preview data stays in development fixtures, outside the production catalog.
- Render percussion clef, 4/4, noteheads, stems, beams, necessary rests, and bar
  lines. Show swing as written eighths with a swing marking.
- Include simultaneous kick/cymbal and snare/cymbal hits and a small legend.
- Establish readable contrast, note size, and spacing on desktop and narrow views.
- Keep the production practice flow unchanged during this proof.

Completion checks:
- SVG renders with bundled assets and no network dependency on a CDN.
- Inspect preview screenshots at desktop and narrow widths; no missing symbols,
  overlapping notes, clipped stems, or unreadable scaling.
- Existing required checks pass; record the pinned version and bundle size.

User review: compare the straight and swing previews with familiar sheet music.
Confirm staff positions, visual style, and whether the notes are comfortable to read.

### 2. Lesson-to-notation model and feel

Work:
- Define and validate the version 2 notation metadata with documented examples.
- Build a deterministic converter from lesson events to bars, voices, notes,
  rests, beams, and tuplets, retaining references to performance events.
- Cover quarters, eighths, sixteenths, and eighth-note triplets first. Include
  empty bars/tracks, simultaneous instruments, and the final note of a bar.
- Extend the preview to read actual lesson JSON. Use Californication, Swing 01,
  and Swing 03 to distinguish straight sixteenths, swing, and explicit triplets.
- Keep version 1 loading and timing behavior intact. Migrate only the reviewed
  examples at this point, with exact before/after event comparisons.

Completion checks:
- Deterministic tests cover written-to-performance correspondence, voice/rest
  durations totaling four beats, grouping, invalid metadata, and ambiguity errors.
- Swung written eighth at tick 48 corresponds to performance tick 64. Existing
  swing note ticks do not move. Explicit triplets remain correctly represented.
- Every source note appears exactly once in the notation model; no invented hits.
- Version 1 tests pass and migrated example playback events match their originals.

User review: inspect the three examples and one small JSON example. Confirm that
the written swing phrases match the supplied scores, particularly Swing 03's
rest followed by two triplet notes. This milestone has a visible preview even
though most work is data conversion.

### 3. Notation view in the app

Work:
- Add a compact Lanes/Notation selector and save the preferred view without
  resetting existing preferences or MIDI configuration.
- Initially show the static score for the selected lesson, with manual bar-page
  navigation. Preserve page position on resize where practical.
- Handle lesson changes, empty tracks, disabled instruments, and all-disabled
  metronome-only practice. Keep instrument toggles available in Notation view.
- Reuse the toolbar, session totals, keyboard focus rules, and Space transport.
- Provide a readable Lanes fallback for conversion/rendering failures.

Completion checks:
- Browser checks cover switching views while stopped and playing, persistence,
  lesson changes, resizing, toggles, and recovery from a rendering failure.
- Switching views does not restart playback or change scheduled notes/assessment.
- Keyboard and simulated MIDI continue to work in both views, at root and subpath.

User review: choose lessons, change pages, resize, disable an instrument, and
switch back to Lanes. Judge notation size and how easy it is to find the controls.

### 4. Playback marker and looping

Work:
- Drive the marker from the existing playback/output clock, including latency
  behavior already used for display. Never schedule audio from animation.
- Map musical time to engraved positions using bar/beat/event anchors. Engraving
  spacing is not uniform, so do not assume the whole bar is linear in pixels.
- Use performance-time anchors for swing, while showing the intended written
  rhythm. Advance score pages at bar boundaries with an upcoming-bar preview.
- Handle count-in, stop, restart, tempo changes, tab hiding, and loop wrap.
- Cache score geometry; animate an overlay rather than re-engraving every frame.

Completion checks:
- Check marker positions before/on/after straight and swung offbeats and explicit
  triplets, including the last beat and four-bar loop boundaries.
- Native-clock browser checks cover several loops, count-in, stop/restart, tempo
  changes, view switching, and delayed animation callbacks.
- Confirm engraving/resize work does not alter playback timing or emit duplicate
  notes. Check the dense Fascination Street pattern for visible stuttering.

User review: follow the score at slow and normal practice tempos. Confirm the
marker feels aligned with the guide/metronome and page changes are easy to follow.

### 5. Timing feedback on notation

Work:
- Apply existing on-time/early/late/missed results to the corresponding noteheads.
  Keep stems, beams, rests, and staff lines legible.
- Handle simultaneous notes independently, including noteheads sharing a stem.
- Represent extra hits with a small transient marker rather than adding written
  notes. Show exact error in milliseconds without shifting the printed rhythm.
- Reset visible feedback per loop iteration; preserve session totals. Support
  delayed events correcting misses and keep disabled instruments dimmed.
- Keep color and a concise text indication available together.

Completion checks:
- Deterministic and browser checks cover early/on-time/late, misses/extras,
  duplicate hits, simultaneous instruments, corrected misses, and loop wrap.
- The same input sequence produces identical assessment results in both views.
- Normal and edge ride notes still count as the same Ride instrument.

User review: deliberately play early, late, skip a note, and add a hit. Confirm
feedback helps while the next notes remain readable. Include a real-kit check.

### 6. Full lesson coverage and regression checks

Work:
- Extend conversion to thirty-second notes and sixteenth-note triplets. Keep
  explicit tuplet groups distinct from the lesson's general feel.
- Review/migrate all current lessons without changing their played note times.
  Add notation hints only where the intended written rhythm requires them.
- Verify toms, both crashes, ride, and all three hi-hat actions, including open
  and closed symbols and pedal position. Provide the corresponding legend.
- Exercise one-, two-, four-, and sixteen-bar lessons using test fixtures for
  cases absent from the production catalog.
- Document supported notation, JSON authoring, limitations, and fallback behavior.
  Ghost-note volume, velocity scoring, and new articulations remain separate work.

Completion checks:
- Run `npm test`, `npm run test:tools`, and `npm run test:browser` with pinned Node.
- Check the generated Pages artifact at `/` and `/rhythm-trainer/`, with bundled
  fonts/assets, recovery behavior, and no browser errors in normal flows.
- Compare scheduled events before/after migration for every lesson. Inspect the
  whole catalog visually; especially Come Undone, Swing 03, and Fascination Street.

User review: practice representative straight and swing lessons, including a
four-bar phrase. Confirm the chosen notation matches the source excerpts.

### 7. Release and live acceptance

Work:
- Resolve accepted review findings; update README and progress records.
- When the user authorizes release, commit/open PR, wait for Actions, merge,
  monitor Pages deployment, and verify the live app in isolated Chrome.
- Verify live view selection, notation assets, lesson loading, playback, and
  feedback. Check a previously visited browser for stale assets; add appropriate
  asset versioning if required by the integration.

Completion checks:
- CI and deployment pass for the actual release commit.
- Live static assets load under the Pages subpath and the catalog is complete.
- User confirms real MPS-850 input, audible timing, view switching, loop/page
  transitions, and reading comfort. Record hardware checks separately from CI.

User review: accept the deployed feature after a real practice session. A passing
simulated MIDI check does not mark physical acceptance complete.

## Deferred work

Score editor/importer, MusicXML, arbitrary meters, variable swing, dynamics,
velocity grading, per-zone cymbal lessons, printing/PDF, accounts, progress
database, and AI/MCP authoring are outside this iteration.

## Progress log

- **2026-11-04 — Plan drafted:** reviewed the current tick-based lesson format,
  strict validation, Track renderer, app playback/assessment integration, and
  Pages packaging. No runtime changes. Next: user reviews this plan; then begin
  milestone 1 only. No milestones are implemented or accepted yet.

- **2026-11-04 — Milestone 1 implementation:** added the local static preview
  at `/scripts/notation-preview.html`, hand-authored straight/Swing 01 fixtures,
  an SVG renderer, a foldable five-instrument legend, and responsive score panels.
  Pinned VexFlow 5.0.0 Bravura bundle (728,171 bytes, 711.1 KiB), with embedded
  fonts, package/license records, font notices, hashes, and reproduction steps.
  Preview scripts/fixtures are development-only; production lessons, input,
  playback, assessment, and settings are unchanged. On narrow screens, score
  panels scroll instead of shrinking symbols. Geometry fixes prevent the pedal
  stem and desktop bar line from clipping. **Automated checks:** `npm ci`, all
  95 JavaScript tests, five Python tests, and twelve browser scenarios pass
  (ten existing practice scenarios and two preview scenarios). Preview checks
  cover bundled font loading, SVG generation, vector bounds, resize, document
  overflow, and local-only requests at root and subpath. Preview files remain
  excluded from the Pages artifact. Desktop (1440×1100) and narrow (390×844)
  screenshots were inspected; music-font text layout boxes contain invisible
  font space, so vector clipping checks inspect actual staves/stems/beams while
  screenshots verify glyph appearance. **User review pending:** open
  `http://localhost:8000/scripts/notation-preview.html`; review notation size,
  noteheads/staff positions, rests, beams, and the swing marking. No playback
  in the preview; no hardware timing claims. Uncommitted and not deployed.
  Next: resolve the user's milestone 1 feedback; do not start milestone 2 yet.

- **2026-11-04 — Milestone 1 accepted:** user approved the preview and authorized
  committing it on a feature branch, then proceeding with milestone 2.
