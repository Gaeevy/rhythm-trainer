import {
    TICKS_PER_BAR, TICKS_PER_BEAT, TICKS_PER_EIGHTH, TICKS_PER_SIXTEENTH, SWING_EIGHTH_TICK,
} from "./music-time.js";

const degrees = ["I", "II", "III", "IV", "V", "VI", "VII"];
const degreePattern = /^([b#]?)(VII|III|VI|IV|II|V|I|vii|iii|vi|iv|ii|v|i)(maj7|ø7|7|°)?$/;
const keyPattern = /^([A-G])([b#]?) (major|minor)$/;
const keyPitch = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const scales = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
const defaultProgression = ["iiø7", "V7", "i7", "i7"];
const accidental = { "": 0, b: -1, "#": 1 };

export function validateBacking(backing, requireCondition) {
    const path = "lesson.backing";
    requireCondition(backing !== null && typeof backing === "object" && !Array.isArray(backing),
        path, "must be an object");
    for (const field of Object.keys(backing)) {
        requireCondition(["bars", "key", "progression"].includes(field), `${path}.${field}`, "is not supported");
    }
    if (Object.hasOwn(backing, "bars")) {
        requireCondition(Number.isInteger(backing.bars) && backing.bars >= 1 && backing.bars <= 16,
            `${path}.bars`, "must be an integer from 1 to 16");
    }
    if (Object.hasOwn(backing, "key")) {
        requireCondition(typeof backing.key === "string" && keyPattern.test(backing.key),
            `${path}.key`, "must be a key such as C minor or Bb major");
    }
    if (Object.hasOwn(backing, "progression")) {
        const progression = backing.progression;
        requireCondition(Array.isArray(progression) && progression.length >= 1 && progression.length <= 16,
            `${path}.progression`, "must contain 1 to 16 chords");
        for (const [index, degree] of progression.entries()) {
            requireCondition(typeof degree === "string" && degreePattern.test(degree),
                `${path}.progression[${index}]`, "must be a scale degree such as iiø7, V7 or i7");
        }
        requireCondition(backing.bars === undefined || backing.bars === progression.length,
            `${path}.progression`, "must contain one chord per backing bar");
    }
}

function chordPitches(degree, tonic, scale) {
    const [, alteration, numeral, suffix] = degree.match(degreePattern);
    const upper = numeral.toUpperCase();
    const minor = numeral !== upper;
    const root = tonic + scale[degrees.indexOf(upper)] + accidental[alteration];
    const pitch = 48 + ((root % 12) + 12) % 12;
    if (suffix === "ø7") return [pitch, pitch + 3, pitch + 6, pitch + 10];
    if (suffix === "°") return [pitch, pitch + 3, pitch + 6];
    const chord = [pitch, pitch + (minor ? 3 : 4), pitch + 7];
    if (suffix === "7") chord.push(pitch + 10);
    if (suffix === "maj7") chord.push(pitch + 11);
    return chord;
}

/** Generate two piano chords per bar from an already validated lesson. */
export function backingTrack(lesson) {
    const backing = lesson.backing ?? {};
    const [, letter, alteration, mode] = (backing.key ?? "C minor").match(keyPattern);
    const tonic = keyPitch[letter] + accidental[alteration];
    const bars = backing.bars ?? backing.progression?.length ?? defaultProgression.length;
    const tonicDegree = mode === "minor" ? "i7" : "Imaj7";
    const defaults = mode === "minor" ? defaultProgression : ["ii7", "V7", "Imaj7", "Imaj7"];
    const kickTicks = lesson.tracks.find(track => track.instrument === "kick")?.notes ?? [];
    const offbeat = lesson.notation?.feel === "swing" ? SWING_EIGHTH_TICK : TICKS_PER_EIGHTH;
    const events = [];
    for (let bar = 0; bar < bars; bar++) {
        const degree = backing.progression?.[bar]
            ?? (bar === bars - 1 ? tonicDegree : defaults[bar % defaults.length]);
        const pitches = chordPitches(degree, tonic, scales[mode]);
        const tick = bar * TICKS_PER_BAR;
        let accent = 2 * TICKS_PER_BEAT + offbeat;
        // Follow a kick syncopation only when the drum phase repeats with this chord.
        if (bars % lesson.bars === 0) {
            const drumBar = (bar % lesson.bars) * TICKS_PER_BAR;
            const kick = kickTicks.findLast(note => note >= drumBar + 2 * TICKS_PER_BEAT
                && note <= drumBar + TICKS_PER_BAR - TICKS_PER_SIXTEENTH
                && note % TICKS_PER_BEAT !== 0);
            if (kick !== undefined) accent = kick - drumBar;
        }
        events.push(
            { tick, pitches, durationTicks: 2 * TICKS_PER_BEAT, velocity: 0.8 },
            {
                tick: tick + accent, pitches, velocity: 0.55,
                durationTicks: Math.min(TICKS_PER_EIGHTH, TICKS_PER_BAR - accent),
            },
        );
    }
    return { bars, events };
}
