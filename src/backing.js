import {
    TICKS_PER_BAR, TICKS_PER_BEAT, TICKS_PER_EIGHTH, TICKS_PER_SIXTEENTH, SWING_EIGHTH_TICK,
} from "./music-time.js";

const degrees = ["I", "II", "III", "IV", "V", "VI", "VII"];
const degreePattern = /^([b#]?)(VII|III|VI|IV|II|V|I|vii|iii|vi|iv|ii|v|i)(maj7|ø7|7|5|°)?$/;
const keyPattern = /^([A-G])([b#]?) (major|minor)$/;
const keyPitch = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const scales = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
const defaultProgression = ["iiø7", "V7", "i7", "i7"];
const straightProgressions = {
    minor: ["i7", "VImaj7", "III", "VII"],
    major: ["vi7", "IVmaj7", "I", "V"],
};
const guitarSteps = [0, 2, 4, 7];
const bassPatterns = [
    { steps: [0, 3, 6, 8, 11, 13, 15], velocities: [0.78, 0.62, 0.67, 0.75, 0.64, 0.67, 0.62] },
    { steps: [0, 4, 7, 8, 10, 13, 15], velocities: [0.78, 0.65, 0.60, 0.75, 0.64, 0.66, 0.62] },
];
const accidental = { "": 0, b: -1, "#": 1 };

function validDegree(degree) {
    return typeof degree === "string" && degreePattern.test(degree);
}

function validateProgressionBar(bar, path, requireCondition) {
    const degreeHint = "must be a scale degree such as iiø7, V7 or I5";
    if (!Array.isArray(bar)) {
        requireCondition(validDegree(bar), path, degreeHint);
        return;
    }
    requireCondition(bar.length > 0, path, "must contain at least one chord change");
    let previousTick = -1;
    for (const [index, change] of bar.entries()) {
        const changePath = `${path}[${index}]`;
        requireCondition(change !== null && typeof change === "object" && !Array.isArray(change),
            changePath, "must be an object");
        for (const field of Object.keys(change)) {
            requireCondition(field === "tick" || field === "degree", `${changePath}.${field}`, "is not supported");
        }
        requireCondition(Number.isInteger(change.tick) && change.tick >= 0 && change.tick < TICKS_PER_BAR,
            `${changePath}.tick`, `must be an integer from 0 to ${TICKS_PER_BAR - 1}`);
        requireCondition(index > 0 || change.tick === 0, `${changePath}.tick`, "the first change must start at tick 0");
        requireCondition(change.tick > previousTick, `${changePath}.tick`, "must be sorted and unique");
        requireCondition(validDegree(change.degree), `${changePath}.degree`, degreeHint);
        previousTick = change.tick;
    }
}

export function validateBacking(backing, requireCondition) {
    const path = "lesson.backing";
    requireCondition(backing !== null && typeof backing === "object" && !Array.isArray(backing),
        path, "must be an object");
    for (const field of Object.keys(backing)) {
        requireCondition(["bars", "key", "progression", "midi"].includes(field), `${path}.${field}`, "is not supported");
    }
    if (Object.hasOwn(backing, "bars")) {
        requireCondition(Number.isInteger(backing.bars) && backing.bars >= 1 && backing.bars <= 16,
            `${path}.bars`, "must be an integer from 1 to 16");
    }
    if (Object.hasOwn(backing, "midi")) {
        requireCondition(typeof backing.midi === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*\.mid$/.test(backing.midi),
            `${path}.midi`, "must be a lowercase .mid filename beside the lesson");
        requireCondition(Object.hasOwn(backing, "bars"), `${path}.bars`, "is required for MIDI backing");
        for (const field of ["key", "progression"]) {
            requireCondition(!Object.hasOwn(backing, field), `${path}.${field}`, "cannot be used with MIDI backing");
        }
    }
    if (Object.hasOwn(backing, "key")) {
        requireCondition(typeof backing.key === "string" && keyPattern.test(backing.key),
            `${path}.key`, "must be a key such as C minor or Bb major");
    }
    if (Object.hasOwn(backing, "progression")) {
        const progression = backing.progression;
        requireCondition(Array.isArray(progression) && progression.length >= 1 && progression.length <= 16,
            `${path}.progression`, "must contain 1 to 16 bars");
        for (const [index, bar] of progression.entries()) {
            validateProgressionBar(bar, `${path}.progression[${index}]`, requireCondition);
        }
        requireCondition(backing.bars === undefined || backing.bars === progression.length,
            `${path}.progression`, "length must match backing bars");
    }
}

function chordPitches(degree, tonic, scale) {
    const [, alteration, numeral, suffix] = degree.match(degreePattern);
    const upper = numeral.toUpperCase();
    const minor = numeral !== upper;
    const root = tonic + scale[degrees.indexOf(upper)] + accidental[alteration];
    const pitch = 48 + ((root % 12) + 12) % 12;
    if (suffix === "5") return [pitch, pitch + 7];
    if (suffix === "ø7") return [pitch, pitch + 3, pitch + 6, pitch + 10];
    if (suffix === "°") return [pitch, pitch + 3, pitch + 6];
    const chord = [pitch, pitch + (minor ? 3 : 4), pitch + 7];
    if (suffix === "7") chord.push(pitch + 10);
    if (suffix === "maj7") chord.push(pitch + 11);
    return chord;
}

function straightBacking(bars, tonic, mode) {
    const progression = straightProgressions[mode];
    const chords = Array.from({ length: bars }, (_, bar) => chordPitches(
        progression[bar % progression.length], tonic, scales[mode],
    ));
    const bassRoots = chords.map(([root]) => 28 + (root - 28) % 12);
    const events = [];
    for (const [bar, chord] of chords.entries()) {
        const barTick = bar * TICKS_PER_BAR;
        const [root, third, fifth, top = root + 12] = chord;
        const guitarPitches = [root, fifth, third, top];
        for (const [index, step] of guitarSteps.entries()) {
            const offset = step * TICKS_PER_SIXTEENTH;
            events.push({
                tick: barTick + offset, pitches: [guitarPitches[index]], program: 27,
                velocity: index === 0 ? 0.69 : 0.62, durationTicks: TICKS_PER_BAR - offset,
            });
        }
        const low = bassRoots[bar];
        const nextRoot = bassRoots[(bar + 1) % bars];
        // Approach the next root from above when it is the bass's low E.
        const approach = nextRoot === 28 ? nextRoot + 1 : nextRoot - 1;
        const bassPitches = [low, low + 7, low + 12, low, low + third - root, low + 7, approach];
        const { steps, velocities } = bassPatterns[bar % bassPatterns.length];
        for (const [index, step] of steps.entries()) {
            const offset = step * TICKS_PER_SIXTEENTH;
            const end = (steps[index + 1] ?? 16) * TICKS_PER_SIXTEENTH;
            events.push({
                tick: barTick + offset, pitches: [bassPitches[index]], program: 34,
                velocity: velocities[index], durationTicks: Math.min(3 * TICKS_PER_SIXTEENTH, end - offset),
            });
        }
    }
    events.sort((left, right) => left.tick - right.tick);
    return { bars, events };
}

/** Generate accompaniment from an already validated lesson. */
export function backingTrack(lesson) {
    const backing = lesson.backing ?? {};
    const straightDefault = lesson.notation?.feel === "straight" && !backing.progression;
    const defaultKey = straightDefault ? "E minor" : "C minor";
    const [, letter, alteration, mode] = (backing.key ?? defaultKey).match(keyPattern);
    const tonic = keyPitch[letter] + accidental[alteration];
    const bars = backing.bars ?? backing.progression?.length ?? defaultProgression.length;
    if (straightDefault) return straightBacking(bars, tonic, mode);
    const tonicDegree = mode === "minor" ? "i7" : "Imaj7";
    const defaults = mode === "minor" ? defaultProgression : ["ii7", "V7", "Imaj7", "Imaj7"];
    const kickTicks = lesson.tracks.find(track => track.instrument === "kick")?.notes ?? [];
    const offbeat = lesson.notation?.feel === "swing" ? SWING_EIGHTH_TICK : TICKS_PER_EIGHTH;
    const events = [];
    for (let bar = 0; bar < bars; bar++) {
        const harmony = backing.progression?.[bar]
            ?? (bar === bars - 1 ? tonicDegree : defaults[bar % defaults.length]);
        const changes = Array.isArray(harmony) ? harmony : [{ tick: 0, degree: harmony }];
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
        for (const [index, change] of changes.entries()) {
            const end = changes[index + 1]?.tick ?? TICKS_PER_BAR;
            const hasAccent = change.tick < accent && accent < end;
            const pitches = chordPitches(change.degree, tonic, scales[mode]);
            const nextOnset = hasAccent ? accent : end;
            events.push({
                tick: tick + change.tick, pitches, velocity: 0.8,
                durationTicks: Math.min(2 * TICKS_PER_BEAT, nextOnset - change.tick),
            });
            if (hasAccent) {
                events.push({
                    tick: tick + accent, pitches, velocity: 0.55,
                    durationTicks: Math.min(TICKS_PER_EIGHTH, end - accent),
                });
            }
        }
    }
    return { bars, events };
}
