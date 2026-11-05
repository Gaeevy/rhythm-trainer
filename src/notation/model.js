import {
    TICKS_PER_BEAT, TICKS_PER_BAR, BEATS_PER_BAR, TICKS_PER_EIGHTH,
    TICKS_PER_SIXTEENTH, TICKS_PER_THIRTY_SECOND, TICKS_PER_EIGHTH_TRIPLET, SWING_EIGHTH_TICK,
} from "../music-time.js";
import { validateLesson } from "../lesson.js";
import { DRUM_KEY } from "./drum-key.js";

export class NotationError extends Error {}

const onGrid = (offsets, spacing) => offsets.every(offset => offset % spacing === 0);

// Combine only aligned quarter rests; never merge through a note or tuplet.
function compactRests(notes, beams, tuplets) {
    const compact = [], indices = new Map();
    for (let index = 0; index < notes.length;) {
        const note = notes[index];
        let count = 1;
        for (const candidate of [BEATS_PER_BAR, 2]) {
            if (note.writtenTick % (TICKS_PER_BEAT * candidate) === 0
                && notes.slice(index, index + candidate).length === candidate
                && notes.slice(index, index + candidate).every(item => item.rest && item.durationTicks === TICKS_PER_BEAT)) {
                count = candidate; break;
            }
        }
        for (let offset = 0; offset < count; offset++) indices.set(index + offset, compact.length);
        compact.push(count === 1 ? note : { ...note, durationTicks: count * TICKS_PER_BEAT, duration: count === BEATS_PER_BAR ? "1r" : "2r" });
        index += count;
    }
    const remap = groups => groups.map(group => group.map(index => indices.get(index)));
    return { notes: compact, beams: remap(beams), tuplets: remap(tuplets) };
}

/**
 * Build a notation model without changing lesson ticks or note identities.
 * Internal strategies, selected only by lessonNotation (not lesson JSON options):
 * - Default: cymbals up, drums/pedal down.
 * - combine: one downward-stem voice, considered only for dense cymbal rhythms.
 * - separateTuplets: isolate hinted instruments if the default grids conflict.
 * The two flags are alternatives; do not combine them. Keep layout decisions
 * in lessonNotation, not in this converter or the SVG renderer.
 */
function convertLesson(lesson, { combine = false, separateTuplets = false } = {}) {
    validateLesson(lesson);
    const feel = lesson.version === 2 ? lesson.notation.feel : "straight";
    const hints = lesson.notation?.triplets ?? [];
    // Last-resort grid separation: retain hinted triplets and their required rests.
    const separate = new Set(separateTuplets ? hints.map(hint => hint.instrument) : []);
    const voiceFor = instrument => combine ? "combined" : separate.has(instrument) ? instrument : DRUM_KEY[instrument].voice;
    const parts = new Map();
    for (const track of lesson.tracks) {
        const id = voiceFor(track.instrument);
        if (!parts.has(id)) parts.set(id, []);
        for (const [noteIndex, performanceTick] of track.notes.entries()) parts.get(id).push({
            instrument: track.instrument, performanceTick, noteIndex,
            id: `${track.instrument}:${performanceTick}`, key: DRUM_KEY[track.instrument].key,
        });
    }
    // Empty tracks must not create extra rows of rests beside active instruments.
    for (const [id, notes] of parts) if (!notes.length) parts.delete(id);
    const bars = Array.from({ length: lesson.bars }, (_, index) => ({ index, voices: [] }));
    for (const [id, events] of parts) {
        const stem = id === "cymbals" || DRUM_KEY[id]?.voice === "cymbals" ? 1 : -1;
        for (const bar of bars) {
            const notes = [], beams = [], tuplets = [];
            for (let beat = 0; beat < BEATS_PER_BAR; beat++) {
                const start = bar.index * TICKS_PER_BAR + beat * TICKS_PER_BEAT;
                const hits = events.filter(event => event.performanceTick >= start && event.performanceTick < start + TICKS_PER_BEAT);
                const beatHints = hints.filter(hint => voiceFor(hint.instrument) === id && Math.floor(hint.tick / TICKS_PER_BEAT) === start / TICKS_PER_BEAT);
                const offsets = hits.map(hit => hit.performanceTick - start);
                const eighthTriplet = beatHints.some(hint => (hint.unit ?? 8) === 8)
                    || (feel === "straight" && !onGrid(offsets, TICKS_PER_THIRTY_SECOND) && onGrid(offsets, TICKS_PER_EIGHTH_TRIPLET));
                const split = !eighthTriplet && (beatHints.some(hint => hint.unit === 16)
                    || (feel === "straight" && !onGrid(offsets, TICKS_PER_THIRTY_SECOND)));
                const span = split ? TICKS_PER_EIGHTH : TICKS_PER_BEAT;
                for (let section = 0; section < TICKS_PER_BEAT; section += span) {
                    const sectionStart = start + section;
                    const sectionHits = hits.filter(hit => hit.performanceTick >= sectionStart && hit.performanceTick < sectionStart + span);
                    const local = sectionHits.map(hit => hit.performanceTick - sectionStart);
                    let step = span, duration = span === TICKS_PER_EIGHTH ? "8" : "4", triplet = false, swung = false;
                    const finerBinary = local.some(offset => offset % TICKS_PER_EIGHTH !== 0 && offset % TICKS_PER_THIRTY_SECOND === 0);
                    const sixteenthTriplet = split && (beatHints.some(hint => hint.unit === 16 && Math.floor(hint.tick / TICKS_PER_EIGHTH) === sectionStart / TICKS_PER_EIGHTH)
                        || !onGrid(local, TICKS_PER_THIRTY_SECOND));
                    if (eighthTriplet || sixteenthTriplet) {
                        step = span / 3; duration = eighthTriplet ? "8" : "16"; triplet = true;
                        if (!onGrid(local, step)) {
                            throw new NotationError(`${id}, bar ${bar.index + 1}, beat ${beat + 1}: unsupported rhythm; no notes were rounded`);
                        }
                    } else if (feel === "swing" && !split && !finerBinary) {
                        if (!local.every(offset => offset === 0 || offset === SWING_EIGHTH_TICK)) {
                            throw new NotationError(`${id}, bar ${bar.index + 1}, beat ${beat + 1}: add an explicit triplet hint; swing eighths use offsets 0/${SWING_EIGHTH_TICK}`);
                        }
                        swung = true;
                        if (local.includes(SWING_EIGHTH_TICK)) { step = TICKS_PER_EIGHTH; duration = "8"; }
                    } else {
                        if (!onGrid(local, TICKS_PER_THIRTY_SECOND)) throw new NotationError(`${id}: unsupported rhythm; no notes were rounded`);
                        if (!onGrid(local, TICKS_PER_SIXTEENTH)) { step = TICKS_PER_THIRTY_SECOND; duration = "32"; }
                        else if (!onGrid(local, TICKS_PER_EIGHTH)) { step = TICKS_PER_SIXTEENTH; duration = "16"; }
                        else if (local.includes(TICKS_PER_EIGHTH)) { step = TICKS_PER_EIGHTH; duration = "8"; }
                    }
                    const group = [];
                    const writtenOffsets = local.map(offset => swung && offset === SWING_EIGHTH_TICK ? TICKS_PER_EIGHTH : offset);
                    for (let offset = 0; offset < span;) {
                        const performanceOffset = swung && offset === TICKS_PER_EIGHTH ? SWING_EIGHTH_TICK : offset;
                        const refs = sectionHits.filter(hit => hit.performanceTick === sectionStart + performanceOffset)
                            .map(hit => ({ ...hit, writtenTick: sectionStart + offset }));
                        const rest = refs.length === 0;
                        let noteTicks = step, noteDuration = duration;
                        // Use the longest aligned binary value before the next hit.
                        // This removes artificial subdivision rests (8th + two 16ths)
                        // without crossing a beat/half-beat or changing explicit tuplets.
                        if (!triplet && step < span) {
                            for (const [ticks, value] of [[TICKS_PER_BEAT, "4"], [TICKS_PER_EIGHTH, "8"], [TICKS_PER_SIXTEENTH, "16"]]) {
                                if (ticks > step && offset % ticks === 0 && offset + ticks <= span
                                    && !writtenOffsets.some(next => next > offset && next < offset + ticks)) {
                                    noteTicks = ticks; noteDuration = value; break;
                                }
                            }
                        }
                        group.push(notes.length);
                        notes.push({ writtenTick: sectionStart + offset, durationTicks: noteTicks, duration: noteDuration + (rest ? "r" : ""),
                            rest, refs, keys: rest ? [stem > 0 ? "d/5" : "b/4"] : refs.map(ref => ref.key), triplet, swung });
                        offset += noteTicks;
                    }
                    if (step < span && group.filter(index => !notes[index].rest).length >= 2) beams.push(group);
                    if (triplet) tuplets.push(group);
                }
            }
            bar.voices.push({ id, stem, ...compactRests(notes, beams, tuplets) });
        }
    }
    const refs = bars.flatMap(bar => bar.voices.flatMap(voice => voice.notes.flatMap(note => note.refs)));
    const expected = lesson.tracks.reduce((count, track) => count + track.notes.length, 0);
    if (refs.length !== expected || new Set(refs.map(ref => ref.id)).size !== expected) {
        throw new NotationError("Notation must reference every lesson note exactly once");
    }
    return { title: lesson.title, feel, bars };
}

/**
 * The single layout policy for the whole lesson. See docs/development.md#notation-layout.
 * Start separate; on a grid conflict, isolate hinted instruments and stop there.
 * Otherwise protect quarter-note cymbal rhythms. Only dense eighth-or-shorter
 * cymbals may share a voice, and only if that model adds no rests.
 * This avoids 35 redundant rests in Fascination Street while keeping the ride
 * quarter independent of offbeat snare in the swing exercises. No song-name,
 * folder or feel-based layout exceptions; feel still controls written timing.
 */
export function lessonNotation(lesson) {
    let separate;
    try { separate = convertLesson(lesson); }
    catch (error) {
        if (!(error instanceof NotationError)) throw error;
        return convertLesson(lesson, { separateTuplets: true });
    }
    const cymbals = separate.bars.flatMap(bar => bar.voices.filter(voice => voice.id === "cymbals")
        .flatMap(voice => voice.notes.filter(note => !note.rest)));
    if (!cymbals.length || cymbals.some(note => note.durationTicks > TICKS_PER_EIGHTH)) return separate;
    try {
        const combined = convertLesson(lesson, { combine: true });
        const restCount = model => model.bars.reduce((count, bar) => count
            + bar.voices.reduce((sum, voice) => sum + voice.notes.filter(note => note.rest).length, 0), 0);
        return restCount(combined) <= restCount(separate) ? combined : separate;
    } catch (error) {
        if (!(error instanceof NotationError)) throw error;
        return separate;
    }
}
