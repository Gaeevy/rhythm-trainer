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

Either lesson version can include an optional `backing` object. Set `midi`
for a prepared song clip. Exercises can use generated harmony.

### Add a song excerpt

1. Identify the recording or arrangement and the exact excerpt. Record which
   source measure starts the loop, the number of bars and any pickup. A timestamp
   helps when the score and the recording number their bars differently.
2. Transcribe the drum part to the lesson JSON. Match the same measures in a
   pitched part for the backing. For chords, use chord symbols or enough
   guitar, piano or bass notation to establish the harmony. For a melody or
   riff, include its full staff or tab, clef or tuning, and measure numbers.
   If the phrase starts before the first downbeat, include the preceding bar
   or mark the exact entrance relative to the drum loop.
3. Prepare a MIDI clip with its first bar aligned to the lesson's first bar.
   Save it next to the JSON and enter the clip length, including any trailing
   rests. Use the same stable filename stem for both files when practical.

```json
{
  "midi": "chop-suey.mid",
  "bars": 2
}
```

Use Standard MIDI File format 0 or 1, 4/4, and ticks per quarter note. The
filename uses lowercase letters, digits and hyphens. Set `bars` to 1–16 and
keep all pitched note starts and ends inside that loop. The drum lesson and
the backing clip can have different lengths. Export just the pitched parts
you want to hear. Playback uses the file's notes, timing, duration and velocity
with the app's piano sound and selected BPM. Channel 10 is reserved for drums.
If a phrase depends on pedal sustain, extend those notes before export.
Run `npm test` to validate each referenced clip, then practice through at least
two repeats to check the loop boundary.

### Generate a backing track

For generated backing, every field below is optional. With an empty or absent
`backing` object, the exercise uses the default progression.

```json
{
  "key": "D minor",
  "progression": ["i7", "iv7", "V7", "i7"]
}
```

| Field | Value |
| --- | --- |
| `key` | Tonic A–G with optional `b` or `#`, followed by `major` or `minor`. Defaults to `C minor`. |
| `progression` | One entry per backing bar. Use a scale degree for the whole bar or a list of chord changes within that bar. |
| `bars` | Integer from 1 to 16. Defaults to the number of entries in `progression`, or 4 without a progression. If both fields are present, their lengths must agree. |

In a list of chord changes, each object contains `tick` and `degree`. Tick
positions are relative to the start of the bar, from 0 to 383. Start with
tick 0 and list each later tick once in ascending order. Tick 192 is beat
three. Use the performed tick for a swung change, as with drum notes.

```json
{
  "key": "G minor",
  "progression": [
    [{"tick": 0, "degree": "I5"}, {"tick": 192, "degree": "#VII5"}],
    [{"tick": 0, "degree": "II5"}, {"tick": 192, "degree": "IV5"}]
  ]
}
```

Use Roman numerals I–VII for roots, with an optional `b` or `#` before the
numeral to alter the scale degree. Roots follow the major or natural minor
scale in the selected key. Uppercase gives a major triad and lowercase gives
a minor triad. The suffix `7` adds a minor seventh and `maj7` adds a major
seventh. Use `ø7` for a half-diminished seventh, `°` for a diminished triad
or `5` for a power chord with root and perfect fifth. In C minor, `V7` is
G–B–D–F and `V5` is G–D.

The default progression is `iiø7 → V7 → i7 → i7` in minor and
`ii7 → V7 → Imaj7 → Imaj7` in major. With a custom length and no progression,
the generator cycles through those degrees and uses the tonic chord in the
final bar. Use either the prepared MIDI file or the generator settings in a
lesson's `backing` object.

### Song backing sources

The initial MIDI clips are piano practice arrangements based on these charts.

| Lesson | Backing phrase | Source |
| --- | --- | --- |
| Autumn Leaves | Four bars in C minor around the closing vocal phrase. Cm7 enters on the first kick at tick 352 of bar 2. | [Jazz changes transposed to C minor for practice](https://spytunes.com/autumn-leaves-chords/) |
| Californication | Two-bar verse riff, Am – F | [Drum transcription](https://www.7drumcity.com/uploads/4/4/2/7/4427384/californication_v4.pdf), [guitar chart](https://themusicdept.com/wp-content/uploads/2016/08/Jam-RHCP-Californication.pdf) |
| Chop Suey! | Instrumental bars 24–25, G5 – F♯5 / A5 – C5, with changes on beat three | [Drum transcription](https://freemusicsheets.neocities.org/Drums_24/System%20of%20A%20Down/Chop%20Suey%21%20Drum%20Tab%20by%20System%20of%20a%20Down%20_%20Songsterr%20Tabs%20with%20Rhythm.pdf), [guitar chart](https://guitartuna.com/chords/chop-suey-system-of-a-down-original-guitar-chords-616681fc954419ddfca26f04) |
| Come Undone | Four-bar main loop, Cm – B♭ – A♭ – B♭ | [Guitar chart with capo at fret 1](https://www.songsterr.com/a/wsa/duran-duran-come-undone-chords-s23869), [bass score](https://billwingfieldsbassvault.wordpress.com/wp-content/uploads/2018/02/come-undone.pdf) |
| Fascination Street | Four opening bars, Cm – Cm – A♭ – Gm, reduced to one chord per bar from the repeating bass figure | [Bass transcription](https://karmaskinmusic.com/fascination-street-the-cure-bass-tab/), [arrangement analysis](https://songparts.com/songs/the-cure/fascination-street) |

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
