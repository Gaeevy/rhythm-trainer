import { TICKS_PER_BAR } from "./music-time.js";
import { INSTRUMENTS } from "./instruments.js";

export const SUPPORTED_INSTRUMENTS = Object.freeze(Object.keys(INSTRUMENTS));

export class LessonValidationError extends Error {
    constructor(path, reason) {
        super(`${path}: ${reason}`);
        this.name = "LessonValidationError";
    }
}

function requireCondition(condition, path, reason) {
    if (!condition) throw new LessonValidationError(path, reason);
}

function validateFields(value, fields, path) {
    requireCondition(
        value !== null && typeof value === "object" && !Array.isArray(value),
        path, "must be an object",
    );
    for (const field of fields) {
        requireCondition(Object.hasOwn(value, field), `${path}.${field}`, "is required");
    }
    for (const field of Object.keys(value)) {
        requireCondition(fields.includes(field), `${path}.${field}`, "is not supported in version 1");
    }
}

/** Validate version 1 lesson data. Return it unchanged or throw a path-specific error. */
export function validateLesson(lesson) {
    validateFields(lesson, ["version", "title", "bpm", "time_signature", "bars", "tracks"], "lesson");
    requireCondition(lesson.version === 1, "lesson.version", "must be 1");
    requireCondition(
        typeof lesson.title === "string" && lesson.title.trim().length > 0,
        "lesson.title", "must be a nonempty string",
    );
    requireCondition(
        Number.isFinite(lesson.bpm) && lesson.bpm > 0,
        "lesson.bpm", "must be a finite positive number",
    );
    requireCondition(
        Array.isArray(lesson.time_signature) && lesson.time_signature.length === 2
            && lesson.time_signature[0] === 4 && lesson.time_signature[1] === 4,
        "lesson.time_signature", "must be [4, 4]",
    );
    requireCondition(
        Number.isInteger(lesson.bars) && lesson.bars >= 1 && lesson.bars <= 16,
        "lesson.bars", "must be an integer from 1 to 16",
    );
    requireCondition(
        Array.isArray(lesson.tracks) && lesson.tracks.length > 0,
        "lesson.tracks", "must be a nonempty array",
    );

    const instruments = new Set();
    let noteCount = 0;
    for (const [index, track] of lesson.tracks.entries()) {
        const path = `lesson.tracks[${index}]`;
        validateFields(track, ["instrument", "notes"], path);
        requireCondition(
            SUPPORTED_INSTRUMENTS.includes(track.instrument),
            `${path}.instrument`, `must be one of ${SUPPORTED_INSTRUMENTS.join(", ")}`,
        );
        requireCondition(
            !instruments.has(track.instrument), `${path}.instrument`, "duplicates another track",
        );
        instruments.add(track.instrument);
        requireCondition(Array.isArray(track.notes), `${path}.notes`, "must be an array");
        let previousTick = -1;
        for (const [noteIndex, tick] of track.notes.entries()) {
            const notePath = `${path}.notes[${noteIndex}]`;
            requireCondition(
                Number.isSafeInteger(tick) && tick >= 0 && tick < lesson.bars * TICKS_PER_BAR,
                notePath, `must be an integer from 0 to ${lesson.bars * TICKS_PER_BAR - 1}`,
            );
            requireCondition(tick > previousTick, notePath, "must be sorted and unique");
            previousTick = tick;
            noteCount++;
        }
    }
    requireCondition(noteCount > 0, "lesson.tracks", "must contain at least one note across all tracks");
    return lesson;
}

/** Parse a JSON file's text and validate it before callers use it for playback. */
export function parseLesson(text) {
    requireCondition(typeof text === "string", "lesson", "JSON input must be text");
    let lesson;
    try {
        lesson = JSON.parse(text);
    } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        throw new LessonValidationError("lesson", "invalid JSON; check commas, quotes, and brackets");
    }
    return validateLesson(lesson);
}
