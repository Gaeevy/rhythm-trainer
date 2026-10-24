import assert from "node:assert/strict";
import test from "node:test";
import { defaultPracticeSettings, loadPracticeSettings, savePracticeSettings, validPracticeSettings, PRACTICE_SETTINGS_KEY } from "../src/practice-settings.js";
import { MIDI_SETTINGS_KEY } from "../src/midi-settings.js";
import { remapKey } from "../src/input.js";

test("defaults are valid and do not share mutable bindings or tempo overrides", () => {
    const first = defaultPracticeSettings();
    const second = defaultPracticeSettings();
    assert.equal(validPracticeSettings(first), true);
    first.tempos["swing-ride"] = 90;
    delete first.keyBindings.KeyF;
    assert.deepEqual(second.tempos, {});
    assert.equal(second.keyBindings.KeyF, "snare");
});

test("practice controls and per-lesson tempo overrides survive storage without touching MIDI", () => {
    const values = new Map([[MIDI_SETTINGS_KEY, "Existing device profiles"]]);
    const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
    const settings = {
        ...defaultPracticeSettings(), countIn: false, toleranceMs: 12.5, latencyOffsetMs: -24.5,
        disabledInstruments: ["kick"], guideVolume: 20, guideMuted: true, metronomeVolume: 75, metronomeMuted: false,
        keyBindings: remapKey(defaultPracticeSettings().keyBindings, "snare", "KeyQ"),
        tempos: { "swing-ride": 92.5, "basic-straight": 110, "mixed-subdivisions": 80 },
        lastBundledLessonId: "basic-straight",
    };
    assert.equal(validPracticeSettings(settings), true);
    assert.equal(savePracticeSettings(storage, settings), "");
    assert.ok(values.has(PRACTICE_SETTINGS_KEY));
    assert.deepEqual(loadPracticeSettings(storage), { settings, warning: "" });
    assert.equal(values.get(MIDI_SETTINGS_KEY), "Existing device profiles");
});

test("corrupt or incompatible preferences restore defaults with a useful warning", () => {
    const invalid = [null, {}, { ...defaultPracticeSettings(), version: 2 }];
    for (const [field, value] of [
        ["disabledInstruments", null], ["disabledInstruments", ["tom"]], ["disabledInstruments", ["kick", "kick"]],
        ["countIn", "false"], ["guideMuted", 1], ["metronomeMuted", null],
        ["toleranceMs", -1], ["toleranceMs", 151], ["latencyOffsetMs", 501],
        ["guideVolume", -1], ["metronomeVolume", 101], ["lastBundledLessonId", "unknown"],
        ["tempos", { "swing-ride": 301 }], ["tempos", []], ["keyBindings", {}],
        ["keyBindings", { Space: "snare", KeyF: "snare", KeyJ: "hi_hat", KeyK: "ride" }],
        ["keyBindings", { Space: "kick", Escape: "snare", KeyJ: "hi_hat", KeyK: "ride" }],
    ]) invalid.push({ ...defaultPracticeSettings(), [field]: value });
    for (const settings of invalid) {
        assert.equal(validPracticeSettings(settings), false);
        const loaded = loadPracticeSettings({ getItem: () => JSON.stringify(settings) });
        assert.deepEqual(loaded.settings, defaultPracticeSettings());
        assert.match(loaded.warning, /invalid.*MIDI mappings are unchanged/);
    }
    assert.match(loadPracticeSettings({ getItem: () => "{bad JSON}" }).warning, /invalid/);
});

test("missing or denied storage never blocks practice", () => {
    assert.deepEqual(loadPracticeSettings({ getItem: () => null }), { settings: defaultPracticeSettings(), warning: "" });
    for (const storage of [undefined, { getItem() { throw new Error("Denied"); }, setItem() { throw new Error("Full"); } }]) {
        assert.deepEqual(loadPracticeSettings(storage).settings, defaultPracticeSettings());
        assert.match(loadPracticeSettings(storage).warning, /unavailable/);
        assert.match(savePracticeSettings(storage, defaultPracticeSettings()), /Could not save/);
    }
});

test("existing Space bindings migrate to a free letter without losing practice settings", () => {
    for (const bindings of [
        { Space: "kick", KeyF: "snare", KeyJ: "hi_hat", KeyK: "ride" },
        { Space: "snare", KeyD: "kick", KeyJ: "hi_hat", KeyK: "ride" },
    ]) {
        const saved = { ...defaultPracticeSettings(), guideVolume: 17, tempos: { "swing-ride": 92 }, keyBindings: bindings };
        delete saved.disabledInstruments;
        const loaded = loadPracticeSettings({ getItem: () => JSON.stringify(saved) });
        assert.equal(loaded.warning, "");
        assert.equal(loaded.settings.guideVolume, 17);
        assert.deepEqual(loaded.settings.tempos, saved.tempos);
        assert.equal(Object.hasOwn(loaded.settings.keyBindings, "Space"), false);
        assert.equal(new Set(Object.values(loaded.settings.keyBindings)).size, 4);
        assert.equal(loaded.settings.keyBindings.KeyD, "kick");
        assert.deepEqual(loaded.settings.disabledInstruments, []);
    }
});
