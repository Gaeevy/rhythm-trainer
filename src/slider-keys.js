/** Step in displayed units, independent of a slider's nonlinear position scale. */
export function bindSliderKeys(slider, { value, min, max, position }) {
    slider.addEventListener("keydown", event => {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        const current = value();
        const values = { ArrowLeft: current - 1, ArrowDown: current - 1,
            ArrowRight: current + 1, ArrowUp: current + 1,
            PageDown: current - 10, PageUp: current + 10, Home: min, End: max };
        if (!Object.hasOwn(values, event.code)) return;
        event.preventDefault();
        slider.value = position(Math.max(min, Math.min(max, values[event.code])));
        slider.dispatchEvent(new Event("input"));
    });
}
