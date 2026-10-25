import { INSTRUMENTS } from "./instruments.js";
import { emptyMappings, validMidiSettings } from "./midi-settings.js";

/** Repository profiles contain portable note mappings, never browser device IDs. */
export function validateKitProfile(profile) {
    if (!profile || profile.version !== 1 || profile.id !== "mps-850"
        || typeof profile.name !== "string" || !profile.name.trim()
        || !["partial", "verified"].includes(profile.verification)
        || typeof profile.notes !== "string") throw new Error("Invalid MPS-850 profile metadata");
    if (!validMidiSettings({ version: 1, selectedDeviceId: null,
        profiles: [{ deviceId: "validation", name: profile.name, mappings: profile.mappings }] })) {
        throw new Error("Invalid MPS-850 MIDI mappings: check instruments, notes, channels, and duplicates");
    }
    return profile;
}

/** Fill defaults without replacing learned mappings or explicit local removals. */
export function mergeKitMappings(local, defaults, overrides) {
    const merged = emptyMappings();
    const assigned = new Set();
    const copy = instrument => {
        merged[instrument] = (local[instrument] ?? []).map(entry => ({ ...entry }));
        for (const entry of merged[instrument]) assigned.add(`${entry.channel}:${entry.note}`);
    };
    for (const instrument of overrides) copy(instrument);
    for (const instrument of Object.keys(INSTRUMENTS)) {
        if (overrides.includes(instrument)) continue;
        merged[instrument] = (defaults[instrument] ?? []).filter(entry => !assigned.has(`${entry.channel}:${entry.note}`))
            .map(entry => ({ ...entry }));
        for (const entry of merged[instrument]) assigned.add(`${entry.channel}:${entry.note}`);
    }
    return merged;
}

export function exportKitProfile(mappings) {
    return validateKitProfile({
        version: 1, id: "mps-850", name: "Millenium MPS-850",
        verification: "partial", notes: "Exported from MIDI setup. Review every pad and hi-hat action on the physical kit before marking this profile verified.",
        mappings: structuredClone(mappings),
    });
}
