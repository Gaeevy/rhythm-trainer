import { TICKS_PER_BAR } from "../music-time.js";
/** A bounded six-row window into an indefinitely repeated lesson. */
export function sheetWindow(absoluteBar, columns) {
    if (!Number.isSafeInteger(absoluteBar) || absoluteBar < 0 || ![1, 2].includes(columns)) {
        throw new RangeError("Invalid score window");
    }
    const start = Math.max(0, Math.floor(absoluteBar / columns) - 2) * columns;
    return { start, end: start + columns * 6 };
}

export function sheetPosition(absoluteBar, bars, columns, tick) {
    return { barIndex: absoluteBar % bars, iteration: Math.floor(absoluteBar / bars),
        rowProgress: (absoluteBar % columns + tick / TICKS_PER_BAR) / columns };
}
