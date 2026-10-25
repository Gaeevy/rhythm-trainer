import assert from "node:assert/strict";
import test from "node:test";
import { emptyMappings, loadMidiSettings, saveMidiSettings, validMidiSettings } from "../src/midi-settings.js";

function settings() {
    return {
        version: 1, selectedDeviceId: "kit",
        profiles: [{ deviceId: "kit", name: "MPS-850", mappings: { ...emptyMappings(), snare: [{ note: 38, channel: 10 }] } }],
    };
}

test("settings round-trip and preserve independent device profiles", () => {
    let text = null;
    const storage = { getItem: () => text, setItem: (key, value) => { text = value; } };
    const value = settings();
    value.profiles.push({ deviceId: "other", name: "Other kit", mappings: { ...emptyMappings(), kick: [{ note: 38, channel: 10 }] } });
    assert.equal(validMidiSettings(value), true);
    assert.equal(saveMidiSettings(storage, value), "");
    assert.deepEqual(loadMidiSettings(storage), { settings: value, warning: "" });
});

test("corrupt, incompatible, conflicting, and invalid stored mappings are ignored", () => {
    const invalid = [null, {}, { ...settings(), version: 2 }, { ...settings(), selectedDeviceId: "unknown" }];
    for (const mutate of [
        value => { value.profiles[0].mappings.snare[0].note = 128; },
        value => { value.profiles[0].mappings.snare[0].channel = 0; },
        value => { value.profiles[0].mappings.snare[0].channel = 17; },
        value => { value.profiles[0].mappings.kick = [{ note: 38, channel: 10 }]; },
        value => { value.profiles[0].mappings.snare.push({ note: 38, channel: 10 }); },
        value => { delete value.profiles[0].mappings.ride; },
        value => { value.profiles[0].mappings.tom = []; },
        value => { value.profiles.push(value.profiles[0]); },
    ]) {
        const value = settings(); mutate(value); invalid.push(value);
    }
    for (const value of invalid) {
        assert.equal(validMidiSettings(value), false);
        const loaded = loadMidiSettings({ getItem: () => JSON.stringify(value) });
        assert.deepEqual(loaded.settings.profiles, []);
        assert.match(loaded.warning, /invalid/);
    }
    assert.match(loadMidiSettings({ getItem: () => "{bad json}" }).warning, /invalid/);
});

test("unavailable storage is nonfatal and produces a visible persistence warning", () => {
    for (const storage of [undefined, { getItem() { throw new Error("Denied"); }, setItem() { throw new Error("Full"); } }]) {
        assert.match(loadMidiSettings(storage).warning, /unavailable/);
        assert.match(saveMidiSettings(storage, settings()), /Could not save/);
    }
    assert.deepEqual(loadMidiSettings({ getItem: () => null }).settings.profiles, []);
});

test("old four-instrument profiles expand without changing existing mappings or device selection", () => {
    const old = { version: 1, selectedDeviceId: "kit", profiles: [{ deviceId: "kit", name: "e-drum", mappings: {
        kick: [{ note: 36, channel: 10 }], snare: [{ note: 38, channel: 10 }],
        hi_hat: [{ note: 42, channel: 10 }, { note: 44, channel: 10 }], ride: [{ note: 59, channel: 10 }],
    } }] };
    const loaded = loadMidiSettings({ getItem: () => JSON.stringify(old) });
    assert.equal(loaded.warning, "");
    assert.equal(loaded.settings.selectedDeviceId, "kit");
    for (const instrument of ["kick", "snare", "hi_hat", "ride"]) {
        assert.deepEqual(loaded.settings.profiles[0].mappings[instrument], old.profiles[0].mappings[instrument]);
    }
    assert.deepEqual(loaded.settings.profiles[0].mappings.hi_hat_closed, []);
    assert.deepEqual(loaded.settings.profiles[0].mappings.tom_4, []);
    assert.equal(validMidiSettings(loaded.settings), true);
});
