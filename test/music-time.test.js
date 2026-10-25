import assert from "node:assert/strict";
import test from "node:test";
import { TICKS_PER_BEAT, TICKS_PER_BAR, ticksToSeconds } from "../src/music-time.js";

test("version 1 has 96 ticks per beat and 384 per bar", () => {
    assert.equal(TICKS_PER_BEAT, 96);
    assert.equal(TICKS_PER_BAR, 384);
});

test("all required subdivisions convert without rounding to a grid", () => {
    for (const bpm of [60, 80, 120, 137.5]) {
        for (const [ticks, beats] of [[96, 1], [48, 1 / 2], [32, 1 / 3], [24, 1 / 4], [16, 1 / 6], [12, 1 / 8]]) {
            assert.ok(Math.abs(ticksToSeconds(ticks, bpm) - beats * 60 / bpm) < 1e-12);
        }
    }
});

test("time conversion preserves origin, tempo scaling, and multi-bar positions", () => {
    assert.equal(ticksToSeconds(0, 80), 0);
    assert.equal(ticksToSeconds(384, 60), 4);
    assert.equal(ticksToSeconds(16 * 384, 120), 32);
    assert.equal(ticksToSeconds(160, 120), ticksToSeconds(160, 60) / 2);
    assert.equal(ticksToSeconds(1, 120), 1 / 192);
});

test("invalid timing inputs fail rather than coercing or rounding", () => {
    for (const ticks of [-1, 0.5, NaN, Infinity, "96", null, Number.MAX_SAFE_INTEGER + 1]) {
        assert.throws(() => ticksToSeconds(ticks, 80), /ticks/);
    }
    for (const bpm of [0, -1, NaN, Infinity, "80", null]) {
        assert.throws(() => ticksToSeconds(96, bpm), /bpm/);
    }
});
