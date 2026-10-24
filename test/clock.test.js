import assert from "node:assert/strict";
import test from "node:test";
import { audioTimeForEvent, eventTimeToAudioTime } from "../src/clock.js";

test("maps milliseconds to seconds without mixing clock origins or rounding", () => {
    const anchor = { contextTime: 10, performanceTime: 12345 };
    assert.equal(eventTimeToAudioTime(12345, anchor), 10);
    assert.ok(Math.abs(eventTimeToAudioTime(12326.234567, anchor) - 9.981234567) < 1e-10);
    assert.equal(eventTimeToAudioTime(12845, anchor), 10.5);
});

test("delayed handling does not change the timestamp of the original event", () => {
    assert.equal(
        eventTimeToAudioTime(5000, { contextTime: 10, performanceTime: 5000 }),
        eventTimeToAudioTime(5000, { contextTime: 11, performanceTime: 6000 }),
    );
});

test("prefers the output clock over the audio rendering clock", () => {
    const context = { currentTime: 10.05, getOutputTimestamp: () => ({ contextTime: 10, performanceTime: 5000 }) };
    assert.equal(audioTimeForEvent(context, 5020, 5100), 10.02);
});

test("falls back for missing or not-yet-initialized output timestamps", () => {
    for (const output of [undefined, { contextTime: 0, performanceTime: 0 }, { contextTime: NaN, performanceTime: 5000 }]) {
        const context = { currentTime: 10, getOutputTimestamp: () => output };
        assert.equal(audioTimeForEvent(context, 4900, 5000), 9.9);
    }
    assert.equal(audioTimeForEvent({ currentTime: 10 }, 4900, 5000), 9.9);
});

test("rejects invalid clock inputs", () => {
    assert.throws(() => eventTimeToAudioTime(NaN, { contextTime: 0, performanceTime: 0 }), RangeError);
    assert.throws(() => eventTimeToAudioTime(0, { contextTime: Infinity, performanceTime: 0 }), RangeError);
});
