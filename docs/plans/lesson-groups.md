# Lesson groups and swing exercises

Scope agreed 2026-11-05. Status: implemented, checked and approved.

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

The first two exercises were approved; the follow-up below completes the sheet.
Physical kit/listening checks remain manual.

## Follow-up after first review

First reviewed state committed as `922c05a`. Approved follow-up:

- Replace the single grouped menu with folder and filtered lesson dropdowns;
  infer the saved folder from the last lesson ID. Folder changes load the first
  lesson, stop playback and retain each lesson's saved tempo.
- Add sheet exercises 9–20 with the same ride/pedal, 80 BPM and fixed 2:1 swing.
  Check all snare positions against the photo, including 13 vs 14 (and of 2 vs 3).
- Make ordinary end-of-bar lines opaque at 1.8px while retaining joined staves.

Status: implemented and approved. 134 JavaScript tests, 7 Python tests and 26 browser
scenarios pass at both mounts. All 23 lessons render; filtered menus, saved
folder/lesson, error recovery, end-of-bar line style and desktop/narrow layouts
are checked. New snare positions were compared with the photo, and rendered
exercise screenshots were inspected. Current guides and documentation links
are updated. Deployment remains a separate step.

## Separate cymbal and drum rhythms

The horizontal-beam experiment was removed after review: changing the angle did
not resolve cross-instrument grouping. Use two voices instead: cymbals upward,
drums/pedal downward. Keep simultaneous drum chords and isolate hinted triplets
only when their grids conflict. This preserves the ride quarter when snare
falls on its swung offbeat. Necessary rests remain visible.

Verification: 134 JavaScript tests and 26 browser scenarios pass at both mounts.
All 23 lessons render without losing note identities; timing, MIDI/keyboard
feedback, tuplets, simultaneous drum chords and scrolling checks pass. Exercise
7 was inspected with independent ride/snare rhythms. Current guides are updated.
Status: approved for release.
