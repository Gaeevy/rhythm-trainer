import { BUNDLED_LESSONS } from "../generated/lesson-catalog.js";
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
        const migrated = JSON.parse(await readFile(new URL(`../lessons/${BUNDLED_LESSONS.find(lesson => lesson.id === id).path}`, import.meta.url)));
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

test("thirty-seconds and sixteenth triplets retain exact ticks and partition each bar", () => {
    for (const notes of [[0, 12, 24, 36, 48, 60, 72, 84, 372], [0, 16, 32, 48, 64, 80], [0, 48, 80]]) {
        const model = lessonNotation(example(notes));
        assert.deepEqual(references(model).map(ref => ref.performanceTick), notes);
        assert.equal(model.bars[0].voices[0].notes.reduce((sum, note) => sum + note.durationTicks, 0), 384);
    }
    const thirtySeconds = lessonNotation(example([0, 12, 372])).bars[0].voices[0];
    assert.equal(thirtySeconds.notes[0].duration, "32");
    const triplets = lessonNotation(example([0, 16, 32, 48, 64, 80])).bars[0].voices[0];
    assert.deepEqual(triplets.tuplets, [[0, 1, 2], [3, 4, 5]]);
    assert.equal(triplets.notes[0].duration, "16");
});

test("explicit sixteenth triplets retain rests, allow separate half-beat groups and reject overlaps", () => {
    const hints = [{ instrument: "snare", tick: 48, unit: 16 }];
    const voice = lessonNotation(example([0, 48, 80], { feel: "straight", triplets: hints })).bars[0].voices[0];
    assert.deepEqual(voice.tuplets, [[1, 2, 3]]);
    assert.equal(voice.notes[2].rest, true);
    assert.deepEqual(voice.notes.slice(1, 4).map(note => note.durationTicks), [16, 16, 16]);
    for (const triplets of [
        [...hints, { instrument: "snare", tick: 80, unit: 16 }],
        [...hints, { instrument: "snare", tick: 0, unit: 8 }],
        [{ instrument: "snare", tick: 0, unit: 32 }],
    ]) assert.throws(() => validateLesson(example([0, 48, 80], { feel: "straight", triplets })), /notation/);
    assert.throws(() => validateLesson(example([0, 24], { feel: "straight", triplets: [{ instrument: "snare", tick: 0, unit: 16 }] })), /sixteenth-note triplets/);
});

test("all twelve instruments and sixteen bars preserve independent references including hi-hat collisions", async () => {
    const { DRUM_KEY } = await import("../src/notation/drum-key.js");
    const lesson = example(); lesson.bars = 16;
    lesson.tracks = Object.keys(DRUM_KEY).map(instrument => ({ instrument, notes: [0, 6144 - 12] }));
    const model = lessonNotation(lesson);
    assert.equal(model.bars.length, 16);
    assert.equal(references(model).length, 24);
    assert.equal(new Set(references(model).map(ref => ref.id)).size, 24);
    for (const bar of model.bars) for (const voice of bar.voices) {
        assert.equal(voice.notes.reduce((sum, note) => sum + note.durationTicks, 0), 384);
    }
    const originals = JSON.parse(await readFile(new URL("./fixtures/notation-originals.json", import.meta.url)));
    assert.equal(Object.keys(originals).length, 9, "Every production lesson has a pre-migration comparison");
});


test("Swing retains literal finer subdivisions without swinging or rounding them twice", () => {
    const lesson = example([0, 64, 96, 108, 120, 144, 168], { feel: "swing" });
    const refs = references(lessonNotation(lesson));
    assert.deepEqual(refs.map(ref => ref.writtenTick), [0, 48, 96, 108, 120, 144, 168]);
    assert.deepEqual(refs.map(ref => ref.performanceTick), lesson.tracks[0].notes);
    assert.throws(() => lessonNotation(example([0, 24, 64], { feel: "swing" })), /unsupported rhythm/);
});

test("cymbals and drums retain their own rhythms, stems and beams", async () => {
    for (const id of ["swing-exercise-07", "swing-exercise-13"]) {
        const entry = BUNDLED_LESSONS.find(lesson => lesson.id === id);
        const lesson = JSON.parse(await readFile(new URL(`../lessons/${entry.path}`, import.meta.url)));
        const bar = lessonNotation(lesson).bars[0];
        assert.equal(bar.voices.length, 2);
        const cymbals = bar.voices.find(voice => voice.id === "cymbals");
        const drums = bar.voices.find(voice => voice.id === "drums");
        assert.equal(cymbals.stem, 1);
        assert.equal(drums.stem, -1);
        assert.ok(cymbals.notes.flatMap(note => note.refs).every(ref => ref.instrument === "ride"));
        assert.ok(drums.notes.flatMap(note => note.refs).every(ref => ref.instrument !== "ride"));
        if (id === "swing-exercise-07") {
            const rideBeat3 = cymbals.notes.find(note => note.writtenTick === 192);
            assert.equal(rideBeat3.duration, "4", "Offbeat snare must not turn the ride quarter into an eighth");
            assert.deepEqual(drums.notes.find(note => note.writtenTick === 240).refs.map(ref => ref.performanceTick), [256]);
        }

    }
});

test("incompatible grids keep separate voices without changing events", () => {
    for (const instrument of ["kick", "ride"]) {
        const lesson = example([0, 32, 64], { feel: "straight", triplets: [{ instrument: "snare", tick: 0 }] });
        lesson.tracks.push({ instrument, notes: [0, 48] });
        const original = structuredClone(lesson);
        const model = lessonNotation(lesson);
        assert.equal(model.bars[0].voices.length, 2);
        assert.equal(references(model).length, 5);
        assert.equal(new Set(references(model).map(ref => ref.id)).size, 5);
        assert.deepEqual(lesson, original);
    }
});

test("dense song grooves combine their notation without added rest clutter", async () => {
    for (const id of ["fascination-street", "californication", "chop-suey", "come-undone"]) {
        const entry = BUNDLED_LESSONS.find(lesson => lesson.id === id);
        const lesson = JSON.parse(await readFile(new URL(`../lessons/${entry.path}`, import.meta.url)));
        const model = lessonNotation(lesson);
        assert.ok(model.bars.every(bar => bar.voices.length === 1 && bar.voices[0].stem === -1), id);
        const rests = model.bars.flatMap(bar => bar.voices[0].notes.filter(note => note.rest));
        assert.equal(rests.length, { "fascination-street": 0, californication: 2, "chop-suey": 7, "come-undone": 1 }[id], id);
        assert.deepEqual(references(model).map(ref => ref.id).sort(),
            lesson.tracks.flatMap(track => track.notes.map(tick => `${track.instrument}:${tick}`)).sort());
    }
});

test("straight quarter-note ride also stays independent from offbeat snare", () => {
    const lesson = example([48]);
    lesson.tracks.unshift({ instrument: "ride", notes: [0, 96, 192, 288] });
    const model = lessonNotation(lesson);
    assert.equal(model.bars[0].voices.length, 2);
    const ride = model.bars[0].voices.find(voice => voice.id === "cymbals");
    assert.ok(ride.notes.every(note => note.duration === "4"));
});
