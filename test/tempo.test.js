import test from "node:test";
import assert from "node:assert/strict";
import { practiceBpm, bpmFromPosition, positionFromBpm, MIN_BPM, MAX_BPM, TEMPO_STEPS } from "../src/tempo.js";

test("tempo slider reaches every integer BPM, bounds and increasing travel", () => {
    assert.equal(bpmFromPosition(0), MIN_BPM);
    assert.equal(bpmFromPosition(TEMPO_STEPS), MAX_BPM);
    for (let bpm = MIN_BPM; bpm <= MAX_BPM; bpm++) {
        assert.equal(bpmFromPosition(positionFromBpm(bpm)), bpm);
    }
    let previous = MIN_BPM;
    for (let position = 0; position <= TEMPO_STEPS; position++) {
        const bpm = bpmFromPosition(position);
        assert.ok(Number.isInteger(bpm) && bpm >= previous);
        previous = bpm;
    }
    assert.ok(positionFromBpm(90) - positionFromBpm(80) > positionFromBpm(290) - positionFromBpm(280));
});

test("practice tempo rounds fractional lessons and clamps without changing source data", () => {
    assert.equal(practiceBpm(90.5220994475138), 91);
    assert.equal(practiceBpm(1), MIN_BPM);
    assert.equal(practiceBpm(999), MAX_BPM);
    for (const value of [NaN, Infinity, undefined]) assert.throws(() => practiceBpm(value), /finite/);
});
