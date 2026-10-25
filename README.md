# Rhythm Trainer

A static drum-practice app for the **Millenium MPS-850**, using Chrome on macOS.
Lessons loop with scrolling instrument lanes, recorded guide drums, a metronome,
and early/on-time/late feedback. No account, backend, or build step is required.

See [mvp.md](mvp.md) for scope and verification status, and [AGENTS.md](AGENTS.md)
for development instructions. Local changes are not published until pushed.

## Run locally

From the repository folder:

```sh
python3 -m http.server 8000
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
| Ride | 59 |

These verify the user's basic pad mappings, not universal factory settings or
end-to-end latency. Rims and separate cymbal bow/edge/bell mappings are excluded.
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
pedal note. The swing and mixed-subdivision lessons use pedal chick; the straight
groove uses closed stick hits. Lane count and order follow the lesson.

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

## Add a lesson

1. Save JSON in `lessons/my-lesson.json`.
2. Add `{ id: "my-lesson", title: "My lesson" }` to `src/lesson-catalog.js`.
3. Run checks, try it locally, then commit and deploy.

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
npm run test:browser
```

`npm test` uses Node's built-in runner. Playwright is a development dependency;
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

GitHub Pages uses **main**, **/ (root)** at
[gaeevy.github.io/rhythm-trainer](https://gaeevy.github.io/rhythm-trainer/).
No build or new hosting service is required. Run both test commands, review and
commit, then publish when ready:

```sh
git push origin main
```

Confirm Pages deployment finishes, then check the live app: lesson load,
start/count-in, keyboard/MIDI hits, mute, stop/restart, and console errors. Local
checks do not verify the live version. This cleanup has not been pushed/deployed.

Physical acceptance remains: hear module and browser audio together, practice
simultaneous hits and several loops, check unplug/reconnect, and tune latency
against the real MPS-850 setup. Observed note mappings and simulated tests do not
replace that practice-session acceptance.
