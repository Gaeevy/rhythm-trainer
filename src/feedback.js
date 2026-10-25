import { TimingStatus } from "./assessment.js";

export const FEEDBACK = Object.freeze({
    [TimingStatus.EARLY]: { label: "Early", color: "#79c3e0", symbol: "◀" },
    [TimingStatus.ON_TIME]: { label: "On time", color: "#b8d88b", symbol: "●" },
    [TimingStatus.LATE]: { label: "Late", color: "#e8b35a", symbol: "▶" },
    [TimingStatus.MISSED]: { label: "Missed", color: "#df908b", symbol: "×" },
    [TimingStatus.EXTRA]: { label: "Extra", color: "#c2aacd", symbol: "+" },
});

export function feedbackText(result) {
    const { label, symbol } = FEEDBACK[result.status];
    if (result.errorMs === null) return `${symbol} ${label}`;
    const error = Math.round(result.errorMs);
    const signedError = error === 0 ? "0" : error > 0 ? `+${error}` : `−${Math.abs(error)}`;
    return `${symbol} ${label} ${signedError} ms`;
}
