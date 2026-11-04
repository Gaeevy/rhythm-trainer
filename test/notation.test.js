import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { validateLesson } from "../src/lesson.js";
import { lessonNotation, NotationError } from "../src/notation/model.js";
import { lessonEvents } from "../src/playback.js";

const example = (notes = [0, 48], notation = { feel: "straight" }) => ({
    version: 2, title: "Notation test", bpm: 80, time_signature: [4, 4], bars: 1,
    tracks: [{ instrument: "snare", notes }], notation,
});
const references = model => model.bars.flatMap(bar => bar.voices.flatMap(voice => voice.notes.flatMap(note => note.refs)));

test("version 1 remains unchanged and version 2 metadata is strict", () => {
    const lesson = example(); delete lesson.notation; lesson.version = 1;
    assert.equal(validateLesson(lesson), lesson);
    assert.throws(() => validateLesson({ ...lesson, notation: { feel: "swing" } }), /not supported/);
    for (const notation of [null, [], {}, { feel: "classic" }, { feel: "swing", ratio: 3 }, { feel: "straight", triplets: null }]) {
        assert.throws(() => validateLesson({ ...example(), notation }), /lesson.notation/);
    }
    const missing = example(); delete missing.notation;
    assert.throws(() => validateLesson(missing), /notation: is required/);
});

test("swing maps performed tick 64 to written tick 48 exactly once", () => {
    const lesson = example([0, 64], { feel: "swing" });
    const original = structuredClone(lesson);
    const model = lessonNotation(lesson);
    assert.deepEqual(references(model).map(ref => [ref.writtenTick, ref.performanceTick]), [[0, 0], [48, 64]]);
    assert.deepEqual(lesson, original);
    assert.deepEqual(lessonNotation(lesson), model);
});

test("literal triplets are not mistaken for swing and explicit hints preserve the rest", () => {
    const literal = example([32, 64]); literal.version = 1; delete literal.notation;
    assert.deepEqual(references(lessonNotation(literal)).map(ref => ref.writtenTick), [32, 64]);
    const lesson = example([32, 64], { feel: "swing", triplets: [{ instrument: "snare", tick: 32 }] });
    const voice = lessonNotation(lesson).bars[0].voices[0];
    assert.deepEqual(voice.tuplets, [[0, 1, 2]]);
    assert.equal(voice.notes[0].rest, true);
    assert.deepEqual(voice.notes.slice(0, 3).map(note => note.durationTicks), [32, 32, 32]);
    assert.deepEqual(references(lessonNotation(lesson)).map(ref => ref.writtenTick), [32, 64]);
    assert.throws(() => lessonNotation(example([32, 64], { feel: "swing" })), /triplet hint/);
});

test("invalid, duplicate and incompatible triplet references fail before playback", () => {
    const hint = { instrument: "snare", tick: 32 };
    for (const triplets of [[null], [{ ...hint, instrument: "kick" }], [{ ...hint, tick: 16 }], [hint, { ...hint, tick: 64 }], [{ ...hint, duration: 8 }]]) {
        assert.throws(() => validateLesson(example([32, 64], { feel: "swing", triplets })), /notation/);
    }
    assert.throws(() => validateLesson(example([0, 48], { feel: "swing", triplets: [{ instrument: "snare", tick: 0 }] })), /three eighth-note triplets/);
});

test("bars and voices cover four beats with simultaneous notes, empty tracks/bars, and final sixteenth", () => {
    const lesson = example([0, 360]); lesson.bars = 2;
    lesson.tracks.push({ instrument: "ride", notes: [0] }, { instrument: "kick", notes: [0, 336] }, { instrument: "tom_1", notes: [] });
    const model = lessonNotation(lesson);
    for (const bar of model.bars) for (const voice of bar.voices) {
        assert.equal(voice.notes.reduce((sum, note) => sum + note.durationTicks, 0), 384);
    }
    assert.equal(model.bars[1].voices.every(voice => voice.notes.every(note => note.rest)), true);
    assert.equal(references(model).length, 5);
    assert.equal(new Set(references(model).map(ref => ref.id)).size, 5);
    assert.equal(references(model).filter(ref => ref.performanceTick === 0).length, 3);
    assert.equal(references(model).find(ref => ref.performanceTick === 360).writtenTick, 360);
});

test("unsupported rhythms remain playable but notation fails without rounding or discarding", () => {
    const lesson = example([0, 383]);
    validateLesson(lesson);
    assert.throws(() => lessonNotation(lesson), NotationError);
    assert.deepEqual(lesson.tracks[0].notes, [0, 383]);
});

test("straight eighths/sixteenths get beat-local beams and sorted references", () => {
    const voice = lessonNotation(example([0, 24, 48, 72, 96, 144])).bars[0].voices[0];
    assert.deepEqual(voice.beams, [[0, 1, 2, 3], [4, 5]]);
    assert.deepEqual(voice.notes.slice(0, 4).map(note => note.duration), ["16", "16", "16", "16"]);
});

test("migrated lessons preserve all scheduled events and note identities from before notation", async () => {
    const originals = JSON.parse(await readFile(new URL("./fixtures/notation-originals.json", import.meta.url)));
    for (const [id, original] of Object.entries(originals)) {
        const migrated = JSON.parse(await readFile(new URL(`../lessons/${id}.json`, import.meta.url)));
        validateLesson(migrated);
        for (const bpm of [60, 96, 180]) assert.deepEqual(lessonEvents(migrated, bpm), lessonEvents(original, bpm));
        const refs = references(lessonNotation(migrated));
        assert.deepEqual(refs.map(ref => ref.id).sort(), original.tracks.flatMap(track => track.notes.map(tick => `${track.instrument}:${tick}`)).sort());
        for (const bar of lessonNotation(migrated).bars) for (const voice of bar.voices) {
            assert.equal(voice.notes.reduce((sum, note) => sum + note.durationTicks, 0), 384);
        }
    }
});

test("quarter rests combine into aligned half/bar rests without moving later beams or tuplets", () => {
    const lesson = example([0]); lesson.bars = 2;
    const model = lessonNotation(lesson);
    assert.deepEqual(model.bars[0].voices[0].notes.map(note => note.duration), ["4", "4r", "2r"]);
    assert.deepEqual(model.bars[1].voices[0].notes.map(note => [note.duration, note.durationTicks]), [["1r", 384]]);
    const sparse = lessonNotation(example([224, 256], { feel: "swing", triplets: [{ instrument: "snare", tick: 224 }] }));
    const voice = sparse.bars[0].voices[0];
    assert.equal(voice.notes[0].duration, "2r");
    assert.deepEqual(voice.tuplets, [[1, 2, 3]]);
    assert.equal(voice.notes[voice.tuplets[0][0]].writtenTick, 192);
});
