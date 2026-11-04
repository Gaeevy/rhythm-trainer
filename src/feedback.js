import { TimingStatus } from "./assessment.js";

export const FEEDBACK = Object.freeze({
    [TimingStatus.EARLY]: { label: "Early", color: "#79c3e0", symbol: "◀" },
    [TimingStatus.ON_TIME]: { label: "On time", color: "#b8d88b", symbol: "●" },
    [TimingStatus.LATE]: { label: "Late", color: "#e8b35a", symbol: "▶" },
    [TimingStatus.MISSED]: { label: "Missed", color: "#df908b", symbol: "×" },
    [TimingStatus.EXTRA]: { label: "Extra", color: "#c2aacd", symbol: "+" },
});

export function feedbackText(result, precision = 0) {
    const { label, symbol } = FEEDBACK[result.status];
    if (result.errorMs === null) return `${symbol} ${label}`;
    const error = precision === 0 ? Math.round(result.errorMs) : Number(result.errorMs.toFixed(precision));
    const magnitude = Math.abs(error).toFixed(precision);
    const signedError = error === 0 ? magnitude : error > 0 ? `+${magnitude}` : `−${magnitude}`;
    return `${symbol} ${label} ${signedError} ms`;
}
