import { noteAppearance, extraPosition, notationFeedbackText, NOTATION_COLORS, feedbackColor } from "./feedback.js";
import { scorePosition, markerX } from "./position.js";
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

/** Score following uses the app clock; this view never schedules audio or input. */
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
        this.running = false;
        this.beat = 0;
        this.assessment = null;
        this.feedbackIteration = 0;
        this.latestResult = null;
        this.extras = [];
        this.extraSequence = 0;
        this.lastPlayedAt = -Infinity;
        this.cache = new Map();
        element("notation-previous").onclick = () => this.changePage(-1);
        element("notation-next").onclick = () => this.changePage(1);
        this.observer = new ResizeObserver(() => {
            cancelAnimationFrame(this.resizeFrame);
            this.resizeFrame = requestAnimationFrame(() => {
                if (this.active && this.model) {
                    this.cache.clear();
                    this.renderSafely();
                }
            });
        });
        this.observer.observe(element("notation-score"));
    }

    setLesson(lesson, disabled) {
        this.request++;
        this.lesson = lesson;
        this.disabled = disabled;
        this.model = null;
        this.assessment = null;
        this.latestResult = null;
        this.extras = [];
        this.feedbackIteration = 0;
        this.lastPlayedAt = -Infinity;
        this.cache.clear();
        this.geometry = null;
        this.page = 0;
        this.updateInstruments(disabled);
    }

    updateInstruments(disabled) {
        this.disabled = disabled;
        this.cache.clear();
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
        if (!this.model || this.running) return;
        this.page = Math.max(0, Math.min(this.model.bars.length - 1, this.page + delta));
        this.renderSafely();
    }

    updatePlayback(beat, running, assessment) {
        this.beat = beat;
        this.running = running;
        if (assessment !== this.assessment) {
            this.assessment = assessment;
            this.latestResult = null;
            this.extras = [];
            this.feedbackIteration = 0;
            this.lastPlayedAt = -Infinity;
        }
        if (running && this.model) this.selectFeedbackIteration(scorePosition(beat, this.model.bars.length).loop - 1);
        if (!this.active || !this.model) return;
        const state = scorePosition(beat, this.model.bars.length);
        if (running && state.barIndex !== this.page) {
            this.page = state.barIndex;
            element("notation-score").scrollLeft = 0;
            this.renderSafely();
        } else this.updateMarker();
    }

    engraving(host, index) {
        const style = getComputedStyle(host);
        const width = Math.max(460, Math.floor(host.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)));
        const key = `${index}:${width}`;
        let geometry = this.cache.get(key);
        if (!geometry) {
            const bar = this.model.bars[index];
            geometry = renderPreview(host, {
                title: this.model.title, feel: this.model.feel, rhythmFeel: this.model.feel,
                description: `Bar ${index + 1}`, voices: bar.voices,
            }, this.disabled);
            const marker = document.createElementNS("http://www.w3.org/2000/svg", "line");
            marker.classList.add("notation-playhead");
            marker.setAttribute("y1", "32");
            marker.setAttribute("y2", "188");
            marker.setAttribute("aria-hidden", "true");
            geometry.svg.append(marker);
            geometry.marker = marker;
            const extraLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
            extraLayer.classList.add("notation-extra-hits");
            extraLayer.setAttribute("aria-hidden", "true");
            geometry.svg.append(extraLayer);
            geometry.extraLayer = extraLayer;
            geometry.extraSignature = "";
            this.cache.set(key, geometry);
        } else host.replaceChildren(geometry.svg);
        geometry.marker.style.display = "none";
        return geometry;
    }

    renderSafely() {
        try {
            if (this.running) {
                const state = scorePosition(this.beat, this.model.bars.length);
                this.page = state.barIndex;
                this.selectFeedbackIteration(state.loop - 1);
            }
            element("notation-page").textContent = `Bar ${this.page + 1} of ${this.model.bars.length}`;
            const feel = this.model.feel === "swing" ? "Swing · 2:1 eighths" : "Straight · literal rhythm";
            element("notation-feel").textContent = feel;
            // The upcoming column changes current-bar width. Apply its layout
            // before measuring/engraving, including one-bar ↔ multi-bar changes.
            const upcoming = element("notation-upcoming");
            upcoming.hidden = this.model.bars.length === 1;
            const host = element("notation-score");
            const scroll = host.scrollLeft;
            this.geometry = this.engraving(host, this.page);
            this.geometry.viewportWidth = host.clientWidth;
            this.geometry.paddingLeft = parseFloat(getComputedStyle(host).paddingLeft);
            host.scrollLeft = scroll;
            if (!upcoming.hidden) {
                const next = (this.page + 1) % this.model.bars.length;
                element("notation-upcoming-label").textContent = `${next === 0 ? "Next loop" : "Next"} · Bar ${next + 1}`;
                this.nextGeometry = this.engraving(element("notation-next-score"), next);
            } else {
                this.nextGeometry = null;
                element("notation-next-score").replaceChildren();
            }
            this.updateMarker();
        } catch (error) { this.fallback(error); }
    }

    updateMarker() {
        element("notation-previous").disabled = this.running || this.page === 0;
        element("notation-next").disabled = this.running || this.page === this.model.bars.length - 1;
        if (!this.geometry) return;
        const state = scorePosition(this.beat, this.model.bars.length);
        const marker = this.geometry.marker;
        marker.style.display = this.running && !state.countIn ? "" : "none";
        marker.dataset.tick = String(state.tick);
        marker.dataset.loop = String(state.loop);
        const x = markerX(state.tick, this.geometry.anchors);
        marker.setAttribute("x1", String(x));
        marker.setAttribute("x2", String(x));
        this.updateFeedback();
        if (this.running && !state.countIn) {
            const host = element("notation-score");
            const left = x + this.geometry.paddingLeft;
            if (left < host.scrollLeft + 20 || left > host.scrollLeft + this.geometry.viewportWidth - 20) {
                host.scrollLeft = Math.max(0, left - this.geometry.viewportWidth / 2);
            }
        }
    }

    selectFeedbackIteration(iteration) {
        if (iteration !== this.feedbackIteration) {
            const resultIteration = this.latestResult?.expected?.iteration
                ?? (this.latestResult ? extraPosition(this.latestResult, this.assessment, this.lesson.bars)?.iteration : undefined);
            // Preserve a legitimate early hit for the new loop, but not old-loop text.
            if (resultIteration !== iteration) {
                this.latestResult = null;
                this.lastPlayedAt = -Infinity;
            }
        }
        this.feedbackIteration = iteration;
    }

    showFeedback(result) {
        const now = performance.now();
        if (result.status !== "missed" || now - this.lastPlayedAt > 800) this.latestResult = result;
        if (result.status !== "missed") this.lastPlayedAt = now;
        if (result.status === "extra") {
            const position = extraPosition(result, this.assessment, this.lesson.bars);
            if (position) this.extras = [...this.extras.filter(extra => extra.expires > now),
                { ...position, result, id: ++this.extraSequence, expires: now + 900 }].slice(-6);
        }
    }

    updateFeedback() {
        const apply = (geometry, iteration, page) => {
            if (!geometry) return;
            for (const head of geometry.noteheads) {
                const appearance = noteAppearance(this.assessment, head.ref, iteration, this.disabled);
                const signature = `${iteration}:${appearance.status}:${appearance.errorMs}`;
                if (head.appearance === signature) continue;
                head.appearance = signature;
                head.node.dataset.timing = appearance.status;
                head.node.dataset.iteration = String(iteration);
                head.node.setAttribute("aria-label", appearance.text);
                head.title.textContent = appearance.text;
                for (const glyph of head.node.querySelectorAll("text, path")) {
                    glyph.style.fill = appearance.color;
                    glyph.style.stroke = glyph.tagName.toLowerCase() === "text" ? "none" : appearance.color;
                }
            }
            const visible = this.running ? this.extras.filter(extra => extra.expires > performance.now()
                && extra.iteration === iteration && extra.barIndex === page).slice(-3) : [];
            const signature = visible.map(extra => extra.id).join(":");
            if (signature !== geometry.extraSignature) {
                geometry.extraSignature = signature;
                geometry.extraLayer.replaceChildren();
                for (const [index, extra] of visible.entries()) {
                    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                    text.classList.add("notation-extra-hit");
                    text.setAttribute("x", String(markerX(extra.tick, geometry.anchors)));
                    text.setAttribute("y", String(178 + index * 14));
                    text.setAttribute("fill", NOTATION_COLORS.extra);
                    text.dataset.instrument = extra.result.instrument;
                    text.dataset.tick = String(extra.tick);
                    text.textContent = "+";
                    geometry.extraLayer.append(text);
                }
            }
        };
        apply(this.geometry, this.feedbackIteration, this.page);
        const next = (this.page + 1) % this.model.bars.length;
        apply(this.nextGeometry, this.feedbackIteration + (next === 0 ? 1 : 0), next);
        const output = element("notation-feedback");
        const text = this.latestResult ? notationFeedbackText(this.latestResult) : "Play to see timing feedback.";
        if (output.textContent !== text) {
            output.textContent = text;
            output.style.color = this.latestResult ? feedbackColor(this.latestResult.status) : "";
        }
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
