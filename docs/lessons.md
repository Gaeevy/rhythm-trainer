# Lesson format

## Add a lesson

Save one JSON file in a lesson folder, then refresh the local app:

- `lessons/Songs/`: song excerpts.
- `lessons/Swing/`: sheet swing exercises 7–20.
- `lessons/Swing [YouTube]/`: existing swing lessons from the earlier videos.

Folders appear in the Lesson menu; hovering over or tapping one reveals its
lesson flyout, in filename order. Browsing folders does not change practice.
A new folder automatically appears; nested folders use their full relative path
as one folder label. Root-level JSON files are still supported under Other.
The filename without `.json` is the lesson ID; `title` is the option text.
Use lowercase hyphenated filenames, unique across all folders. Moving a file
between groups preserves its ID, saved selection and tempo. Renaming the file
changes its ID. No registry, importer or editor is needed. Run the
[checks](development.md#checks), try the lesson, then commit/deploy when approved.

The server discovers additions/deletions without restart. The generated catalog
and Pages artifact are ignored by Git; never edit or commit them. Existing
[lesson JSON files](../lessons/) are the source of truth for the current catalog.
Song lessons are excerpt-based practice patterns, not full arrangements or backing
tracks. Ghost notes and accent marks currently have the same guide volume and scoring
as other hits. Sheet exercises 7–20 use fixed 2:1 swing, ride and hi-hat
pedal on 2/4, with no added bass drum. Exercise 7 has snare on 1 and the swung
and of 3; exercise 8 has snare on 2 and its swung and. All start at 80 BPM.

## JSON schema

Use version 2 for new lessons:

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

All shown top-level fields are required. Title must be nonempty; BPM is a finite
positive number (practice controls round to whole BPM and limit playback to 20–300). Meter is `[4, 4]`;
a lesson spans 1–16 bars. Each track has only `instrument` and `notes`, with a
unique instrument ID. Notes are sorted, unique integer ticks from zero through
`bars * 384 - 1`. At least one note is required across the lesson; other tracks
may be empty. Simultaneous notes on different instruments are allowed.
Unknown fields/instruments are rejected.

Supported instruments: `kick`, `snare`, `hi_hat_closed`, `hi_hat_open`,
`hi_hat_pedal`, `tom_1`–`tom_4`, `crash_1`, `crash_2`, `ride`.
There is no generic hi-hat. See [instrument definitions](../src/instruments.js)
and [staff positions](../src/notation/drum-key.js). MIDI zones are configured
separately; ride normal/edge map to the same `ride` track.

Version 1 remains supported with the same base fields but **without** `notation`.
It displays literal rhythms; titles never imply Swing.

## Ticks and feel

One beat is a quarter note: **96 ticks per beat, 384 per bar**. Stored ticks are
performance positions from the lesson start, across all bars. Add 384 for each
following bar. Playback/assessment always use these exact positions.

| Subdivision | Tick spacing |
| --- | ---: |
| Quarter | 96 |
| Straight eighth | 48 |
| Sixteenth | 24 |
| Thirty-second | 12 |
| Eighth-note triplet | 32 |
| Sixteenth-note triplet | 16 |

`notation` accepts required `feel` (`straight` or `swing`) and optional `triplets`.
Straight keeps literal written/performance positions. Swing writes ordinary
eighths at beat offsets 0/48 but plays them at 0/64, a fixed 2:1 ratio. Store 64,
not 48, for that swung offbeat. The renderer adds the Swing marking; it never
moves notes or applies swing twice. Explicit triplets and finer binary subdivisions
stay literal; there is no sixteenth-note swing. Ambiguous mixed grids may fall
back to independent voices or Lanes rather than being rounded.

## Explicit triplets

A hint references an existing note using `instrument`, `tick` and optional `unit`
(8 or 16, default 8). One hint identifies a three-slot group. Duplicate/overlapping
groups on an instrument, missing references, unsupported fields/units or notes
outside the group's slots are rejected.

For Swing 03, the `notation` value is:

```json
{
  "feel": "swing",
  "triplets": [{"instrument": "snare", "tick": 608}]
}
```

Unit 8 uses the containing quarter-note beat: slots 576/608/640. Snare is silent
at 576, then plays the other slots. Another drum can fill the first slot on the
combined staff, so it does not require a separate printed snare rest.

Come Undone uses sixteenth triplets inside the second eighth of beats 2 and 4:

```json
{
  "feel": "straight",
  "triplets": [
    {"instrument": "ride", "tick": 144, "unit": 16},
    {"instrument": "ride", "tick": 336, "unit": 16}
  ]
}
```

Unit 16 uses the containing half-beat: slots 144/160/176 (note/rest/note) and
336/352/368 (three notes). Adjacent half-beat groups are allowed. Hints make the
intended written groups explicit, including necessary rests.

## Notation limits

Notation separates cymbals (upward stems) from drums and hi-hat pedal (downward
stems). Their rhythms and beams stay independent, so an offbeat snare does not
shorten a ride quarter note. Simultaneous snare/kick notes can still share a
stem. If instruments within a group conflict with a triplet grid, the hinted
instrument keeps its own voice. Beams group by beat/tuplet; aligned quarter rests combine into half/bar
rests. Every head retains its instrument, original note index and performance
tick; nearby heads can be displaced to avoid collisions. No hits are merged.
Written durations describe rhythm, not recording sustain.

Unsupported notation leaves the lesson playable in Lanes with an explanation.
General ties/dotted durations, arbitrary tuplets/meters, custom voices, dynamics,
separately scored rims/bells/edges, variable swing, editing and printing are outside
the current scope. Do not approximate unsupported notes silently.
