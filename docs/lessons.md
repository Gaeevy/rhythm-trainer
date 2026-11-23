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

Either lesson version can include an optional `backing` object. Prefer `midi`
for a prepared song clip so it follows practice tempo at the original pitch.
Use `audio` when the rendered instrument tone or mix matters. Exercises can
use generated harmony.

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
3. Align the backing file's first bar to the lesson's first bar. Save it beside
   the JSON with a lowercase, hyphenated filename. Set `bars` to the full loop
   length from 1 to 16, including trailing rests. The drum and backing loops
   can have different lengths.
4. Run `npm test`, then practice through two repeats to check the loop boundary.

### WAV backing

```json
{
  "audio": "chop-suey.wav",
  "bars": 2
}
```

Use a PCM WAV. Trim or pad the recording to exactly the stated number of bars
at its recorded tempo. Use the song's original tempo to hear the recorded pitch.

### MIDI backing

Use `midi` instead of `audio`. Export a Standard MIDI File in format 0 or 1,
4/4, with ticks per quarter note. Keep pitched notes within the loop and extend
any notes that depend on pedal sustain before export. Channel 10 is reserved
for drums.

Use Program Change on the same track and channel as the notes. Displayed
General MIDI program 28 (byte 27) plays clean electric guitar. Programs 33–40
(bytes 32–39) share the picked bass voice, with 3 dB of gain. Other programs use
piano. Pitch bend follows its channel and uses the pitch-bend sensitivity
setting when present.

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
| `key` | Tonic A–G with optional `b` or `#`, followed by `major` or `minor`. Defaults to `E minor` for straight exercises without a progression, and `C minor` for generated piano. |
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

Straight exercises without an explicit progression default to clean guitar and
picked bass. The four-bar progression is `i7 → VImaj7 → III → VII` in minor
(`Em7 → Cmaj7 → G → D` in the default key) and `vi7 → IVmaj7 → I → V` in
major. With a custom length, repeat or trim that progression to fit.

Swing exercises, version 1 lessons and exercises with an explicit progression
use generated piano. Its default progression is `iiø7 → V7 → i7 → i7` in minor and
`ii7 → V7 → Imaj7 → Imaj7` in major. With a custom length and no progression,
the generator cycles through those degrees and uses the tonic chord in the
final bar. Use generator settings in lessons without a prepared backing file.

### Song backing sources

The clips are practice arrangements based on these charts.

| Lesson | Backing phrase | Source |
| --- | --- | --- |
| Autumn Leaves | Four bars in C minor around the closing vocal phrase. Cm7 enters on the first kick at tick 352 of bar 2. B7 and A7 enter on the kicks before beat three in bars 3 and 4. | [Jazz changes transposed to C minor for practice](https://spytunes.com/autumn-leaves-chords/) |
| Californication | Four-bar verse clip. The Am – Fmaj7 guitar arpeggio repeats over the bass phrase, including its sixteenth-note triplets. | Supplied guitar and bass tablature, [drum transcription](https://www.7drumcity.com/uploads/4/4/2/7/4427384/californication_v4.pdf) |
| Chop Suey! | Two bars at 80 BPM. Guitar and bass play sixteenths in Drop C. The WAV is a mix captured in Ableton Live with Shreddage 3 Stratus Free on guitar and Electric Bass Raw on bass. | Supplied guitar and bass tablature, [drum transcription](https://freemusicsheets.neocities.org/Drums_24/System%20of%20A%20Down/Chop%20Suey%21%20Drum%20Tab%20by%20System%20of%20a%20Down%20_%20Songsterr%20Tabs%20with%20Rhythm.pdf), [Shreddage 3 Stratus Free](https://impactsoundworks.com/product/shreddage-3-stratus-free-kp/) |
| Come Undone | Four-bar main loop, Cm – B♭ – A♭ – B♭ | [Guitar chart with capo at fret 1](https://www.songsterr.com/a/wsa/duran-duran-come-undone-chords-s23869), [bass score](https://billwingfieldsbassvault.wordpress.com/wp-content/uploads/2018/02/come-undone.pdf) |
| Come Undone (Placebo) | Bars 2–5 at 85 BPM. The clean guitar plays C5 – C5 – B♭5 – B♭5 in eighths under a G–F–C lead figure. Both parts use the chart's F–B♭–E♭–A♭–C–C tuning. The drum chart's backbeat uses the trainer's snare track. | Supplied guitar and drum tablature, [Placebo recording](https://www.youtube.com/watch?v=FO2zaYPLUgE) |
| Fascination Street | Electric guitar and picked bass for bars 9–12. Bass slides follow the supplied tab, with slide lengths set for practice. | Supplied guitar and bass tablature |

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
