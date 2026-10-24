import { INSTRUMENTS } from "./instruments.js";

export const MIDI_SETTINGS_KEY = "rhythm-trainer.midi.v1";

export function emptyMappings() {
    return Object.fromEntries(Object.keys(INSTRUMENTS).map(instrument => [instrument, []]));
}

function emptySettings() {
    return { version: 1, selectedDeviceId: null, profiles: [] };
}

/** Reject corrupt settings instead of accidentally assigning hits to wrong lanes. */
export function validMidiSettings(settings) {
    if (!settings || settings.version !== 1 || !Array.isArray(settings.profiles)) return false;
    if (settings.selectedDeviceId !== null && typeof settings.selectedDeviceId !== "string") return false;
    const deviceIds = new Set();
    for (const profile of settings.profiles) {
        if (!profile || typeof profile.deviceId !== "string" || !profile.deviceId
            || typeof profile.name !== "string" || !profile.mappings || deviceIds.has(profile.deviceId)) return false;
        deviceIds.add(profile.deviceId);
        if (Object.keys(profile.mappings).some(instrument => !Object.hasOwn(INSTRUMENTS, instrument))) return false;
        const assigned = new Set();
        for (const instrument of Object.keys(INSTRUMENTS)) {
            const notes = profile.mappings[instrument];
            if (!Array.isArray(notes)) return false;
            for (const entry of notes) {
                if (!entry || !Number.isInteger(entry.note) || entry.note < 0 || entry.note > 127
                    || !Number.isInteger(entry.channel) || entry.channel < 1 || entry.channel > 16) return false;
                const key = `${entry.channel}:${entry.note}`;
                if (assigned.has(key)) return false;
                assigned.add(key);
            }
        }
    }
    return settings.selectedDeviceId === null || deviceIds.has(settings.selectedDeviceId);
}

export function loadMidiSettings(storage) {
    try {
        if (!storage) throw new Error("Storage unavailable");
        const text = storage.getItem(MIDI_SETTINGS_KEY);
        if (text === null) return { settings: emptySettings(), warning: "" };
        const settings = JSON.parse(text);
        if (!validMidiSettings(settings)) throw new SyntaxError("Invalid MIDI settings");
        return { settings, warning: "" };
    } catch (error) {
        return {
            settings: emptySettings(),
            warning: error instanceof SyntaxError
                ? "Saved MIDI settings were invalid. Learn your mappings again."
                : "Local storage is unavailable. MIDI mappings will last for this page only.",
        };
    }
}

export function saveMidiSettings(storage, settings) {
    try {
        if (!storage) throw new Error("Storage unavailable");
        storage.setItem(MIDI_SETTINGS_KEY, JSON.stringify(settings));
        return "";
    } catch {
        return "Could not save MIDI settings. Current mappings will last for this page only.";
    }
}
