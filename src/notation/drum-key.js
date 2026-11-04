// Staff positions, not MIDI pitches. Keep all notation renderers on this table.
export const DRUM_KEY = Object.freeze({
    hi_hat_closed: { label: "Hi-hat closed", key: "g/5/x2", position: "Above the staff · X", voice: "hands" },
    hi_hat_open: { label: "Hi-hat open", key: "g/5/x2", position: "Above the staff · X (open symbol later)", voice: "hands" },
    ride: { label: "Ride", key: "f/5/x2", position: "Top line · X", voice: "hands" },
    snare: { label: "Snare", key: "c/5", position: "Third space · normal head", voice: "hands" },
    kick: { label: "Kick", key: "f/4", position: "Bottom space · normal head", voice: "feet" },
    hi_hat_pedal: { label: "Hi-hat pedal", key: "d/4/x2", position: "Below the staff · X", voice: "feet" },
    tom_1: { label: "Tom 1", key: "e/5", position: "Top space", voice: "hands" },
    tom_2: { label: "Tom 2", key: "d/5", position: "Fourth line", voice: "hands" },
    tom_3: { label: "Tom 3", key: "b/4", position: "Middle line", voice: "hands" },
    tom_4: { label: "Tom 4", key: "a/4", position: "Second space", voice: "hands" },
    crash_1: { label: "Crash 1", key: "a/5/x2", position: "Above the staff · X", voice: "hands" },
    crash_2: { label: "Crash 2", key: "b/5/x2", position: "Above the staff · X", voice: "hands" },
});
