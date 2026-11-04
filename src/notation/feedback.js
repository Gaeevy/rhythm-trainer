import { FEEDBACK, feedbackText } from "../feedback.js";
import { INSTRUMENTS } from "../instruments.js";

// Same feedback categories/hues as Lanes, darker for legibility on score paper.
export const NOTATION_COLORS = Object.freeze({
    waiting: "#242820", disabled: "#a4a99f", on_time: "#367527",
    early: "#146982", late: "#8c5a08", missed: "#a53735", extra: "#75508b",
});

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
    const total = (result.correctedTime - assessment.origin) / assessment.secondsPerBeat * 96;
    if (!Number.isFinite(total) || total < 0) return null;
    const bar = Math.floor(total / 384);
    return { iteration: Math.floor(bar / bars), barIndex: bar % bars, tick: total - bar * 384 };
}

export function feedbackColor(status) {
    return FEEDBACK[status].color;
}
