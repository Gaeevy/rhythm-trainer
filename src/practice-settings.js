import { DEFAULT_KEY_BINDINGS, KEY_CODES } from "./input.js";
import { INSTRUMENTS } from "./instruments.js";
import { BUNDLED_LESSONS } from "./lesson-catalog.js";

export const PRACTICE_SETTINGS_KEY = "rhythm-trainer.practice.v1";

export function defaultPracticeSettings() {
    return {
        version: 1, countIn: true, toleranceMs: 30, latencyOffsetMs: 0,
        guideVolume: 55, guideMuted: false, metronomeVolume: 35, metronomeMuted: false,
        keyBindings: { ...DEFAULT_KEY_BINDINGS }, tempos: {}, disabledInstruments: [],
        lastBundledLessonId: BUNDLED_LESSONS[0].id,
    };
}

function inRange(value, min, max) {
    return Number.isFinite(value) && value >= min && value <= max;
}

export function validPracticeSettings(settings) {
    if (!settings || settings.version !== 1 || typeof settings.countIn !== "boolean"
        || typeof settings.guideMuted !== "boolean" || typeof settings.metronomeMuted !== "boolean"
        || !inRange(settings.toleranceMs, 0, 150) || !inRange(settings.latencyOffsetMs, -500, 500)
        || !inRange(settings.guideVolume, 0, 100) || !inRange(settings.metronomeVolume, 0, 100)
        || !BUNDLED_LESSONS.some(lesson => lesson.id === settings.lastBundledLessonId)) return false;
    if (!Array.isArray(settings.disabledInstruments)
        || settings.disabledInstruments.some(instrument => !Object.hasOwn(INSTRUMENTS, instrument))
        || new Set(settings.disabledInstruments).size !== settings.disabledInstruments.length) return false;
    if (!settings.keyBindings || Array.isArray(settings.keyBindings)) return false;
    const entries = Object.entries(settings.keyBindings);
    if (entries.length !== Object.keys(INSTRUMENTS).length
        || entries.some(([code, instrument]) => !KEY_CODES.includes(code) || !Object.hasOwn(INSTRUMENTS, instrument))
        || new Set(entries.map(([, instrument]) => instrument)).size !== entries.length) return false;
    if (!settings.tempos || typeof settings.tempos !== "object" || Array.isArray(settings.tempos)) return false;
    return Object.values(settings.tempos).every(bpm => inRange(bpm, 20, 300));
}

export function loadPracticeSettings(storage) {
    try {
        if (!storage) throw new Error("Storage unavailable");
        const text = storage.getItem(PRACTICE_SETTINGS_KEY);
        if (text === null) return { settings: defaultPracticeSettings(), warning: "" };
        const settings = JSON.parse(text);
        // Keep existing controls and MIDI profiles when reserving Space for transport.
        if (settings?.version === 1) {
            if (settings.disabledInstruments === undefined) settings.disabledInstruments = [];
            if (settings.keyBindings && Object.hasOwn(settings.keyBindings, "Space")) {
                const replacement = ["KeyD", ...KEY_CODES].find(code => !Object.hasOwn(settings.keyBindings, code));
                settings.keyBindings[replacement] = settings.keyBindings.Space;
                delete settings.keyBindings.Space;
            }
        }
        if (!validPracticeSettings(settings)) throw new SyntaxError("Invalid practice settings");
        return { settings, warning: "" };
    } catch (error) {
        return {
            settings: defaultPracticeSettings(),
            warning: error instanceof SyntaxError
                ? "Saved practice settings were invalid. Defaults restored; MIDI mappings are unchanged."
                : "Local storage is unavailable. Practice settings will last for this page only.",
        };
    }
}

export function savePracticeSettings(storage, settings) {
    try {
        if (!storage) throw new Error("Storage unavailable");
        storage.setItem(PRACTICE_SETTINGS_KEY, JSON.stringify(settings));
        return "";
    } catch {
        return "Could not save practice settings. Changes will last for this page only.";
    }
}
