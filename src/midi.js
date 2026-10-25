import { loadKitProfile } from "./kit-profile.js";

export const MidiState = Object.freeze({
    IDLE: "idle", CONNECTING: "connecting", CONNECTED: "connected",
    NO_DEVICES: "no_devices", UNSUPPORTED: "unsupported", ERROR: "error",
});

/** Only nonzero-velocity Note On is a hit; pedal controls/aftertouch are not hits. */
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

function releaseInput(input) {
    input.onmidimessage = null;
    try { Promise.resolve(input.close?.()).catch(() => {}); } catch { /* Already closed. */ }
}

/** Treat every connected input as an MPS-850, using the repository config only. */
export class MidiInput {
    constructor({ requestAccess, loadProfile = loadKitProfile, onHit = () => {}, onChange = () => {}, onActivity = () => {}, onDisconnect = () => {} }) {
        Object.assign(this, { requestAccess, loadProfile, onHit, onChange, onActivity, onDisconnect });
        this.access = null;
        this.profile = null;
        this.mappings = new Map();
        this.inputs = new Map();
        this.failedInputs = new Map();
        this.lastNote = null;
        this.request = 0;
        this.state = requestAccess ? MidiState.IDLE : MidiState.UNSUPPORTED;
        this.message = requestAccess ? "Connecting to MPS-850…" : "Web MIDI is unavailable. Use Chrome on localhost or HTTPS.";
    }

    async connect() {
        if (!this.requestAccess || this.state === MidiState.CONNECTING) return;
        if (this.access) {
            this.failedInputs.clear();
            this.refreshInputs();
            return;
        }
        const request = ++this.request;
        this.state = MidiState.CONNECTING;
        this.message = "Connecting to MPS-850…";
        this.onChange();
        try {
            this.profile ??= await this.loadProfile();
            if (request !== this.request) return;
            this.mappings = new Map(Object.entries(this.profile.mappings).flatMap(([instrument, notes]) =>
                notes.map(({ note, channel }) => [`${channel}:${note}`, instrument])));
            const access = await this.requestAccess({ sysex: false });
            if (request !== this.request) return;
            this.access = access;
            access.onstatechange = () => this.refreshInputs();
            this.refreshInputs();
        } catch (error) {
            if (request !== this.request) return;
            this.state = MidiState.ERROR;
            this.message = ["NotAllowedError", "SecurityError"].includes(error.name)
                ? "Allow MIDI access in Chrome, then retry. Keyboard remains available."
                : `MIDI unavailable: ${error.message || "connection failed"}. Retry to reconnect.`;
            this.onChange();
        }
    }

    refreshInputs() {
        if (!this.access) return;
        const connected = new Map(Array.from(this.access.inputs.values())
            .filter(input => input.state === "connected").map(input => [input.id, input]));
        for (const [id, input] of this.inputs) {
            if (connected.get(id) === input) continue;
            this.inputs.delete(id);
            releaseInput(input);
            this.onDisconnect();
        }
        for (const id of this.failedInputs.keys()) if (!connected.has(id)) this.failedInputs.delete(id);
        for (const [id, input] of connected) {
            if (this.inputs.has(id) || this.failedInputs.has(id)) continue;
            this.inputs.set(id, input);
            input.onmidimessage = message => {
                if (this.inputs.get(id) === input && input.state === "connected") this.handleMessage(message);
            };
            Promise.resolve().then(() => this.inputs.get(id) === input ? input.open?.() : undefined).catch(error => {
                if (this.inputs.get(id) !== input) return;
                this.inputs.delete(id);
                this.failedInputs.set(id, error.message || "Port is busy");
                releaseInput(input);
                this.onDisconnect();
                this.updateStatus();
            });
        }
        this.updateStatus();
    }

    updateStatus() {
        this.state = this.failedInputs.size ? MidiState.ERROR
            : this.inputs.size ? MidiState.CONNECTED : MidiState.NO_DEVICES;
        this.message = this.failedInputs.size
            ? `Could not open MIDI: ${[...this.failedInputs.values()].join("; ")}. Close other MIDI apps, then retry.`
            : this.inputs.size ? `MPS-850 connected: ${[...this.inputs.values()].map(input => input.name || "MIDI input").join(", ")}.`
            : "No MIDI inputs found. Connect the MPS-850 USB MIDI port; it will connect automatically.";
        this.onChange();
    }

    handleMessage(message) {
        const note = parseNoteOn(message);
        if (!note || !this.inputs.size) return;
        const instrument = this.mappings.get(`${note.channel}:${note.note}`) ?? null;
        this.lastNote = { ...note, instrument };
        this.onActivity();
        if (instrument) this.onHit({ instrument, originalTimeStamp: note.originalTimeStamp, velocity: note.velocity, source: "midi" });
    }

    disconnect() {
        this.request++;
        if (this.access) this.access.onstatechange = null;
        const wasConnected = this.inputs.size > 0;
        for (const input of this.inputs.values()) releaseInput(input);
        this.inputs.clear();
        this.failedInputs.clear();
        this.access = null;
        this.state = this.requestAccess ? MidiState.IDLE : MidiState.UNSUPPORTED;
        if (wasConnected) this.onDisconnect();
    }
}
