import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { LessonValidationError, parseLesson, validateLesson } from "../src/lesson.js";

import { BUNDLED_LESSONS } from "../generated/lesson-catalog.js";

function example() {
    return {
        version: 1, title: "Test lesson", bpm: 80, time_signature: [4, 4], bars: 1,
        tracks: [{ instrument: "ride", notes: [0, 96, 160, 383] }],
    };
}

test("all bundled lessons parse and validate", async () => {
    const directory = new URL("../lessons/", import.meta.url);
    const files = (await readdir(directory)).filter(file => file.endsWith(".json"));
    assert.deepEqual(files.sort(), BUNDLED_LESSONS.map(({ id }) => `${id}.json`).sort(),
        "Each lesson JSON must have exactly one entry in the generated catalog");
    for (const file of files) {
        parseLesson(await readFile(new URL(file, directory), "utf8"));
    }
});

test("validation preserves data, track order, subsets, and simultaneous notes", () => {
    const lesson = example();
    lesson.tracks.push({ instrument: "kick", notes: [0] }, { instrument: "snare", notes: [] });
    const before = structuredClone(lesson);
    assert.equal(validateLesson(lesson), lesson);
    assert.deepEqual(lesson, before);
});

test("one and sixteen bars accept first and last ticks", () => {
    for (const bars of [1, 16]) {
        const lesson = example();
        lesson.bars = bars;
        lesson.tracks[0].notes = [0, bars * 384 - 1];
        validateLesson(lesson);
        lesson.tracks[0].notes.push(bars * 384);
        assert.throws(() => validateLesson(lesson), /lesson\.tracks\[0\]\.notes\[2\]/);
    }
});

const invalidCases = [
    ["version", 2, /lesson\.version/],
    ["title", "  ", /lesson\.title/],
    ["title", 123, /lesson\.title/],
    ...[0, -1, NaN, Infinity, "80", null].map(value => ["bpm", value, /lesson\.bpm/]),
    ...[0, 17, 1.5, "1", null].map(value => ["bars", value, /lesson\.bars/]),
    ...[[3, 4], [4, 4, 4], "4/4", null].map(value => ["time_signature", value, /lesson\.time_signature/]),
    ...[[], null, {}].map(value => ["tracks", value, /lesson\.tracks/]),
];

for (const [field, value, message] of invalidCases) {
    test(`rejects ${field} = ${String(value)}`, () => {
        assert.throws(() => validateLesson({ ...example(), [field]: value }), message);
    });
}

test("missing and unknown fields have useful paths", () => {
    for (const field of Object.keys(example())) {
        const lesson = example();
        delete lesson[field];
        assert.throws(() => validateLesson(lesson), new RegExp(`lesson\\.${field}: is required`));
    }
    assert.throws(() => validateLesson({ ...example(), swing: true }), /lesson\.swing: is not supported/);
    for (const field of ["instrument", "notes"]) {
        const lesson = example();
        delete lesson.tracks[0][field];
        assert.throws(() => validateLesson(lesson), /is required/);
    }
    const lesson = example();
    lesson.tracks[0].velocity = 100;
    assert.throws(() => validateLesson(lesson), /tracks\[0\]\.velocity: is not supported/);
});

test("rejects malformed objects, unknown instruments, and duplicate tracks", () => {
    for (const value of [null, [], 1, "lesson"]) {
        assert.throws(() => validateLesson(value), LessonValidationError);
        assert.throws(() => validateLesson({ ...example(), tracks: [value] }), LessonValidationError);
    }
    const lesson = example();
    lesson.tracks[0].instrument = "tom";
    assert.throws(() => validateLesson(lesson), /tracks\[0\]\.instrument/);
    lesson.tracks = [example().tracks[0], example().tracks[0]];
    assert.throws(() => validateLesson(lesson), /tracks\[1\]\.instrument: duplicates/);
});

test("rejects malformed, unsorted, duplicate, fractional, and out-of-range notes", () => {
    for (const notes of [null, {}, "0", [-1], [384], [0.5], [NaN], [Infinity], ["0"], [null], [96, 0], [0, 0]]) {
        const lesson = example();
        lesson.tracks[0].notes = notes;
        assert.throws(() => validateLesson(lesson), /lesson\.tracks\[0\]\.notes/);
    }
    const lesson = example();
    lesson.tracks[0].notes = [];
    assert.throws(() => validateLesson(lesson), /at least one note/);
});

test("JSON parse errors use the same user-facing error type", () => {
    for (const text of ["", '{"version": 1,}', "// comment", undefined]) {
        assert.throws(() => parseLesson(text), LessonValidationError);
    }
    assert.throws(() => parseLesson("null"), /lesson: must be an object/);
});

test("removed generic hi-hat IDs are rejected", () => {
    const lesson = example();
    lesson.tracks = [{ instrument: "hi_hat", notes: [0] }, { instrument: "hi_hat_pedal", notes: [96] }];
    assert.throws(() => validateLesson(lesson), /must be one of/);
});
