# Lesson notation format

Version 2 adds written-notation metadata to the JSON lesson. Keep the existing
`title`, `bpm`, `time_signature`, `bars`, and `tracks`. Track `notes` remain
**performance ticks**: 96 per quarter note and 384 per 4/4 bar. Playback,
MIDI/keyboard assessment, and Lanes use these exact ticks. Adding a lesson still
requires only one JSON file in `lessons/`.

## Straight and Swing

```json
{
  "version": 2,
  "title": "Two swung snare notes",
  "bpm": 80,
  "time_signature": [4, 4],
  "bars": 1,
  "notation": {"feel": "swing"},
  "tracks": [{"instrument": "snare", "notes": [0, 64]}]
}
```

`notation` is required for version 2. It accepts only:

| Field | Required | Meaning |
| --- | --- | --- |
| `feel` | Yes | `straight` or `swing` |
| `triplets` | No | Explicit triplet groups referencing existing notes |

**Straight** keeps literal written/performance positions. **Swing** writes an
ordinary eighth-note pair at offsets 0/48 but plays it at 0/64 (fixed 2:1). The
renderer adds a Swing marking. It never moves stored notes or applies swing twice.
Offsets are relative to a quarter-note beat; JSON ticks run from the start of
the lesson, across all bars.

| Subdivision | Performance spacing | Written duration |
| --- | --- | --- |
| Quarter | 96 | Quarter |
| Straight eighth | 48 | Eighth |
| Sixteenth | 24 | Sixteenth |
| Thirty-second | 12 | Thirty-second |
| Eighth-note triplet | 32 | Three eighths in a quarter |
| Sixteenth-note triplet | 16 | Three sixteenths in an eighth |

Straight rhythms infer a binary grid, or literal triplets when notes require it.
Within Swing, ordinary eighths use 0/64. Explicit triplets stay literal. Beats
containing finer binary subdivisions (e.g. tick 12 or 24) remain literal too;
there is no sixteenth-note swing. Ambiguous mixtures of swung eighths and binary
subdivisions within the same voice/beat fail rather than being rounded.

## Explicit triplet groups

A hint accepts `instrument`, `tick`, and optional `unit` (8 or 16; default 8).
It references an **existing note**, not a second playable event list.

Swing 03 has a snare rest followed by two eighth-note triplets on beat 3 of bar 2:

```json
"notation": {
  "feel": "swing",
  "triplets": [{"instrument": "snare", "tick": 608}]
}
```

For `unit: 8`, use the containing quarter-note beat. Its slots here are
576/608/640: rest, snare, snare. One hint identifies the whole group.

Come Undone has sixteenth-note triplets within the second eighth of beats 2/4:

```json
"notation": {
  "feel": "straight",
  "triplets": [
    {"instrument": "ride", "tick": 144, "unit": 16},
    {"instrument": "ride", "tick": 336, "unit": 16}
  ]
}
```

For `unit: 16`, use the containing half-beat (48 ticks). Here the slots are
144/160/176 (note/rest/note) and 336/352/368 (three notes). Adjacent half-beat
groups are allowed. A hint is useful even where literal inference would work,
because it states the intended written group and retains its rests.

Missing note references, unsupported fields/units, duplicate or overlapping groups
on an instrument, and notes outside a group's three slots fail validation.
A hinted instrument gets its own voice so its triplet rests remain visible beside
other instruments. Half-beat groups use literal subdivisions within that beat.
No custom voice/duration fields are needed.

## Staff positions and symbols

These are percussion staff positions, not MIDI pitches. The foldable Drum key
shows only instruments present in the lesson. All twelve instruments share the
same table in `src/notation/drum-key.js`.

| Instrument | Staff position | Head / mark |
| --- | --- | --- |
| `hi_hat_closed` | Above staff (G5) | X; + at bar start and after an open hit |
| `hi_hat_open` | Above staff (G5) | X with circle |
| `hi_hat_pedal` | Below staff (D4) | X, lower voice |
| `ride` | Top line (F5) | X |
| `crash_1` | Above staff (A5) | X |
| `crash_2` | Above staff (B5) | X |
| `snare` | Third space (C5) | Normal |
| `tom_1` | Top space (E5) | Normal |
| `tom_2` | Fourth line (D5) | Normal |
| `tom_3` | Middle line (B4) | Normal |
| `tom_4` | Second space (A4) | Normal |
| `kick` | Bottom space (F4) | Normal, lower voice |

Simultaneous heads share a stem where possible. Heads at the same/adjacent
positions are displaced by the engraver; each retains its own instrument,
performance tick, note index, and assessment result. No hits are merged.

## Conversion, playback, and limits

`lessonNotation(lesson)` derives bars, voices, note/rest durations, beams, and
triplets without changing lesson data. Every printed head references exactly one
source note. It retains its written tick, performance tick, original note index,
and stable `instrument:tick` identity. The overlay adds the active loop iteration
from the existing clock. It does not schedule audio or grade input.

Each voice partitions every bar into four beats. Beams group by beat/tuplet;
aligned quarter rests combine into half/bar rests. Empty tracks do not create
redundant voices; silent bars remain visible. Durations describe reading rhythm,
not sample sustain. The score uses one current bar and one upcoming bar, with
pages for up to sixteen bars. Narrow screens scroll instead of shrinking notes.

All nine bundled lessons use version 2. Tests compare their scheduled events with
saved originals at three tempos. Version 1 remains valid with its original strict
schema and literal notation; a title never implies Swing.

Unsupported rhythms leave the lesson playable in Lanes with a clear explanation.
Renderer/font failures offer Retry notation. No arbitrary ticks are rounded and
no notes are silently omitted. General ties/dotted durations, arbitrary tuplets,
custom voices, dynamics/ghost-note volume, rim/bell/edge notation, other meters,
variable swing, editing, and printing remain outside this iteration.

For visual review, use the main app's Notation view. The static development page
at `/scripts/notation-preview.html` still fetches Californication, Swing 01, and
Swing 03 and displays their exact metadata. The preview is not deployed.
