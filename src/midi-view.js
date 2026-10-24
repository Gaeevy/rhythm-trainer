import { INSTRUMENTS } from "./instruments.js";
import { MidiState } from "./midi.js";

/** Render setup state without replacing the practice controls or lane focus. */
export function renderMidi(midi, { onLearn, onRemove }) {
    const element = id => document.getElementById(id);
    const connected = Boolean(midi.input);
    const connecting = midi.state === MidiState.CONNECTING;
    const connectButton = element("midi-connect");
    connectButton.disabled = connecting || midi.state === MidiState.UNSUPPORTED;
    connectButton.textContent = connecting ? "Connecting…"
        : midi.access && midi.state === MidiState.ERROR ? "Reconnect MIDI"
        : midi.access ? "Disconnect MIDI" : "Connect MIDI";
    element("midi-status").textContent = midi.message;
    element("midi-summary").textContent = connected ? midi.input.name || "Connected" : "Keyboard available";
    element("midi-storage-warning").textContent = midi.storageWarning;
    element("midi-storage-warning").hidden = !midi.storageWarning;

    const select = element("midi-device");
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select MIDI device";
    const options = [placeholder];
    for (const input of midi.devices) {
        const option = document.createElement("option");
        option.value = input.id;
        option.textContent = [input.name || "MIDI input", input.manufacturer].filter(Boolean).join(" · ");
        options.push(option);
    }
    if (midi.selectedDeviceId && !midi.devices.some(input => input.id === midi.selectedDeviceId)) {
        const unavailable = document.createElement("option");
        unavailable.value = midi.selectedDeviceId;
        unavailable.textContent = `${midi.profile?.name || "Saved MIDI device"} (not connected)`;
        unavailable.disabled = true;
        options.push(unavailable);
    }
    select.replaceChildren(...options);
    select.value = midi.selectedDeviceId ?? "";
    select.disabled = !midi.access;

    const rows = Object.entries(INSTRUMENTS).map(([instrument, details]) => {
        const row = document.createElement("div");
        row.className = "midi-mapping";
        row.dataset.instrument = instrument;
        const name = document.createElement("span");
        name.className = "midi-instrument";
        name.textContent = details.label;
        const notes = document.createElement("div");
        notes.className = "midi-notes";
        const mappings = midi.profile?.mappings[instrument] ?? [];
        if (!mappings.length) notes.textContent = "Not mapped";
        for (const entry of mappings) {
            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "midi-note";
            remove.textContent = `Note ${entry.note} · Ch ${entry.channel} ×`;
            remove.setAttribute("aria-label", `Remove ${details.label} note ${entry.note}, channel ${entry.channel}`);
            remove.addEventListener("click", () => onRemove(instrument, entry));
            notes.append(remove);
        }
        const learn = document.createElement("button");
        learn.type = "button";
        learn.className = "midi-learn";
        learn.dataset.instrument = instrument;
        learn.disabled = !connected;
        learn.setAttribute("aria-pressed", String(midi.learning === instrument));
        learn.textContent = midi.learning === instrument ? "Cancel learn" : "Learn pad";
        learn.setAttribute("aria-label", `${learn.textContent}: ${details.label}`);
        learn.addEventListener("click", () => onLearn(instrument));
        row.append(name, notes, learn);
        return row;
    });
    element("midi-mappings").replaceChildren(...rows);
    renderMidiActivity(midi);
}

export function renderMidiActivity(midi) {
    const note = midi.lastNote;
    document.getElementById("midi-monitor").textContent = note
        ? `${note.instrument ? INSTRUMENTS[note.instrument].label : "Unmapped"} · Note ${note.note} · Channel ${note.channel} · Velocity ${note.velocity}`
        : "No MIDI hits yet. Strike a pad to check the input.";
}
