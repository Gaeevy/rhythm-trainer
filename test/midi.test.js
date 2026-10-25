import assert from "node:assert/strict";
import test from "node:test";
import { MidiInput, MidiState, parseNoteOn } from "../src/midi.js";
import { Assessment } from "../src/assessment.js";
import { eventTimeToAudioTime } from "../src/clock.js";

function input(id = "kit", name = "MPS-850") {
    return { id, name, state: "connected", onmidimessage: null };
}

function storage() {
    const values = new Map();
    return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

function message(note = 38, channel = 10, velocity = 90, timeStamp = 1234.56789) {
    return { data: new Uint8Array([0x90 + channel - 1, note, velocity]), timeStamp };
}

function harness({ ports = [input()], saved = storage(), requestAccess } = {}) {
    const access = { inputs: new Map(ports.map(port => [port.id, port])), onstatechange: null };
    const hits = [];
    const requests = [];
    let disconnects = 0;
    const midi = new MidiInput({
        storage: saved,
        requestAccess: requestAccess ?? (async options => { requests.push(options); return access; }),
        onHit: hit => hits.push(hit), onDisconnect: () => { disconnects++; },
    });
    return { midi, access, hits, requests, saved, ports, get disconnects() { return disconnects; } };
}

async function ready(options) {
    const h = harness(options);
    await h.midi.connect();
    h.midi.selectDevice(h.ports[0].id);
    return h;
}

test("Note On parser accepts all channels and preserves note, velocity, and timestamp", () => {
    for (const channel of [1, 10, 16]) {
        assert.deepEqual(parseNoteOn(message(0, channel, 127, 12.3456789)), {
            note: 0, channel, velocity: 127, originalTimeStamp: 12.3456789,
        });
    }
    assert.equal(parseNoteOn(message(127, 1, 1)).note, 127);
});

test("ignores Note Off, zero velocity, clocks, CC, pressure, SysEx, and malformed messages", () => {
    for (const data of [
        [0x80, 38, 90], [0x90, 38, 0], [0xf8], [0xfa], [0xb9, 4, 90], [0xa9, 38, 90],
        [0xf0, 1, 0xf7], [0x90, 38], [0x90, 38, 90, 1], [0x90, -1, 90],
        [0x90, 128, 90], [0x90, 38, 128], [0x90, 38, -1], [0x90, 38.5, 90],
        ["144", 38, 90], [0x90, 38, NaN], null, {}, { length: 3, 0: 144, 1: 38, 2: 90 },
    ]) assert.equal(parseNoteOn({ data, timeStamp: 10 }), null);
    assert.equal(parseNoteOn(null), null);
    assert.equal(parseNoteOn({ data: [0x90, 38, 90], timeStamp: NaN }), null);
});

test("connection is explicit, requests no SysEx, and never chooses the first device", async () => {
    const h = harness();
    assert.equal(h.requests.length, 0);
    await h.midi.connect();
    assert.deepEqual(h.requests, [{ sysex: false }]);
    assert.equal(h.midi.state, MidiState.AVAILABLE);
    assert.equal(h.midi.input, null);
    assert.equal(h.ports[0].onmidimessage, null);
    h.midi.selectDevice("kit");
    assert.equal(h.midi.state, MidiState.CONNECTED);
    assert.equal(h.midi.input, h.ports[0]);
    assert.equal(typeof h.ports[0].onmidimessage, "function");
    assert.throws(() => h.midi.selectDevice("missing"), RangeError);
});

test("learn mode consumes its hit, accepts any channel, and preserves multiple zones", async () => {
    const h = await ready();
    h.midi.startLearn("hi_hat");
    h.ports[0].onmidimessage({ data: [0xf8], timeStamp: 1 });
    assert.equal(h.midi.learning, "hi_hat");
    h.ports[0].onmidimessage(message(42, 1));
    h.midi.startLearn("hi_hat");
    h.ports[0].onmidimessage(message(44, 1));
    h.midi.startLearn("ride");
    h.ports[0].onmidimessage(message(51, 16));
    h.midi.startLearn("ride");
    h.ports[0].onmidimessage(message(53, 16));
    assert.equal(h.hits.length, 0);
    assert.deepEqual(h.midi.profile.mappings.hi_hat, [{ note: 42, channel: 1 }, { note: 44, channel: 1 }]);
    assert.deepEqual(h.midi.profile.mappings.ride, [{ note: 51, channel: 16 }, { note: 53, channel: 16 }]);
    h.ports[0].onmidimessage(message(44, 1));
    assert.deepEqual(h.hits[0], { instrument: "hi_hat", originalTimeStamp: 1234.56789, velocity: 90, source: "midi" });
    h.ports[0].onmidimessage(message(53, 16));
    assert.equal(h.hits[1].instrument, "ride");
});

test("notes and channels identify mappings; unknown messages are monitored without scoring", async () => {
    const h = await ready();
    h.midi.startLearn("snare");
    h.ports[0].onmidimessage(message(38, 2));
    h.ports[0].onmidimessage(message(38, 10));
    assert.equal(h.hits.length, 0);
    assert.equal(h.midi.lastNote.instrument, null);
    assert.equal(h.midi.lastNote.channel, 10);
    h.ports[0].onmidimessage(message(38, 2, 0));
    assert.equal(h.hits.length, 0);
    h.ports[0].onmidimessage(message(38, 2, 45));
    assert.equal(h.hits.length, 1);
    assert.equal(h.hits[0].velocity, 45);
});

test("relearning a note moves it between instruments without double assignment", async () => {
    const h = await ready();
    for (const instrument of ["snare", "snare", "kick"]) {
        h.midi.startLearn(instrument);
        h.ports[0].onmidimessage(message(38));
    }
    assert.deepEqual(h.midi.profile.mappings.snare, []);
    assert.deepEqual(h.midi.profile.mappings.kick, [{ note: 38, channel: 10 }]);
    assert.match(h.midi.message, /Moved from Snare/);
    h.ports[0].onmidimessage(message(38));
    assert.equal(h.hits.length, 1);
    assert.equal(h.hits[0].instrument, "kick");
});

test("cancel and mapping removal do not consume subsequent hits", async () => {
    const h = await ready();
    h.midi.startLearn("snare");
    h.midi.startLearn("snare");
    assert.equal(h.midi.learning, null);
    h.ports[0].onmidimessage(message());
    assert.deepEqual(h.midi.profile.mappings.snare, []);
    h.midi.startLearn("snare");
    h.ports[0].onmidimessage(message());
    h.midi.removeMapping("snare", { note: 38, channel: 10 });
    h.ports[0].onmidimessage(message());
    assert.equal(h.hits.length, 0);
    assert.throws(() => h.midi.startLearn("tom"), RangeError);
});

test("selection detaches old input and does not leak mappings across devices", async () => {
    const h = await ready({ ports: [input(), input("other", "Other kit")] });
    h.midi.startLearn("snare");
    h.ports[0].onmidimessage(message());
    const staleHandler = h.ports[0].onmidimessage;
    h.midi.selectDevice("other");
    assert.equal(h.ports[0].onmidimessage, null);
    staleHandler(message());
    h.ports[1].onmidimessage(message());
    assert.equal(h.hits.length, 0);
    h.midi.startLearn("kick");
    h.ports[1].onmidimessage(message());
    h.midi.selectDevice("kit");
    h.ports[0].onmidimessage(message());
    assert.equal(h.hits[0].instrument, "snare");
    assert.deepEqual(h.midi.profile.mappings.kick, []);
});

test("disconnect stops the consumer once; reconnect with same ID restores mapping", async () => {
    const h = await ready();
    h.midi.startLearn("snare");
    h.ports[0].onmidimessage(message());
    h.midi.startLearn("kick");
    h.ports[0].state = "disconnected";
    h.access.onstatechange();
    h.access.onstatechange();
    assert.equal(h.disconnects, 1);
    assert.equal(h.midi.learning, null);
    assert.equal(h.midi.state, MidiState.DISCONNECTED);
    assert.equal(h.ports[0].onmidimessage, null);
    const reconnected = input();
    h.access.inputs.set("kit", reconnected);
    h.access.onstatechange();
    assert.equal(h.midi.state, MidiState.CONNECTED);
    reconnected.onmidimessage(message());
    assert.equal(h.hits[0].instrument, "snare");
    h.midi.disconnect();
    assert.equal(h.disconnects, 2);
    assert.equal(h.access.onstatechange, null);
    assert.equal(reconnected.onmidimessage, null);
});

test("reload restores the selected device and mappings only after explicit Connect", async () => {
    const first = await ready();
    first.midi.startLearn("snare");
    first.ports[0].onmidimessage(message());
    first.midi.disconnect();
    const second = harness({ saved: first.saved });
    assert.equal(second.requests.length, 0);
    assert.equal(second.midi.input, null);
    assert.deepEqual(second.midi.profile.mappings.snare, [{ note: 38, channel: 10 }]);
    await second.midi.connect();
    second.ports[0].onmidimessage(message());
    assert.equal(second.hits[0].instrument, "snare");
});

test("reports unsupported browsers, absent devices, denied permission, and request cancellation", async () => {
    const unsupported = new MidiInput({ storage: storage() });
    await unsupported.connect();
    assert.equal(unsupported.state, MidiState.UNSUPPORTED);
    const noDevices = harness({ ports: [] });
    await noDevices.midi.connect();
    assert.equal(noDevices.midi.state, MidiState.NO_DEVICES);
    for (const name of ["NotAllowedError", "SecurityError", "NetworkError"]) {
        const denied = harness({ requestAccess: async () => { throw Object.assign(new Error("Test failure"), { name }); } });
        await denied.midi.connect();
        assert.equal(denied.midi.state, MidiState.ERROR);
        assert.match(denied.midi.message, name === "NetworkError" ? /Could not connect/ : /permission was denied/);
    }
    let resolve;
    const pending = harness({ requestAccess: () => new Promise(done => { resolve = done; }) });
    const connecting = pending.midi.connect();
    assert.equal(pending.midi.state, MidiState.CONNECTING);
    pending.midi.disconnect();
    resolve(pending.access);
    await connecting;
    assert.equal(pending.midi.access, null);
    assert.equal(pending.access.onstatechange, null);
});

test("MIDI uses the same timestamp conversion and assessment with velocity retained", async () => {
    const h = await ready();
    h.midi.startLearn("snare");
    h.ports[0].onmidimessage(message());
    const lesson = { version: 1, title: "MIDI", bpm: 120, bars: 1, time_signature: [4, 4], tracks: [{ instrument: "snare", notes: [0] }] };
    const assessment = new Assessment(lesson, { origin: 10 });
    h.midi.onHit = hit => assessment.recordHit({
        ...hit, audioTime: eventTimeToAudioTime(hit.originalTimeStamp, { contextTime: 10, performanceTime: 1000 }),
    });
    h.ports[0].onmidimessage(message(38, 10, 77, 1018.7654321));
    assert.equal(assessment.hits[0].status, "on_time");
    assert.equal(assessment.hits[0].source, "midi");
    assert.equal(assessment.hits[0].velocity, 77);
    assert.equal(assessment.hits[0].originalTimeStamp, 1018.7654321);
    assert.ok(Math.abs(assessment.hits[0].errorMs - 18.7654321) < 1e-8);
});

test("a port-open failure detaches input and reports an error without retrying in a loop", async () => {
    const port = input();
    let opens = 0;
    port.open = async () => { opens++; throw new Error("Device busy"); };
    const h = await ready({ ports: [port] });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.midi.state, MidiState.ERROR);
    assert.match(h.midi.message, /Could not open MPS-850: Device busy/);
    assert.equal(h.midi.input, null);
    assert.equal(port.onmidimessage, null);
    h.access.onstatechange();
    assert.equal(opens, 1);
    assert.equal(h.disconnects, 1);
    port.state = "disconnected";
    h.access.onstatechange();
    const reconnected = input();
    h.access.inputs.set("kit", reconnected);
    h.access.onstatechange();
    assert.equal(h.midi.state, MidiState.CONNECTED);
});

test("switching and disconnecting release the old port; stale open failures are ignored", async () => {
    const first = input();
    const second = input("other", "Other kit");
    let rejectOpen;
    let firstCloses = 0;
    let secondCloses = 0;
    first.open = () => new Promise((resolve, reject) => { rejectOpen = reject; });
    first.close = async () => { firstCloses++; };
    second.close = async () => { secondCloses++; };
    const h = await ready({ ports: [first, second] });
    await new Promise(resolve => setImmediate(resolve));
    h.midi.selectDevice("other");
    assert.equal(firstCloses, 1);
    rejectOpen(new Error("Late failure from old port"));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.midi.state, MidiState.CONNECTED);
    assert.equal(h.midi.input, second);
    assert.equal(h.disconnects, 0);
    h.midi.disconnect();
    assert.equal(secondCloses, 1);
});

test("closed, open, and pedal hi-hat learn and emit independent actions", async () => {
    const h = await ready();
    for (const [instrument, note] of [["hi_hat_closed", 42], ["hi_hat_open", 46], ["hi_hat_pedal", 44]]) {
        h.midi.startLearn(instrument);
        h.ports[0].onmidimessage({ data: [0xb9, 4, 127], timeStamp: 1 });
        assert.equal(h.midi.learning, instrument);
        h.ports[0].onmidimessage(message(note));
    }
    assert.equal(h.hits.length, 0);
    for (const note of [42, 46, 44]) h.ports[0].onmidimessage(message(note));
    assert.deepEqual(h.hits.map(hit => hit.instrument), ["hi_hat_closed", "hi_hat_open", "hi_hat_pedal"]);
    assert.deepEqual(h.midi.profile.mappings.hi_hat, []);
    assert.match(h.midi.learnMessage("hi_hat_closed"), /before clicking/);
    assert.match(h.midi.learnMessage("hi_hat_pedal"), /without striking/);
});

test("observed pedal burst produces one chick hit despite controller, note-off, and aftertouch messages", async () => {
    const h = await ready();
    h.midi.startLearn("hi_hat_pedal");
    h.ports[0].onmidimessage(message(44));
    const burst = [
        ...[15, 26, 38, 50, 63, 80].map(value => [0xb9, 4, value]),
        [0x99, 44, 46], [0x99, 44, 0],
        [0xa9, 46, 127], [0xa9, 46, 0], [0xa9, 26, 127], [0xa9, 26, 0],
        [0xa9, 21, 127], [0xa9, 21, 0],
        ...[91, 103, 118].map(value => [0xb9, 4, value]),
    ];
    for (const data of burst) h.ports[0].onmidimessage({ data, timeStamp: 1000 });
    assert.equal(h.hits.length, 1);
    assert.equal(h.hits[0].instrument, "hi_hat_pedal");
    assert.equal(h.hits[0].velocity, 46);
});
