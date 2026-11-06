import { TimingStatus } from "./assessment.js";
import { BEATS_PER_BAR, TICKS_PER_BAR, TICKS_PER_BEAT } from "./music-time.js";

// Scoring calibration, not matching windows or user settings. Quality stays 0–1;
// only the returned scores use 0–100. No rounding before presentation.
export const TIMING_WIDTH_MS = 50;
export const CONSISTENCY_WIDTH_MS = 25;
export const HALF_LIFE_BARS = 8;
export const TREND_BARS = 8;
export const TREND_POINTS = 3;
const CONSISTENCY_WEIGHT = 0.3;

/** Conservative lesson-wide delay for notes whose late windows cross a bar end. */
export function barClosingDelay(assessment) {
    const barSeconds = assessment.secondsPerBeat * BEATS_PER_BAR;
    return Math.max(0, ...[...assessment.tracks.values()].flatMap(track => track.notes.map(note =>
        (note.tick % TICKS_PER_BAR) / TICKS_PER_BEAT * assessment.secondsPerBeat
            + note.lateWindow - barSeconds)));
}

/** elapsedSeconds is frozen on Stop; apply the same latency correction as misses.
 * The tiny boundary allowance matches Assessment's inclusive late windows.
 */
export function completedBarCount(assessment, elapsedSeconds, closingDelay = barClosingDelay(assessment)) {
    const correctedElapsed = elapsedSeconds - assessment.latencyOffsetMs / 1000;
    return Math.max(0, Math.floor((correctedElapsed - closingDelay - 1e-9)
        / (assessment.secondsPerBeat * BEATS_PER_BAR)));
}

export function gaussianQuality(errorMs, widthMs) {
    if (!Number.isFinite(errorMs) || !Number.isFinite(widthMs) || widthMs <= 0) {
        throw new RangeError("Quality needs a finite error and positive finite width");
    }
    return Math.exp(-0.5 * (errorMs / widthMs) ** 2);
}

/** A null trend means insufficient history, not an unchanged score. */
export function scoreTrend(score, referenceScore, completedBars) {
    if (completedBars < 2 * TREND_BARS || score === null || referenceScore === null) {
        return { score, referenceScore: null, change: null, trend: null };
    }
    const change = score - referenceScore;
    return { score, referenceScore, change,
        trend: change >= TREND_POINTS ? "up" : change <= -TREND_POINTS ? "down" : "steady" };
}

const emptySample = () => ({ quality: 0, opportunities: 0 });

// Sum weighted opportunities, never averages of rounded pad/bar percentages.
// Anchor weights to the last actual sample so silence does not erase a score.
function weightedScore(bars, sampleForBar) {
    const samples = bars.map(bar => ({ absoluteBar: bar.absoluteBar, ...sampleForBar(bar) }))
        .filter(sample => sample.opportunities > 0);
    if (!samples.length) return null;
    const latest = samples.at(-1).absoluteBar;
    let quality = 0, opportunities = 0;
    for (const sample of samples) {
        const weight = 2 ** (-(latest - sample.absoluteBar) / HALF_LIFE_BARS);
        quality += weight * sample.quality;
        opportunities += weight * sample.opportunities;
    }
    return 100 * quality / opportunities;
}

function summarize(bars, instruments, hasConsistency) {
    const pads = Object.fromEntries(instruments.map(instrument =>
        [instrument, weightedScore(bars, bar => bar.pads[instrument])]));
    const padScore = weightedScore(bars, bar => Object.values(bar.pads).reduce((sum, sample) => ({
        quality: sum.quality + sample.quality,
        opportunities: sum.opportunities + sample.opportunities,
    }), emptySample()));
    const consistency = hasConsistency ? weightedScore(bars, bar => bar.consistency) : null;
    const overall = padScore === null || (hasConsistency && consistency === null) ? null
        : hasConsistency ? (1 - CONSISTENCY_WEIGHT) * padScore + CONSISTENCY_WEIGHT * consistency : padScore;
    return { pads, padScore, consistency, overall };
}

/** Read one finalized assessment snapshot. Never match, advance or mutate it.
 * The caller owns completed-bar/clock decisions and must finalize all expected
 * results first. Rebuilding this projection incorporates delayed miss corrections.
 */
export function scorePractice(assessment, completedBars) {
    if (!Number.isSafeInteger(completedBars) || completedBars < 0) {
        throw new RangeError("completedBars must be a nonnegative safe integer");
    }
    const instruments = [...assessment.tracks.keys()];
    const barSeconds = assessment.secondsPerBeat * BEATS_PER_BAR;
    const barsPerLoop = Math.round(assessment.loopSeconds / barSeconds);
    const groups = new Map();
    for (const [instrument, track] of assessment.tracks) {
        for (const [index, note] of track.notes.entries()) {
            if (!groups.has(note.tick)) groups.set(note.tick, []);
            groups.get(note.tick).push({ instrument, index });
        }
    }
    const hasConsistency = [...groups.values()].some(members => members.length > 1);
    const bars = Array.from({ length: completedBars }, (_, absoluteBar) => ({
        absoluteBar, pads: Object.fromEntries(instruments.map(instrument => [instrument, emptySample()])),
        consistency: emptySample(),
    }));
    for (const bar of bars) {
        const iteration = Math.floor(bar.absoluteBar / barsPerLoop);
        const barIndex = bar.absoluteBar % barsPerLoop;
        for (const [tick, members] of groups) {
            if (Math.floor(tick / TICKS_PER_BAR) !== barIndex) continue;
            const errors = [];
            for (const { instrument, index } of members) {
                const result = assessment.resultFor(instrument, iteration, index);
                if (!result) throw new RangeError("Expected notes must be finalized before scoring completed bars");
                const error = result.status === TimingStatus.MISSED ? null : result.errorMs;
                const sample = bar.pads[instrument];
                sample.opportunities++;
                if (error !== null) sample.quality += gaussianQuality(error, TIMING_WIDTH_MS);
                errors.push(error);
            }
            if (members.length > 1) {
                bar.consistency.opportunities++;
                if (errors.every(error => error !== null)) {
                    const spread = Math.max(...errors) - Math.min(...errors);
                    bar.consistency.quality += gaussianQuality(spread, CONSISTENCY_WIDTH_MS);
                }
            }
        }
    }
    // Extras use their corrected input bar, not a nearby expected note's bar.
    // The canonical hit list contains each extra once, including duplicate hits.
    for (const hit of assessment.hits) {
        if (hit.status !== TimingStatus.EXTRA) continue;
        const absoluteBar = Math.floor((hit.correctedTime - assessment.origin) / barSeconds);
        const sample = bars[absoluteBar]?.pads[hit.instrument];
        if (sample) sample.opportunities++;
    }
    const current = summarize(bars, instruments, hasConsistency);
    const reference = summarize(bars.slice(0, Math.max(0, completedBars - TREND_BARS)), instruments, hasConsistency);
    return {
        completedBars,
        overall: scoreTrend(current.overall, reference.overall, completedBars),
        padScore: scoreTrend(current.padScore, reference.padScore, completedBars),
        pads: instruments.map(instrument => ({ instrument,
            ...scoreTrend(current.pads[instrument], reference.pads[instrument], completedBars) })),
        consistency: hasConsistency ? scoreTrend(current.consistency, reference.consistency, completedBars) : null,
    };
}
