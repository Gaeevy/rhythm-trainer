export const DEFAULT_KEY_BINDINGS = Object.freeze({
    Space: "kick", KeyF: "snare", KeyJ: "hi_hat", KeyK: "ride",
});

/** Ignore repeats, browser shortcuts, and typing/activating focused controls. */
export function keyboardInstrument(event, bindings = DEFAULT_KEY_BINDINGS) {
    if (event.repeat || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return null;
    if (event.target?.isContentEditable || event.target?.closest?.(
        "input, textarea, select, button, a, [contenteditable]:not([contenteditable='false'])",
    )) return null;
    return Object.hasOwn(bindings, event.code) ? bindings[event.code] : null;
}

export function instrumentKeyLabel(instrument, bindings = DEFAULT_KEY_BINDINGS) {
    const code = Object.keys(bindings).find(key => bindings[key] === instrument);
    return code === "Space" ? "Space" : code?.replace(/^Key/, "") ?? "";
}
