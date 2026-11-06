import assert from "node:assert/strict";
import test from "node:test";
import { Assessment } from "../src/assessment.js";
import { lessonNotation } from "../src/notation/model.js";
import { noteheadShift, noteAppearance, extraPosition, NOTATION_COLORS, notationFeedbackText } from "../src/notation/feedback.js";

const lesson = { version: 2, title: "Feedback", bpm: 60, bars: 1, time_signature: [4, 4], notation: { feel: "straight" },
    tracks: [{ instrument: "snare", notes: [0, 96, 192] }, { instrument: "hi_hat_closed", notes: [0, 96] }] };
const makeAssessment = () => new Assessment(lesson, { origin: 10 });
const refs = lessonNotation(lesson).bars[0].voices.flatMap(voice => voice.notes.flatMap(note => note.refs));
const ref = (instrument, tick) => refs.find(ref => ref.instrument === instrument && ref.performanceTick === tick);
const hit = (assessment, instrument, time) => assessment.recordHit({ instrument, audioTime: time, originalTimeStamp: time * 1000 });

test("each simultaneous/shared-stem note reads its own existing result and retains raw error", () => {
    const assessment = makeAssessment();
    hit(assessment, "snare", 9.95);
    hit(assessment, "hi_hat_closed", 10);
    const snare = noteAppearance(assessment, ref("snare", 0), 0);
    const hat = noteAppearance(assessment, ref("hi_hat_closed", 0), 0);
    assert.equal(snare.status, "early");
    assert.equal(hat.status, "on_time");
    assert.notEqual(snare.color, hat.color);
    assert.ok(Math.abs(snare.errorMs + 50) < 1e-8);
    assert.match(snare.text, /Snare.*Early −50.0 ms/);
    hit(assessment, "snare", 11.05);
    assert.equal(noteAppearance(assessment, ref("snare", 96), 0).status, "late");
});

test("miss correction changes the projected note without keeping the obsolete miss", () => {
    const assessment = makeAssessment();
    assessment.advance(10.2);
    assert.equal(noteAppearance(assessment, ref("snare", 0), 0).status, "missed");
    hit(assessment, "snare", 10.005);
    assert.equal(noteAppearance(assessment, ref("snare", 0), 0).status, "on_time");
    assert.match(noteAppearance(assessment, ref("snare", 0), 0).text, /\+5.0 ms/);
});

test("loop feedback is independent, disabled heads stay dim, and projection never assesses again", () => {
    const assessment = makeAssessment();
    hit(assessment, "snare", 10);
    const counts = { ...assessment.counts };
    for (let index = 0; index < 20; index++) {
        assert.equal(noteAppearance(assessment, ref("snare", 0), 0).status, "on_time");
        assert.equal(noteAppearance(assessment, ref("snare", 0), 1).status, "waiting");
        assert.equal(noteAppearance(assessment, ref("snare", 0), 0, ["snare"]).color, NOTATION_COLORS.disabled);
    }
    assert.deepEqual(assessment.counts, counts);
    assert.equal(assessment.hits.length, 1);
    assert.equal(noteAppearance(null, ref("snare", 0), 0).status, "waiting");
});

test("duplicate/unmatched hits become precise extra overlays, never overwrite matched notes", () => {
    const assessment = makeAssessment();
    hit(assessment, "snare", 10);
    const duplicate = hit(assessment, "snare", 10.017);
    assert.equal(duplicate.status, "extra");
    const position = extraPosition(duplicate, assessment, 1);
    assert.equal(position.iteration, 0);
    assert.equal(position.barIndex, 0);
    assert.ok(Math.abs(position.tick - 1.632) < 1e-8);
    assert.equal(noteAppearance(assessment, ref("snare", 0), 0).status, "on_time");
    assert.equal(extraPosition(assessment.hits[0], assessment, 1), null);
    assert.equal(notationFeedbackText(duplicate), "Snare · + Extra");
});

test("Lanes and repeated notation projections leave the complete input assessment identical", () => {
    const lanes = makeAssessment(), notation = makeAssessment();
    for (const [instrument, time] of [["snare", 9.95], ["hi_hat_closed", 10], ["snare", 10.02], ["snare", 11.05], ["hi_hat_closed", 11], ["snare", 14]]) {
        assert.deepEqual(hit(notation, instrument, time), hit(lanes, instrument, time));
        for (const reference of refs) for (const iteration of [0, 1]) noteAppearance(notation, reference, iteration);
    }
    assert.deepEqual(notation.advance(14.2), lanes.advance(14.2));
    for (const reference of refs) noteAppearance(notation, reference, 1);
    assert.deepEqual(notation.counts, lanes.counts);
    assert.deepEqual(notation.hits, lanes.hits);
    assert.deepEqual(notation.noteResults, lanes.noteResults);
    assert.equal(notation.meanAbsoluteErrorMs, lanes.meanAbsoluteErrorMs);
});

test("an extra belongs to its own precise bar/iteration and text suppresses signed zero", () => {
    const assessment = makeAssessment();
    const result = { status: "extra", correctedTime: 18.125, instrument: "snare", errorMs: null };
    assert.deepEqual(extraPosition(result, assessment, 2), { iteration: 1, barIndex: 0, tick: 12 });
    assert.equal(notationFeedbackText({ instrument: "snare", status: "on_time", errorMs: -0.001 }), "Snare · ● On time 0.0 ms");
});

test("an eligible early hit for the next loop is already assigned to that iteration", () => {
    const assessment = makeAssessment();
    hit(assessment, "snare", 10);
    const early = hit(assessment, "snare", 13.95);
    assert.equal(early.expected.iteration, 1);
    assert.equal(noteAppearance(assessment, ref("snare", 0), 0).status, "on_time");
    assert.equal(noteAppearance(assessment, ref("snare", 0), 1).status, "early");
});

test("notehead movement shows signed error, grows with error and respects visual bounds", () => {
    assert.equal(noteheadShift({ status: "early", errorMs: -20 }), -7);
    assert.equal(noteheadShift({ status: "early", errorMs: -40 }), -14);
    assert.equal(noteheadShift({ status: "late", errorMs: 20 }), 7);
    assert.equal(noteheadShift({ status: "late", errorMs: 40 }), 14);
    assert.equal(noteheadShift({ status: "early", errorMs: -150 }), -18);
    assert.equal(noteheadShift({ status: "late", errorMs: 150 }), 18);
    assert.equal(noteheadShift({ status: "late", errorMs: 80 }, 6), 6);
    assert.equal(noteheadShift({ status: "early", errorMs: -80 }, 6), -6);
    for (const status of ["on_time", "waiting", "disabled", "missed", "extra"]) {
        assert.equal(noteheadShift({ status, errorMs: 40 }), 0);
    }
    assert.equal(noteheadShift({ status: "early", errorMs: NaN }), 0);
});

test("spatial feedback is independent for simultaneous hits, loops, miss correction and reset", () => {
    const assessment = makeAssessment();
    hit(assessment, "snare", 9.95);
    hit(assessment, "hi_hat_closed", 10);
    assert.ok(noteheadShift(noteAppearance(assessment, ref("snare", 0), 0)) < 0);
    assert.equal(noteheadShift(noteAppearance(assessment, ref("hi_hat_closed", 0), 0)), 0);
    assert.equal(noteheadShift(noteAppearance(assessment, ref("snare", 0), 1)), 0);
    assessment.advance(11.2);
    assert.equal(noteheadShift(noteAppearance(assessment, ref("snare", 96), 0)), 0);
    hit(assessment, "snare", 11.05);
    const before = structuredClone({ counts: assessment.counts, hits: assessment.hits, results: assessment.noteResults });
    for (let index = 0; index < 20; index++) {
        assert.ok(noteheadShift(noteAppearance(assessment, ref("snare", 96), 0)) > 0);
        assert.equal(noteheadShift(noteAppearance(assessment, ref("snare", 96), 0, ["snare"])), 0);
    }
    assert.deepEqual({ counts: assessment.counts, hits: assessment.hits, results: assessment.noteResults }, before);
    assert.equal(noteheadShift(noteAppearance(null, ref("snare", 0), 0)), 0);
});
