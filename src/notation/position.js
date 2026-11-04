/** Current score position from the existing audio-clock beat; no timers or audio. */
export function scorePosition(beat, bars) {
    if (!Number.isFinite(beat) || !Number.isInteger(bars) || bars < 1) throw new RangeError("Invalid score position");
    if (beat < 0) return { barIndex: 0, tick: 0, loop: 1, countIn: true };
    const totalBars = Math.floor(beat / 4);
    return { barIndex: totalBars % bars, tick: (beat - totalBars * 4) * 96,
        loop: Math.floor(totalBars / bars) + 1, countIn: false };
}

/** Interpolate between measured engraving anchors, not across the whole staff. */
export function markerX(tick, anchors) {
    if (!Number.isFinite(tick) || anchors.length < 2) throw new RangeError("Invalid marker geometry");
    if (tick <= anchors[0].tick) return anchors[0].x;
    for (let index = 1; index < anchors.length; index++) {
        const left = anchors[index - 1], right = anchors[index];
        if (tick <= right.tick) return left.x + (right.x - left.x) * (tick - left.tick) / (right.tick - left.tick);
    }
    return anchors.at(-1).x;
}

/** Resolve voice geometry into performance-time anchors, including rests/beats. */
export function scoreAnchors(positions, { barStart, endX, feel }) {
    const selected = new Map();
    for (const { note, x, voice } of positions) {
        const written = note.writtenTick - barStart;
        const offset = written % 96;
        const restTick = feel === "swing" && !note.triplet && offset === 48 ? written + 16 : written;
        const ticks = note.refs.length ? note.refs.map(ref => ref.performanceTick - barStart) : [restTick];
        // Actual notes take precedence over inferred rests; upper voice over displaced feet.
        const priority = (note.rest ? 10 : 0) + (voice === "hands" ? 0 : voice === "feet" ? 2 : 1);
        for (const tick of ticks) {
            if (!selected.has(tick) || selected.get(tick).priority > priority) selected.set(tick, { tick, x, priority });
        }
    }
    selected.set(384, { tick: 384, x: endX });
    const anchors = [...selected.values()].sort((a, b) => a.tick - b.tick).map(({ tick, x }) => ({ tick, x }));
    if (!anchors.length || anchors[0].tick !== 0 || anchors.some((anchor, index) => !Number.isFinite(anchor.x)
        || (index > 0 && anchor.x < anchors[index - 1].x))) throw new Error("Score positions could not be aligned with performance timing.");
    const measured = [...anchors];
    for (const tick of [96, 192, 288]) if (!selected.has(tick)) anchors.push({ tick, x: markerX(tick, measured) });
    return anchors.sort((a, b) => a.tick - b.tick);
}
