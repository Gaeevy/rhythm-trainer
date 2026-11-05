import { TICKS_PER_BAR } from "../music-time.js";
/** A bounded six-row window into an indefinitely repeated lesson. */
export function sheetWindow(absoluteBar, columns) {
    if (!Number.isSafeInteger(absoluteBar) || absoluteBar < 0 || ![1, 2, 3].includes(columns)) {
        throw new RangeError("Invalid score window");
    }
    const start = Math.max(0, Math.floor(absoluteBar / columns) - 2) * columns;
    return { start, end: start + columns * 6 };
}

export function sheetPosition(absoluteBar, bars, columns, tick) {
    return { barIndex: absoluteBar % bars, iteration: Math.floor(absoluteBar / bars),
        rowProgress: (absoluteBar % columns + tick / TICKS_PER_BAR) / columns };
}

/** Reserve readable spacing for each rhythmic slot, including rests. */
export function minimumBarWidth(bar) {
    const positions = new Set(bar.voices.flatMap(voice => voice.notes.map(note => note.writtenTick)));
    return Math.max(300, 80 + positions.size * 24);
}

export function sheetColumns(width, bars) {
    const minimum = Math.max(...bars.map(minimumBarWidth));
    return Math.max(1, Math.min(3, Math.floor(width / minimum)));
}
