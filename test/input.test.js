import assert from "node:assert/strict";
import test from "node:test";
import { keyboardInstrument, instrumentKeyLabel } from "../src/input.js";
import { feedbackText } from "../src/feedback.js";

test("keyboard bindings and labels agree for all four instruments", () => {
    for (const [code, instrument, label] of [["Space", "kick", "Space"], ["KeyF", "snare", "F"], ["KeyJ", "hi_hat", "J"], ["KeyK", "ride", "K"]]) {
        assert.equal(keyboardInstrument({ code }), instrument);
        assert.equal(instrumentKeyLabel(instrument), label);
    }
    assert.equal(keyboardInstrument({ code: "KeyQ" }), null);
    assert.equal(keyboardInstrument({ code: "toString" }), null);
    assert.equal(instrumentKeyLabel("tom"), "");
});

test("ignores repeats, handled keys, modifiers, editable fields, and controls", () => {
    for (const flag of ["repeat", "defaultPrevented", "ctrlKey", "metaKey", "altKey"]) {
        assert.equal(keyboardInstrument({ code: "Space", [flag]: true }), null);
    }
    assert.equal(keyboardInstrument({ code: "KeyF", target: { isContentEditable: true } }), null);
    assert.equal(keyboardInstrument({ code: "KeyF", target: { closest: selector => selector.includes("button") } }), null);
    assert.equal(keyboardInstrument({ code: "Space", target: { closest: selector => selector.includes("summary") } }), null);
    assert.equal(keyboardInstrument({ code: "KeyF", target: { closest: () => null } }), "snare");
});

test("input bindings are separate from lesson data and accept other mappings", () => {
    assert.equal(keyboardInstrument({ code: "KeyQ" }, { KeyQ: "snare" }), "snare");
    assert.equal(instrumentKeyLabel("snare", { KeyQ: "snare" }), "Q");
});

test("feedback uses signed milliseconds and text as well as distinct symbols", () => {
    assert.equal(feedbackText({ status: "early", errorMs: -42.4 }), "◀ Early −42 ms");
    assert.equal(feedbackText({ status: "late", errorMs: 35.8 }), "▶ Late +36 ms");
    assert.equal(feedbackText({ status: "on_time", errorMs: -0.1 }), "● On time 0 ms");
    assert.equal(feedbackText({ status: "missed", errorMs: null }), "× Missed");
    assert.equal(feedbackText({ status: "extra", errorMs: null }), "+ Extra");
});
