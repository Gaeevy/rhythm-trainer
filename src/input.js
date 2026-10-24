export const DEFAULT_KEY_BINDINGS = Object.freeze({
    Space: "kick", KeyF: "snare", KeyJ: "hi_hat", KeyK: "ride",
});

export const KEY_CODES = Object.freeze([
    "Space",
    ...Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ", letter => `Key${letter}`),
    ...Array.from("0123456789", digit => `Digit${digit}`),
]);

export function keyLabel(code) {
    return code === "Space" ? "Space" : code?.replace(/^(Key|Digit)/, "") ?? "";
}

/** Ignore repeats, browser shortcuts, and typing/activating focused controls. */
export function keyboardInstrument(event, bindings = DEFAULT_KEY_BINDINGS) {
    if (event.repeat || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return null;
    if (event.target?.isContentEditable || event.target?.closest?.(
        "input, textarea, select, button, summary, a, [contenteditable]:not([contenteditable='false'])",
    )) return null;
    return Object.hasOwn(bindings, event.code) ? bindings[event.code] : null;
}

export function instrumentKeyLabel(instrument, bindings = DEFAULT_KEY_BINDINGS) {
    const code = Object.keys(bindings).find(key => bindings[key] === instrument);
    return keyLabel(code);
}

/** Swap an occupied key so every instrument keeps exactly one distinct binding. */
export function remapKey(bindings, instrument, code) {
    if (!KEY_CODES.includes(code)) throw new RangeError("Choose Space, a letter, or a digit");
    const previous = Object.keys(bindings).find(key => bindings[key] === instrument);
    if (!previous) throw new RangeError("Unknown keyboard instrument");
    const next = { ...bindings };
    const displaced = next[code];
    delete next[previous];
    next[code] = instrument;
    if (displaced && displaced !== instrument) next[previous] = displaced;
    return next;
}
