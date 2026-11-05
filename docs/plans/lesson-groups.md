# Lesson groups and swing exercises

Scope agreed 2026-11-05. Status: implemented and checked; leave uncommitted for review.

- Discover JSON recursively; use folders for native dropdown groups. Keep filename
  IDs stable, reject duplicates, and load each catalog entry's relative path.
- Put song excerpts in Songs, previous swing lessons in Swing [YouTube], and new
  sheet exercises in Swing. Adding a lesson still needs only one JSON file.
- Start with sheet exercises 7 and 8, one bar at 80 BPM, ride/pedal/snare. Use
  existing fixed 2:1 swing; accents/dynamics remain outside the lesson format.
- Check discovery, moves/IDs, duplicate/symlink errors, packaged subfolder URLs,
  saved preferences and both new patterns in Lanes and Notation at both mounts.

Verification: 134 JavaScript tests, 7 Python tests and 26 browser scenarios pass.
Checks cover root and /rhythm-trainer/, all 11 lessons, grouped options, nested
asset URLs, saved selection/tempo, and existing keyboard/MIDI/score behavior.
Rendered exercises 7 and 8 were inspected against the photo. Current guides and
local documentation links are updated. Local server runs on port 8000.

Next: user review of these two exercises before adding the remaining patterns.
Physical kit/listening checks remain manual; no commit or deployment performed.
