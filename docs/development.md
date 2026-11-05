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

No automated check verifies physical latency or audible sound quality. Before
release, check the kit/module and browser audio together, simultaneous hits,
several loops, count-in, stop/restart, view switching, latency and reconnect.

## Code map

| Area | Source |
| --- | --- |
| App controls and session coordination | [app.js](../src/app.js), [tempo.js](../src/tempo.js), [volume.js](../src/volume.js) |
| Audio scheduling / recorded sounds | [playback.js](../src/playback.js), [audio.js](../src/audio.js) |
| Timestamp conversion / assessment | [clock.js](../src/clock.js), [assessment.js](../src/assessment.js) |
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
alone do not verify the live release. Latest acceptance is in the
[notation history](history/2026-11-04-notation-plan.md#acceptance).

## Asset sources

Preserve [recording credits/licenses](../assets/drums/README.md) and
[VexFlow/font source records](../assets/vendor/vexflow/README.md) beside the assets.
Recordings load before scheduling; failure stops Start with a retry message.
The synthesized metronome is retained; guide drums have no synthesized fallback.
Optional recording regeneration is `python3 scripts/prepare_samples.py`, using
Python's standard library and macOS `afconvert`. Neither is needed at app runtime.
