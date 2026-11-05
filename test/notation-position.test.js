import assert from "node:assert/strict";
import test from "node:test";
import { scorePosition, markerX, scoreAnchors } from "../src/notation/position.js";

const position = (writtenTick, performanceTick, x, { triplet = false, rest = false, voice = "cymbals", swung } = {}) => ({
    note: { writtenTick, triplet, rest, swung, refs: rest ? [] : [{ performanceTick }] }, x, voice,
});

test("position uses exact beat boundaries, count-in, four-bar wrap, and delayed frames", () => {
    assert.deepEqual(scorePosition(-1, 4), { barIndex: 0, tick: 0, loop: 1, countIn: true });
    assert.deepEqual(scorePosition(0, 4), { barIndex: 0, tick: 0, loop: 1, countIn: false });
    assert.equal(scorePosition(4 - 1e-6, 4).barIndex, 0);
    assert.deepEqual(scorePosition(4, 4), { barIndex: 1, tick: 0, loop: 1, countIn: false });
    assert.deepEqual(scorePosition(15.5, 4), { barIndex: 3, tick: 336, loop: 1, countIn: false });
    assert.deepEqual(scorePosition(16, 4), { barIndex: 0, tick: 0, loop: 2, countIn: false });
    assert.deepEqual(scorePosition(29, 4), { barIndex: 3, tick: 96, loop: 2, countIn: false });
    for (const beat of [NaN, Infinity]) assert.throws(() => scorePosition(beat, 4));
});

test("nonuniform engraving anchors preserve straight note positions and interpolate locally", () => {
    const anchors = scoreAnchors([position(0, 0, 90), position(48, 48, 140), position(96, 96, 240), position(288, 288, 390)],
        { barStart: 0, endX: 460, feel: "straight" });
    assert.equal(markerX(48, anchors), 140);
    assert.equal(markerX(72, anchors), 190);
    assert.equal(markerX(192, anchors), 315);
    assert.equal(markerX(-1, anchors), 90);
    assert.equal(markerX(400, anchors), 460);
});

test("swung written offbeats are reached at performance tick 64, never 48", () => {
    const anchors = scoreAnchors([position(0, 0, 80), position(48, 64, 180), position(96, 96, 230)],
        { barStart: 0, endX: 400, feel: "swing" });
    assert.equal(markerX(64, anchors), 180);
    assert.equal(markerX(48, anchors), 155);
    assert.equal(markerX(80, anchors), 205);
});

test("explicit triplets stay literal inside Swing, including a triplet rest", () => {
    const anchors = scoreAnchors([position(384, 384, 80), position(576, 576, 180, { triplet: true, rest: true }),
        position(608, 608, 240, { triplet: true }), position(640, 640, 300, { triplet: true })],
        { barStart: 384, endX: 440, feel: "swing" });
    assert.equal(markerX(224, anchors), 240);
    assert.equal(markerX(256, anchors), 300);
    assert.equal(markerX(240, anchors), 270);
});

test("rests use swing mapping and actual noteheads win over shifted lower drum/rest glyphs", () => {
    const anchors = scoreAnchors([position(0, 0, 80), position(0, 0, 95, { voice: "drums" }),
        position(48, 64, 150, { rest: true }), position(48, 64, 160, { voice: "snare" })],
        { barStart: 0, endX: 400, feel: "swing" });
    assert.equal(markerX(0, anchors), 80);
    assert.equal(markerX(64, anchors), 160);
    assert.throws(() => scoreAnchors([position(0, 0, 150), position(48, 48, 100)],
        { barStart: 0, endX: 400, feel: "straight" }), /aligned/);
});

test("literal finer-subdivision rests at tick 48 stay literal inside Swing", () => {
    const anchors = scoreAnchors([position(0, 0, 80), position(48, 48, 150, { rest: true, swung: false }),
        position(72, 72, 180, { swung: false })], { barStart: 0, endX: 400, feel: "swing" });
    assert.equal(markerX(48, anchors), 150);
});
