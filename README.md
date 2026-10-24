# Rhythm Trainer

A browser-based drum trainer hosted on
[GitHub Pages](https://gaeevy.github.io/rhythm-trainer/).
The new trainer is being built one milestone at a time. See
[mvp.md](mvp.md#implementation-plan-and-tracker) for scope and progress, and
[AGENTS.md](AGENTS.md) for agent instructions.

## Current features

- JSON lessons with dynamic instrument lanes: kick, snare, hi-hat, and ride.
- A fixed playhead, scrolling notes, beat/bar lines, and continuous looping.
- Synthesized guide drum sounds and a metronome, with independent volume/mute.
- An optional one-bar count-in and adjustable tempo from 20–300 BPM.
- Straight, swing, and mixed-subdivision example lessons.
- Sixteenth-note triplets and thirty-second notes, including mixed subdivisions.
- Keyboard input with precise hit markers and early/on-time/late feedback.
- Missed/extra note counts, session totals, and mean absolute timing error.
- Adjustable on-time tolerance and latency offset.
- MIDI device selection, MIDI learn, multiple pad zones, and locally saved mappings.
- Repository JSON lessons, keyboard remapping, and saved practice preferences.
- Practice time and completed-loop counts alongside the session totals.

Keyboard and MIDI practice are available. The
[original metronome](legacy.html) remains available with its existing Space-key
and MIDI tap markers. The original metronome does not assess timing accuracy.

## Run locally

From the repository folder, use Python 3 to serve the static files:

```sh
python3 -m http.server 8000
```

Open [http://localhost:8000](http://localhost:8000) in Chrome. Stop the server with
Ctrl+C. No backend, build step, package installation, or cloud service is needed.

Choose a lesson and press **Start loop**. Notes move toward the **NOW** line.
The count-in plays only the metronome; guide drums begin at the lesson start.
Muting the metronome also mutes its count-in.

Changing BPM, count-in, or lesson stops playback. Press Start to begin again
from the start with the chosen settings. Hiding the tab or an audio interruption
also stops playback. Volume and mute controls work during playback without
resetting the loop. After an error, select a lesson again to retry loading it.

## Keyboard practice and timing

Start focuses the lanes so you can play immediately. Click the lanes to return
focus after using controls. Keys: **Space = kick**, **F = snare**, **J = hi-hat**,
**K = ride**. Only instruments present in the lesson accept input. Hitting an
empty track during the lesson counts as extra. Holding a key does not repeat
hits; typing in controls or editable content does not play notes.

Expand **KEYBOARD SETUP** to assign Space, letters, or digits. Choosing a key
already assigned to another instrument swaps the assignments, so every
instrument keeps one distinct key. The lane labels, practice hints, and input
update together. **Reset keys** restores Space/F/J/K without changing MIDI
mappings. Changing keys stops playback.

Expected notes use rectangles; actual hits appear beneath them at their precise
positions. The lane text and marker symbols distinguish early (◀), on time (●),
late (▶), missed (×), and extra (+). The signed timing error is negative for early
and positive for late. Mean absolute error includes matched hits only.

The default on-time tolerance is **±30 ms**. Hits can match within **±150 ms**,
but that window is capped at the midpoint to each neighboring note on the same
instrument, including across loops. An exact midpoint belongs to the earlier
note. A hit nearest an already matched note counts as extra; it cannot consume
another note. Missed notes are counted after their late window closes. A delayed
browser event can correct a miss if its original timestamp was within the window.

Count-in taps are unscored, except an eligible early hit for the first note.
Browser output timestamps align input with the audio output clock where available.
The **latency offset** adjusts the remaining delay: a positive value subtracts
milliseconds from hit times. For example, a +50 ms offset moves a hit measured
60 ms late to 10 ms late. Use a negative offset if hits need to move later.
Changing tolerance or latency stops playback; restart to apply it.

Stop freezes the session totals without counting future notes as missed. Start
creates a new session; loading another lesson also clears the totals. Original
event timestamps and unrounded errors stay in memory for the current session;
they are not saved across reloads or sent to a server.

The summary also shows practice time (excluding count-in) and completed loops.
These freeze on Stop and reset on Start or a successful lesson change.

## Custom lessons

Generate or edit a JSON lesson, then:

1. Save it as `lessons/my-lesson.json`.
2. Add `{ id: "my-lesson", title: "My lesson" }` to `src/lesson-catalog.js`.
3. Run `npm test`. Tests validate every lesson and check that the lesson list
   matches the files in `lessons/`.
4. Try it locally, then commit and deploy with the rest of the app.

Lessons load from the repository. No in-app importer or editor is required.
Switching lessons stops playback and clears the session after a successful load.
If a lesson fails to load or validate, the error is shown and the previous lesson
remains usable. Choose the lesson again to retry.

This two-bar example has swing ride notes and hi-hat on beats 2 and 4:

```json
{
  "version": 1,
  "title": "My two-bar swing lesson",
  "bpm": 80,
  "time_signature": [4, 4],
  "bars": 2,
  "tracks": [
    {"instrument": "ride", "notes": [0, 96, 160, 192, 288, 352, 384, 480, 544, 576, 672, 736]},
    {"instrument": "hi_hat", "notes": [96, 288, 480, 672]}
  ]
}
```

Positions are absolute ticks from the lesson start. Beat 1 starts at tick 0;
bar 2 starts at 384. Use 32 ticks between eighth-note triplets, 16 between
sixteenth-note triplets, and 12 between thirty-second notes. Mix subdivisions
freely; all positions must be sorted, unique within a track, and before the
loop end. Lessons support 1–16 bars and any subset of the four instruments.
The visible window stays eight beats wide regardless of total lesson length.

## Saved practice preferences

Count-in, tolerance, latency offset, guide/metronome volume and mute, keyboard
bindings, and tempo overrides are saved automatically in local storage. The
status below the practice panel reports saving or unavailable storage. If saved
practice settings are invalid, defaults are restored without changing MIDI
profiles. Valid changes still work for the current page when saving is unavailable.

Tempo overrides are stored per lesson, so switching
lessons does not erase your chosen practice tempo. **Use lesson tempo** clears
that override and restores the JSON's BPM. Playback accepts 20–300 BPM, including
fractional values. If a JSON lesson specifies a tempo outside this range, change
the BPM before starting. Blank/invalid numeric edits are not saved and Start
requires valid controls.

Preferences and MIDI mappings use separate storage keys. Settings belong to
this browser and site address; localhost and GitHub Pages have separate storage.

The guide sounds are synthesized in the browser; no external samples or audio
services are used. They are functional practice sounds, not a sampled drum kit.
For now, the swing example has notes only in the ride and hi-hat lanes; snare
and kick lanes are intentionally empty.

## MIDI setup

Use Chrome on localhost or HTTPS. To set up the Millenium MPS-850:

1. Connect the module's **USB MIDI** port to the Mac; do not use its USB MEMORY
   port. Expand **MIDI SETUP** below the volume controls.
2. Click **Connect MIDI** and allow MIDI access if Chrome asks. On first use,
   explicitly select the kit from **Input device**.
3. Click **Learn pad** beside an instrument, then strike the intended pad or
   pedal once. That hit is used for setup, not scoring.
4. Repeat Learn pad to add another zone. For jazz, learn both the hi-hat pad and
   pedal chick under **Hi-hat**, and the desired ride zones under **Ride**.
5. Check the input monitor while stopped: it shows the last valid Note On,
   channel, velocity, and instrument, or **Unmapped**. The kit does not need to
   use channel 10. Learn records the actual note and channel.
6. Start a lesson. Mapped MIDI hits use the same timing assessment as keyboard
   hits. MIDI and keyboard input can be used together.

There are no assumed factory note mappings. Each instrument can have several
note/channel pairs. A pair belongs to one instrument: learning it elsewhere
moves the assignment and reports the change. Remove individual assignments
with their **×** buttons. Learning or changing mappings/device stops the loop;
Start cancels unfinished learning before beginning practice.

Mappings and device selection are saved per device ID in this browser's local
storage, separately from lessons. After reload, click Connect MIDI again; the
saved device is selected if available. Different browsers, site addresses, or
changed device IDs can require new mappings. If storage is disabled/full, the
page reports it and mappings continue to work until the page is reloaded.

Only the selected device is listened to. Note Off, zero-velocity Note On, clocks,
CC (including hi-hat controller movement), pressure, and SysEx are ignored.
The hi-hat pedal must send a Note On for its chick to count as a hit. Velocity
is retained in session data but is not scored. Unmapped notes appear in the
monitor and do not count as practice hits. Browser playback of your own MIDI
hits is off; guide sounds and metronome remain independent.

Unplugging the selected device stops practice; reconnecting the same ID restores
the mappings but does not restart the loop. Disconnect MIDI releases the input
and keeps saved mappings. If a port is busy, close other MIDI applications and
use Reconnect MIDI. Keyboard practice remains available after MIDI errors.

USB MIDI carries events, not the kit's audio. Use an audio setup that lets you
hear both the drum module and browser guide/metronome. The actual MPS-850
connection and end-to-end latency still require a real-kit check.

## Development setup and tests

The project pins Node.js in `.node-version`. On macOS, install fnm once:

```sh
brew install fnm
```

Add this initialization to `~/.zshrc` once, then open a new terminal:

```sh
eval "$(fnm env --use-on-cd --shell zsh)"
```

From the repository folder:

```sh
fnm install
fnm use
npm test
```

With this shell setup, fnm also selects the installed version automatically when
you enter the repository. No `npm install` is needed: there are no dependencies.
`npm test` runs Node's built-in test runner (`node --test`). Node and npm are only
required for development checks, not for serving or deploying the app.
If dependencies are added later, commit `package-lock.json` and use `npm ci`.

The deterministic tests cover JSON parsing/validation, clock conversion,
look-ahead scheduling, count-in, repeated loops, stop/restart, delayed callbacks,
mixed subdivisions, hit matching, latency correction, missed/extra notes, keyboard
filtering, and signed feedback. Scheduling is tested against a controllable audio
clock, without relying on animation or real timers. MIDI tests use simulated
ports for note filtering, device selection, learn/cancel/reassign/remove, saved
profiles, disconnect/reconnect, permission errors, busy ports, and timestamped
assessment. Browser checks must also run
with untouched native timers: replacing global timers can mask integration bugs.

For a browser check in Chrome:

1. Start the swing lesson, confirm four lanes, count-in, and several loops.
2. Change guide and metronome volume/mute independently; notes keep scrolling.
3. Stop and restart several times; no sound should continue after Stop.
4. Change BPM during playback; it stops and restarts at the new tempo on Start.
5. Select the straight lesson: only hi-hat, snare, and kick lanes appear.
6. Select mixed subdivisions: the position progresses through both bars.
7. Hide and return to the tab: playback stays stopped until Start is pressed.
8. Click the lanes and play with Space/F/J/K. Check hit feedback and totals.
9. Hold a key or type in a focused control: no repeated or unintended hits.
10. Stop: totals freeze. Restart: totals reset. Change tolerance/offset and verify
    that restarting applies the new settings.
11. With the kit, complete MIDI learn for four instruments, both hi-hat pad/pedal,
    and ride zones. Confirm the monitor identifies the intended instruments.
12. Practice simultaneous hits; unplug/reconnect and verify the loop stays stopped
    until Start. Reload and reconnect to confirm saved mapping restoration.
13. Remap/swap keys and reload: inputs and lane hints agree, practice controls
    restore, and MIDI profiles remain unchanged.
14. Add a multi-bar lesson to the repository and lesson list, then select it.
    Try invalid JSON and confirm the previous lesson stays usable. Try a 16-bar
    lesson and confirm note spacing stays the same as bar/loop position advances.
15. If the app cannot load its JavaScript modules, confirm it shows a connection
    error and a **Reload page** button instead of staying on “Loading lessons…”.

Hardware MIDI and end-to-end latency have not been verified. Real-kit acceptance
with the Millenium MPS-850 is milestone 7; keyboard/simulated MIDI checks do not
replace that acceptance.

## Lesson files

Examples are in `lessons/`. A lesson uses version 1, a title, quarter-note BPM,
`time_signature: [4, 4]`, 1–16 bars, and an ordered list of instrument tracks.
Supported instruments are `kick`, `snare`, `hi_hat`, and `ride`.

Each note is an absolute integer tick from the lesson start: 96 ticks per beat,
384 per bar. Note lists must be sorted and unique within each track, with no
position at or beyond the loop end. Different tracks can play simultaneously.
Empty tracks are allowed if the lesson contains at least one note elsewhere.
Missing and unknown fields are rejected so spelling errors are visible.
The display shows an eight-beat window, independently of total lesson length.

See [the format and example](mvp.md#lesson-format-version-1). Keyboard and MIDI
mappings belong to player settings, not lesson files. Actual hit timestamps will
remain precise; the tick resolution only defines expected-note positions.

The browser-compatible core modules have no Node or DOM dependencies:

```js
import { parseLesson } from "./src/lesson.js";
import { ticksToSeconds } from "./src/music-time.js";

const lesson = parseLesson(jsonText);
const seconds = ticksToSeconds(lesson.tracks[0].notes[0], lesson.bpm);
```

## Project structure

```text
index.html              New playback interface
style.css               Playback layout and styles
src/app.js              Controls, lesson loading, and animation lifecycle
src/lesson.js           JSON parsing and validation
src/music-time.js       Musical timing constants and conversion
src/instruments.js      Instrument labels and colors
src/playback.js         Shared playback timeline and look-ahead scheduler
src/audio.js            Synthesized drum voices and independent audio buses
src/track.js            Reusable Track component and lane drawing
src/input.js            Keyboard filtering and default player mappings
src/clock.js            Event timestamps mapped to the audio clock
src/assessment.js       Precise hit matching, missed notes, and session results
src/feedback.js         Shared timing labels, symbols, and colors
src/midi.js             Selected MIDI input, filtering, learn, and reconnects
src/midi-settings.js    Versioned local MIDI device profiles
src/midi-view.js        MIDI setup controls and last-hit monitor
src/lesson-catalog.js   Bundled lesson selector entries
src/practice-settings.js Local practice preferences and validation
src/keyboard-view.js    Keyboard remapping controls
lessons/                Three bundled JSON lessons
test/                   Node tests for lesson and playback logic
legacy.html, legacy.css Original metronome interface
script.js, click_tr.wav Original metronome behavior and sound
AGENTS.md, mvp.md       Agent instructions, scope, and progress
```

## Deployment

Publish the repository's static files with GitHub Pages. No build is needed.
Asset and lesson URLs are relative, including when hosted under
`/rhythm-trainer/`. Local changes are not automatically published by this work;
a live deployment must be checked separately.

## License

Feel free to use, modify, and share this project for your own learning and
musical practice.
