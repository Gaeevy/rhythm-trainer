import { validateLesson } from "./lesson.js";
import { TICKS_PER_BEAT, TICKS_PER_BAR, ticksToSeconds } from "./music-time.js";

export const TimingStatus = Object.freeze({
    EARLY: "early", ON_TIME: "on_time", LATE: "late", MISSED: "missed", EXTRA: "extra",
});

// Only absorb floating-point error at inclusive boundaries, not playing error.
const EPSILON_SECONDS = 1e-9;

function noteKey(instrument, iteration, index) {
    return `${instrument}:${iteration}:${index}`;
}

/** Assess an in-memory session using precise hit times, never snapped ticks. */
export class Assessment {
    constructor(lesson, {
        origin, bpm = lesson.bpm, toleranceMs = 30, matchingWindowMs = 150, latencyOffsetMs = 0,
    }) {
        validateLesson(lesson);
        this.secondsPerBeat = ticksToSeconds(TICKS_PER_BEAT, bpm);
        if (!Number.isFinite(origin)) throw new RangeError("origin must be finite");
        if (!Number.isFinite(matchingWindowMs) || matchingWindowMs <= 0) {
            throw new RangeError("matchingWindowMs must be finite and positive");
        }
        if (!Number.isFinite(toleranceMs) || toleranceMs < 0 || toleranceMs > matchingWindowMs) {
            throw new RangeError("toleranceMs must be between zero and matchingWindowMs");
        }
        if (!Number.isFinite(latencyOffsetMs)) throw new RangeError("latencyOffsetMs must be finite");
        this.origin = origin;
        this.bpm = bpm;
        this.toleranceMs = toleranceMs;
        this.latencyOffsetMs = latencyOffsetMs;
        this.loopSeconds = ticksToSeconds(lesson.bars * TICKS_PER_BAR, bpm);
        this.hits = [];
        this.noteResults = new Map();
        this.counts = Object.fromEntries(Object.values(TimingStatus).map(status => [status, 0]));
        this.totalAbsoluteErrorMs = 0;
        this.tracks = new Map(lesson.tracks.map(track => {
            const notes = track.notes.map((tick, index, ticks) => {
                const previous = index === 0 ? ticks.at(-1) - lesson.bars * TICKS_PER_BAR : ticks[index - 1];
                const next = index === ticks.length - 1 ? ticks[0] + lesson.bars * TICKS_PER_BAR : ticks[index + 1];
                return {
                    tick, offset: ticksToSeconds(tick, bpm),
                    earlyWindow: Math.min(matchingWindowMs / 1000, ticksToSeconds(tick - previous, bpm) / 2),
                    lateWindow: Math.min(matchingWindowMs / 1000, ticksToSeconds(next - tick, bpm) / 2),
                };
            });
            return [track.instrument, { notes, nextMissIndex: 0, nextMissIteration: 0, hits: [] }];
        }));
    }

    expected(instrument, iteration, index) {
        const note = this.tracks.get(instrument).notes[index];
        return {
            key: noteKey(instrument, iteration, index),
            tick: note.tick, iteration,
            time: this.origin + iteration * this.loopSeconds + note.offset,
            earlyWindow: note.earlyWindow, lateWindow: note.lateWindow,
        };
    }

    resultFor(instrument, iteration, index) {
        return this.noteResults.get(noteKey(instrument, iteration, index));
    }

    /** Finalize elapsed note windows. A delayed timestamped hit can correct a miss. */
    advance(audioTime) {
        if (!Number.isFinite(audioTime)) throw new RangeError("audioTime must be finite");
        const correctedTime = audioTime - this.latencyOffsetMs / 1000;
        const missed = [];
        for (const [instrument, track] of this.tracks) {
            if (track.notes.length === 0) continue;
            while (true) {
                const expected = this.expected(instrument, track.nextMissIteration, track.nextMissIndex);
                if (correctedTime <= expected.time + expected.lateWindow + EPSILON_SECONDS) break;
                if (!this.noteResults.has(expected.key)) {
                    const result = {
                        instrument, expected, bpm: this.bpm, status: TimingStatus.MISSED,
                        errorMs: null, originalTimeStamp: null, audioTime: null, correctedTime: null,
                    };
                    this.noteResults.set(expected.key, result);
                    this.counts.missed++;
                    missed.push(result);
                }
                track.nextMissIndex++;
                if (track.nextMissIndex === track.notes.length) {
                    track.nextMissIndex = 0;
                    track.nextMissIteration++;
                }
            }
        }
        return missed;
    }

    /** Match only the nearest note on this instrument; a second hit becomes extra. */
    recordHit({ instrument, originalTimeStamp, audioTime, source = "keyboard", velocity = null }) {
        const track = this.tracks.get(instrument);
        if (!track) return null;
        if (![originalTimeStamp, audioTime].every(Number.isFinite)) {
            throw new RangeError("Hit timestamps must be finite");
        }
        const correctedTime = audioTime - this.latencyOffsetMs / 1000;
        const nearIteration = Math.floor((correctedTime - this.origin) / this.loopSeconds);
        let nearest = null;
        let distance = Infinity;
        for (let iteration = Math.max(0, nearIteration - 1); iteration <= Math.max(0, nearIteration + 1); iteration++) {
            for (let index = 0; index < track.notes.length; index++) {
                const expected = this.expected(instrument, iteration, index);
                const difference = Math.abs(correctedTime - expected.time);
                if (difference < distance - EPSILON_SECONDS) {
                    nearest = expected;
                    distance = difference;
                }
            }
        }

        const errorSeconds = nearest ? correctedTime - nearest.time : null;
        const inWindow = nearest && errorSeconds >= -nearest.earlyWindow - EPSILON_SECONDS
            && errorSeconds <= nearest.lateWindow + EPSILON_SECONDS;
        // Count-in taps are unscored except an eligible early first note.
        if (correctedTime < this.origin && !inWindow) return null;
        const previousResult = nearest ? this.noteResults.get(nearest.key) : null;
        const matches = inWindow && (!previousResult || previousResult.status === TimingStatus.MISSED);
        let status = TimingStatus.EXTRA;
        if (matches) {
            status = Math.abs(errorSeconds) <= this.toleranceMs / 1000 + EPSILON_SECONDS
                ? TimingStatus.ON_TIME : errorSeconds < 0 ? TimingStatus.EARLY : TimingStatus.LATE;
        }
        const result = {
            instrument, source, velocity, originalTimeStamp, audioTime, correctedTime, bpm: this.bpm,
            expected: matches ? nearest : null,
            errorMs: matches ? errorSeconds * 1000 : null,
            status,
        };
        if (matches) {
            if (previousResult?.status === TimingStatus.MISSED) this.counts.missed--;
            this.noteResults.set(nearest.key, result);
            this.totalAbsoluteErrorMs += Math.abs(result.errorMs);
        }
        this.counts[status]++;
        this.hits.push(result);
        track.hits.push(result);
        return result;
    }

    get meanAbsoluteErrorMs() {
        const matched = this.counts.early + this.counts.on_time + this.counts.late;
        return matched ? this.totalAbsoluteErrorMs / matched : null;
    }
}
