# Practice guide

Start the server as shown in the [README](../README.md), then use Chrome on
localhost. Open the app through HTTP, not by opening `index.html` directly.

## Controls

Choose a folder (Songs, Swing or Swing [YouTube]), then a lesson, set BPM and
press **Start loop** or **Space**. The lesson dropdown lists only the selected
folder. Changing folder loads its first lesson and stops playback; reloading
restores the last lesson and its folder. The toolbar also
has metronome and guide volume sliders with speaker icons for mute.
Metronome spans 0–300% gain; guide drums span 0–100%. Both use logarithmic
travel for finer control at low levels, with exact silence at the left endpoint.
Arrow keys adjust by 1%, Page Up/Down by 10%, and Home/End select the limits.
The metronome's 300% endpoint is three times its normal 100% signal gain; its
click sound and timing are unchanged. There is no master volume or shared boost.
Old master preferences are discarded; separate levels and mute states are kept.
Volume/mute and view changes keep playback running.

BPM uses whole numbers from 20 to 300. Its logarithmic slider gives more precision
around slower practice tempos and advances faster at high tempos. Arrow keys
adjust by 1 BPM, Page Up/Down by 10, and Home/End select the limits. The small
reset icon beside BPM restores the lesson tempo and clears its saved override.
Fractional lesson tempos and old saved overrides are rounded for practice.

Practice settings contains Lanes/Notation selection, count-in, on-time tolerance
and latency offset. Notation is the default; a valid saved view is preserved.
Keyboard setup changes keys; MIDI setup shows connection/activity and retry.
Changing lesson, BPM, count-in, timing settings or keys stops playback. Start
begins a new session; Stop freezes totals. A failed lesson load keeps the prior
lesson available. Hiding the tab, interrupted audio or MIDI input loss stops the
loop; reconnection does not restart it.

Track controls disable an instrument's guide notes and assessment. Its lane or
noteheads stay dimmed. Changing enabled tracks stops/resets the session;
all-disabled tracks permit metronome-only practice.

## Input and sound

Connect the module's **USB MIDI** port to the Mac. Chrome may ask permission.
The app connects all available inputs as MPS-850 inputs, including newly attached
ports. Use **Enable / retry MIDI** after permission, config or busy-port errors.
MIDI needs localhost or HTTPS. Keyboard input remains available after MIDI errors.

Mappings observed on this user's kit, all on channel 10:

| Instrument | MIDI note |
| --- | --- |
| Kick / snare | 36 / 38 |
| Hi-hat closed / open / pedal chick | 42 / 46 / 44 |
| Tom 1 / 2 / 3 / 4 | 48 / 45 / 43 / 41 |
| Crash 1 / 2 | 49 / 57 |
| Ride normal / edge | 51 / 59, both count as Ride |

The [repository config](../config/drumkits/mps-850.json) is the sole mapping
source. There is no MIDI Learn, device selector or browser mapping override.
Only nonzero-velocity Note On creates hits; controllers, aftertouch, Note Off
and unmapped notes do not. Open, closed and pedal hi-hat actions are distinct.
These observed note assignments do not verify physical latency or factory defaults.

Default keys: **D/F/J/K** kick/snare/closed hi-hat/ride, **U/H** open hi-hat/pedal,
**Q/W/E/R** Tom 1–4, **A/S** Crash 1–2. Remapping swaps occupied letters/digits.
Space is reserved for transport. Held keys, shortcuts and typing in controls
are ignored.

USB MIDI carries events, not drum audio. Your playing sounds through the module;
the app plays expected guide notes, not a second sound for your hits. Use an
audio setup that lets you hear both. Guide drums use local acoustic recordings;
the metronome is synthesized. Closing the guide hi-hat chokes its open recording.
If a recording fails to load/decode, playback stays stopped: fix the connection
and press Start to retry. Stopping during loading cannot start a delayed loop.

## Views and feedback

The lesson dropdown identifies the selected pattern; the practice surface does
not repeat its title/details. Change the view in **Practice settings**.

**Lanes** shows the lesson's instruments in track order with an eight-beat window.
**Notation** repeats the score down one continuous sheet, with connected staff
lines and thin standard bar lines. It fits up to three bars per row when width
and note density allow; dense patterns use two, and narrow screens use one.
Small bar numbers replace separate card labels. Bars stay in place as playback
advances. The display retains six rows (up to 18 copies) and recycles older rows
without growing indefinitely.
Arrows browse while stopped. Count-in hides the marker; Stop preserves the score;
Start returns to loop 1/bar 1. Narrow scores scroll horizontally to retain note size.

Compatible drums share stems; snare/bass heads align and redundant rests disappear.
Incompatible grids keep independent voices. The foldable **Drum key** in Practice settings explains
staff positions: open hi-hat has a circle, closed has + at bar start/after opening,
and pedal uses X below the staff. Other closed hits keep plain X heads.
Unsupported notation or renderer errors leave Lanes usable with an explanation.

Noteheads show on time (green), early (blue), late (amber) or missed (red).
Notehead tooltips and screen-reader feedback show the instrument and matched
error to 0.1 ms; stored error keeps full precision. Routine prompts below the
score are hidden, while actionable playback errors remain visible. Extras appear briefly as purple + marks, not printed notes.
Each repeated bar has its own feedback; earlier rows retain results while new
loops start fresh. Totals accumulate across loops.

Tolerance defaults to ±30 ms. Matching allows at most ±150 ms, bounded by
neighboring-note midpoints on the same instrument, including loop edges. Ties
belong to the earlier note. A note matches once; duplicates are extra. Misses
finalize after their late window; delayed events can correct them using their
original timestamp. Hits are never snapped to ticks. Mean absolute error uses
matched hits only; elapsed time excludes count-in.

Positive latency offset subtracts milliseconds from hit times; negative adds them.
Preferences save locally: view, keys, disabled tracks, count-in, timing, mixer,
last lesson and per-lesson tempo. Localhost and the live site use separate storage.
Storage failure does not block practice. Session activity is not saved or uploaded.

For a real-kit check, practice simultaneous hits and several loops, compare
marker/audio alignment, test unplug/reconnect and adjust latency. Automated MIDI
simulation cannot verify audible timing, sound balance or reading comfort.
