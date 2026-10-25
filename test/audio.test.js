import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { DrumAudio } from "../src/audio.js";
import { DRUM_SAMPLES } from "../src/drum-samples.js";
import { INSTRUMENTS } from "../src/instruments.js";

function harness() {
    const sources = [];
    const parameter = () => ({ value: 0, events: [],
        setValueAtTime(value, time) { this.events.push(["set", value, time]); },
        linearRampToValueAtTime(value, time) { this.events.push(["linear", value, time]); },
        exponentialRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {},
    });
    const node = () => ({ connect() {}, disconnect() {}, gain: parameter() });
    const source = kind => {
        const result = { ...node(), kind, frequency: parameter(), starts: [], stops: [],
            start(time) { this.starts.push(time); }, stop(time) { this.stops.push(time); } };
        sources.push(result);
        return result;
    };
    const context = {
        currentTime: 0, sampleRate: 100, destination: {}, createGain: node,
        createBuffer: () => ({ getChannelData: () => new Float32Array(100) }),
        createBufferSource: () => source("sample"), createOscillator: () => source("oscillator"),
        decodeAudioData: async () => ({ duration: 4 }),
    };
    const requests = [];
    const fetcher = async url => { requests.push(url.pathname); return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) }; };
    return { audio: new DrumAudio(context), sources, context, requests, fetcher };
}

test("recordings load once, deduplicate the legacy hi-hat alias, and use exact audio timestamps", async () => {
    const h = harness();
    await Promise.all([h.audio.loadSamples(h.fetcher), h.audio.loadSamples(h.fetcher)]);
    assert.equal(h.requests.length, 12);
    assert.equal(h.audio.samples.size, 12);
    h.audio.schedule("snare", 12.3456789);
    assert.equal(h.sources[0].buffer, h.audio.samples.get("snare.wav"));
    assert.deepEqual(h.sources[0].starts, [12.3456789]);
    h.sources[0].onended();
    assert.equal(h.audio.sources.size, 0);
    h.audio.schedule("metronome", 13, true);
    assert.equal(h.sources.at(-1).kind, "oscillator");
    assert.deepEqual(h.sources.at(-1).frequency.events[0], ["set", 1400, 13]);
});

test("closed and pedal notes choke open recordings on the same clock, including simultaneous notes", async () => {
    const h = harness();
    await h.audio.loadSamples(h.fetcher);
    h.audio.schedule("hi_hat_open", 10);
    h.audio.schedule("hi_hat_pedal", 11);
    assert.deepEqual(h.sources[0].stops, [11.02]);
    h.audio.schedule("hi_hat_open", 12);
    assert.deepEqual(h.sources[2].stops, []);
    h.audio.schedule("hi_hat_closed", 14);
    assert.deepEqual(h.sources[2].stops, [14.02]);
    h.audio.schedule("hi_hat_open", 14);
    assert.deepEqual(h.sources[4].stops, [14.02]);
    h.audio.stop();
    assert.equal(h.audio.sources.size, 0);
    assert.equal(h.audio.openHiHats.size, 0);
    assert.deepEqual(h.audio.hiHatClosures, []);
});

test("missing or corrupt recordings can retry without publishing a partial sound bank", async () => {
    const h = harness();
    assert.equal(await h.audio.loadSamples(async () => ({ ok: false, status: 404 })), false);
    assert.equal(h.audio.samples.size, 0);
    assert.equal(await h.audio.loadSamples(h.fetcher), true);
    assert.equal(h.audio.samples.size, 12);
    const broken = harness();
    broken.context.decodeAudioData = async () => { throw new Error("Corrupt recording"); };
    assert.equal(await broken.audio.loadSamples(broken.fetcher), false);
    assert.equal(broken.audio.samples.size, 0);
});

test("every instrument has a valid non-silent local PCM recording in a small sound bank", async () => {
    assert.deepEqual(Object.keys(DRUM_SAMPLES).sort(), Object.keys(INSTRUMENTS).sort());
    let bytes = 0;
    for (const file of new Set(Object.values(DRUM_SAMPLES).map(sample => sample.file))) {
        const wav = await readFile(new URL(`../assets/drums/${file}`, import.meta.url));
        assert.equal(wav.toString("ascii", 0, 4), "RIFF");
        assert.equal(wav.readUInt16LE(20), 1);
        assert.equal(wav.readUInt16LE(22), 1);
        assert.equal(wav.readUInt32LE(24), 44100);
        assert.equal(wav.readUInt16LE(34), 16);
        let peak = 0;
        for (let offset = 44; offset < wav.length; offset += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(offset)));
        assert.ok(peak > 100 && peak < 32767, `${file}: audible and not clipped`);
        bytes += wav.length;
    }
    assert.ok(bytes < 3 * 1024 * 1024);
});
