import { TICKS_PER_BEAT, TICKS_PER_EIGHTH } from "../music-time.js";
/** Validate notation hints without changing performance notes or clocks. */
export function validateNotation(notation, tracks) {
    const fail = message => { throw new Error(message); };
    if (!notation || typeof notation !== "object" || Array.isArray(notation)) fail("must be an object");
    if (Object.keys(notation).some(key => !["feel", "triplets"].includes(key))) fail("contains an unsupported field");
    if (!["straight", "swing"].includes(notation.feel)) fail("feel must be straight or swing");
    if (notation.triplets !== undefined && !Array.isArray(notation.triplets)) fail("triplets must be an array");
    const groups = [];
    for (const [index, hint] of (notation.triplets ?? []).entries()) {
        const path = `triplets[${index}]`;
        if (!hint || typeof hint !== "object" || Array.isArray(hint)
            || Object.keys(hint).some(key => !["instrument", "tick", "unit"].includes(key))
            || !Object.hasOwn(hint, "instrument") || !Object.hasOwn(hint, "tick")) {
            fail(`${path}: requires instrument, tick, and optional unit (8 or 16)`);
        }
        const track = tracks.find(track => track.instrument === hint.instrument);
        if (!Number.isSafeInteger(hint.tick) || !track?.notes.includes(hint.tick)) fail(`${path}: must reference an existing instrument/note tick`);
        const unit = hint.unit ?? 8;
        if (![8, 16].includes(unit)) fail(`${path}: unit must be 8 or 16`);
        const span = unit === 8 ? TICKS_PER_BEAT : TICKS_PER_EIGHTH;
        const start = Math.floor(hint.tick / span) * span;
        if (groups.some(group => group.instrument === hint.instrument && start < group.end && start + span > group.start)) {
            fail(`${path}: duplicates or overlaps an instrument/triplet group`);
        }
        groups.push({ instrument: hint.instrument, start, end: start + span });
        if (track.notes.some(tick => tick >= start && tick < start + span && (tick - start) % (span / 3) !== 0)) {
            fail(`${path}: this group cannot be written as three ${unit === 8 ? "eighth" : "sixteenth"}-note triplets`);
        }
    }
    return notation;
}
