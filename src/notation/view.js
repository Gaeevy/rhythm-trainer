import { lessonNotation } from "./model.js";
import { renderPreview, renderDrumKey } from "./preview.js";
import { DRUM_KEY } from "./drum-key.js";
import { INSTRUMENTS } from "../instruments.js";

let rendererPromise;
function loadRenderer() {
    if (globalThis.VexFlow) return document.fonts.ready;
    if (!rendererPromise) rendererPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = new URL("../../assets/vendor/vexflow/vexflow-bravura.js", import.meta.url).href;
        script.onload = async () => {
            await document.fonts.ready;
            if (globalThis.VexFlow && document.fonts.check("20px Bravura")) resolve();
            else { script.remove(); rendererPromise = null; reject(new Error("The score fonts could not load.")); }
        };
        script.onerror = () => {
            script.remove(); rendererPromise = null;
            reject(new Error("The score renderer could not load. Check the connection and retry."));
        };
        document.head.append(script);
    });
    return rendererPromise;
}

const element = id => document.getElementById(id);

/** Static notation navigation; never starts/stops playback or records input. */
export class NotationView {
    constructor({ onToggle, onFallback }) {
        this.onToggle = onToggle;
        this.onFallback = onFallback;
        this.lesson = null;
        this.model = null;
        this.disabled = [];
        this.page = 0;
        this.request = 0;
        this.active = false;
        element("notation-previous").onclick = () => this.changePage(-1);
        element("notation-next").onclick = () => this.changePage(1);
        this.observer = new ResizeObserver(() => {
            cancelAnimationFrame(this.resizeFrame);
            this.resizeFrame = requestAnimationFrame(() => {
                if (this.active && this.model) this.renderSafely();
            });
        });
        this.observer.observe(element("notation-score"));
    }

    setLesson(lesson, disabled) {
        this.request++;
        this.lesson = lesson;
        this.disabled = disabled;
        this.model = null;
        this.page = 0;
        this.updateInstruments(disabled);
    }

    updateInstruments(disabled) {
        this.disabled = disabled;
        const buttons = this.lesson?.tracks.map(track => {
            const enabled = !disabled.includes(track.instrument);
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = INSTRUMENTS[track.instrument].label;
            button.setAttribute("aria-pressed", String(enabled));
            button.setAttribute("aria-label", `${enabled ? "Disable" : "Enable"} ${INSTRUMENTS[track.instrument].label} in notation`);
            button.onclick = () => this.onToggle(track.instrument);
            return button;
        }) ?? [];
        element("notation-instruments").replaceChildren(...buttons);
        if (this.active && this.model) this.renderSafely();
    }

    async show(view) {
        const request = ++this.request;
        this.active = view === "notation";
        element("notation-error").hidden = true;
        this.updateVisibility();
        if (!this.active || !this.lesson) return;
        element("notation-score").textContent = "Loading notation…";
        try {
            const model = this.model ?? lessonNotation(this.lesson);
            await loadRenderer();
            if (request !== this.request || !this.active) return;
            this.model = model;
            renderDrumKey(element("notation-key"), this.lesson.tracks.map(track => ({ ...DRUM_KEY[track.instrument], instrument: track.instrument })));
            this.renderSafely();
        } catch (error) {
            if (request === this.request) this.fallback(error);
        }
    }

    updateVisibility() {
        element("timeline").hidden = this.active;
        element("notation-panel").hidden = !this.active;
        element("view-notation").setAttribute("aria-pressed", String(this.active));
        element("view-lanes").setAttribute("aria-pressed", String(!this.active));
    }

    changePage(delta) {
        if (!this.model) return;
        this.page = Math.max(0, Math.min(this.model.bars.length - 1, this.page + delta));
        this.renderSafely();
    }

    renderSafely() {
        try {
            const bar = this.model.bars[this.page];
            element("notation-page").textContent = `Bar ${this.page + 1} of ${this.model.bars.length}`;
            element("notation-previous").disabled = this.page === 0;
            element("notation-next").disabled = this.page === this.model.bars.length - 1;
            const feel = this.model.feel === "swing" ? "Swing · 2:1 eighths" : "Straight · literal rhythm";
            element("notation-feel").textContent = feel;
            renderPreview(element("notation-score"), {
                title: this.model.title, feel, description: `Bar ${this.page + 1}`, voices: bar.voices,
            }, this.disabled);
        } catch (error) { this.fallback(error); }
    }

    fallback(error) {
        this.request++;
        this.active = false;
        this.updateVisibility();
        element("notation-error-text").textContent = `Notation unavailable: ${error.message} The Lanes view is available.`;
        element("notation-error").hidden = false;
        this.onFallback();
    }
}
