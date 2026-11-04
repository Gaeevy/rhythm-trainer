/** Validate notation hints without changing performance notes or clocks. */
export function validateNotation(notation, tracks) {
    const fail = message => { throw new Error(message); };
    if (!notation || typeof notation !== "object" || Array.isArray(notation)) fail("must be an object");
    if (Object.keys(notation).some(key => !["feel", "triplets"].includes(key))) fail("contains an unsupported field");
    if (!["straight", "swing"].includes(notation.feel)) fail("feel must be straight or swing");
    if (notation.triplets !== undefined && !Array.isArray(notation.triplets)) fail("triplets must be an array");
    const groups = new Set();
    for (const [index, hint] of (notation.triplets ?? []).entries()) {
        const path = `triplets[${index}]`;
        if (!hint || typeof hint !== "object" || Array.isArray(hint)
            || Object.keys(hint).length !== 2 || !Object.hasOwn(hint, "instrument") || !Object.hasOwn(hint, "tick")) {
            fail(`${path}: requires only instrument and tick`);
        }
        const track = tracks.find(track => track.instrument === hint.instrument);
        if (!Number.isSafeInteger(hint.tick) || !track?.notes.includes(hint.tick)) fail(`${path}: must reference an existing instrument/note tick`);
        const beat = Math.floor(hint.tick / 96);
        const key = `${hint.instrument}:${beat}`;
        if (groups.has(key)) fail(`${path}: duplicates an instrument/beat group`);
        groups.add(key);
        if (track.notes.some(tick => Math.floor(tick / 96) === beat && tick % 32 !== 0)) {
            fail(`${path}: this beat cannot be written as three eighth-note triplets`);
        }
    }
    return notation;
}
