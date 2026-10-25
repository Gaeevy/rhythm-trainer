export const INSTRUMENTS = Object.freeze({
    kick: { label: "Kick", color: "#e8b35a", symbol: "K" },
    snare: { label: "Snare", color: "#7fb9e8", symbol: "S" },
    hi_hat: { label: "Hi-hat (any)", color: "#b6c980", symbol: "H" },
    hi_hat_closed: { label: "Hi-hat closed", color: "#b6c980", symbol: "HC", learnHint: "Hold the pedal closed before clicking Learn pad, then strike the hi-hat." },
    hi_hat_open: { label: "Hi-hat open", color: "#d3db96", symbol: "HO", learnHint: "Release the pedal before clicking Learn pad, then strike the hi-hat." },
    hi_hat_pedal: { label: "Hi-hat pedal", color: "#8fb69b", symbol: "HP", learnHint: "Close the pedal without striking the pad. Learn the chick, not a splash." },
    tom_1: { label: "Tom 1", color: "#e4b18a", symbol: "T1" },
    tom_2: { label: "Tom 2", color: "#d49c81", symbol: "T2" },
    tom_3: { label: "Tom 3", color: "#c38979", symbol: "T3" },
    tom_4: { label: "Tom 4", color: "#b17872", symbol: "T4" },
    crash_1: { label: "Crash 1", color: "#e7cf8d", symbol: "C1" },
    crash_2: { label: "Crash 2", color: "#cfb778", symbol: "C2" },
    ride: { label: "Ride", color: "#c4a0e5", symbol: "R" },
});

export const HI_HAT_ACTIONS = Object.freeze(["hi_hat_closed", "hi_hat_open", "hi_hat_pedal"]);

/** Old generic hi-hat lessons accept any action; explicit action tracks stay strict. */
export function lessonInstrument(instrument, tracks) {
    if (tracks.has(instrument)) return instrument;
    return HI_HAT_ACTIONS.includes(instrument) && tracks.has("hi_hat") ? "hi_hat" : null;
}
