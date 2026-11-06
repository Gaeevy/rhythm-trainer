import assert from "node:assert/strict";
import test from "node:test";
import { Assessment } from "../src/assessment.js";
import { gaussianQuality, scorePractice, scoreTrend, TIMING_WIDTH_MS, CONSISTENCY_WIDTH_MS } from "../src/analytics.js";
import { TICKS_PER_BAR, TICKS_PER_BEAT } from "../src/music-time.js";

function session(tracks = [{ instrument: "snare", notes: [0] }], bars = 1, options = {}) {
    return new Assessment({ version: 1, title: "Scoring", bpm: 60, bars, time_signature: [4, 4], tracks },
        { origin: 10, ...options });
}
function hit(assessment, instrument, tick, errorMs = 0) {
    const audioTime = assessment.origin + tick / TICKS_PER_BEAT * assessment.secondsPerBeat
        + (errorMs + assessment.latencyOffsetMs) / 1000;
    return assessment.recordHit({ instrument, audioTime, originalTimeStamp: audioTime * 1000 });
}
function finish(assessment, bars) {
    assessment.advance(assessment.origin + bars * 4 * assessment.secondsPerBeat + 0.2
        + assessment.latencyOffsetMs / 1000);
    return scorePractice(assessment, bars);
}
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≈ ${expected}`);
const pad = (report, instrument = "snare") => report.pads.find(entry => entry.instrument === instrument);

test("Gaussian quality is symmetric, smooth inside the on-time band, and matches reviewed examples", () => {
    assert.equal(gaussianQuality(0, TIMING_WIDTH_MS), 1);
    for (const [error, points] of [[20, 92], [30, 84], [60, 49], [100, 14], [150, 1]]) {
        const quality = gaussianQuality(error, TIMING_WIDTH_MS);
        assert.equal(Math.round(quality * 100), points);
        assert.equal(quality, gaussianQuality(-error, TIMING_WIDTH_MS));
    }
    for (const [spread, points] of [[0, 100], [10, 92], [20, 73], [40, 28], [80, 1]]) {
        assert.equal(Math.round(100 * gaussianQuality(spread, CONSISTENCY_WIDTH_MS)), points);
    }
    assert.ok(gaussianQuality(10, TIMING_WIDTH_MS) > gaussianQuality(20, TIMING_WIDTH_MS));
    for (const args of [[NaN, 50], [Infinity, 50], [0, 0], [0, -1], [0, Infinity]]) {
        assert.throws(() => gaussianQuality(...args), RangeError);
    }
});

test("tolerance affects visual categories, not quality of an already matched error", () => {
    const scores = [];
    for (const toleranceMs of [0, 30, 150]) {
        const assessment = session(undefined, 1, { toleranceMs });
        const result = hit(assessment, "snare", 0, 20);
        assert.equal(result.status, toleranceMs === 0 ? "late" : "on_time");
        scores.push(finish(assessment, 1).overall.score);
    }
    close(scores[0], 100 * gaussianQuality(20, TIMING_WIDTH_MS));
    assert.deepEqual(scores, [scores[0], scores[0], scores[0]]);
});

test("no data is null, disabled pads disappear, and expected misses score zero", () => {
    const assessment = session([{ instrument: "snare", notes: [0] }, { instrument: "ride", notes: [] }]);
    assert.equal(scorePractice(assessment, 0).overall.score, null);
    const report = finish(assessment, 1);
    assert.equal(report.overall.score, 0);
    assert.equal(pad(report).score, 0);
    assert.equal(pad(report, "ride").score, null);
    const disabled = session(undefined, 1, { disabledInstruments: ["snare"] });
    const empty = finish(disabled, 2);
    assert.deepEqual(empty.pads, []);
    assert.equal(empty.overall.score, null);
    assert.equal(empty.consistency, null);
});

test("four perfect notes plus a duplicate extra score 80, without rematching or overwriting notes", () => {
    const assessment = session([{ instrument: "snare", notes: [0, 96, 192, 288] }]);
    for (const tick of [0, 96, 192, 288]) hit(assessment, "snare", tick);
    assert.equal(hit(assessment, "snare", 0, 1).status, "extra");
    const report = finish(assessment, 1);
    close(pad(report).score, 80);
    close(report.overall.score, 80);
    assert.equal(report.consistency, null);
    assert.equal(assessment.counts.on_time, 4);
    assert.equal(assessment.resultFor("snare", 0, 0).errorMs, 0);
});

test("pad weights include missed expected notes and extras on silent enabled tracks", () => {
    const assessment = session([{ instrument: "ride", notes: [0, 96, 192, 288] },
        { instrument: "snare", notes: [48] }, { instrument: "kick", notes: [] }]);
    for (const tick of [0, 96, 192, 288]) hit(assessment, "ride", tick);
    close(finish(assessment, 1).overall.score, 80);
    assert.equal(hit(assessment, "kick", 96).status, "extra");
    const report = scorePractice(assessment, 1);
    assert.equal(pad(report, "snare").score, 0);
    assert.equal(pad(report, "kick").score, 0);
    close(report.overall.score, 100 * 4 / 6);
    assert.equal(hit(assessment, "tom_1", 96), null, "Unlisted instruments retain existing unscored behavior");
});

test("consistency rewards tightly grouped early hits, separately from timing, using the 70/30 blend", () => {
    const tracks = ["snare", "kick", "ride"].map(instrument => ({ instrument, notes: [0] }));
    const reports = [];
    for (const errors of [[-42, -40, -38], [-40, 0, 40]]) {
        const assessment = session(tracks);
        tracks.forEach((track, index) => hit(assessment, track.instrument, 0, errors[index]));
        const report = finish(assessment, 1);
        const expectedPad = errors.reduce((sum, error) => sum + gaussianQuality(error, TIMING_WIDTH_MS), 0) / 3 * 100;
        close(report.padScore, expectedPad);
        close(report.consistency.score, 100 * gaussianQuality(Math.max(...errors) - Math.min(...errors), CONSISTENCY_WIDTH_MS));
        close(report.overall.score, 0.7 * expectedPad + 0.3 * report.consistency.score);
        reports.push(report);
    }
    assert.ok(reports[0].consistency.score > reports[1].consistency.score);
    assert.ok(reports[0].padScore < reports[1].padScore, "Centered average is not the same as coordination");
});

test("partial simultaneous groups score zero and delayed timestamped hits correct the snapshot", () => {
    const tracks = ["snare", "kick", "ride"].map(instrument => ({ instrument, notes: [0] }));
    const assessment = session(tracks);
    hit(assessment, "snare", 0);
    hit(assessment, "kick", 0);
    const partial = finish(assessment, 1);
    assert.equal(partial.consistency.score, 0);
    close(partial.overall.score, 0.7 * 200 / 3);
    hit(assessment, "ride", 0);
    assert.equal(scorePractice(assessment, 1).overall.score, 100);
    assert.equal(scorePractice(assessment, 1).consistency.score, 100);
    const disabled = session(tracks, 1, { disabledInstruments: ["kick", "ride"] });
    hit(disabled, "snare", 0);
    const report = finish(disabled, 1);
    assert.equal(report.consistency, null, "One enabled member is no longer a simultaneous group");
    assert.equal(report.overall.score, 100);
});

test("eligible groups later in the lesson do not receive invented consistency credit", () => {
    const assessment = session([{ instrument: "snare", notes: [0, 384] }, { instrument: "kick", notes: [384] }], 2);
    hit(assessment, "snare", 0);
    const report = finish(assessment, 1);
    assert.equal(report.padScore, 100);
    assert.equal(report.consistency.score, null);
    assert.equal(report.overall.score, null);
});

test("eight-bar half-life weights note counts, not the average of bar percentages", () => {
    for (const earlierNotes of [[0], [0, 96, 192, 288]]) {
        const assessment = session([{ instrument: "snare", notes: [...earlierNotes, 8 * TICKS_PER_BAR] }], 16);
        hit(assessment, "snare", 8 * TICKS_PER_BAR);
        const report = finish(assessment, 9);
        close(report.overall.score, 100 / (0.5 * earlierNotes.length + 1));
        assert.equal(report.overall.trend, null);
    }
});

test("silent bars leave scores unchanged; extras use corrected hit bars, not neighboring note bars", () => {
    const assessment = session([{ instrument: "snare", notes: [383] }], 16, { latencyOffsetMs: 100 });
    assert.equal(hit(assessment, "snare", 383).status, "on_time");
    assert.equal(hit(assessment, "snare", 384, 5).status, "extra");
    // The exact first hit has an audio timestamp in bar 2, but belongs to its expected bar 1.
    const first = finish(assessment, 1);
    close(first.overall.score, 100);
    const second = finish(assessment, 2);
    close(second.overall.score, 100 * 2 ** (-1 / 8) / (1 + 2 ** (-1 / 8)));
    close(finish(assessment, 8).overall.score, second.overall.score);
});

test("groups from separate loop copies never combine; dense matching still controls extras", () => {
    const assessment = session([{ instrument: "snare", notes: [0] }, { instrument: "kick", notes: [0] }]);
    hit(assessment, "snare", 0);
    hit(assessment, "kick", TICKS_PER_BAR);
    assert.equal(finish(assessment, 2).consistency.score, 0);
    const dense = session([{ instrument: "snare", notes: [0, 12, 32, 48, 64] }]);
    hit(dense, "snare", 0);
    assert.equal(hit(dense, "snare", 0, 20).status, "extra");
    assert.equal(hit(dense, "snare", 64, 200).status, "extra", "A Gaussian tail never widens the matching window");
    const report = finish(dense, 1);
    close(report.overall.score, 100 / 7);
});

test("count-in taps stay unscored except an eligible early first note", () => {
    const assessment = session();
    assert.equal(hit(assessment, "snare", 0, -400), null);
    assert.equal(scorePractice(assessment, 0).overall.score, null);
    assert.equal(hit(assessment, "snare", 0, -20).status, "on_time");
    close(finish(assessment, 1).overall.score, 100 * gaussianQuality(20, TIMING_WIDTH_MS));
    assert.equal(assessment.hits.length, 1);
});

test("trend gates warm-up, null samples and exact neutral-band boundaries", () => {
    assert.equal(scoreTrend(90, 80, 15).trend, null);
    assert.equal(scoreTrend(null, 80, 16).trend, null);
    assert.equal(scoreTrend(90, null, 16).trend, null);
    assert.equal(scoreTrend(83, 80, 16).trend, "up");
    assert.equal(scoreTrend(77, 80, 16).trend, "down");
    assert.equal(scoreTrend(82.999, 80, 16).trend, "steady");
    assert.equal(scoreTrend(77.001, 80, 16).trend, "steady");
    close(scoreTrend(82.999, 80, 16).change, 2.999);
});

test("trend reference uses all earlier bars excluding eight, for pads, consistency and overall", () => {
    const tracks = ["snare", "kick"].map(instrument => ({ instrument, notes: [0, 8 * TICKS_PER_BAR] }));
    const assessment = session(tracks, 16);
    hit(assessment, "snare", 0, -80);
    hit(assessment, "kick", 0, 80);
    for (const tick of [8 * TICKS_PER_BAR, 16 * TICKS_PER_BAR]) {
        for (const { instrument } of tracks) hit(assessment, instrument, tick);
    }
    const earlier = finish(assessment, 16);
    const current = finish(assessment, 24);
    close(current.overall.referenceScore, earlier.overall.score);
    close(current.consistency.referenceScore, earlier.consistency.score);
    close(pad(current).referenceScore, pad(earlier).score);
    assert.equal(current.overall.trend, "up");
    assert.equal(current.consistency.trend, "up");
    assert.equal(pad(current).trend, "up");
});

test("long sessions stay finite, use raw precision and never mutate or advance the assessment", () => {
    const assessment = session();
    for (let bar = 0; bar < 2500; bar++) hit(assessment, "snare", bar * TICKS_PER_BAR, 12.345678);
    assessment.advance(assessment.origin + 2500 * 4 + 0.2);
    const before = JSON.stringify({ counts: assessment.counts, hits: assessment.hits, results: [...assessment.noteResults] });
    assessment.advance = () => { throw new Error("Analytics must not advance assessment"); };
    const report = scorePractice(assessment, 2500);
    close(report.overall.score, 100 * gaussianQuality(12.345678, TIMING_WIDTH_MS));
    assert.equal(report.overall.trend, "steady");
    assert.notEqual(report.overall.score, Math.round(report.overall.score));
    assert.equal(JSON.stringify({ counts: assessment.counts, hits: assessment.hits, results: [...assessment.noteResults] }), before);
    assert.throws(() => scorePractice(assessment, -1), RangeError);
    assert.throws(() => scorePractice(assessment, 1.5), RangeError);
    assert.throws(() => scorePractice(session(), 1), /finalized/);
});
