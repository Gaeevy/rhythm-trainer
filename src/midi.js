import { INSTRUMENTS } from "./instruments.js";
import { emptyMappings, loadMidiSettings, saveMidiSettings } from "./midi-settings.js";

export const MidiState = Object.freeze({
    IDLE: "idle", CONNECTING: "connecting", AVAILABLE: "available", CONNECTED: "connected",
    DISCONNECTED: "disconnected", NO_DEVICES: "no_devices", UNSUPPORTED: "unsupported", ERROR: "error",
});

/** Web MIDI sends one message per event. Only nonzero-velocity Note On is a hit. */
export function parseNoteOn(message) {
    const data = message?.data;
    if (!(Array.isArray(data) || ArrayBuffer.isView(data))
        || data.length !== 3 || !Number.isFinite(message.timeStamp)) return null;
    const [status, note, velocity] = data;
    if (!Number.isInteger(status) || status < 0x90 || status > 0x9f
        || !Number.isInteger(note) || note < 0 || note > 127
        || !Number.isInteger(velocity) || velocity < 1 || velocity > 127) return null;
    return { note, channel: (status & 0x0f) + 1, velocity, originalTimeStamp: message.timeStamp };
}

function sameNote(left, right) {
    return left.note === right.note && left.channel === right.channel;
}

function releaseInput(input) {
    input.onmidimessage = null;
    // A detached handler alone does not release an exclusively opened port.
    try { Promise.resolve(input.close?.()).catch(() => {}); } catch { /* The port may already be gone. */ }
}

/** Own MIDI input selection and learn mode, independent of audio and scoring. */
export class MidiInput {
    constructor({ requestAccess, storage, onHit = () => {}, onChange = () => {}, onActivity = () => {}, onDisconnect = () => {} }) {
        const loaded = loadMidiSettings(storage);
        this.settings = loaded.settings;
        this.storageWarning = loaded.warning;
        this.storage = storage;
        this.requestAccess = requestAccess;
        this.onHit = onHit;
        this.onChange = onChange;
        this.onActivity = onActivity;
        this.onDisconnect = onDisconnect;
        this.access = null;
        this.input = null;
        this.failedInput = null;
        this.learning = null;
        this.lastNote = null;
        this.request = 0;
        this.state = requestAccess ? MidiState.IDLE : MidiState.UNSUPPORTED;
        this.message = requestAccess ? "Connect MIDI, then select your drum kit. Keyboard stays available."
            : "Web MIDI is unavailable. Use Chrome on localhost or HTTPS. Keyboard stays available.";
    }

    get devices() {
        return this.access ? Array.from(this.access.inputs.values()).filter(input => input.state === "connected") : [];
    }

    get selectedDeviceId() {
        return this.settings.selectedDeviceId;
    }

    get profile() {
        return this.settings.profiles.find(profile => profile.deviceId === this.selectedDeviceId) ?? null;
    }

    persist() {
        this.storageWarning = saveMidiSettings(this.storage, this.settings);
    }

    async connect() {
        if (!this.requestAccess || this.state === MidiState.CONNECTING || this.access) return;
        const request = ++this.request;
        this.state = MidiState.CONNECTING;
        this.message = "Waiting for MIDI permission…";
        this.onChange();
        try {
            const access = await this.requestAccess({ sysex: false });
            if (request !== this.request) return;
            this.access = access;
            access.onstatechange = () => this.refreshDevices();
            this.refreshDevices();
        } catch (error) {
            if (request !== this.request) return;
            this.state = MidiState.ERROR;
            this.message = ["NotAllowedError", "SecurityError"].includes(error.name)
                ? "MIDI permission was denied. Allow MIDI in Chrome’s site settings, then try Connect MIDI again."
                : `Could not connect MIDI: ${error.message || "unknown error"}. Try Connect MIDI again.`;
            this.onChange();
        }
    }

    refreshDevices() {
        if (!this.access) return;
        if (this.failedInput?.state === "disconnected") this.failedInput = null;
        const next = this.devices.find(input => input.id === this.selectedDeviceId) ?? null;
        if (next && next === this.failedInput) return;
        if (next !== this.input) {
            const previous = this.input;
            this.input = next;
            if (previous) releaseInput(previous);
            this.learning = null;
            if (previous && !next) this.onDisconnect();
            if (next) {
                // Setting onmidimessage implicitly opens the port in Web MIDI.
                next.onmidimessage = message => {
                    if (this.input === next && next.state === "connected") this.handleMessage(message);
                };
                if (typeof next.open === "function") {
                    Promise.resolve().then(() => this.input === next ? next.open() : undefined).catch(error => {
                        if (this.input !== next) return;
                        this.failedInput = next;
                        this.input = null;
                        releaseInput(next);
                        this.learning = null;
                        this.state = MidiState.ERROR;
                        this.message = `Could not open ${next.name || "MIDI input"}: ${error.message || "device unavailable"}. Close other MIDI apps, then reconnect MIDI.`;
                        this.onDisconnect();
                        this.onChange();
                    });
                }
            }
        }
        if (next) {
            this.state = MidiState.CONNECTED;
            this.message = this.learning
                ? `Strike the ${INSTRUMENTS[this.learning].label} pad or pedal once. The hit will be learned, not scored.`
                : `Listening to ${next.name || "MIDI input"}. Learn each pad or pedal below.`;
        } else if (this.selectedDeviceId) {
            this.state = MidiState.DISCONNECTED;
            this.message = `${this.profile?.name || "Saved MIDI device"} is disconnected. Reconnect it or select another input.`;
        } else {
            this.state = this.devices.length ? MidiState.AVAILABLE : MidiState.NO_DEVICES;
            this.message = this.devices.length ? "Select a MIDI input. No device is selected automatically."
                : "No MIDI inputs found. Connect the kit’s USB MIDI port; it will appear here.";
        }
        this.onChange();
    }

    selectDevice(deviceId) {
        if (deviceId && !this.devices.some(input => input.id === deviceId)) {
            throw new RangeError("Select a connected MIDI input");
        }
        this.learning = null;
        this.failedInput = null;
        this.lastNote = null;
        this.settings.selectedDeviceId = deviceId || null;
        if (deviceId && !this.profile) {
            const input = this.devices.find(input => input.id === deviceId);
            this.settings.profiles.push({ deviceId, name: input.name || "MIDI input", mappings: emptyMappings() });
        }
        this.persist();
        this.refreshDevices();
        this.onActivity();
    }

    startLearn(instrument) {
        if (!Object.hasOwn(INSTRUMENTS, instrument)) throw new RangeError("Unknown instrument");
        if (!this.input) return;
        if (this.learning === instrument) return this.cancelLearn();
        this.learning = instrument;
        this.message = `Strike the ${INSTRUMENTS[instrument].label} pad or pedal once. The hit will be learned, not scored.`;
        this.onChange();
    }

    cancelLearn() {
        if (!this.learning) return;
        this.learning = null;
        this.message = "MIDI learn cancelled. Your saved mappings are unchanged.";
        this.onChange();
    }

    removeMapping(instrument, entry) {
        if (!this.profile || !Object.hasOwn(INSTRUMENTS, instrument)) return;
        this.profile.mappings[instrument] = this.profile.mappings[instrument].filter(note => !sameNote(note, entry));
        this.persist();
        this.message = `Removed note ${entry.note}, channel ${entry.channel} from ${INSTRUMENTS[instrument].label}.`;
        this.onChange();
    }

    handleMessage(message) {
        const note = parseNoteOn(message);
        if (!note || !this.input || !this.profile) return;
        if (this.learning) {
            const instrument = this.learning;
            let reassignedFrom = null;
            for (const [other, notes] of Object.entries(this.profile.mappings)) {
                if (other !== instrument && notes.some(entry => sameNote(entry, note))) reassignedFrom = other;
                this.profile.mappings[other] = notes.filter(entry => !sameNote(entry, note));
            }
            this.profile.mappings[instrument].push({ note: note.note, channel: note.channel });
            this.learning = null;
            this.lastNote = { ...note, instrument };
            this.persist();
            this.message = `Learned ${INSTRUMENTS[instrument].label}: note ${note.note}, channel ${note.channel}.`
                + (reassignedFrom ? ` Moved from ${INSTRUMENTS[reassignedFrom].label}.` : " Use Learn pad again to add another zone.");
            this.onChange();
            this.onActivity();
            return;
        }
        const instrument = Object.keys(INSTRUMENTS).find(instrument =>
            this.profile.mappings[instrument].some(entry => sameNote(entry, note)));
        this.lastNote = { ...note, instrument: instrument ?? null };
        this.onActivity();
        if (instrument) this.onHit({ instrument, originalTimeStamp: note.originalTimeStamp, velocity: note.velocity, source: "midi" });
    }

    disconnect() {
        this.request++;
        const previous = this.input;
        if (this.access) this.access.onstatechange = null;
        const wasListening = Boolean(this.input);
        this.input = null;
        this.failedInput = null;
        this.access = null;
        if (previous) releaseInput(previous);
        this.learning = null;
        this.state = this.requestAccess ? MidiState.IDLE : MidiState.UNSUPPORTED;
        this.message = "MIDI disconnected. Keyboard stays available. Saved mappings are kept.";
        if (wasListening) this.onDisconnect();
        this.onChange();
    }
}
