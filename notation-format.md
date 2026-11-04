# Lesson notation format — milestone 2

Version 2 adds written-notation metadata to the existing JSON lesson. Keep the
same `title`, `bpm`, `time_signature`, `bars`, and `tracks`. Track `notes` remain
**performance ticks**, at 96 ticks per quarter note and 384 ticks per 4/4 bar.
Playback, MIDI/keyboard assessment, and the Lanes view continue to use those ticks.
Adding a lesson still requires only one JSON file in `lessons/`.

## Straight and Swing

A complete minimal version 2 example:

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
| `triplets` | No | Array of explicit eighth-note triplet group references |

- **Straight:** notes keep their literal written/performance positions. For
  example, offsets 0 and 48 within a beat are ordinary eighth notes. Offsets
  0/24/48/72 are sixteenths. Literal eighth-note triplets use 0/32/64.
- **Swing:** ordinary written eighth notes at offsets 0/48 refer to performance
  offsets 0/64. The renderer shows eighth notes plus a Swing marking. It never
  moves the stored notes or applies another timing delay.
- Offsets are relative to each quarter-note beat; stored lesson ticks are absolute
  from the start of the lesson, across all its bars.

The migrated examples are:

- `californication.json`: `"notation": {"feel": "straight"}`.
- `swing-01.json`: `"notation": {"feel": "swing"}`.
- `swing-03.json`: Swing plus the explicit group below.

## Explicit triplets within Swing

Swing 03 contains a snare rest followed by two eighth-note triplets on beat 3
of bar 2. This must remain a triplet group rather than becoming ordinary swung
notation. It uses:

```json
"notation": {
  "feel": "swing",
  "triplets": [{"instrument": "snare", "tick": 608}]
}
```

Each reference accepts exactly `instrument` and `tick`. It names an **existing
note** on that instrument. The converter uses the quarter-note beat containing
that note as the three-slot group. Here the beat starts at tick 576, with slots
576/608/640: snare rest, snare note, snare note.

One reference is enough for a group. Referencing two notes in the same
instrument/beat is rejected as a duplicate. Missing notes/instruments, extra
fields, and beats containing notes outside the three slots are rejected.

The referenced instrument receives its own voice throughout the lesson so its
rests and triplet remain visible. Other hand instruments stay grouped in an
upper voice; kick and pedal stay grouped in a lower voice. This keeps the ride's
quarter note independent from the snare's triplet. No separate voice hints are
needed for the current three examples.

## Derived notation and limits

`lessonNotation(lesson)` produces bars containing voices, note/rest durations,
beam groups, and tuplet groups. Every printed notehead references its original
instrument and performance tick. It also records its written tick and stable
`instrument:tick` identity. Future playback overlays will add the loop iteration;
this static model does not store an active playback session.

Durations partition every bar into exactly four beats per voice. Rhythms are
split at beats for readable beams; aligned quarter rests combine into half/bar
rests. Percussion note durations are inferred rhythmic notation, not sample
sustain instructions. Explicit note-length/voice authoring is outside this step.

Milestone 2 supports quarters, straight eighths/sixteenths, swung eighths, and
explicit eighth-note triplets. Thirty-second notes, sixteenth-note triplets,
open/closed hi-hat marks, and full-kit collision handling remain milestone 6 work.
A rhythm outside current notation support raises an explanation instead of
rounding ticks or silently dropping notes. It remains playable in Lanes.

Version 1 lessons keep their strict original schema and behavior. They do not
accept a `notation` field. If converted for display, they use literal rhythms;
the converter never guesses Swing from a title. Only the three examples above
are migrated in milestone 2; other lessons remain version 1.

## Review

Open `http://localhost:8000/scripts/notation-preview.html` after starting the
normal server. The page fetches the three real lesson JSON files. Expand
**Lesson notation metadata** beneath a score to see the exact version/feel/hints.
Review Californication, Swing 01, and especially Swing 03's second bar.
This step has no notation playback marker or feedback yet.
