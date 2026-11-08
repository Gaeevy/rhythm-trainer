# Development

Static HTML/CSS and JavaScript ES modules run the app. Python's standard library
serves files, discovers lessons and packages GitHub Pages assets.

## Setup

Run `python3 scripts/site.py` and open localhost in Chrome. Stop with Ctrl+C.
For checks, initialize [fnm](https://github.com/Schniz/fnm) and use the pinned Node:

```sh
fnm install
fnm use
npm ci
```

Chrome is required for Playwright browser checks. npm dependencies are development tools.

## Checks

```sh
npm test
npm run test:tools
npm run test:browser
```

Node tests cover data, timing, assessment, audio, notation and settings. Python
tests cover discovery/packaging. Browser checks serve the Pages artifact at `/`
and `/rhythm-trainer/`, using disposable Chrome profiles and simulated MIDI.
They retain native audio clocks/timers. Physical checks are listed in
[Practice](practice.md#timing-and-saved-settings).

The [browser runner](../scripts/browser-smoke.mjs) loads scenarios from
[`scripts/browser/`](../scripts/browser/). Shared input/clock/setup helpers live
in `helpers.mjs`; `server.mjs` serves the artifact. Focused checks append
`-- --polish-only`, `-- --analytics-only`, `-- --cleanup-only`,
`-- --notehead-motion-only`, `-- --notation-feedback-only`,
`-- --lesson-menu-only` or `-- --notation-coverage` to `npm run test:browser`.
All modes check both mounts; the full suite is the release check.

Browser assertions allow 0.25 ms for separately sampled native output-clock
anchors. Clock-conversion unit tests use exact values. This allowance belongs
only to the tests; assessment retains the original timestamps and tolerances.

## Code map

| Area | Source |
| --- | --- |
| Controls / session coordination | [app.js](../src/app.js), [lesson-picker.js](../src/lesson-picker.js), [tempo.js](../src/tempo.js), [volume.js](../src/volume.js), [slider-keys.js](../src/slider-keys.js) |
| Audio scheduling / recordings | [playback.js](../src/playback.js), [audio.js](../src/audio.js) |
| Input timestamps / assessment | [clock.js](../src/clock.js), [assessment.js](../src/assessment.js) |
| Scores / panel | [analytics.js](../src/analytics.js), [analytics-view.js](../src/analytics-view.js) |
| Keyboard / MIDI | [input.js](../src/input.js), [midi.js](../src/midi.js), [kit profile](../config/drumkits/mps-850.json) |
| Lanes / saved controls | [track.js](../src/track.js), [practice-settings.js](../src/practice-settings.js) |
| Lesson validation / notation conversion | [lesson.js](../src/lesson.js), [model.js](../src/notation/model.js) |
| Engraving / displayed bars / following | [renderer.js](../src/notation/renderer.js), [bar.js](../src/notation/bar.js), [view.js](../src/notation/view.js) |
| Labels / timing constants | [instruments.js](../src/instruments.js), [music-time.js](../src/music-time.js) |
| Server / catalog / packaging | [site.py](../scripts/site.py) |

The Web Audio clock schedules playback. Original input timestamps convert to
that clock for assessment. Both views and analytics consume the same results.
`loadLesson()` guards asynchronous success, failure and cleanup with a request
counter, so stale requests cannot replace the active lesson or its controls.
Its `finally` block refreshes lesson navigation after loading succeeds or fails.

`NotationView` caches engraving and retains six rows of independent bar copies.
`resetSession()` clears feedback/displayed bars while retaining templates;
`clearBars()` clears displayed geometry. Lesson/viewport changes invalidate
engraving; instrument toggles refresh feedback. The Drum key loads when opened
and is reused until the lesson changes; closing/reopening retries a failed load.
Session history remains in memory even as older displayed rows are recycled.

## Practice analytics

[Scoring](../src/analytics.js) projects canonical assessment results using full
precision; [Practice](practice.md#scores-and-trends) explains the displayed scores.

```text
quality = exp(-0.5 * (errorMs / widthMs)**2)
weight = 2 ** (-barAge / 8)
pad score = 100 * sum(weight * quality) / sum(weight * opportunities)
overall = 0.70 * pooled pad score + 0.30 * consistency score
```

Timing width is 50 ms; consistency uses simultaneous-hit spread with width 25 ms.
Misses/extras contribute zero quality; an incomplete group contributes zero
consistency. Pads pool by weighted opportunities. Without simultaneous groups,
overall uses pads only. Missing samples are `null`; overall waits for the first
eligible group to finalize. The visual on-time band is independent of quality.
Trends compare against the history excluding the last eight bars, require 16
completed bars and use a ±3-point threshold.

`completedBarCount()` uses elapsed audio time, latency offset and a cached
`barClosingDelay()` for late windows crossing bar ends, with an inclusive late
boundary. Advance assessment before computing scores. `resultBar()` assigns
matched/missed results to their expected bar and extras to corrected input time.
`AnalyticsView` refreshes on assessment/bar changes or corrections in completed
bars. Unfinished-bar input waits for completion. Projection work scales with
session length at refresh points. [Tests](../test/analytics.test.js) cover these
boundaries and weighted examples.

## Notehead timing feedback

[bar.js](../src/notation/bar.js) translates an SVG wrapper around each cloned
notehead, preserving VexFlow transforms, stems/beams, anchors and cached templates.
Each displayed bar copy owns its feedback. Only changed results update the DOM.
The visual offset is bounded by engraving gaps and SVG edges; it never feeds
back into timing or scoring. Scale/caps live in [feedback.js](../src/notation/feedback.js)
and `bar.js`; animation values live in [style.css](../style.css).

Severe and missed animations run once for newly displayed results. Reconstructed
historical feedback retains its final appearance without replay. A delayed
correction cancels missed styling. Reduced motion preserves static feedback.
Extras map corrected hit times through `markerX()` and use VexFlow-derived
`staffYs`, including instruments silent in that bar. Retain live overlay nodes
when adding extras so their fades continue; reconstruction uses remaining lifetime.
The update loop bounds overlays to six recent extras total, three per bar.
[Feedback tests](../test/notation-feedback.test.js) and browser scenarios cover
independent offsets, fixed stems, corrections, reconstruction and reduced motion.

## Notation layout

`lessonNotation()` in [model.js](../src/notation/model.js) selects one layout for
the whole lesson. A *voice* groups notes/rests with shared stems and beams.
The renderer engraves the selected model.

| `convertLesson()` strategy | Result | Selection |
| --- | --- | --- |
| Default `{}` | Cymbals up; drums/pedal down | Try first |
| `{separateTuplets: true}` | Hinted instruments use independent voices | Default grids conflict; return this result directly |
| `{combine: true}` | One downward-stem voice | Default succeeds and all played cymbal notes are eighths or shorter |

Keep a combined candidate only if it converts and adds no rests. A played
quarter-note cymbal anywhere protects the entire lesson from combining, keeping
ride and offbeat snare rhythms independent. Silent rests do not trigger that
protection. The flags are alternatives. Layout depends on rhythm; keep policy
in `lessonNotation()` and avoid per-song or renderer-level decisions.

Every strategy preserves original performance ticks and note identities.
Only `NotationError` permits fallback; other errors propagate. Unsupported
notation leaves Lanes available. [Regression tests](../test/notation.test.js)
cover dense grooves, quarter-ride protection in both feels, incompatible grids,
tuplets and identity preservation.

### Durations and beams

`convertLesson()` emits the longest aligned binary value before the next hit,
within the current beat/half-beat section. Onsets at 0/48/72 become an eighth and
two sixteenths in one beam group. Leading gaps remain rests; explicit triplet
slots stay literal. Aligned quarter rests compact to half/bar rests. Durations
never extend across a beat. This spelling keeps mixed rhythms readable without
artificial subdivision rests or altered hits. Beams group by beat/tuplet; shared
voices use lighter downward stems/beams. VexFlow's `beamWidth` sets thickness.

## Packaging and release

`npm run build` validates lessons and recreates `_site/`. It packages runtime
assets and notices. `generated/lesson-catalog.js` and `_site/` are ignored outputs.
Catalog IDs, folder order and JSON authoring are defined in [Lessons](lessons.md).

The generated index uses a relative base URL to `runtime/<content-hash>/`.
All runtime assets share that path, preventing new HTML from mixing cached
assets from another release. Local serving disables caching; cached HTML still
requires normal revalidation.

The [Pages workflow](../.github/workflows/pages.yml) checks PRs and deploys
successful `main` builds. After release approval: commit/push, open a PR, wait
for checks, merge, wait for Pages, then verify the live lesson list, notation,
keyboard/MIDI, mixer and console. Record verification in the PR or handoff.
README screenshots in `docs/images/` show simulated input in the actual app;
refresh them after major UI changes.

## Asset sources

Keep [recording credits/licenses](../assets/drums/README.md) and
[VexFlow/font sources](../assets/vendor/vexflow/README.md) beside their assets.
Guide recordings load/decode before scheduling; failure leaves Start stopped
with a retryable error. Preserve metronome synthesis, hi-hat choking and cancellation.
Optional regeneration uses `python3 scripts/prepare_samples.py`, Python's standard
library and macOS `afconvert`.
