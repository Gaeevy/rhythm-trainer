import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { validateKitProfile, loadKitProfile } from "../src/kit-profile.js";
import { INSTRUMENTS } from "../src/instruments.js";
import { DEFAULT_KEY_BINDINGS } from "../src/input.js";

const profile = JSON.parse(await readFile(new URL("../config/drumkits/mps-850.json", import.meta.url), "utf8"));

test("fixed MPS-850 config matches the observed basic pads and covers every instrument", () => {
    assert.equal(validateKitProfile(profile), profile);
    const expected = { kick: 36, snare: 38, hi_hat_closed: 42, hi_hat_open: 46, hi_hat_pedal: 44,
        tom_1: 48, tom_2: 45, tom_3: 43, tom_4: 41, crash_1: 49, crash_2: 57 };
    for (const [instrument, note] of Object.entries(expected)) {
        assert.deepEqual(profile.mappings[instrument], [{ note, channel: 10 }]);
    }
    assert.deepEqual(profile.mappings.ride, [{ note: 51, channel: 10 }, { note: 59, channel: 10 }]);
    assert.deepEqual(Object.keys(profile.mappings).sort(), Object.keys(INSTRUMENTS).sort());
    assert.deepEqual(new Set(Object.values(DEFAULT_KEY_BINDINGS)), new Set(Object.keys(INSTRUMENTS)));
});

test("invalid or ambiguous config cannot enable MIDI", () => {
    for (const change of [
        p => { p.version = 2; }, p => { p.id = "other"; }, p => { p.verification = "partial"; },
        p => { p.mappings.kick[0].note = 128; }, p => { p.mappings.snare[0].channel = 0; },
        p => { p.mappings.hi_hat_closed = p.mappings.kick; }, p => { p.mappings.unknown = []; },
        p => { p.mappings.tom_1 = []; }, p => { delete p.mappings.tom_1; },
    ]) {
        const value = structuredClone(profile); change(value);
        assert.throws(() => validateKitProfile(value));
    }
});

test("loading the fixed config uses a repository-relative URL and reports fetch errors", async () => {
    const loaded = await loadKitProfile(async url => {
        assert.ok(url.pathname.endsWith("/config/drumkits/mps-850.json"));
        return { ok: true, json: async () => profile };
    });
    assert.equal(loaded, profile);
    await assert.rejects(() => loadKitProfile(async () => ({ ok: false, status: 404 })), /HTTP 404/);
});
