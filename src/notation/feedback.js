import { TICKS_PER_BEAT, TICKS_PER_BAR } from "../music-time.js";
import { FEEDBACK, feedbackText } from "../feedback.js";
import { INSTRUMENTS } from "../instruments.js";

// Same feedback categories/hues as Lanes, darker for legibility on score paper.
export const NOTATION_COLORS = Object.freeze({
    waiting: "#242820", disabled: "#a4a99f", on_time: "#367527",
    early: "#146982", late: "#8c5a08", missed: "#a53735", extra: "#75508b",
});

// Visual magnification only: never feed these pixels back into clocks or assessment.
const NOTEHEAD_PIXELS_PER_MS = 0.175;
const MAX_NOTEHEAD_SHIFT_PX = 9;

/** On-time/unplayed notes stay attached; early/late heads show their signed error. */
export function noteheadShift(appearance, availableTravel = MAX_NOTEHEAD_SHIFT_PX) {
    if (!["early", "late"].includes(appearance.status) || !Number.isFinite(appearance.errorMs)) return 0;
    const limit = Math.max(0, Math.min(MAX_NOTEHEAD_SHIFT_PX, availableTravel));
    return Math.max(-limit, Math.min(limit, appearance.errorMs * NOTEHEAD_PIXELS_PER_MS));
}

export function notationFeedbackText(result) {
    return `${INSTRUMENTS[result.instrument].label} · ${feedbackText(result, 1)}`;
}

/** Project the existing assessment result; never match, round, or record a hit. */
export function noteAppearance(assessment, ref, iteration, disabled = []) {
    const label = INSTRUMENTS[ref.instrument].label;
    if (disabled.includes(ref.instrument)) return { status: "disabled", color: NOTATION_COLORS.disabled, text: `${label} · Disabled`, errorMs: null };
    const result = assessment?.resultFor(ref.instrument, iteration, ref.noteIndex);
    if (!result) return { status: "waiting", color: NOTATION_COLORS.waiting, text: `${label} · Waiting`, errorMs: null };
    return { status: result.status, color: NOTATION_COLORS[result.status], text: notationFeedbackText(result), errorMs: result.errorMs };
}

/** Position an unmatched hit precisely; it is an overlay, never a written note. */
export function extraPosition(result, assessment, bars) {
    if (result.status !== "extra" || !assessment) return null;
    const total = (result.correctedTime - assessment.origin) / assessment.secondsPerBeat * TICKS_PER_BEAT;
    if (!Number.isFinite(total) || total < 0) return null;
    const bar = Math.floor(total / TICKS_PER_BAR);
    return { iteration: Math.floor(bar / bars), barIndex: bar % bars, tick: total - bar * TICKS_PER_BAR };
}

export function feedbackColor(status) {
    return FEEDBACK[status].color;
}
