# Acoustic guide drums

Twelve recordings selected from **Big Rusty Drums**, by **Karoryfer Samples**.
Upstream: https://github.com/sfzinstruments/karoryfer.big-rusty-drums
Revision: `f07ce00df34a46b6b08375be56fe116cf15782bc`.

The upstream library dedicates the recordings under **CC0 1.0 Universal**.
The complete text is retained in `LICENSE-CC0.txt`; individual source paths and
processing details are in `sources.json`.

These are moderate-strength stick hits, round robin 1. Kick/snare/toms/hi-hat
use close microphones. Ride and crashes use overhead microphones. Crash 2 is a
sizzle crash. Four separate tom recordings are used; there are no pitched copies.
The selection is an acoustic starting point, not an exact recording of the MPS-850
or a recreation of its sound module. The metronome remains synthesized.

Prepared WAVs are mono, 44.1 kHz, 16-bit PCM. Leading silence is trimmed with
2 ms attack padding, peaks are normalized to 0.75, long tails are limited, and
the last 40 ms fade out. Playback gains balance the instruments separately.

To regenerate on macOS with Python 3 and the built-in `afconvert`:

```sh
python3 scripts/prepare_samples.py
```

Regeneration needs network access; playback uses only the files in this repo.
No audio conversion tool or extra Python package is required to run the app.
