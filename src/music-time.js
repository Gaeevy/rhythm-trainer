export const TICKS_PER_BEAT = 96;
export const BEATS_PER_BAR = 4;
export const TICKS_PER_BAR = TICKS_PER_BEAT * BEATS_PER_BAR;
export const TICKS_PER_EIGHTH = TICKS_PER_BEAT / 2;
export const TICKS_PER_SIXTEENTH = TICKS_PER_BEAT / 4;
export const TICKS_PER_THIRTY_SECOND = TICKS_PER_BEAT / 8;
export const TICKS_PER_EIGHTH_TRIPLET = TICKS_PER_BEAT / 3;
export const SWING_EIGHTH_TICK = TICKS_PER_BEAT * 2 / 3;

/** Convert a nonnegative musical position to seconds at a quarter-note BPM. */
export function ticksToSeconds(ticks, bpm) {
    if (!Number.isSafeInteger(ticks) || ticks < 0) {
        throw new RangeError("ticks must be a nonnegative safe integer");
    }
    if (!Number.isFinite(bpm) || bpm <= 0) {
        throw new RangeError("bpm must be a finite positive number");
    }
    return (ticks / TICKS_PER_BEAT) * (60 / bpm);
}
