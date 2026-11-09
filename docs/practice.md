# Practice guide

[Run locally](../README.md#run-locally), or open the
[live app](https://gaeevy.github.io/rhythm-trainer/) in Chrome.

## Controls

Choose **Lesson → folder → lesson**, or use **‹ / ›** to move within the current
folder in menu order. The buttons stop at folder boundaries. Browsing the menu
preserves playback; selecting a lesson stops and resets practice. Failed loads
keep the previous lesson available. Reloading restores the last selected lesson.

Set **BPM** (20–300) and press **Start loop** or **Space**. The reset icon restores
that lesson's tempo. BPM and volume sliders use logarithmic travel for finer
control at low values. Arrow keys change the displayed value by 1; Page Up/Down
by 10; Home/End select the limits. Metronome volume spans 0–300%, guide drums
0–100%; speaker icons toggle mute. Mixer and view changes preserve playback.

**Practice settings** contains Lanes/Notation, count-in, on-time tolerance,
latency offset and the Drum key. **Keyboard setup** changes keys; **MIDI setup**
shows connection/activity and retry. Notation is the default view.

Changing lesson, BPM, count-in, timing settings, keys or enabled tracks stops
playback. Start resets the session; Stop freezes results. Track buttons disable
that instrument's guide sound and assessment and dim its notes. Disabling all
tracks permits metronome-only practice. Hiding the tab, interrupted audio or
MIDI input loss stops playback; reconnecting leaves it stopped.

The lesson menu supports Up/Down, Home/End, first-letter search and Enter/Space.
Right opens a folder, Left returns to folders, and Escape closes the menu.

## Scores and trends

**Score**, enabled pad scores and **Consistency** range from 0 to 100.
Closer timing earns more points, including inside the on-time band. Missed notes
earn zero; extras add zero-point opportunities. Results eight bars older have
half the weight. Scores update after completed bars' late-hit windows close.
“—” means insufficient results; delayed timestamped hits can correct earlier scores.

Consistency measures the spread of hits scheduled together. Tight groups earn
more points even when the whole group is early or late; an incomplete group
earns zero. Score combines 70% pad scores and 30% consistency, weighting pads by
expected notes plus extras. Lessons without simultaneous groups use pads only.
If the first group occurs later, Score and Consistency wait for its bar to close.

After 16 completed bars with sufficient earlier samples, arrows compare against
the weighted score ending eight bars ago: **↑ / ↓** means at least 3 points
better/worse; **~** means a smaller change. Hover for the numeric change.
**Session totals** shows hit counts and mean absolute timing error.
[Development](development.md#practice-analytics) defines the calculations.

## Input and sound

Connect the module's **USB MIDI** port to the Mac and allow Chrome's MIDI
permission. MIDI requires localhost or HTTPS. All connected inputs use the
[MPS-850 mapping](../config/drumkits/mps-850.json), on channel 10. Multiple mapped
notes can count as the same instrument, including both snare and ride zones.
Only nonzero-velocity Note On messages create hits. Open, closed and pedal
hi-hat actions are distinct. Use **Enable / retry MIDI** after permission,
configuration or busy-port errors; keyboard input remains available.

Default keys: **D/F/J/K** kick/snare/closed hi-hat/ride, **U/H** open hi-hat/pedal,
**Q/W/E/R** Tom 1–4, **A/S** Crash 1–2. Remapping swaps occupied letters/digits.
Space controls playback. Held keys, shortcuts and typing in controls are ignored.

USB MIDI carries events; hear your playing through the module and the app's
guide/metronome through your computer's audio setup. Guide drums use acoustic
recordings; the metronome is synthesized. Closing the guide hi-hat chokes its
open sound. If recordings fail to load, fix the connection and press Start to retry.

## Views and feedback

**Lanes** shows an eight-beat window. **Notation** repeats the score down a
continuous sheet with one to three bars per row, depending on width and density.
It follows playback and retains six rows. Browse with the score arrows while
stopped. Stop preserves the score; Start returns to loop 1/bar 1. The Drum key
explains staff positions. Unsupported notation leaves Lanes available.
Swing beams connect matching pad groups; changing pads starts a new beam or flag.
Inactive voices omit trailing/full-bar rests while another voice plays.
Leading/internal rests and triplet rests remain visible to locate the next hit.

Early noteheads move left, late heads right; larger errors move farther, within
spacing limits. Stems and beams stay fixed. Severe errors (above the larger of
60 ms or twice the on-time tolerance) settle horizontally; mild errors slide.
Missed heads shake vertically once and remain dimmed. Delayed corrections
replace the missed appearance. Resizing or switching views preserves feedback
without replaying animations. Reduced motion keeps static offsets and dimming.
Extra hits appear as hollow heads at their staff position and actual hit time,
then disappear after 900 ms. Tooltips expose timing error; colors supplement the
movement and shapes. Each repeated bar shows its own results.

## Timing and saved settings

Tolerance defaults to ±30 ms. Matching allows at most ±150 ms, bounded by
neighboring-note midpoints on the same instrument, including loop edges. Ties
belong to the earlier note. Each note matches once; duplicates are extra. Misses
finalize after their late window; original input timestamps allow corrections.
Hits retain their exact timing. Mean absolute error uses matched hits only;
elapsed time excludes count-in. Positive latency offset subtracts milliseconds
from hit times; negative adds them.

View, keys, disabled tracks, count-in, timing, mixer, last lesson and per-lesson
tempo save locally. Localhost and the live site have separate storage. Storage
failure leaves practice usable. Session activity stays in memory until reset.
For a kit check, compare marker/audio alignment, practice simultaneous hits and
several loops, test unplug/reconnect and adjust latency. Automated checks cannot
verify physical latency, listening balance or reading comfort.
