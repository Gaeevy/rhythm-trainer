import { INSTRUMENTS } from "./instruments.js";
import { MidiState } from "./midi.js";

export function renderMidi(midi) {
    const button = document.getElementById("midi-connect");
    button.hidden = midi.state === MidiState.CONNECTED || midi.state === MidiState.NO_DEVICES;
    button.disabled = midi.state === MidiState.CONNECTING || midi.state === MidiState.UNSUPPORTED;
    button.textContent = midi.state === MidiState.CONNECTING ? "Connecting…" : "Enable / retry MIDI";
    document.getElementById("midi-status").textContent = midi.message;
    document.getElementById("midi-summary").textContent = midi.state === MidiState.ERROR ? "MIDI error"
        : midi.inputs.size ? "MPS-850 connected" : "Keyboard available";
    renderMidiActivity(midi);
}

export function renderMidiActivity(midi) {
    const note = midi.lastNote;
    document.getElementById("midi-monitor").textContent = note
        ? `${note.instrument ? INSTRUMENTS[note.instrument].label : "Unmapped"} · Note ${note.note} · Channel ${note.channel} · Velocity ${note.velocity}`
        : "No MIDI hits yet.";
}
