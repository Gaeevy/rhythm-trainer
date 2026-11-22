# Lesson format

## Add a lesson

Add one JSON file under `lessons/`, then refresh the local app:

- `Songs/`: song excerpts.
- `Straight: Exercises/`: straight sixteenth-note snare exercises and grooves
  from “Single 16th-Note Subdivisions on the Snare” in *The Breakbeat Bible*,
  in practice order.
- `Swing/`: sheet exercises.
- `Swing [YouTube]/`: video exercises.

Folders become menu groups; lessons follow filename order. Nested folders use
their full relative path as a label; root files appear under Other. Use unique,
lowercase hyphenated filenames across all folders. The filename without `.json`
is the stable lesson ID; moving a file preserves saved selection/tempo, while
renaming changes its ID. `title` supplies the displayed name.

The server discovers additions/deletions without restart. The generated catalog
and Pages artifact are ignored outputs. Run the [checks](development.md#checks),
try the lesson, then commit/deploy with approval. Existing [lessons](../lessons/)
provide complete examples. Accents and ghost notes use ordinary hit sound/scoring.

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

All shown top-level fields are required. Title is nonempty; BPM is finite and
positive (practice rounds/clamps to 20–300). Meter is `[4, 4]`; length is 1–16 bars.
Each track has a unique `instrument` and sorted, unique integer `notes` from 0
through `bars * 384 - 1`. At least one note is required across all tracks; empty
tracks and simultaneous notes on different instruments are allowed. Unknown
fields/instruments are rejected. The optional `backing` block is described below.

Supported instruments: `kick`, `snare`, `hi_hat_closed`, `hi_hat_open`,
`hi_hat_pedal`, `tom_1`–`tom_4`, `crash_1`, `crash_2`, `ride`. Labels live in
[instruments.js](../src/instruments.js); staff positions in
[drum-key.js](../src/notation/drum-key.js). MIDI mapping is independent of lesson data.
Version 1 uses the same base fields without `notation` and displays literal rhythms.

## Backing track

Either lesson version can include an optional `backing` object. Each field
inside it is optional.

```json
{
  "key": "D minor",
  "progression": ["i7", "iv7", "V7", "i7"]
}
```

| Field | Value |
| --- | --- |
| `key` | Tonic A–G with optional `b` or `#`, followed by `major` or `minor`. Defaults to `C minor`. |
| `progression` | One scale degree per backing bar. Repeat a degree to use the same chord in consecutive bars. |
| `bars` | Integer from 1 to 16. Defaults to the number of chords in `progression`, or 4 without a progression. If both fields are present, their lengths must agree. |

Use Roman numerals I–VII for roots, with an optional `b` or `#` before the
numeral to alter the scale degree. Roots follow the major or natural minor
scale in the selected key. Uppercase gives a major triad and lowercase gives
a minor triad. Append `7` for a minor seventh, `maj7` for a major seventh,
`ø7` for a half-diminished seventh, or `°` for a diminished triad. For
example, `V7` in C minor is G–B–D–F.

The default progression is `iiø7 → V7 → i7 → i7` in minor and
`ii7 → V7 → Imaj7 → Imaj7` in major. With a custom length and no progression,
the generator cycles through those degrees and uses the tonic chord in the
final bar. The [Autumn Leaves practice excerpt](../lessons/Songs/autumn-leaves.json)
has an example of a custom progression for practice.

## Ticks and feel

One quarter-note beat is **96 ticks**; one bar is **384 ticks**. Notes store
performance positions across the entire lesson. Add 384 for each following bar.
Playback/assessment use these exact positions.

| Subdivision | Tick spacing |
| --- | ---: |
| Quarter | 96 |
| Straight eighth | 48 |
| Sixteenth | 24 |
| Thirty-second | 12 |
| Eighth-note triplet | 32 |
| Sixteenth-note triplet | 16 |

`notation` requires `feel` (`straight` or `swing`) and accepts optional `triplets`.
Straight uses literal positions. Swing writes beat offsets 0/64 as ordinary
0/48 eighths with a fixed 2:1 feel. **Store 64 for the swung offbeat.** Conversion
affects written notation only, so playback never applies swing twice. Explicit
triplets and finer binary subdivisions stay literal; sixteenth-note swing is
unsupported.

## Explicit triplets

A hint references an existing note with `instrument`, `tick` and optional `unit`
(8 or 16, default 8). It identifies a three-slot group, including any rests.
Duplicate/overlapping groups on an instrument, missing references, unsupported
fields/units and notes outside the group's slots are rejected.

```json
{
  "feel": "swing",
  "triplets": [{"instrument": "snare", "tick": 608}]
}
```

Unit 8 uses the containing quarter beat: slots 576/608/640. Another instrument
can fill a silent slot in combined notation. Unit 16 uses the containing half-beat:
`{"instrument":"ride","tick":144,"unit":16}` identifies slots 144/160/176.
Adjacent half-beat groups are allowed. See [Come Undone](../lessons/Songs/come-undone.json)
for sixteenth triplets with rests.

## Notation limits

Layout is automatic; [Development](development.md#notation-layout) defines
voice selection, quarter-ride protection, duration spelling and grid fallbacks.
Written durations describe rhythm rather than recording sustain. Unsupported
notation leaves the lesson playable in Lanes with an explanation; conversion
preserves every hit and its original tick.

General ties/dotted durations, arbitrary tuplets/meters, custom voices, dynamics,
separately scored rims/bells/edges, variable swing, editing and printing are
outside the supported format.
