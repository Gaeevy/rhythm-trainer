import { INSTRUMENTS } from "./instruments.js";
import { KEY_CODES, keyLabel } from "./input.js";

export function renderKeyboardBindings(bindings, onRemap) {
    const controls = Object.entries(INSTRUMENTS).map(([instrument, details]) => {
        const label = document.createElement("label");
        label.textContent = details.label;
        const select = document.createElement("select");
        select.dataset.instrument = instrument;
        select.setAttribute("aria-label", `${details.label} key`);
        for (const code of KEY_CODES) {
            const option = document.createElement("option");
            option.value = code;
            option.textContent = keyLabel(code);
            select.append(option);
        }
        select.value = Object.keys(bindings).find(code => bindings[code] === instrument);
        select.addEventListener("change", () => onRemap(instrument, select.value));
        label.append(select);
        return label;
    });
    document.getElementById("keyboard-bindings").replaceChildren(...controls);
}
