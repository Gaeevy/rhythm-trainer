import assert from "node:assert/strict";
import test from "node:test";
import { Assessment, TimingStatus } from "../src/assessment.js";

function lesson(notes = [0, 96, 192, 288]) {
    return {
        version: 1, title: "Assessment test", bpm: 120, bars: 1, time_signature: [4, 4],
        tracks: [{ instrument: "snare", notes }, { instrument: "kick", notes: [0] }, { instrument: "ride", notes: [] }],
    };
}

function session(notes, options = {}) {
    return new Assessment(lesson(notes), { origin: 10, ...options });
}

function hit(assessment, time, instrument = "snare", originalTimeStamp = 1234.56789) {
    return assessment.recordHit({ instrument, originalTimeStamp, audioTime: time });
}

test("timing tolerance and matching-window edges are inclusive", () => {
    for (const [offset, status] of [
        [-0.15, "early"], [-0.030001, "early"], [-0.03, "on_time"],
        [0, "on_time"], [0.03, "on_time"], [0.030001, "late"], [0.15, "late"], [0.150001, "extra"],
    ]) {
        const assessment = session();
        const result = hit(assessment, 10 + offset);
        assert.equal(result.status, status, `offset ${offset}`);
        assert.equal(assessment.hits.length, 1);
    }
    assert.equal(hit(session(), 10.349999).status, "extra");
});

test("preserves precise timestamps, expected ticks, iteration, BPM, and signed error", () => {
    const assessment = session();
    const result = hit(assessment, 10.0187654321);
    assert.equal(result.originalTimeStamp, 1234.56789);
    assert.equal(result.audioTime, 10.0187654321);
    assert.equal(result.correctedTime, result.audioTime);
    assert.equal(result.expected.tick, 0);
    assert.equal(result.expected.iteration, 0);
    assert.equal(result.bpm, 120);
    assert.equal(result.source, "keyboard");
    assert.ok(Math.abs(result.errorMs - 18.7654321) < 1e-8);
    assert.equal(assessment.meanAbsoluteErrorMs, Math.abs(result.errorMs));
});

test("simultaneous instruments match independently; wrong instruments never consume a note", () => {
    const assessment = session();
    assert.equal(hit(assessment, 10, "snare").status, "on_time");
    assert.equal(hit(assessment, 10, "kick").status, "on_time");
    assert.equal(hit(assessment, 10, "ride").status, "extra");
    assert.equal(hit(assessment, 10, "hi_hat"), null);
    assert.equal(assessment.counts.on_time, 2);
    assert.equal(assessment.counts.extra, 1);
});

test("a duplicate hit cannot consume a nearby unmatched note", () => {
    const assessment = session([0, 24]);
    assert.equal(hit(assessment, 10).expected.tick, 0);
    assert.equal(hit(assessment, 10.04).status, "extra");
    assert.equal(assessment.resultFor("snare", 0, 1), undefined);
    assert.equal(hit(assessment, 10.125).expected.tick, 24);
    assert.equal(assessment.counts.on_time, 2);
});

test("exact midpoint ties belong to the earlier note and do not fall through", () => {
    const assessment = session([0, 24]);
    assert.equal(hit(assessment, 10.0625).expected.tick, 0);
    assert.equal(hit(assessment, 10.0625).status, "extra");
    assert.equal(hit(assessment, 10.062501).expected.tick, 24);
});

test("dense thirty-second notes remain distinct at high tempo", () => {
    const assessment = session([0, 12, 24], { bpm: 300 });
    assert.equal(hit(assessment, 10.013).expected.tick, 12);
    assert.equal(hit(assessment, 10).expected.tick, 0);
    assert.equal(hit(assessment, 10.05).expected.tick, 24);
    assert.equal(assessment.counts.on_time, 3);
    assert.ok(Math.abs(assessment.meanAbsoluteErrorMs - 4) < 1e-8);
});

test("sixteenth-note triplets match their fractional-second targets", () => {
    const assessment = session([0, 16, 32]);
    assert.equal(hit(assessment, 10 + 1 / 12).expected.tick, 16);
    assert.equal(hit(assessment, 10 + 1 / 6).expected.tick, 32);
    assert.equal(assessment.counts.on_time, 2);
});

test("missed notes are finalized only after their bounded late window", () => {
    const assessment = session([0, 24]);
    assessment.advance(10.0625);
    assert.equal(assessment.counts.missed, 0);
    assessment.advance(10.062501);
    assert.equal(assessment.resultFor("snare", 0, 0).status, "missed");
    assert.equal(assessment.counts.missed, 1);
    assessment.advance(10.2);
    assert.equal(assessment.counts.missed, 2); // First snare and kick; second snare still eligible.
    assessment.advance(10.3);
    assert.equal(assessment.counts.missed, 3);
    assessment.advance(10.3);
    assert.equal(assessment.counts.missed, 3);
});

test("count-in taps are ignored except eligible early first notes", () => {
    const assessment = session();
    assert.equal(hit(assessment, 9), null);
    assert.equal(hit(assessment, 9.8), null);
    assert.equal(hit(assessment, 9.95, "ride"), null);
    assert.equal(assessment.hits.length, 0);
    assert.equal(hit(assessment, 9.95).status, "early");
    assert.equal(assessment.hits.length, 1);
});

test("matches both sides of loop boundaries with distinct iteration identities", () => {
    const assessment = session([0, 288]);
    const early = hit(assessment, 11.95);
    assert.equal(early.expected.iteration, 1);
    assert.equal(early.expected.tick, 0);
    assert.equal(early.status, "early");
    assert.equal(hit(assessment, 10).expected.iteration, 0);
    assert.equal(assessment.counts.on_time, 1);

    const previousLoop = session([96, 376]);
    previousLoop.advance(12);
    const late = hit(previousLoop, 12.03);
    assert.equal(late.expected.iteration, 0);
    assert.equal(late.expected.tick, 376);
    assert.equal(late.status, "late");
    previousLoop.advance(12.2);
    assert.equal(previousLoop.resultFor("snare", 0, 1).status, "late");
});

test("positive latency offset subtracts delay; negative offset adds time", () => {
    for (const [offset, audioTime] of [[50, 10.06], [-50, 9.96]]) {
        const result = hit(session(undefined, { latencyOffsetMs: offset }), audioTime);
        assert.equal(result.status, "on_time");
        assert.equal(result.audioTime, audioTime);
        assert.ok(Math.abs(result.correctedTime - 10.01) < 1e-10);
    }
    const assessment = session(undefined, { latencyOffsetMs: 50 });
    assessment.advance(10.19);
    assert.equal(assessment.counts.missed, 0);
    assessment.advance(10.21);
    assert.equal(assessment.counts.missed, 2);
});

test("delayed event delivery can correct a missed note using its original hit time", () => {
    const assessment = session();
    assessment.advance(10.3);
    assert.equal(assessment.counts.missed, 2);
    const result = hit(assessment, 10.02);
    assert.equal(result.status, "on_time");
    assert.equal(assessment.counts.missed, 1);
    assert.equal(assessment.resultFor("snare", 0, 0), result);
    assert.equal(hit(assessment, 10.02).status, "extra");
});

test("misses and extras do not affect the mean absolute timing error", () => {
    const assessment = session();
    assert.equal(assessment.meanAbsoluteErrorMs, null);
    hit(assessment, 9.95);
    hit(assessment, 10.54);
    hit(assessment, 10.54);
    assessment.advance(11.4);
    assert.ok(Math.abs(assessment.meanAbsoluteErrorMs - 45) < 1e-8);
    assert.equal(assessment.counts.early, 1);
    assert.equal(assessment.counts.late, 1);
    assert.equal(assessment.counts.extra, 1);
});

test("a new session clears results, pending miss positions, and totals", () => {
    const before = session();
    hit(before, 10);
    before.advance(14);
    const after = session(undefined, { origin: 20 });
    assert.equal(after.hits.length, 0);
    assert.equal(after.noteResults.size, 0);
    assert.ok(Object.values(after.counts).every(count => count === 0));
    assert.equal(hit(after, 20).expected.iteration, 0);
});

test("rejects invalid settings and timestamps", () => {
    for (const options of [{ origin: NaN }, { bpm: 0 }, { toleranceMs: -1 }, { toleranceMs: 151 }, { matchingWindowMs: 0 }, { latencyOffsetMs: Infinity }]) {
        assert.throws(() => session(undefined, options), RangeError);
    }
    assert.throws(() => hit(session(), NaN), RangeError);
    assert.throws(() => session().advance(Infinity), RangeError);
    assert.deepEqual(Object.values(TimingStatus).sort(), ["early", "extra", "late", "missed", "on_time"]);
});
