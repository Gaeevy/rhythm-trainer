/** Map a DOM event timestamp (milliseconds) into the audio clock (seconds). */
export function eventTimeToAudioTime(timeStamp, { contextTime, performanceTime }) {
    if (![timeStamp, contextTime, performanceTime].every(Number.isFinite)) {
        throw new RangeError("Clock timestamps must be finite numbers");
    }
    return contextTime + (timeStamp - performanceTime) / 1000;
}

/** Prefer the audio output clock so input is aligned with the sound being heard. */
export function audioTimeForEvent(context, timeStamp, performanceNow = performance.now()) {
    const output = context.getOutputTimestamp?.();
    const anchor = output && Number.isFinite(output.contextTime) && output.contextTime >= 0
        && Number.isFinite(output.performanceTime) && output.performanceTime > 0
        ? output
        : { contextTime: context.currentTime, performanceTime: performanceNow };
    return eventTimeToAudioTime(timeStamp, anchor);
}
