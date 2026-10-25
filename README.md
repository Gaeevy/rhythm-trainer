# Rhythm Trainer

A static drum-practice app for the **Millenium MPS-850**, using Chrome on macOS.
Lessons loop with scrolling instrument lanes, recorded guide drums, a metronome,
and early/on-time/late feedback. No account or backend is required. A small Python
script generates the lesson list and packages the static files for deployment.

See [mvp.md](mvp.md) for scope and verification status, and [AGENTS.md](AGENTS.md)
for development instructions. Local changes are not published until pushed.

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
If loading fails, the app uses synthesized drums and retries on the next Start.
Stop during loading cannot start a delayed loop. Practice settings reports the
current sound source. Listening balance remains subject to user review.

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

Parenthesized snare notes in the excerpts are ghost notes. Version 1 stores timing
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
  "version": 1,
  "title": "Swing ride and pedal chick",
  "bpm": 80,
  "time_signature": [4, 4],
  "bars": 1,
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
The visible window stays eight beats wide regardless of lesson length.

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
Native audio clocks and timers remain active. Sound quality and physical latency
still require manual checks.

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

Physical acceptance remains: hear module and browser audio together, practice
simultaneous hits and several loops, check unplug/reconnect, and tune latency
against the real MPS-850 setup. Observed note mappings and simulated tests do not
replace that practice-session acceptance.
