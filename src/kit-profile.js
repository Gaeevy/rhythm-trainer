import { INSTRUMENTS } from "./instruments.js";

/** Validate the repository's fixed MPS-850 mappings before listening to MIDI. */
export function validateKitProfile(profile) {
    if (!profile || profile.version !== 1 || profile.id !== "mps-850"
        || profile.verification !== "verified" || typeof profile.name !== "string" || !profile.name.trim()
        || !profile.mappings || typeof profile.mappings !== "object"
        || Object.keys(profile.mappings).length !== Object.keys(INSTRUMENTS).length
        || Object.keys(profile.mappings).some(instrument => !Object.hasOwn(INSTRUMENTS, instrument))) {
        throw new Error("Invalid MPS-850 profile");
    }
    const assigned = new Set();
    for (const instrument of Object.keys(INSTRUMENTS)) {
        const notes = profile.mappings[instrument];
        if (!Array.isArray(notes) || notes.length === 0) throw new Error(`Missing MPS-850 mapping: ${instrument}`);
        for (const entry of notes) {
            if (!entry || !Number.isInteger(entry.note) || entry.note < 0 || entry.note > 127
                || !Number.isInteger(entry.channel) || entry.channel < 1 || entry.channel > 16) {
                throw new Error(`Invalid MPS-850 note/channel: ${instrument}`);
            }
            const key = `${entry.channel}:${entry.note}`;
            if (assigned.has(key)) throw new Error(`Duplicate MPS-850 mapping: ${key}`);
            assigned.add(key);
        }
    }
    return profile;
}

export async function loadKitProfile(fetcher = fetch) {
    const response = await fetcher(new URL("../config/drumkits/mps-850.json", import.meta.url));
    if (!response.ok) throw new Error(`Could not load MPS-850 config (HTTP ${response.status})`);
    return validateKitProfile(await response.json());
}
