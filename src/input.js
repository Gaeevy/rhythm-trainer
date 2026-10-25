import { INSTRUMENTS } from "./instruments.js";

export const DEFAULT_KEY_BINDINGS = Object.freeze({
    KeyD: "kick", KeyF: "snare", KeyJ: "hi_hat_closed", KeyK: "ride",
    KeyU: "hi_hat_open", KeyH: "hi_hat_pedal",
    KeyQ: "tom_1", KeyW: "tom_2", KeyE: "tom_3", KeyR: "tom_4",
    KeyA: "crash_1", KeyS: "crash_2",
});

export const KEY_CODES = Object.freeze([
    ...Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ", letter => `Key${letter}`),
    ...Array.from("0123456789", digit => `Digit${digit}`),
]);

export function keyLabel(code) {
    return code === "Space" ? "Space" : code?.replace(/^(Key|Digit)/, "") ?? "";
}

/** Do not intercept typing, browser shortcuts, held keys, or control activation. */
function ignoreKeyboardEvent(event) {
    return Boolean(event.repeat || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey
        || event.target?.isContentEditable || event.target?.closest?.(
            "input, textarea, select, button, summary, a, [contenteditable]:not([contenteditable='false'])",
        ));
}

export function keyboardTransport(event) {
    return event.code === "Space" && !ignoreKeyboardEvent(event);
}

export function keyboardInstrument(event, bindings = DEFAULT_KEY_BINDINGS) {
    if (event.code === "Space" || ignoreKeyboardEvent(event)) return null;
    return Object.hasOwn(bindings, event.code) ? bindings[event.code] : null;
}

export function instrumentKeyLabel(instrument, bindings = DEFAULT_KEY_BINDINGS) {
    const code = Object.keys(bindings).find(key => bindings[key] === instrument);
    return keyLabel(code);
}

/** Swap an occupied key so every instrument keeps exactly one distinct binding. */
export function remapKey(bindings, instrument, code) {
    if (!KEY_CODES.includes(code)) throw new RangeError("Choose a letter or a digit; Space starts and stops playback");
    if (!Object.hasOwn(INSTRUMENTS, instrument)) throw new RangeError("Unknown keyboard instrument");
    const previous = Object.keys(bindings).find(key => bindings[key] === instrument);
    if (!previous) throw new RangeError("Unknown keyboard instrument");
    const next = { ...bindings };
    const displaced = next[code];
    delete next[previous];
    next[code] = instrument;
    if (displaced && displaced !== instrument) next[previous] = displaced;
    return next;
}
