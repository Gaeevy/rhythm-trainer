import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { MidiInput, MidiState, parseNoteOn } from "../src/midi.js";

const profile = JSON.parse(await readFile(new URL("../config/drumkits/mps-850.json", import.meta.url), "utf8"));
const port = (id = "kit") => ({ id, name: id, state: "connected", onmidimessage: null, closes: 0,
    async open() {}, async close() { this.closes++; } });
const message = (note = 38, channel = 10, velocity = 90, timeStamp = 12.345) =>
    ({ data: [0x90 + channel - 1, note, velocity], timeStamp });
function harness({ ports = [port()], requestAccess, loadProfile } = {}) {
    const access = { inputs: new Map(ports.map(input => [input.id, input])), onstatechange: null };
    const hits = [], requests = [];
    let disconnects = 0;
    const midi = new MidiInput({
        requestAccess: requestAccess ?? (async options => { requests.push(options); return access; }),
        loadProfile: loadProfile ?? (async () => profile), onHit: hit => hits.push(hit),
        onDisconnect: () => { disconnects++; },
    });
    return { midi, access, hits, requests, ports, get disconnects() { return disconnects; } };
}

test("Note On parser preserves all channels, velocity, and exact timestamp", () => {
    for (const channel of [1, 10, 16]) assert.deepEqual(parseNoteOn(message(0, channel, 127)),
        { note: 0, channel, velocity: 127, originalTimeStamp: 12.345 });
});

test("note-off, zero velocity, controllers, aftertouch and malformed messages are ignored", () => {
    for (const data of [[0x80, 38, 90], [0x90, 38, 0], [0xf8], [0xb9, 4, 90], [0xa9, 38, 90],
        [0xf0, 1, 0xf7], [0x90, 38], [0x90, 38, 128], [0x90, -1, 90], [0x90, 38.5, 90], null, {}]) {
        assert.equal(parseNoteOn({ data, timeStamp: 10 }), null);
    }
    assert.equal(parseNoteOn(null), null);
    assert.equal(parseNoteOn({ data: [0x99, 38, 90], timeStamp: NaN }), null);
});

test("every available input connects automatically with the same fixed MPS-850 mapping", async () => {
    const h = harness({ ports: [port("kit"), port("other")] });
    await h.midi.connect();
    assert.deepEqual(h.requests, [{ sysex: false }]);
    assert.equal(h.midi.inputs.size, 2);
    assert.equal(h.midi.state, MidiState.CONNECTED);
    h.ports[0].onmidimessage(message(42));
    h.ports[1].onmidimessage(message(44));
    h.ports[0].onmidimessage(message(46));
    assert.deepEqual(h.hits.map(hit => hit.instrument), ["hi_hat_closed", "hi_hat_pedal", "hi_hat_open"]);
    assert.equal(h.hits[0].originalTimeStamp, 12.345);
    assert.equal(h.hits[0].velocity, 90);
    h.ports[0].onmidimessage(message(127));
    h.ports[0].onmidimessage(message(42, 1));
    assert.equal(h.hits.length, 3);
    assert.equal(h.midi.lastNote.instrument, null);
});

test("hotplug reconnects automatically, while unplugging stops the consumer", async () => {
    const h = harness({ ports: [] });
    await h.midi.connect();
    assert.equal(h.midi.state, MidiState.NO_DEVICES);
    const input = port(); h.access.inputs.set(input.id, input); h.access.onstatechange();
    assert.equal(h.midi.state, MidiState.CONNECTED);
    input.onmidimessage(message());
    assert.equal(h.hits.length, 1);
    input.state = "disconnected"; h.access.onstatechange();
    assert.equal(h.disconnects, 1);
    assert.equal(input.onmidimessage, null);
    input.state = "connected"; h.access.onstatechange();
    assert.equal(h.midi.inputs.size, 1);
    assert.equal(h.requests.length, 1);
    h.midi.disconnect();
    assert.equal(input.onmidimessage, null);
    assert.equal(h.access.onstatechange, null);
});

test("permission denial and config failure can retry without breaking keyboard consumers", async () => {
    const denied = harness({ requestAccess: async () => { throw new DOMException("Denied", "NotAllowedError"); } });
    await denied.midi.connect();
    assert.equal(denied.midi.state, MidiState.ERROR);
    assert.match(denied.midi.message, /Allow MIDI access/);
    denied.midi.requestAccess = async () => denied.access;
    await denied.midi.connect();
    assert.equal(denied.midi.inputs.size, 1);
    const badConfig = harness({ loadProfile: async () => { throw new Error("Bad config"); } });
    await badConfig.midi.connect();
    assert.equal(badConfig.requests.length, 0);
    assert.match(badConfig.midi.message, /Bad config/);
    badConfig.midi.loadProfile = async () => profile;
    await badConfig.midi.connect();
    assert.equal(badConfig.midi.state, MidiState.CONNECTED);
    assert.equal(new MidiInput({}).state, MidiState.UNSUPPORTED);
});

test("busy ports are released and can retry; stale port-open errors are ignored", async () => {
    const input = port(); input.open = async () => { throw new Error("Busy"); };
    const h = harness({ ports: [input] });
    await h.midi.connect();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.midi.state, MidiState.ERROR);
    assert.equal(h.midi.inputs.size, 0);
    assert.equal(input.onmidimessage, null);
    assert.match(h.midi.message, /Busy/);
    input.open = async () => {};
    await h.midi.connect();
    assert.equal(h.midi.inputs.size, 1);
    let rejectOpen;
    const pending = port("pending"); pending.open = () => new Promise((resolve, reject) => { rejectOpen = reject; });
    h.access.inputs.set(pending.id, pending); h.access.onstatechange();
    await new Promise(resolve => setImmediate(resolve));
    pending.state = "disconnected"; h.access.onstatechange();
    rejectOpen(new Error("Late failure"));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.midi.state, MidiState.CONNECTED);
});

test("disconnect invalidates pending profile/permission requests", async () => {
    let finish;
    const h = harness({ requestAccess: () => new Promise(resolve => { finish = resolve; }) });
    const connecting = h.midi.connect();
    await new Promise(resolve => setImmediate(resolve));
    h.midi.disconnect(); finish(h.access); await connecting;
    assert.equal(h.midi.inputs.size, 0);
    assert.equal(h.access.onstatechange, null);
});

test("the observed pedal burst produces one chick hit", async () => {
    const h = harness(); await h.midi.connect();
    for (const data of [[0xb9, 4, 15], [0xb9, 4, 80], [0x99, 44, 46], [0x99, 44, 0],
        [0xa9, 46, 127], [0xa9, 46, 0], [0xb9, 4, 118]]) h.ports[0].onmidimessage({ data, timeStamp: 1000 });
    assert.equal(h.hits.length, 1);
    assert.equal(h.hits[0].instrument, "hi_hat_pedal");
});
