export const MIN_BPM = 20;
export const MAX_BPM = 300;
export const TEMPO_STEPS = 1000;

/** Keep the practice tempo integral; lesson data can retain its original BPM. */
export function practiceBpm(value) {
    if (!Number.isFinite(value)) throw new RangeError("BPM must be finite");
    return Math.round(Math.max(MIN_BPM, Math.min(MAX_BPM, value)));
}

/** Logarithmic travel gives lower practice tempos more physical slider space. */
export function bpmFromPosition(position) {
    return practiceBpm(MIN_BPM * (MAX_BPM / MIN_BPM) ** (position / TEMPO_STEPS));
}

export function positionFromBpm(bpm) {
    return Math.round(TEMPO_STEPS * Math.log(practiceBpm(bpm) / MIN_BPM) / Math.log(MAX_BPM / MIN_BPM));
}
