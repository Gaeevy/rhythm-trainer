import assert from "node:assert/strict";
import test from "node:test";
import { backingTrack } from "../src/backing.js";
import { validateLesson } from "../src/lesson.js";

const swing = {
    version: 2, title: "Backing test", bpm: 120, time_signature: [4, 4], bars: 1,
    notation: { feel: "swing" }, tracks: [{ instrument: "ride", notes: [0] }],
};

test("default harmony and swing accents repeat for four bars independently of the drum length", () => {
    const track = backingTrack(swing);
    assert.equal(track.bars, 4);
    assert.deepEqual(track.events.map(event => event.tick), [0, 256, 384, 640, 768, 1024, 1152, 1408]);
    assert.deepEqual(track.events.filter((_, index) => index % 2 === 0).map(event => event.pitches),
        [[50, 53, 56, 60], [55, 59, 62, 65], [48, 51, 55, 58], [48, 51, 55, 58]]);
    assert.deepEqual(track, backingTrack({ ...swing, backing: {} }));
    const { notation, ...oldLesson } = swing;
    assert.equal(backingTrack({ ...oldLesson, version: 1 }).events[1].tick, 240);
});

test("lesson progression sets the length and is resolved in the lesson key", () => {
    const lesson = validateLesson({ ...swing, backing: { key: "Bb major", progression: ["ii7", "V7", "Imaj7"] } });
    const track = backingTrack(lesson);
    assert.equal(track.bars, 3);
    assert.deepEqual(track.events.filter((_, index) => index % 2 === 0).map(event => event.pitches),
        [[48, 51, 55, 58], [53, 57, 60, 63], [58, 62, 65, 69]]);
    const oneBar = backingTrack(validateLesson({ ...swing, backing: { bars: 1, key: "D minor" } }));
    assert.equal(oneBar.bars, 1);
    assert.deepEqual(oneBar.events[0].pitches, [50, 53, 57, 60]);
});

test("a kick accent follows exact ticks when drum phase is stable and ends by the bar boundary", () => {
    const kick = { instrument: "kick", notes: [0, 224, 352, 383] };
    const lesson = { ...swing, tracks: [kick] };
    const accents = backingTrack(validateLesson(lesson)).events.filter((_, index) => index % 2 === 1);
    assert.deepEqual(accents.map(event => event.tick), [352, 736, 1120, 1504]);
    assert.equal(accents[0].durationTicks, 32);
    const shifting = backingTrack(validateLesson({ ...lesson, bars: 3 })).events;
    assert.equal(shifting[1].tick, 256);
});

test("timed changes keep the accent on the active chord and play once when they coincide", () => {
    const lesson = validateLesson({
        ...swing, bars: 2, tracks: [{ instrument: "kick", notes: [256, 640] }],
        backing: {
            key: "G minor", bars: 2,
            progression: [
                [{ tick: 0, degree: "I5" }, { tick: 192, degree: "#VII5" }, { tick: 280, degree: "IV5" }],
                [{ tick: 0, degree: "II5" }, { tick: 256, degree: "IV5" }],
            ],
        },
    });
    assert.deepEqual(backingTrack(lesson), { bars: 2, events: [
        { tick: 0, pitches: [55, 62], durationTicks: 192, velocity: 0.8 },
        { tick: 192, pitches: [54, 61], durationTicks: 64, velocity: 0.8 },
        { tick: 256, pitches: [54, 61], durationTicks: 24, velocity: 0.55 },
        { tick: 280, pitches: [48, 55], durationTicks: 104, velocity: 0.8 },
        { tick: 384, pitches: [57, 64], durationTicks: 192, velocity: 0.8 },
        { tick: 640, pitches: [48, 55], durationTicks: 128, velocity: 0.8 },
    ] });
});

test("adjacent ticks and the last tick in a bar keep positive chord durations", () => {
    const lesson = validateLesson({ ...swing, backing: {
        progression: [[{ tick: 0, degree: "i" }, { tick: 1, degree: "v" }, { tick: 383, degree: "V7" }]],
    } });
    const events = backingTrack(lesson).events;
    assert.equal(events[0].durationTicks, 1);
    assert.equal(events.at(-1).tick, 383);
    assert.equal(events.at(-1).durationTicks, 1);
});

test("invalid backing metadata fails lesson validation with the field path", () => {
    for (const [backing, field] of [
        [null, ""], [[], ""], [{ feel: "swing" }, ".feel"], [{ bars: 0 }, ".bars"],
        [{ bars: 17 }, ".bars"], [{ key: "H minor" }, ".key"], [{ progression: [] }, ".progression"],
        [{ progression: ["VIII"] }, ".progression[0]"], [{ progression: [null] }, ".progression[0]"],
        [{ bars: 2, progression: ["i7"] }, ".progression"],
        [{ midi: "../phrase.mid", bars: 2 }, ".midi"],
        [{ midi: "https://example.com/phrase.mid", bars: 2 }, ".midi"],
        [{ midi: "phrase.mid" }, ".bars"],
        [{ midi: "phrase.mid", bars: 2, key: "C minor" }, ".key"],
        [{ midi: "phrase.mid", bars: 2, progression: ["i7", "i7"] }, ".progression"],
        ...[
            [[], ""],
            [[null], "[0]"],
            [[{ tick: 1, degree: "i" }], "[0].tick"],
            [[{ tick: 0, degree: "i", duration: 192 }], "[0].duration"],
            [[{ tick: 0, degree: "H5" }], "[0].degree"],
            [[{ tick: 0 }], "[0].degree"],
            ...[0, 384, -1, 32.5, "192"].map(tick => [
                [{ tick: 0, degree: "i" }, { tick, degree: "V" }], "[1].tick",
            ]),
            [[{ tick: 0, degree: "i" }, { tick: 192, degree: "iv" }, { tick: 96, degree: "V" }], "[2].tick"],
        ].map(([bar, field]) => [{ progression: [bar] }, `.progression[0]${field}`]),
    ]) {
        assert.throws(() => validateLesson({ ...swing, backing }), { message: new RegExp(
            `^${RegExp.escape(`lesson.backing${field}`)}:`,
        ) });
    }
});
