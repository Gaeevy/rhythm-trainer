import assert from "node:assert/strict";
import test from "node:test";
import { FIXTURE_LESSONS } from "../scripts/fixtures/lessons.js";
import { lessonEvents, Playback } from "../src/playback.js";

const lesson = {
    version: 1, title: "Playback test", bpm: 120, time_signature: [4, 4], bars: 1,
    tracks: [
        { instrument: "ride", notes: [0, 32, 96, 160, 192, 288, 352] },
        { instrument: "hi_hat_closed", notes: [96, 288] },
    ],
};

function harness() {
    let now = 10;
    let nextTimer = 0;
    const timers = new Map();
    const scheduled = [];
    let cancellations = 0;
    const playback = new Playback({
        clock: () => now,
        schedule: (instrument, time, accent) => scheduled.push({ instrument, time, accent }),
        cancel: () => { cancellations++; },
        setTimer: callback => { timers.set(++nextTimer, callback); return nextTimer; },
        clearTimer: timer => timers.delete(timer),
    });
    return {
        playback, timers, scheduled,
        get cancellations() { return cancellations; },
        advance(time) { now = time; for (const callback of timers.values()) callback(); },
    };
}

test("repeating events retain triplets, simultaneous hits, and bar accents", () => {
    const events = lessonEvents(lesson, 120);
    assert.equal(events.length, 13);
    assert.deepEqual(events.filter(event => event.offset === 0.5).map(event => event.instrument), ["ride", "hi_hat_closed", "metronome"]);
    assert.equal(events.find(event => event.offset === 1 / 6).instrument, "ride");
    assert.deepEqual(events.filter(event => event.instrument === "metronome").map(event => event.accent), [true, false, false, false]);
});

test("scheduler plays several loops exactly once without animation callbacks", () => {
    const h = harness();
    h.playback.start(lesson, { countIn: false });
    const origin = h.playback.origin;
    for (let step = 1; step <= 320; step++) h.advance(10 + step * 0.025);
    const completed = h.scheduled.filter(event => event.time < origin + 8);
    assert.equal(completed.length, 13 * 4);
    assert.equal(new Set(completed.map(event => `${event.instrument}:${event.time}`)).size, completed.length);
    for (let loop = 0; loop < 4; loop++) {
        const downbeat = origin + loop * 2;
        assert.equal(completed.filter(event => event.time === downbeat).length, 2);
    }
    assert.ok(Math.abs(h.playback.beat - (18 - origin) * 2) < 1e-10);
});

test("count-in plays four metronome beats before the first lesson note", () => {
    const h = harness();
    h.playback.start(lesson);
    assert.equal(h.playback.beat, -4);
    for (let step = 1; step <= 84; step++) h.advance(10 + step * 0.025);
    const countIn = h.scheduled.filter(event => event.time < h.playback.origin);
    assert.deepEqual(countIn.map(event => event.instrument), Array(4).fill("metronome"));
    assert.deepEqual(countIn.map(event => event.accent), [true, false, false, false]);
    assert.ok(h.scheduled.some(event => event.instrument === "ride" && event.time === h.playback.origin));
    assert.ok(h.playback.beat > 0);
});

test("display can follow the audio output timestamp independently of the render clock", () => {
    const h = harness();
    h.playback.start(lesson, { countIn: false });
    h.advance(h.playback.origin + 0.52);
    assert.ok(Math.abs(h.playback.beat - 1.04) < 1e-10);
    assert.ok(Math.abs(h.playback.beatAt(h.playback.origin + 0.5) - 1) < 1e-10);
    h.playback.stop();
    assert.equal(h.playback.beatAt(100), 0);
});

test("adjacent scheduling windows do not duplicate a note on their boundary", () => {
    const h = harness();
    h.playback.start(lesson, { countIn: false });
    const target = h.playback.origin + 0.5;
    h.advance(target - 0.12);
    h.advance(target - 0.10);
    h.advance(target - 0.08);
    assert.equal(h.scheduled.filter(event => event.instrument === "hi_hat_closed" && event.time === target).length, 1);
});

test("delayed callbacks skip old notes instead of playing a catch-up burst", () => {
    const h = harness();
    h.playback.start(lesson, { countIn: false });
    h.scheduled.length = 0;
    h.advance(1000);
    assert.ok(h.scheduled.length < 5);
    assert.ok(h.scheduled.every(event => event.time >= 1000 && event.time < 1000.12));
});

test("stop cancels pending sounds and repeated starts keep only one timer", () => {
    const h = harness();
    for (let index = 0; index < 5; index++) {
        h.playback.start(lesson, { countIn: false });
        assert.equal(h.timers.size, 1);
    }
    assert.equal(h.cancellations, 5);
    h.playback.stop();
    assert.equal(h.cancellations, 6);
    assert.equal(h.timers.size, 0);
    assert.equal(h.playback.beat, 0);
    const count = h.scheduled.length;
    h.advance(20);
    h.playback.pump();
    assert.equal(h.scheduled.length, count);
    h.playback.start(lesson, { bpm: 60, countIn: true });
    assert.equal(h.playback.secondsPerBeat, 1);
    assert.equal(h.playback.origin, 24.08);
    assert.equal(h.playback.beat, -4);
});

test("invalid lessons and tempo never schedule sounds", () => {
    const h = harness();
    assert.throws(() => h.playback.start({ ...lesson, bars: 0 }));
    assert.throws(() => h.playback.start(lesson, { bpm: 0 }));
    assert.equal(h.scheduled.length, 0);
    assert.equal(h.timers.size, 0);
});

test("default browser timers retain the global receiver on start and stop", context => {
    const activeTimers = new Set();
    context.mock.method(globalThis, "setInterval", function(callback, delay) {
        assert.ok(this === globalThis, "browser setInterval requires the global receiver");
        assert.equal(typeof callback, "function");
        assert.equal(delay, 25);
        activeTimers.add(1);
        return 1;
    });
    context.mock.method(globalThis, "clearInterval", function(timer) {
        assert.ok(this === globalThis, "browser clearInterval requires the global receiver");
        activeTimers.delete(timer);
    });
    const playback = new Playback({ clock: () => 10, schedule: () => {}, cancel: () => {} });
    playback.start(lesson);
    assert.equal(activeTimers.size, 1);
    playback.stop();
    assert.equal(activeTimers.size, 0);
});

test("mixed subdivisions keep exact note offsets at loop boundaries", () => {
    const mixed = FIXTURE_LESSONS["mixed-subdivisions"];
    const h = harness();
    h.playback.start(mixed, { countIn: false });
    for (let step = 1; step <= 650; step++) h.advance(10 + step * 0.025);
    const snare = h.scheduled.filter(event => event.instrument === "snare");
    for (let loop = 0; loop < 2; loop++) {
        for (const tick of mixed.tracks.find(track => track.instrument === "snare").notes) {
            const expected = h.playback.origin + loop * 8 + tick / 96;
            assert.equal(snare.filter(event => Math.abs(event.time - expected) < 1e-10).length, 1);
        }
    }
});

test("disabled tracks are silent without changing metronome, count-in, or loop length", () => {
    const before = structuredClone(lesson);
    const { playback, scheduled, advance } = harness();
    playback.start(lesson, { disabledInstruments: ["ride", "hi_hat_closed"] });
    for (let time = 10; time <= 16; time += 0.025) advance(time);
    assert.ok(scheduled.length >= 8);
    assert.ok(scheduled.every(event => event.instrument === "metronome"));
    assert.equal(playback.loopSeconds, 2);
    assert.equal(playback.countInBeats, 4);
    assert.deepEqual(lesson, before);
    playback.start(lesson, { countIn: false, disabledInstruments: ["ride"] });
    assert.ok(playback.events.some(event => event.instrument === "hi_hat_closed"));
    assert.ok(playback.events.every(event => event.instrument !== "ride"));
});
