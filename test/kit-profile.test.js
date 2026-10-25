import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { validateKitProfile, mergeKitMappings, exportKitProfile } from "../src/kit-profile.js";
import { emptyMappings } from "../src/midi-settings.js";
import { MidiInput } from "../src/midi.js";
import { INSTRUMENTS, lessonInstrument } from "../src/instruments.js";
import { DEFAULT_KEY_BINDINGS } from "../src/input.js";
import { Assessment } from "../src/assessment.js";

const profile = JSON.parse(await readFile(new URL("../config/drumkits/mps-850.json", import.meta.url), "utf8"));

test("repository MPS-850 profile contains the basic mappings verified from physical kit observations", () => {
    assert.equal(validateKitProfile(profile), profile);
    assert.equal(profile.verification, "verified");
    assert.deepEqual(profile.mappings.kick, [{ note: 36, channel: 10 }]);
    assert.deepEqual(profile.mappings.ride, [{ note: 59, channel: 10 }]);
    for (const [instrument, note] of [["hi_hat_closed", 42], ["hi_hat_open", 46], ["hi_hat_pedal", 44]]) {
        assert.deepEqual(profile.mappings[instrument], [{ note, channel: 10 }]);
    }
    for (const [instrument, note] of [["tom_1", 48], ["tom_2", 45], ["tom_3", 43], ["tom_4", 41], ["crash_1", 49], ["crash_2", 57]]) {
        assert.deepEqual(profile.mappings[instrument], [{ note, channel: 10 }]);
    }
    assert.deepEqual(profile.mappings.hi_hat, []);
    assert.deepEqual(new Set(Object.values(DEFAULT_KEY_BINDINGS)), new Set(Object.keys(INSTRUMENTS)));
});

test("invalid profile notes, channels, instruments, and conflicting pairs are rejected", () => {
    for (const change of [
        p => { p.version = 2; }, p => { p.id = "other"; }, p => { p.verification = "complete"; },
        p => { p.mappings.kick[0].note = 128; }, p => { p.mappings.snare[0].channel = 0; },
        p => { p.mappings.hi_hat_closed = p.mappings.kick; }, p => { p.mappings.unknown = []; },
    ]) {
        const value = structuredClone(profile); change(value);
        assert.throws(() => validateKitProfile(value), /Invalid MPS-850/);
    }
});

test("local overrides and explicit removals win over profile defaults, including conflicts", () => {
    const defaults = structuredClone(profile.mappings);
    defaults.hi_hat_closed = [{ note: 42, channel: 10 }];
    const local = { ...emptyMappings(), kick: [{ note: 35, channel: 1 }], hi_hat: [{ note: 42, channel: 10 }] };
    const merged = mergeKitMappings(local, defaults, ["kick", "snare", "hi_hat"]);
    assert.deepEqual(merged.kick, local.kick);
    assert.deepEqual(merged.snare, []);
    assert.deepEqual(merged.hi_hat_closed, []);
    assert.deepEqual(merged.ride, defaults.ride);
    assert.equal(local.ride.length, 0);
    merged.ride[0].note = 51;
    assert.equal(defaults.ride[0].note, 59);
});

test("profile application and export preserve learned overrides and persist deliberate removals", async () => {
    let saved;
    const storage = { getItem: () => saved ?? null, setItem: (key, value) => { saved = value; } };
    const input = { id: "browser-private-id", name: "e-drum", state: "connected" };
    const midi = new MidiInput({ storage, requestAccess: async () => ({ inputs: new Map([[input.id, input]]) }) });
    await midi.connect(); midi.selectDevice(input.id); midi.applyKitProfile(profile);
    assert.deepEqual(midi.profile.mappings.kick, profile.mappings.kick);
    midi.removeMapping("kick", { note: 36, channel: 10 });
    midi.startLearn("kick"); midi.handleMessage({ data: [0x90, 35, 70], timeStamp: 1 });
    midi.removeMapping("snare", { note: 38, channel: 10 });
    midi.applyKitProfile(profile);
    assert.deepEqual(midi.profile.mappings.kick, [{ note: 35, channel: 1 }]);
    assert.deepEqual(midi.profile.mappings.snare, []);
    const reloaded = new MidiInput({ storage });
    assert.deepEqual(reloaded.profile.overriddenInstruments, midi.profile.overriddenInstruments);
    const exported = midi.exportKitProfile();
    assert.equal(exported.verification, "partial");
    assert.deepEqual(exported.mappings, midi.profile.mappings);
    assert.equal(JSON.stringify(exported).includes(input.id), false);
    assert.equal(JSON.stringify(exported).includes("latency"), false);
    assert.deepEqual(validateKitProfile(JSON.parse(JSON.stringify(exported))), exported);
});

test("legacy hi-hat accepts explicit actions; explicit lessons never accept a generic or wrong action", () => {
    assert.equal(lessonInstrument("hi_hat_pedal", new Map([["hi_hat", {}]])), "hi_hat");
    assert.equal(lessonInstrument("hi_hat", new Map([["hi_hat_pedal", {}]])), null);
    assert.equal(lessonInstrument("hi_hat_open", new Map([["hi_hat_closed", {}]])), null);
    const lesson = { version: 1, title: "Separate actions", bpm: 80, bars: 1, time_signature: [4, 4],
        tracks: ["hi_hat_closed", "hi_hat_open", "hi_hat_pedal"].map(instrument => ({ instrument, notes: [0] })) };
    const assessment = new Assessment(lesson, { origin: 10 });
    const hit = instrument => assessment.recordHit({ instrument, audioTime: 10, originalTimeStamp: 1 });
    assert.equal(hit("hi_hat"), null);
    assert.equal(hit("hi_hat_closed").status, "on_time");
    assert.equal(assessment.resultFor("hi_hat_pedal", 0, 0), undefined);
    assert.equal(hit("hi_hat_closed").status, "extra");
    assert.equal(hit("hi_hat_pedal").status, "on_time");
    assert.equal(hit("hi_hat_open").status, "on_time");
});
