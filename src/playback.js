import { validateLesson } from "./lesson.js";
import { backingTrack, isBassProgram } from "./backing.js";
import { TICKS_PER_BEAT, BEATS_PER_BAR, ticksToSeconds } from "./music-time.js";

/** Expand a lesson into a repeating sequence, including a separate metronome. */
export function lessonEvents(lesson, bpm, disabledInstruments = [], metronome = true) {
    const events = lesson.tracks.filter(track => !disabledInstruments.includes(track.instrument)).flatMap(track => track.notes.map(tick => ({
        offset: ticksToSeconds(tick, bpm), instrument: track.instrument, accent: false,
    })));
    if (metronome) {
        for (let beat = 0; beat < lesson.bars * BEATS_PER_BAR; beat++) {
            events.push({
                offset: ticksToSeconds(beat * TICKS_PER_BEAT, bpm),
                instrument: "metronome", accent: beat % BEATS_PER_BAR === 0,
            });
        }
    }
    return events.sort((left, right) => left.offset - right.offset);
}

/** Schedule short windows against an audio clock, independently of animation. */
export class Playback {
    constructor({
        clock, schedule, scheduleBacking, cancel,
        // Browser timers must be called on the global object, not on Playback.
        setTimer = (callback, delay) => globalThis.setInterval(callback, delay),
        clearTimer = timer => globalThis.clearInterval(timer),
    }) {
        this.clock = clock;
        this.schedule = schedule;
        this.scheduleBacking = scheduleBacking;
        this.cancel = cancel;
        this.setTimer = setTimer;
        this.clearTimer = clearTimer;
        this.running = false;
        this.timer = null;
    }

    start(lesson, {
        bpm = lesson.bpm, countIn = true, disabledInstruments = [], backing = false, midiBacking = null, audioBacking = null,
    } = {}) {
        validateLesson(lesson);
        if (backing && lesson.backing?.midi && !midiBacking) throw new Error("MIDI backing is not loaded");
        if (backing && lesson.backing?.audio && !audioBacking) throw new Error("Audio backing is not loaded");
        const secondsPerBeat = ticksToSeconds(TICKS_PER_BEAT, bpm);
        this.stop();
        this.secondsPerBeat = secondsPerBeat;
        this.countInBeats = countIn ? BEATS_PER_BAR : 0;
        this.loopBeats = lesson.bars * BEATS_PER_BAR;
        this.loopSeconds = this.loopBeats * secondsPerBeat;
        this.events = lessonEvents(lesson, bpm, disabledInstruments, !backing);
        this.backing = null;
        if (backing && lesson.backing?.audio) {
            const loopSeconds = lesson.backing.bars * BEATS_PER_BAR * secondsPerBeat;
            this.backing = {
                loopSeconds,
                events: [{ offset: 0, buffer: audioBacking, playbackRate: audioBacking.duration / loopSeconds }],
            };
        } else if (backing) {
            const track = midiBacking ?? backingTrack(lesson);
            const ppq = track.ppq ?? TICKS_PER_BEAT;
            const bassGain = 10 ** ((lesson.backing?.bassGainDb ?? 0) / 20);
            this.backing = {
                loopSeconds: track.bars * BEATS_PER_BAR * secondsPerBeat,
                events: track.events.map(({ durationTicks, bends, ...event }) => {
                    const timed = {
                        ...event, offset: (event.tick / ppq) * secondsPerBeat,
                        duration: (durationTicks / ppq) * secondsPerBeat,
                    };
                    if (bassGain !== 1 && isBassProgram(event.program)) timed.gain = bassGain;
                    if (bends) {
                        timed.bends = bends.map(({ offsetTicks, cents }) => ({
                            offset: (offsetTicks / ppq) * secondsPerBeat, cents,
                        }));
                    }
                    return timed;
                }),
            };
        }
        this.startTime = this.clock() + 0.08;
        this.origin = this.startTime + this.countInBeats * secondsPerBeat;
        this.scheduledUntil = this.startTime;
        this.running = true;
        this.pump();
        this.timer = this.setTimer(() => this.pump(), 25);
    }

    get beat() {
        return this.beatAt(this.clock());
    }

    /** Return position at an audio timestamp, including output-clock readings. */
    beatAt(audioTime) {
        if (!this.running) return 0;
        return Math.max(-this.countInBeats, (audioTime - this.origin) / this.secondsPerBeat);
    }

    pump() {
        if (!this.running) return;
        const now = this.clock();
        // Skip elapsed time after a delayed callback rather than playing a burst.
        const from = Math.max(now, this.scheduledUntil);
        const until = now + 0.12;
        if (until <= from) return;

        for (let beat = 0; beat < this.countInBeats; beat++) {
            const time = this.startTime + beat * this.secondsPerBeat;
            if (time >= from && time < until) {
                this.schedule("metronome", time, beat === 0);
            }
        }
        this.scheduleLoop(this.events, this.loopSeconds, from, until,
            (event, time) => this.schedule(event.instrument, time, event.accent));
        if (this.backing) {
            this.scheduleLoop(this.backing.events, this.backing.loopSeconds, from, until,
                (event, time) => this.scheduleBacking(event, time));
        }
        this.scheduledUntil = until;
    }

    scheduleLoop(events, loopSeconds, from, until, schedule) {
        const firstLoop = Math.max(0, Math.floor((from - this.origin) / loopSeconds));
        const lastLoop = Math.floor((until - this.origin) / loopSeconds);
        for (let loop = firstLoop; loop <= lastLoop; loop++) {
            for (const event of events) {
                const time = this.origin + loop * loopSeconds + event.offset;
                if (time >= from && time < until) schedule(event, time);
            }
        }
    }

    stop() {
        this.running = false;
        if (this.timer !== null) this.clearTimer(this.timer);
        this.timer = null;
        this.cancel();
    }
}
