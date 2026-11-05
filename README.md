# Rhythm Trainer

A static drum-practice app for the **Millenium MPS-850**, using Chrome on macOS.
Lessons loop with scrolling instrument lanes, recorded guide drums, a metronome,
and early/on-time/late feedback. No account or backend is required. A small Python
script generates the lesson list and packages the static files for deployment.

See [mvp.md](mvp.md) for scope and verification status, and [AGENTS.md](AGENTS.md)
for development instructions. Local changes are not published until pushed.

Standard drum notation is ready for **local review**. Its implementation and
acceptance record is in [notation-plan.md](notation-plan.md). The final changes
are uncommitted and undeployed, as requested.

Choose **Lanes / Notation** below the lesson title. Lanes is the default; your
chosen view saves in this browser without resetting practice controls or keys.
Both views use the same lesson, audio clock, input, assessment, and session totals.
Switching views keeps playback running. Space starts/stops when the score has
focus. Instrument buttons stop/reset practice; disabled noteheads stay gray.

Notation is a vertically scrolling, repeating score. Desktop shows two bars per
row, in their original order; narrow screens show one. A two-bar lesson stays
bars 1/2 on each row, with its next loop below. The marker follows the existing
audio clock and the score moves down gradually. It continues indefinitely with
six rows in memory; older rows leave above the viewport without moving the
visible music. Each row labels its loop/bar. Clefs appear at row starts; 4/4
appears at the beginning. Engraving is cached, with separate notehead bindings
for each displayed loop. Audio scheduling remains independent of animation.

Arrows browse bars while stopped. Count-in keeps the first row with the marker
hidden; Stop preserves the position/results; Start returns to loop 1/bar 1.
Narrow scores scroll horizontally as needed to retain readable symbols.
Compatible drum rhythms use one voice with shared stems. Simultaneous snare and
bass heads align vertically; separate snare/kick rests are unnecessary while
another drum plays. Rests remain where the combined rhythm needs silence (for
example, Come Undone's middle sixteenth-triplet slot). Independent voices remain
a fallback for incompatible simultaneous grids. Durations describe reading rhythm,
not how long a drum recording sustains. Performance ticks are unchanged.

Individual noteheads show on time (green), early (blue), late (amber), or missed
(red). Shared stems/beams stay legible. The text below the score and notehead
hover text show the instrument/result and matched error to 0.1 ms. Measured error
retains full precision. Extra hits appear briefly as purple + markers below the
staff at their precise time; they do not add written notes. Each repeated bar has its own loop feedback; previous rows retain their results
while the next loop starts fresh and totals accumulate. Delayed hits can correct misses, and both ride
MIDI notes count as Ride.

All nine current lessons have version 2 metadata, including Come Undone's
sixteenth-note triplets. Their performance ticks are unchanged. The foldable
**Drum key** explains the staff positions for the lesson's instruments. Hi-hat
open uses a circle, closed uses + at the start of a bar and after an open hit,
and pedal uses an X below the staff. Other closed notes retain plain X heads.
Unsupported rhythms or renderer failures keep Lanes available with an explanation
and retry. Notes are never rounded or silently dropped.

The renderer/fonts load locally only when Notation is selected, adding about
711 KiB plus notices. No CDN is required.
[Version, licenses, hashes, and reproduction](assets/vendor/vexflow/README.md).
[Version 2 format](notation-format.md) covers supported rhythms and authoring.
The main app is also the notation review surface; the separate static preview
has been removed. `npm run test:browser` checks actual app engraving and playback
at root and the Pages subpath.

For a local practice check, start [localhost:8000](http://localhost:8000) and choose
**Notation**:

1. **Come Undone:** compare its shared stems and single necessary rest with the
   supplied Guitar Pro example. No separate snare/kick rests remain.
2. **Swing 03, bar 2:** compare the written swung eighths with the explicit snare
   triplet. Follow several two-bar loops: the bars stay left/right in each row,
   with the next loop below. Also try four-bar **Fascination Street**.
3. Play early/late, miss a note, add a hit, and try simultaneous ride/snare.
   Check the next loop clears colors while totals remain, then compare Lanes.
4. Check count-in, stop/restart, resizing, disabling instruments, and reloading.
   Confirm marker/audio alignment and reading comfort with the real MPS-850.
   Check that simultaneous snare/bass heads align and colors remain independent.

Real-kit/audio routing, physical latency, and final release acceptance remain
pending. Automated simulated MIDI does not replace a practice session.

## Run locally

From the repository folder:

```sh
python3 scripts/site.py
```

Open [localhost:8000](http://localhost:8000) in Chrome. Use HTTP rather than opening
`index.html` directly. Stop the server with Ctrl+C.

Choose a lesson and press **Start loop** or **Space**. The top row contains the
lesson dropdown, BPM, metronome volume, guide volume, and Start/Stop. Speaker
icons mute each audio bus. Settings panels contain count-in, timing controls,
keyboard bindings, and MIDI status. Controls wrap on narrow screens.

**− / +** disables/enables an instrument's track. Disabled lanes stay dimmed;
they produce no guide sound, scored hits, or misses. Disabling every track gives
metronome-only practice. Changing tracks stops and clears the session.

Changing BPM, count-in, timing settings, keys, or lesson stops playback. Start
begins a new session; Stop freezes totals. Volume/mute changes keep the loop
running. Hiding the tab, an audio interruption, or losing a MIDI input stops the
loop. Reconnecting MIDI does not restart playback.

## MPS-850 MIDI

Connect the module's **USB MIDI** port to the Mac. The app automatically requests
MIDI access and listens to **all connected inputs as MPS-850 inputs**, using
[the repository config](config/drumkits/mps-850.json). Chrome may require a
first-time permission approval. **Enable / retry MIDI** is available after a
permission or connection error. MIDI requires localhost or HTTPS.

There is no device selector, MIDI Learn, browser mapping store, profile apply,
or config import/export. Edit the repository config to change mappings. Old
browser MIDI mappings are ignored; they cannot override the config. Newly
connected inputs attach automatically. Busy ports report an error and can retry.

Basic mappings observed on this kit, all on **channel 10**:

| Instrument | MIDI note |
| --- | ---: |
| Kick | 36 |
| Snare | 38 |
| Hi-hat closed | 42 |
| Hi-hat open | 46 |
| Hi-hat pedal chick | 44 |
| Tom 1 / 2 / 3 / 4 | 48 / 45 / 43 / 41 |
| Crash 1 / 2 | 49 / 57 |
| Ride (normal / edge) | 51 / 59 |

These verify the user's basic pad mappings, not universal factory settings or
end-to-end latency. Normal ride D♯2 (51) and edge B2 (59) both count as
**Ride**, with the same timing assessment. Rims and separately scored cymbal
articulations are excluded.
Only nonzero-velocity Note On is scored. Note Off, controllers, aftertouch, clocks,
and unmapped notes do not create hits. The MIDI panel monitors the last Note On.

USB MIDI carries events, not the kit's audio. Your own playing sounds through
the module; browser guide drums play expected lesson notes. Use an audio setup
that lets you hear both. The app does not play a second sound for your own hits.

## Keyboard, timing, and saved settings

Default keys: **D** kick, **F** snare, **J** closed hi-hat, **K** ride, **U** open
hi-hat, **H** pedal chick, **Q/W/E/R** Tom 1–4, **A/S** Crash 1–2. **Space** is
reserved for start/stop. Keyboard setup can remap letters/digits; occupied keys
swap assignments. Held keys, browser shortcuts, and typing in controls are ignored.

Closed, open, and pedal hi-hat tracks are distinct. A stick hit cannot satisfy a
pedal note. The swing lessons use pedal chick; closed stick hits have their own
track. Lane count and order follow the lesson.

On-time tolerance defaults to **±30 ms**. Matching allows up to **±150 ms**,
limited by the midpoint to neighboring notes on the same instrument, including
across loops. Midpoint ties belong to the earlier note. Each expected note matches
once; duplicate hits are extra. Misses are counted when their late window closes.
A delayed event can correct a miss using its original timestamp. Errors remain
precise; the app does not quantize hits to musical ticks.

Positive latency offset subtracts milliseconds from hit times; negative adds them.
Practice settings opens automatically if a timing field is invalid. The summary
shows counts, mean absolute matched-hit error, time excluding count-in, and loops.

Practice preferences save in browser local storage: keys, disabled instruments,
count-in, tolerance, latency, volume/mute, last lesson, and per-lesson tempo.
**Use lesson tempo** clears its override. Playback supports 20–300 BPM, including
fractions; lesson tempos outside the range are limited with a status message.
Storage failure does not block practice. Old generic hi-hat preferences migrate
to closed hi-hat; custom controls are preserved. Localhost and the live site have
separate storage. Activity totals are not stored or sent to a server.

## Guide recordings

Twelve local acoustic recordings from **Karoryfer Big Rusty Drums**, under CC0,
load once on first Start (about **1.8 MiB**). The metronome retains its synthesized
sound. Closing the guide hi-hat cuts off an open recording at the scheduled time.
Guide drums use recordings only. If a recording fails to load or decode, playback
stays stopped with an error; press Start to retry after fixing the connection.
No substitute drum sounds are played. The metronome's sound is unchanged.
Stop during loading cannot start a delayed loop. Listening balance still needs
user review.

[Credits, license, source revision, and preparation details](assets/drums/README.md)
are included with the assets. The optional macOS regeneration command is:

```sh
python3 scripts/prepare_samples.py
```

Regeneration uses Python's standard library and macOS `afconvert`. Running the
app needs neither audio conversion nor extra Python packages.

## Swing lessons

- **Swing ride and hi-hat:** ride pattern and pedal chick on beats 2 and 4.
- **Swing 01: kick quarters and snare:** the first supplied notation, one looping
  4/4 bar at 80 BPM. Kick on beats 1–4; pedal chick on 2 and 4; snare on beat 1
  and the last eighth-note triplet of beat 2. Ride plays on 1, 2, the last triplet
  of 2, 3, 4, and the last triplet of 4.

- **Swing 02: two-bar snare phrase:** same ride, kick, and pedal pattern in both
  bars at 80 BPM. Snare on beat 1 and the swung “and” of 2 in both bars, plus
  the swung “and” of 3 in bar 2.

- **Swing 03: snare triplet pair:** two bars at 80 BPM. Same accompaniment;
  snare on beat 1 and the swung “and” of 2 in both bars, plus the middle and
  last triplets of beat 3 in bar 2.
- **Swing 04: offbeat snare response:** two bars at 80 BPM. Same accompaniment;
  snare on beat 1 and the swung “and” of 2 in bar 1, then the swung “and”
  of beats 1 and 2 in bar 2.

The old straight, mixed-subdivision, and pad-check examples have been removed.
Browser-only lesson fixtures retain subset/full-kit coverage without appearing
in the app's lesson selector.

## Song lessons

Transcribed from the supplied notation excerpts; each lesson repeats indefinitely.
These are practice patterns, not complete song arrangements or backing tracks.

- **Californication:** one bar at the shown 96 BPM; eighth-note closed hi-hat,
  kick on beat 1 and the “and” of 3, and the supplied snare pattern.
- **Come Undone:** one bar at the requested practice tempo of 80 BPM, using ride
  instead of hi-hat. Includes sixteenth-note triplets on the “and” of beats 2 and 4, with the middle triplet
  rest on beat 2. Snare on beats 2 and 4; kick on beat 1.
- **Chop Suey!:** two bars at the requested practice tempo of 80 BPM; eighth-note
  closed hi-hat with the supplied sixteenth-note snare and kick variations.

- **Fascination Street: bars 9–12:** four bars at 80 BPM for practice. Straight
  sixteenth notes, with the shown kick variations, snare on beats 2/4 and extra
  snare notes in bars 10–12. All X noteheads use closed hi-hat, including the
  opening hit, per the requested simplification. Diamond noteheads use Snare,
  without a separate cross-stick articulation. Hi-hat rests on the diamond notes.

Parenthesized snare notes in the excerpts are ghost notes. Lessons store timing
only, so these notes use the same guide volume and scoring as other snare notes.
The screenshots' bar numbers and 99-repeat markings do not affect the loop.

## Add a lesson

1. Save JSON in `lessons/my-lesson.json`. Use a lowercase, hyphenated filename.
2. Refresh the local app. The lesson appears automatically, using its JSON `title`.
3. Run checks, try it locally, then commit and deploy.

The filename defines the lesson ID. Lessons appear in filename order. Adding,
renaming, or deleting a JSON file updates the list without a registry edit or a
local server restart. Keep filenames stable to preserve saved lesson preferences.
`generated/lesson-catalog.js` and `_site/` are generated and ignored by Git.
The existing JavaScript validator checks the full lesson format; Python only
collects catalog metadata. Invalid lessons fail checks before deployment.

```json
{
  "version": 2,
  "title": "Swing ride and pedal chick",
  "bpm": 80,
  "time_signature": [4, 4],
  "bars": 1,
  "notation": {"feel": "swing"},
  "tracks": [
    {"instrument": "ride", "notes": [0, 96, 160, 192, 288, 352]},
    {"instrument": "hi_hat_pedal", "notes": [96, 288]}
  ]
}
```

There are **96 ticks per quarter note**, **384 per 4/4 bar**. Notes are sorted,
unique integer positions from zero, before `bars * 384`. Add 384 per following
bar. Supported spacing: eighth 48, sixteenth 24, thirty-second 12, eighth-note
triplet 32, sixteenth-note triplet 16. Lessons support 1–16 bars and any subset
of the twelve IDs in [src/instruments.js](src/instruments.js). Empty tracks are
allowed if the lesson has a note elsewhere. Unknown fields/instruments are rejected.
The Lanes window stays eight beats wide regardless of lesson length.
Version 2 additionally requires `notation`; see [notation-format.md](notation-format.md).
Version 1 remains supported with its original fields.

Loading another lesson stops practice; a failed load keeps the previous lesson
usable. Choose it again to retry. Lessons are generated/edited outside the app
and committed to the repository. No browser lesson editor/importer is needed.

## Development checks

Use the Node version in `.node-version`. With [fnm](https://github.com/Schniz/fnm)
installed and initialized in your shell:

```sh
fnm install
fnm use
npm ci
npm test
npm run test:tools
npm run test:browser
```

`npm test` generates the catalog, then uses Node's built-in runner.
`npm run test:tools` checks discovery, live refresh, errors, and packaging.
`npm run test:browser` builds and serves the actual `_site/` artifact.
Playwright is a development dependency;
the app itself has no npm runtime dependencies. Browser checks require Chrome,
start temporary loopback servers, and use disposable browser profiles and
simulated MIDI. They do not access your existing Chrome profile or physical kit.

Checks cover validation, precise timing, loop boundaries, input filtering, fixed
MIDI mappings, automatic multi-input connection, permission/port failure retry,
hotplug, saved controls, sample loading/cancellation, mixer controls, and responsive
layout. Both `/` and `/rhythm-trainer/` mounts are checked. Normal flows fail on
browser/network errors; intentionally failed requests have separate recovery checks.
Checks also visit every bar of every current lesson and exercise all twelve
instruments, mixed subdivisions, silent bars, sixteen-bar lessons, shared stems,
aligned snare/bass heads, stable two-bar rows, and bounded repetition beyond 100
loops. Earlier rows preserve independent feedback. The
versioned artifact is tested with cached prior CSS/modules. Native audio clocks
and timers remain active. Sound quality and physical latency
still require manual checks.

The notation implementation separates engraving (`src/notation/renderer.js`),
displayed bars and their SVG feedback (`src/notation/bar.js`), and score following
(`src/notation/view.js`). Cached engraving is reused across loops. Note feedback
is projected when results change or bars are created; summary text changes only
when displayed values change. Animation continues to move the marker/score and
expire extra-hit marks. Instrument labels come from `src/instruments.js`; musical
timing constants come from `src/music-time.js`. MIDI mappings remain separate in
the MPS-850 config.

## Deployment and remaining acceptance

The [Pages workflow](.github/workflows/pages.yml) checks pull requests and pushes
to `main`: Node tests, Python tests, and isolated Chrome checks. Successful pushes
to `main` publish `_site/` to
[gaeevy.github.io/rhythm-trainer](https://gaeevy.github.io/rhythm-trainer/).
No extra hosting service or personal access token is needed.

The repository Pages source is **GitHub Actions**, verified on 2026-10-25.
Open a pull request for review; merging it into `main` runs the checks and deploys
the generated site. For later updates, commit and push when ready:

```sh
git push origin main
```

Confirm Pages deployment finishes, then check the live app: lesson load,
start/count-in, keyboard/MIDI hits, mute, stop/restart, and console errors. Local
checks do not verify the live version. Deployment and live-site verification remain pending the pull request merge.

For a local deployment artifact, run `npm run build` (lesson validation plus
packaging). It recreates `_site/` using only runtime assets; no JavaScript compiler
or frontend framework is involved. The workflow retains its artifact for one day.
The generated index uses a relative base URL into `runtime/<content-hash>/`.
CSS, modules, catalog, lessons, MIDI config, recordings, and notation assets share
that release path. New HTML therefore cannot reuse old unversioned CSS/modules.
The hash changes when runtime content changes; local development keeps the normal
file paths and disables caching. No runtime assets are duplicated in the package.
A previously cached HTML document still requires normal browser revalidation;
asset versioning cannot force a browser to fetch a new document while offline.

Physical acceptance remains: hear module and browser audio together, practice
simultaneous hits and several loops, check unplug/reconnect, and tune latency
against the real MPS-850 setup. Observed note mappings and simulated tests do not
replace that practice-session acceptance.
