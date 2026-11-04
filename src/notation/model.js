import { validateLesson } from "../lesson.js";
import { DRUM_KEY } from "./drum-key.js";

export class NotationError extends Error {}

// Combine only aligned quarter rests; never merge through a note or tuplet.
function compactRests(notes, beams, tuplets) {
    const compact = [], indices = new Map();
    for (let index = 0; index < notes.length;) {
        const note = notes[index];
        let count = 1;
        for (const candidate of [4, 2]) {
            if (note.writtenTick % (96 * candidate) === 0
                && notes.slice(index, index + candidate).length === candidate
                && notes.slice(index, index + candidate).every(item => item.rest && item.durationTicks === 96)) {
                count = candidate; break;
            }
        }
        for (let offset = 0; offset < count; offset++) indices.set(index + offset, compact.length);
        compact.push(count === 1 ? note : { ...note, durationTicks: count * 96, duration: count === 4 ? "1r" : "2r" });
        index += count;
    }
    const remap = groups => groups.map(group => group.map(index => indices.get(index)));
    return { notes: compact, beams: remap(beams), tuplets: remap(tuplets) };
}

/** Convert performance ticks into written rhythms; never rewrite playable notes. */
export function lessonNotation(lesson) {
    validateLesson(lesson);
    const feel = lesson.version === 2 ? lesson.notation.feel : "straight";
    const hints = lesson.notation?.triplets ?? [];
    // A specifically notated instrument needs its own voice, so its rests remain visible.
    const separate = new Set(hints.map(hint => hint.instrument));
    const voiceFor = instrument => separate.has(instrument) ? instrument : DRUM_KEY[instrument].voice;
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
        const stem = id === "feet" || (separate.has(id) && id !== "ride") ? -1 : 1;
        for (const bar of bars) {
            const notes = [], beams = [], tuplets = [];
            for (let beat = 0; beat < 4; beat++) {
                const start = bar.index * 384 + beat * 96;
                const hits = events.filter(event => event.performanceTick >= start && event.performanceTick < start + 96);
                const beatHints = hints.filter(hint => voiceFor(hint.instrument) === id && Math.floor(hint.tick / 96) === start / 96);
                const offsets = hits.map(hit => hit.performanceTick - start);
                const eighthTriplet = beatHints.some(hint => (hint.unit ?? 8) === 8)
                    || (feel === "straight" && offsets.some(offset => offset % 12 !== 0) && offsets.every(offset => offset % 32 === 0));
                const split = !eighthTriplet && (beatHints.some(hint => hint.unit === 16)
                    || (feel === "straight" && offsets.some(offset => offset % 12 !== 0)));
                const span = split ? 48 : 96;
                for (let section = 0; section < 96; section += span) {
                    const sectionStart = start + section;
                    const sectionHits = hits.filter(hit => hit.performanceTick >= sectionStart && hit.performanceTick < sectionStart + span);
                    const local = sectionHits.map(hit => hit.performanceTick - sectionStart);
                    let step = span, duration = span === 48 ? "8" : "4", triplet = false, swung = false;
                    const sixteenthTriplet = split && (beatHints.some(hint => hint.unit === 16 && Math.floor(hint.tick / 48) === sectionStart / 48)
                        || local.some(offset => offset % 12 !== 0));
                    if (eighthTriplet || sixteenthTriplet) {
                        step = span / 3; duration = eighthTriplet ? "8" : "16"; triplet = true;
                        if (!local.every(offset => offset % step === 0)) {
                            throw new NotationError(`${id}, bar ${bar.index + 1}, beat ${beat + 1}: unsupported rhythm; no notes were rounded`);
                        }
                    } else if (feel === "swing" && !split && !local.some(offset => offset % 48 !== 0 && offset % 12 === 0)) {
                        if (!local.every(offset => offset === 0 || offset === 64)) {
                            throw new NotationError(`${id}, bar ${bar.index + 1}, beat ${beat + 1}: add an explicit triplet hint; swing eighths use offsets 0/64`);
                        }
                        swung = true;
                        if (local.includes(64)) { step = 48; duration = "8"; }
                    } else {
                        if (!local.every(offset => offset % 12 === 0)) throw new NotationError(`${id}: unsupported rhythm; no notes were rounded`);
                        if (local.some(offset => offset % 24 !== 0)) { step = 12; duration = "32"; }
                        else if (local.some(offset => offset % 48 !== 0)) { step = 24; duration = "16"; }
                        else if (local.includes(48)) { step = 48; duration = "8"; }
                    }
                    const group = [];
                    for (let offset = 0; offset < span; offset += step) {
                        const performanceOffset = swung && offset === 48 ? 64 : offset;
                        const refs = sectionHits.filter(hit => hit.performanceTick === sectionStart + performanceOffset)
                            .map(hit => ({ ...hit, writtenTick: sectionStart + offset }));
                        const rest = refs.length === 0;
                        group.push(notes.length);
                        notes.push({ writtenTick: sectionStart + offset, durationTicks: step, duration: duration + (rest ? "r" : ""),
                            rest, refs, keys: rest ? [id === "feet" ? "d/4" : separate.has(id) ? "d/5" : "b/4"] : refs.map(ref => ref.key), triplet, swung });
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
