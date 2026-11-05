# Development

The app is static HTML/CSS and small JavaScript ES modules. Python's standard
library serves files, discovers lesson JSON and packages the site; no Python
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
views share the assessment. Notation caches engraving and keeps six rows of
independent loop copies. Layout fits one to three bars per row from width and
rhythmic density; each bar's staff reaches its SVG edges to join its neighbors.
Only changed results refresh noteheads/summaries.
Animation moves the marker/score and expires extra-hit overlays. Session history
remains in memory until reset; the bounded sheet does not bound assessment history.

## Packaging and release

`npm run build` validates lessons and recreates `_site/`. The ignored
`generated/lesson-catalog.js` and `_site/` are outputs, never hand-edited sources.
Only runtime files and asset notices are packaged; project docs/tools/tests are
excluded. There is no JavaScript compilation step.

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
