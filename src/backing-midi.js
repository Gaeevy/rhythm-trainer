import { BEATS_PER_BAR } from "./music-time.js";

const CHUNK_HEADER = 0x4d546864; // MThd
const CHUNK_TRACK = 0x4d54726b; // MTrk
const DRUM_CHANNEL = 9; // Channel 10 in General MIDI.

class MidiReader {
    constructor(bytes) {
        this.bytes = bytes;
        this.offset = 0;
    }

    get done() {
        return this.offset === this.bytes.length;
    }

    take(length) {
        const end = this.offset + length;
        if (end > this.bytes.length) throw new Error("truncated MIDI data");
        const bytes = this.bytes.subarray(this.offset, end);
        this.offset = end;
        return bytes;
    }

    number(length) {
        let value = 0;
        for (const byte of this.take(length)) value = value * 256 + byte;
        return value;
    }

    delta() {
        let value = 0;
        for (let count = 0; count < 4; count++) {
            const byte = this.number(1);
            value = value * 128 + (byte & 0x7f);
            if (byte < 0x80) return value;
        }
        throw new Error("invalid MIDI variable-length value");
    }
}

function readNotes(track, endTick, chords) {
    const pending = new Map();
    let tick = 0;
    let runningStatus = 0;
    while (!track.done) {
        tick += track.delta();
        const first = track.number(1);
        const status = first >= 0x80 ? first : runningStatus;
        if (status >= 0xf0) {
            runningStatus = 0;
            if (status === 0xff) {
                const type = track.number(1);
                const data = track.take(track.delta());
                if (type === 0x2f) {
                    if (data.length || !track.done) throw new Error("invalid MIDI end of track");
                    if (pending.size) throw new Error("MIDI note is missing its note-off");
                    return;
                }
                if (type === 0x58 && (data[0] !== BEATS_PER_BAR || data[1] !== 2)) {
                    throw new Error("backing MIDI must use 4/4");
                }
            } else if (status === 0xf0 || status === 0xf7) {
                track.take(track.delta());
            } else {
                throw new Error("invalid MIDI status");
            }
            continue;
        }
        if (!status) throw new Error("missing MIDI running status");
        runningStatus = status;
        const message = status >> 4;
        const channel = status & 0x0f;
        const pitch = first < 0x80 ? first : track.number(1);
        const value = message === 0xc || message === 0xd ? 0 : track.number(1);
        if (pitch >= 0x80 || value >= 0x80) throw new Error("invalid MIDI channel data");
        if (channel === DRUM_CHANNEL || (message !== 0x8 && message !== 0x9)) continue;

        const noteId = channel * 128 + pitch;
        const active = pending.get(noteId) ?? [];
        if (message === 0x9 && value > 0) {
            if (tick >= endTick) throw new Error("MIDI note starts outside the backing loop");
            active.push({ tick, velocity: value });
            pending.set(noteId, active);
            continue;
        }
        const note = active.shift();
        if (!note) throw new Error("MIDI note-off has no matching note-on");
        if (!active.length) pending.delete(noteId);
        if (tick <= note.tick || tick > endTick) throw new Error("MIDI note duration exceeds the backing loop or is zero");
        const durationTicks = tick - note.tick;
        const chordId = `${note.tick}:${durationTicks}:${note.velocity}`;
        if (!chords.has(chordId)) {
            chords.set(chordId, { tick: note.tick, durationTicks, velocity: note.velocity / 127, pitches: [] });
        }
        chords.get(chordId).pitches.push(pitch);
    }
    throw new Error("missing MIDI end of track");
}

/** Read the pitched notes of an SMF format 0 or 1 clip with quarter-note timing. */
export function parseBackingMidi(bytes, bars) {
    const file = new MidiReader(bytes);
    if (file.number(4) !== CHUNK_HEADER) throw new Error("not a Standard MIDI File");
    const header = new MidiReader(file.take(file.number(4)));
    const format = header.number(2);
    const trackCount = header.number(2);
    const ppq = header.number(2);
    if (format > 1 || !trackCount || (format === 0 && trackCount !== 1)) {
        throw new Error("backing MIDI must use format 0 or 1");
    }
    if (!ppq || ppq >= 0x8000) throw new Error("backing MIDI must use ticks per quarter note");

    const chords = new Map();
    const endTick = bars * BEATS_PER_BAR * ppq;
    let tracks = 0;
    while (!file.done && tracks < trackCount) {
        const type = file.number(4);
        const data = file.take(file.number(4));
        if (type === CHUNK_TRACK) {
            readNotes(new MidiReader(data), endTick, chords);
            tracks++;
        }
    }
    if (tracks !== trackCount) throw new Error("missing MIDI track");
    if (!chords.size) throw new Error("MIDI has no pitched notes");
    const events = [...chords.values()].sort((left, right) => left.tick - right.tick);
    return { bars, ppq, events };
}
