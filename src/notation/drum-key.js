// Staff positions, not MIDI pitches. Keep all notation renderers on this table.
export const DRUM_KEY = Object.freeze({
    hi_hat_closed: { key: "g/5/x2", position: "Above the staff · X with +", articulation: "brassMuteClosed", voice: "hands" },
    hi_hat_open: { key: "g/5/x2", position: "Above the staff · X with circle", articulation: "brassMuteOpen", voice: "hands" },
    ride: { key: "f/5/x2", position: "Top line · X", voice: "hands" },
    snare: { key: "c/5", position: "Third space · normal head", voice: "hands" },
    kick: { key: "f/4", position: "Bottom space · normal head", voice: "feet" },
    hi_hat_pedal: { key: "d/4/x2", position: "Below the staff · X", voice: "feet" },
    tom_1: { key: "e/5", position: "Top space", voice: "hands" },
    tom_2: { key: "d/5", position: "Fourth line", voice: "hands" },
    tom_3: { key: "b/4", position: "Middle line", voice: "hands" },
    tom_4: { key: "a/4", position: "Second space", voice: "hands" },
    crash_1: { key: "a/5/x2", position: "Above the staff · X", voice: "hands" },
    crash_2: { key: "b/5/x2", position: "Above the staff · X", voice: "hands" },
});
