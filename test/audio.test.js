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
        exponentialRampToValueAtTime(value, time) { this.events.push(["exponential", value, time]); }, cancelScheduledValues() {}, setTargetAtTime(value, time, constant) { this.events.push(["target", value, time, constant]); },
    });
    const node = () => ({ connections: [], connect(target) { this.connections.push(target); }, disconnect() {}, gain: parameter() });
    const source = kind => {
        const result = { ...node(), kind, frequency: parameter(), detune: parameter(), starts: [], stops: [],
            start(time) { this.starts.push(time); }, stop(time) { this.stops.push(time); } };
        sources.push(result);
        return result;
    };
    const context = {
        currentTime: 0, sampleRate: 100, destination: {}, createGain: node, createWaveShaper: node,
        createBiquadFilter: () => ({ ...node(), frequency: parameter(), Q: parameter() }),
        createBuffer: () => ({ getChannelData: () => new Float32Array(100) }),
        createBufferSource: () => source("sample"), createOscillator: () => source("oscillator"),
        decodeAudioData: async () => ({ duration: 4 }),
    };
    const requests = [];
    const fetcher = async url => { requests.push(url.pathname); return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) }; };
    return { audio: new DrumAudio(context), sources, context, requests, fetcher };
}

test("recordings load once, cover every instrument and use exact audio timestamps", async () => {
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


test("unavailable guide recordings never create substitute sounds; metronome remains independent", async () => {
    const h = harness();
    assert.equal(await h.audio.loadSamples(async () => ({ ok: false, status: 404 })), false);
    for (const instrument of Object.keys(DRUM_SAMPLES)) assert.throws(() => h.audio.schedule(instrument, 2), /Recording unavailable/);
    assert.equal(h.sources.length, 0);
    for (const [accent, frequency] of [[false, 1000], [true, 1400]]) {
        h.audio.schedule("metronome", 3, accent);
        const source = h.sources.at(-1);
        assert.equal(source.type, "sine");
        assert.deepEqual(source.frequency.events, [["set", frequency, 3], ["exponential", frequency, 3.035]]);
        assert.deepEqual(source.connections[0].gain.events, [["set", 0, 3], ["linear", 0.25, 3.002], ["exponential", 0.0001, 3.035]]);
        assert.deepEqual(source.starts, [3]);
        assert.deepEqual(source.stops, [3 + 0.035 + 0.01]);
        source.onended();
        assert.equal(h.audio.sources.size, 0);
    }
    assert.equal(await h.audio.loadSamples(h.fetcher), true);
    h.audio.schedule("kick", 4);
    assert.equal(h.sources.at(-1).kind, "sample");
});

test("independent buses reach the output directly and metronome supports triple gain", () => {
    const h = harness();
    assert.deepEqual(h.audio.guide.connections, [h.context.destination]);
    assert.deepEqual(h.audio.metronome.connections, [h.context.destination]);
    assert.equal(h.audio.master, undefined);
    h.audio.setVolume("metronome", 3, false);
    h.audio.setVolume("metronome", 3, true);
    h.audio.setVolume("metronome", 3, false);
    assert.deepEqual(h.audio.metronome.gain.events,
        [["target", 3, 0, 0.008], ["target", 0, 0, 0.008], ["target", 3, 0, 0.008]]);
    assert.equal(h.audio.guide.gain.value, 0.55);
});

test("backing voices play on their own bus at the requested time and stop with transport", () => {
    const h = harness();
    h.audio.scheduleBacking({ pitches: [69, 72], duration: 0.25, velocity: 0.8 }, 3);
    assert.equal(h.sources.length, 8);
    assert.deepEqual(h.sources[0].frequency.events, [["set", 440, 3]]);
    assert.deepEqual(h.audio.backing.connections, [h.context.destination]);
    for (const source of h.sources) {
        assert.deepEqual(source.starts, [3]);
        assert.deepEqual(source.stops, [3.29]);
        assert.deepEqual(source.connections[0].connections, [h.audio.backing]);
    }
    h.audio.stop();
    assert.equal(h.audio.sources.size, 0);
    assert.ok(h.sources.every(source => source.stops.length === 2));
});

test("short backing chords reach their peak before the release begins", () => {
    const h = harness();
    h.audio.scheduleBacking({ pitches: [60], duration: 0.002, velocity: 0.8 }, 3);
    const envelope = h.sources[0].connections[0].gain.events;
    assert.equal(envelope[1][2], 3.001);
    assert.equal(envelope[2][2], 3.002);
});

test("backing guitar and bass use distinct timbres and apply pitch bends on the audio clock", () => {
    const h = harness();
    h.audio.scheduleBacking({ pitches: [60], duration: 0.25, velocity: 0.8, program: 27 }, 3);
    const guitar = h.sources.slice();
    h.audio.scheduleBacking({
        pitches: [60], duration: 0.25, velocity: 0.8, program: 34,
        bends: [{ offset: 0.125, cents: 300 }],
    }, 3);
    const bass = h.sources.slice(guitar.length);
    assert.notDeepEqual(guitar.map(source => source.frequency.events), bass.map(source => source.frequency.events));
    const guitarPeak = guitar[0].connections[0].gain.events[1][1];
    const bassPeak = bass[0].connections[0].gain.events[1][1];
    assert.ok(Math.abs(guitarPeak - 0.08 * 0.8) < 1e-12);
    assert.ok(Math.abs(bassPeak - 0.15 * 0.8 * Math.SQRT2) < 1e-12);
    assert.ok(guitar.every(source => source.detune.events.length === 0));
    assert.ok(bass.every(source => source.detune.events[0][1] === 300 && source.detune.events[0][2] === 3.125));
});

test("the entire General MIDI bass family shares the boosted backing voice", () => {
    const h = harness();
    const peak = program => {
        const first = h.sources.length;
        h.audio.scheduleBacking({ pitches: [45], duration: 0.25, velocity: 1, program }, 3);
        return h.sources[first].connections[0].gain.events[1][1];
    };
    for (let program = 32; program <= 39; program++) assert.equal(peak(program), 0.15 * Math.SQRT2);
    assert.equal(peak(31), peak(0));
    assert.equal(peak(40), peak(0));
});

test("distorted sawtooth guitar chords share a soft clipper and cabinet filter", () => {
    const h = harness();
    const chord = { pitches: [44, 51], duration: 1, velocity: 0.8, program: 30 };
    h.audio.scheduleBacking(chord, 3);
    const clipper = h.sources[0].connections[0].connections[0];
    h.audio.scheduleBacking(chord, 4);
    assert.ok(h.sources.every(source => source.connections[0].connections[0] === clipper));
    assert.equal(h.sources[0].type, "sawtooth");
    const [cabinet] = clipper.connections;
    assert.equal(cabinet.type, "bandpass");
    assert.deepEqual(cabinet.connections, [h.audio.backing]);
    assert.equal(clipper.curve[512], 0);
    assert.ok(clipper.curve[1024] < 2 * clipper.curve[768]);
    h.audio.scheduleBacking({ ...chord, program: 34 }, 4);
    assert.equal(h.sources.at(-1).connections[0].connections[0], h.audio.backing);
});
