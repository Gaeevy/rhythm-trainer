# Development

The app is static HTML/CSS and small JavaScript ES modules. Python's standard
library serves files, discovers lesson JSON recursively and packages the site; no Python
virtual environment or external service is needed. Audio scheduling, timestamps,
assessment and animation stay in the browser. Keep this architecture unless a
new requirement needs something else.

## Setup

Run `python3 scripts/site.py` and open localhost in Chrome. Use Ctrl+C to stop.
For development checks, install/initialize [fnm](https://github.com/Schniz/fnm)
and use the Node version in [`.node-version`](../.node-version):

```sh
fnm install
fnm use
npm ci
```

Chrome must be installed for browser checks. Playwright is a development dependency;
the app has no npm runtime dependencies and uses no CDN.

## Checks

```sh
npm test
npm run test:tools
npm run test:browser
```

- Node tests cover validation, clocks, matching, loop boundaries, playback,
  notation conversion, settings, MIDI and recorded audio behavior.
- Python tests cover discovery, live catalog refresh, errors and packaging.
- Browser checks build/serve the actual Pages artifact at `/` and
  `/rhythm-trainer/`. They use disposable Chrome profiles and simulated MIDI,
  not the user's browser profile or physical kit. Native audio clocks/timers
  remain active. Checks cover the catalog, subdivisions, full kit, feedback,
  bounded score repetition, resize, cached assets and failure recovery.

[`scripts/browser-smoke.mjs`](../scripts/browser-smoke.mjs) is the browser runner.
Scenarios live under [`scripts/browser/`](../scripts/browser/): `lessons.mjs`
(catalog, menu and release cache), `transport.mjs` (practice, tracks and loading
recovery), `midi.mjs`, `notation.mjs` (view, lifecycle, following and layout),
`notation-feedback.mjs`, `toolbar.mjs` and `analytics.mjs`. Shared page/input/clock helpers are
in `helpers.mjs`; `server.mjs` serves the packaged artifact. Keep test clocks
and simulated MIDI there rather than duplicating setup in scenarios.

For focused checks, append `-- --polish-only`, `-- --analytics-only`,
`-- --cleanup-only`, `-- --notehead-motion-only`,
`-- --notation-feedback-only`, `-- --lesson-menu-only` or
`-- --notation-coverage` to `npm run test:browser`. Every mode runs at both
mounts. The full command remains the release check.

Browser timing assertions allow 0.25 ms between the separately sampled native
output-clock anchors used to create and handle a simulated hit. Deterministic
clock-conversion unit tests retain exact numeric checks. This sampling allowance
is test-only; it does not change the app's on-time tolerance or hit timestamps.

No automated check verifies physical latency or audible sound quality. Before
release, check the kit/module and browser audio together, simultaneous hits,
several loops, count-in, stop/restart, view switching, latency and reconnect.

## Code map

| Area | Source |
| --- | --- |
| App controls and session coordination | [app.js](../src/app.js), [tempo.js](../src/tempo.js), [volume.js](../src/volume.js), [slider-keys.js](../src/slider-keys.js) |
| Audio scheduling / recorded sounds | [playback.js](../src/playback.js), [audio.js](../src/audio.js) |
| Timestamp conversion / assessment | [clock.js](../src/clock.js), [assessment.js](../src/assessment.js) |
| Analytics calculations / scores panel | [analytics.js](../src/analytics.js), [analytics-view.js](../src/analytics-view.js) |
| Keyboard / fixed-kit MIDI | [input.js](../src/input.js), [midi.js](../src/midi.js), [kit profile](../config/drumkits/mps-850.json) |
| Dynamic lanes / saved controls | [track.js](../src/track.js), [practice-settings.js](../src/practice-settings.js) |
| Lesson validation / notation model | [lesson.js](../src/lesson.js), [model.js](../src/notation/model.js) |
| Engraving / displayed bars / following | [renderer.js](../src/notation/renderer.js), [bar.js](../src/notation/bar.js), [view.js](../src/notation/view.js) |
| Shared facts | [instruments.js](../src/instruments.js), [music-time.js](../src/music-time.js) |
| Server, catalog and package | [site.py](../scripts/site.py) |

The Web Audio clock schedules playback. Original event timestamps are converted
to that time base for matching; animation never determines hit timing. Both
views share the assessment. Notation follows the [layout policy below](#notation-layout).
It caches engraving and keeps six rows of
independent loop copies. Layout fits one to three bars per row from width and
rhythmic density; each bar's staff reaches its SVG edges to join its neighbors.
An opaque 1.8px end-of-bar line makes each boundary clear.
Only changed results refresh noteheads/summaries.
Animation moves the marker/score and expires extra-hit overlays. Session history
remains in memory until reset; the bounded sheet does not bound assessment history.

`NotationView.resetSession()` clears session feedback and displayed bars while
retaining cached engraving. `clearBars()` only clears displayed geometry; lesson
and viewport changes invalidate engraving explicitly. Instrument toggles refresh
feedback without invalidating engraving. The folded drum key is rendered by
`showDrumKey()` only when open, reused across view/open-close changes and rebuilt
when the lesson changes. Failed key loading can be retried by closing/reopening.

`app.js` uses one `loadLesson()` path for fetching, validation and installation.
Its request counter guards late successes, errors and cleanup; a failed load
keeps the previous lesson available. `bindSliderKeys()` shares only keyboard
stepping in displayed units (arrows ±1, Page ±10, Home/End limits). BPM and volume
retain their own scale conversions, persistence and playback behavior.

## Practice analytics

The analytics feature ([history](history/2026-11-06-practice-analytics.md)) shows
overall, per-pad and consistency scores/trends.
Overall uses the 70/30 blend; when the enabled lesson has no simultaneous groups
it uses pads only and hides consistency. Session totals are folded below it.
The minimal UI labels overall as “Score”, uses large numeric outputs and separates
pad rows with a divider. Formula, complete-group counts and bar-progress text
are omitted from the DOM, not merely hidden. Trend descriptions remain available
on hover and to screen readers; calculations and no-data rules are unchanged.

At viewport widths of at least 1600 px, `.practice-body` uses a score/Lanes column
and a 300 px analytics sidebar. The page maximum width expands to 1840 px, leaving
over 1100 px for the practice view at the breakpoint. Below it, the same analytics
DOM stays below the full-width view. The top toolbar and folded setup sections
remain outside the columns. CSS controls placement; no reparenting or saved layout
setting. The existing notation ResizeObserver handles column/width changes and
`sheetColumns()` still fits bars according to rhythmic density.

`scorePractice(assessment, completedBars)` in [analytics.js](../src/analytics.js)
returns raw 0–100 overall/per-pad/consistency scores plus historical references,
changes and trends. It reads enabled tracks, canonical expected-note results
and extras from Assessment. Gaussian quality uses fixed widths of 50 ms for
timing and 25 ms for simultaneous-hit spread. Weighted opportunities include
misses and extras; the blend is 70% pads/30% consistency, or 100% pads when the
enabled lesson has no simultaneous groups. Missing samples are `null`, not zero.

The half-life is 8 bars; trends compare with all completed bars except the last
8 and require at least 16 completed bars. Changes of at least 3 points are up/down;
smaller changes are neutral. All math keeps full precision. See
[deterministic examples](../test/analytics.test.js).

```text
quality = exp(-0.5 * (errorMs / widthMs)**2)
weight = 2 ** (-barAge / 8)
pad score = 100 * sum(weight * quality) / sum(weight * opportunities)
overall = 0.70 * pooled pad score + 0.30 * consistency score
```

Consistency applies the same quality function to simultaneous-hit spread, one
opportunity per group. Missing members receive zero group quality. Pad pooling
uses weighted opportunities, not an equal average of rounded pad scores. No
simultaneous groups means 100% pads. The visual on-time category is independent
of continuous quality; a near-center on-time hit need not receive exactly 100.

`barClosingDelay()` caches a conservative lesson-wide delay for late windows that
cross a bar end (zero when none do). `completedBarCount()` uses elapsed audio
time, this delay and the assessment's latency offset; it preserves the inclusive
late-window boundary. Assessment advances before rendering scores. The projection
rejects absent expected results; it never advances time, matches input or finalizes
misses. Recomputing incorporates delayed timestamped miss corrections.

`app.js` sends each assessment result through one `showFeedback()` helper to
Lanes, Notation and analytics. `resultBar()` assigns matched/missed results to
their expected bar and extras to corrected input time, shared with score assembly.
`AnalyticsView.onResult()` marks a snapshot dirty only for a result in an already
completed bar. New/unfinished-bar hits and misses wait for bar completion.
Assessment identity and completed-bar changes also refresh the snapshot.
Unchanged frames and unfinished-bar input do no history projection or analytics
DOM writes; delayed corrections/extras in completed bars update immediately.
Work still scales with session length at refresh points. No parallel matcher,
hit recorder or per-bar cache was introduced.
Stop freezes the elapsed time/results; Start and lesson/track changes reset.
Volume/mute/view changes preserve the same assessment. The panel shows enabled
lesson instruments only. No stored analytics or new settings.

The report exposes only overall, individual pads and consistency. Pooled pad
quality stays internal to the blend; unused group-count and repeated bar-count
outputs were removed. A missing member makes group quality zero, while a delayed
correction can complete it. An eligible group scheduled in a later bar does not
earn invented credit: consistency and overall stay empty until a group has been
finalized.

## Notehead timing feedback

This is display-only feedback, independent of the layout policy below.
`noteheadShift()` in [feedback.js](../src/notation/feedback.js) reads the existing
matched result: early is negative X, late positive X, on time zero. It magnifies
signed error at 0.175 px/ms, capped at 9 px and 20% of the nearest static
engraving-anchor gap, also bounded by half the clearance to the glyph's SVG
edges. The displacement is a visual cue, not a new time axis or assessment
tolerance. These values halve both the earlier sensitivity and its
spacing/edge caps. Unplayed/disabled notes remain at zero; misses have no
horizontal displacement.

[bar.js](../src/notation/bar.js) wraps each cloned notehead in an SVG group and
translates only that wrapper. VexFlow transforms, stems, beams, original marker
anchors and cached templates stay unchanged. Each hit/loop copy keeps its own
offset. Only changed feedback writes the transform. Mild timing errors slide for
180 ms. `timingSeverity()` selects severe errors above max(60 ms, twice the
on-time tolerance), only for matched early/late hits. A newly displayed severe
result gets one 320 ms horizontal settling animation, staying between zero and
the existing capped final shift, then holding that shift. CSS reads the same
shift from `--notehead-shift`; no overshoot, extra wrappers or JS timers.
This presentation rule never changes Gaussian scoring or input assessment.
Waiting/disabled resets snap to zero; reduced-motion preferences disable the
transition/settling while retaining the spatial feedback. Historical severe
results reconstructed on resize/view changes keep their offset without replay.
Existing colors and tooltips
remain, with no new visible labels or markers.

A newly missed displayed head gets one 280 ms vertical shake (±2 px), then
stays at its original position at 55% opacity. `bar.js` adds the `is-new-miss`
class only when an existing displayed head becomes missed; restored historical
misses are dim without replaying the shake. The CSS animation runs once, without
JS timers. A corrected miss removes the class, restores full opacity and uses
the matched horizontal offset. Reduced motion keeps static dimming only.

[Notation feedback tests](../test/notation-feedback.test.js) cover sign, scale,
caps, independent hits/loops, correction and read-only projection. Browser checks
measure actual SVG displacement, fixed shared stems/beams, future copies,
keyboard/MIDI, resize/view changes, stop/restart and reduced motion.

Extra hits use hollow SVG ellipses in each bar's overlay, without stems or beams.
`extraPosition()` retains the corrected input time; `markerX()` maps its precise
tick to the engraving anchors. The renderer exposes `staffYs` for all
instruments, resolved through VexFlow on the same stave using `DRUM_KEY`, so
extras share printed note positions even when that instrument has no notes in
the bar. This does not add notes to the engraving model or affect assessment.
The existing bounded overlay lifetime remains 900 ms (six recent extras total,
three per bar); CSS fades each head until removal by the existing update loop.
Live overlay nodes are retained when another extra arrives, preserving their
fade. Reconstruction uses the remaining lifetime. Reduced motion disables the
fade, while Stop/reset removes overlays as before.

## Notation layout

**One policy, one entry point:** `lessonNotation()` in
[model.js](../src/notation/model.js) selects the layout for the entire lesson.
A notation *voice* groups notes/rests with shared stems and beams; it is not an
audio channel or a lesson track. [renderer.js](../src/notation/renderer.js)
engraves the selected model and does not choose a layout.

`convertLesson()` has three internal strategies, not public lesson settings:

| Internal options | Result | Used when |
| --- | --- | --- |
| Default `{}` | Cymbals up; drums/pedal down | Always tried first |
| `{separateTuplets: true}` | Hinted instruments get independent voices | Default conversion has incompatible grids; return this result directly |
| `{combine: true}` | One downward-stem voice with shared beams | Default succeeds and every played cymbal note is an eighth note or shorter |

Keep the combined candidate only if it converts successfully and its total rest
count is no greater than the separate model. Otherwise retain the separate
model. A played quarter-note cymbal anywhere protects the whole lesson from
combining. Silent rests do not count as played cymbal notes. The flags are
alternative strategies; never enable both together.

The combined voice uses downward stems and lighter stems/beams, leaving
noteheads and bar lines dark. The renderer marks the already selected layout
on the SVG; CSS styles it. Separate voices keep upward cymbal and downward
drum stems; the 3 px beam thickness applies to both layouts.
This adds no new selection rule or lesson option.

This deliberately keeps Fascination Street compact (zero rests instead of 35)
and swing exercise 7's ride quarter separate from its offbeat snare. The same
quarter-ride protection applies to Straight lessons. Folder, title and feel do
not select layouts; feel only determines written/performed rhythm conversion.
There are no per-song exceptions, layout options in JSON, or saved voice-grouping
preferences. Keep future changes here rather than adding decisions to the
renderer, UI or individual lesson files.

Every strategy preserves original performance ticks and each note identity.
Only `NotationError` permits a fallback; other errors propagate. If no valid
notation can be produced, the existing Lanes fallback remains available.
Regression cases live in [notation.test.js](../test/notation.test.js): dense
songs/rest counts, Swing and Straight quarter-ride protection, incompatible
grids, tuplets and identity preservation. Browser coverage checks rendering,
feedback and score-following across the catalog at both site mounts.

### Durations and beams

After choosing the subdivision grid, `convertLesson()` emits the longest aligned
binary note/rest value that fits before the next hit, within the current beat
or half-beat section. For example, onsets at ticks 0/48/72 become an eighth and
two sixteenths in one beam group, rather than four sixteenth slots with a rest.
No event is skipped. Leading gaps remain rests; there are no dotted values,
ties or extensions across a beat. Explicit triplet slots are never compacted.
This is duration spelling inside the converter, not another layout strategy.

Beam groups still follow beats/tuplets. The renderer uses VexFlow's existing
`beamWidth` setting at 3 px for both shared and separate voices; no library
patch or new render option is exposed to lessons/users.

## Packaging and release

`npm run build` validates lessons and recreates `_site/`. The ignored
`generated/lesson-catalog.js` and `_site/` are outputs, never hand-edited sources.
Only runtime files and asset notices are packaged; project docs/tools/tests are
excluded. There is no JavaScript compilation step.

The generated catalog records stable filename IDs, relative JSON paths and
folder group names. IDs must be unique across folders; moving a file keeps
saved preferences. A small [LessonPicker](../src/lesson-picker.js) uses a native popover with
folder flyouts, keyboard navigation and touch controls. Browsing does not
change playback; choosing a lesson uses the existing loading/reset path.

The generated index points to `runtime/<content-hash>/` through a relative base
URL. CSS, modules, lessons/catalog, config, recordings and notation assets share
one release path. New HTML cannot mix old cached runtime assets. Local serving
disables caching; a cached HTML document still needs normal revalidation.

The [Pages workflow](../.github/workflows/pages.yml) checks pull requests and
pushes to `main`. Successful `main` runs deploy `_site/` to
[GitHub Pages](https://gaeevy.github.io/rhythm-trainer/). After release approval,
commit/open a PR, wait for checks, merge, wait for Pages, then verify the live
lesson list, notation assets, keyboard/MIDI flow, mixer and console. Local checks
alone do not verify the live release. Merged PRs and Actions runs record release
checks; [dated history](history/README.md) records the major delivery decisions.

README screenshots live in `docs/images/` and are excluded from the runtime
package with the other docs. They show the actual app with simulated demo input,
captured through a disposable browser profile. Refresh them after major UI changes.

## Asset sources

Preserve [recording credits/licenses](../assets/drums/README.md) and
[VexFlow/font source records](../assets/vendor/vexflow/README.md) beside the assets.
Recordings load before scheduling; failure stops Start with a retry message.
The synthesized metronome is retained; guide drums have no synthesized fallback.
Optional recording regeneration is `python3 scripts/prepare_samples.py`, using
Python's standard library and macOS `afconvert`. Neither is needed at app runtime.
