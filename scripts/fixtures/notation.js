// Hand-authored written rhythms for milestone 1 only. This is not a lesson converter.
// Pitch letters here identify staff positions, not the drum module's MIDI notes.
export const DRUM_KEY = Object.freeze([
    { instrument: "hi_hat_closed", label: "Hi-hat closed", key: "g/5/x2", position: "Above the staff · X" },
    { instrument: "ride", label: "Ride", key: "f/5/x2", position: "Top line · X" },
    { instrument: "snare", label: "Snare", key: "c/5", position: "Third space · normal head" },
    { instrument: "kick", label: "Kick", key: "f/4", position: "Bottom space · normal head" },
    { instrument: "hi_hat_pedal", label: "Hi-hat pedal", key: "d/4/x2", position: "Below the staff · X" },
]);

export const NOTATION_PREVIEWS = [
    {
        id: "straight", title: "Straight groove", feel: "Straight eighth notes",
        description: "Hi-hat eighth notes, snare on 2 and 4, kick on 1 and 3.",
        voices: [
            { stem: 1, notes: [
                { keys: ["g/5/x2"], duration: "8" }, { keys: ["g/5/x2"], duration: "8" },
                { keys: ["c/5", "g/5/x2"], duration: "8" }, { keys: ["g/5/x2"], duration: "8" },
                { keys: ["g/5/x2"], duration: "8" }, { keys: ["g/5/x2"], duration: "8" },
                { keys: ["c/5", "g/5/x2"], duration: "8" }, { keys: ["g/5/x2"], duration: "8" },
            ], beams: [[0, 1], [2, 3], [4, 5], [6, 7]] },
            { stem: -1, notes: [
                { keys: ["f/4"], duration: "4" }, { keys: ["d/4"], duration: "4r" },
                { keys: ["f/4"], duration: "4" }, { keys: ["d/4"], duration: "4r" },
            ], beams: [] },
        ],
    },
    {
        id: "swing", title: "Swing 01", feel: "Swing · eighth notes played long–short (2:1)",
        description: "Ride pattern, kick quarters, pedal on 2 and 4; snare on 1 and the swung “and” of 2.",
        voices: [
            { stem: 1, notes: [
                { keys: ["c/5", "f/5/x2"], duration: "4" },
                { keys: ["f/5/x2"], duration: "8" }, { keys: ["c/5", "f/5/x2"], duration: "8" },
                { keys: ["f/5/x2"], duration: "4" },
                { keys: ["f/5/x2"], duration: "8" }, { keys: ["f/5/x2"], duration: "8" },
            ], beams: [[1, 2], [4, 5]] },
            { stem: -1, notes: [
                { keys: ["f/4"], duration: "4" }, { keys: ["d/4/x2", "f/4"], duration: "4" },
                { keys: ["f/4"], duration: "4" }, { keys: ["d/4/x2", "f/4"], duration: "4" },
            ], beams: [] },
        ],
    },
];
