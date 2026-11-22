import assert from "node:assert/strict";
import test from "node:test";
import { parseBackingMidi } from "../src/backing-midi.js";

function midiFile(tracks, { format = tracks.length - 1, ppq = 480 } = {}) {
    const header = Buffer.from("4d54686400000006000000000000", "hex");
    header.writeUInt16BE(format, 8);
    header.writeUInt16BE(tracks.length, 10);
    header.writeUInt16BE(ppq, 12);
    const chunks = tracks.map(hex => {
        const data = Buffer.from(hex.replaceAll(" ", ""), "hex");
        const chunk = Buffer.alloc(8);
        chunk.write("MTrk");
        chunk.writeUInt32BE(data.length, 4);
        return Buffer.concat([chunk, data]);
    });
    return Buffer.concat([header, ...chunks]);
}

test("MIDI keeps the file's original resolution, offsets, duration and velocities", () => {
    const file = midiFile([
        "00 ff580404021808 00 ff510307a120 00 ff2f00",
        "01 903c64 00 4064 8360 3c00 00 804000 00 ff2f00",
        "00 992464 8360 892400 00 ff2f00",
    ], { format: 1 });
    assert.deepEqual(parseBackingMidi(file, 2), {
        bars: 2, ppq: 480, events: [{ tick: 1, durationTicks: 480, velocity: 100 / 127, pitches: [60, 64] }],
    });
});

test("separate MIDI notes with different durations or dynamics stay independent", () => {
    const file = midiFile(["00 903c64 00 4050 10 803c00 08 804000 00 ff2f00"]);
    assert.deepEqual(parseBackingMidi(file, 1).events, [
        { tick: 0, durationTicks: 16, velocity: 100 / 127, pitches: [60] },
        { tick: 0, durationTicks: 24, velocity: 80 / 127, pitches: [64] },
    ]);
});

test("MIDI programs and bend sensitivity apply to notes on the matching channel", () => {
    const file = midiFile([
        "00 c01b 00 902474 60 802400 00 ff2f00",
        "00 c122 00 b16500 00 b16400 00 b1060c 00 912474 30 e10060 30 812400 00 e10040 00 912774 30 812700 00 ff2f00",
    ]);
    assert.deepEqual(parseBackingMidi(file, 1).events, [
        { tick: 0, durationTicks: 96, velocity: 116 / 127, pitches: [36], program: 27 },
        {
            tick: 0, durationTicks: 96, velocity: 116 / 127, pitches: [36], program: 34,
            bends: [{ offsetTicks: 48, cents: 600 }],
        },
        { tick: 96, durationTicks: 48, velocity: 116 / 127, pitches: [39], program: 34 },
    ]);
});

test("invalid or out-of-loop MIDI fails before playback", () => {
    const track = "00 903c64 8360 803c00 00 ff2f00";
    assert.throws(() => parseBackingMidi(midiFile([track], { format: 2 }), 1), /format 0 or 1/);
    assert.throws(() => parseBackingMidi(midiFile([track], { ppq: 0x8128 }), 1), /ticks per quarter/);
    assert.throws(() => parseBackingMidi(midiFile([track]).subarray(0, -2), 1), /truncated/);
    assert.throws(() => parseBackingMidi(midiFile(["00 ff580403021808 " + track]), 1), /4\/4/);
    assert.throws(() => parseBackingMidi(midiFile(["00 903c64 8f01 803c00 00 ff2f00"]), 1), /exceeds the backing loop/);
    assert.throws(() => parseBackingMidi(midiFile(["00 903c64 00 ff2f00"]), 1), /missing its note-off/);
    assert.throws(() => parseBackingMidi(midiFile(["00 3c64 00 ff2f00"]), 1), /running status/);
    assert.throws(() => parseBackingMidi(midiFile(["00 ff2f00"]), 1), /no pitched notes/);
});
