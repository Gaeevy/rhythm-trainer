import { BEATS_PER_BAR } from "../music-time.js";
import { extraPosition, notationFeedbackText, feedbackColor } from "./feedback.js";
import { sheetWindow, sheetPosition } from "./sheet.js";
import { scorePosition, markerX } from "./position.js";
import { lessonNotation } from "./model.js";
import { renderDrumKey } from "./renderer.js";
import { createScoreBar, updateScoreFeedback, updateScoreExtras } from "./bar.js";
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
        this.feedbackRevision = 0;
        this.displayedResult = undefined;
        this.cache = new Map();
        this.cards = new Map();
        this.absoluteBar = 0;
        this.columns = 2;
        element("notation-previous").onclick = () => this.changePage(-1);
        element("notation-next").onclick = () => this.changePage(1);
        this.observer = new ResizeObserver(() => {
            const width = element("notation-scroll").clientWidth;
            if (width === this.viewportWidth) return;
            this.viewportWidth = width;
            cancelAnimationFrame(this.resizeFrame);
            this.resizeFrame = requestAnimationFrame(() => {
                if (this.active && this.model) {
                    this.cache.clear();
                    this.renderSafely(true);
                }
            });
        });
        this.observer.observe(element("notation-scroll"));
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
        this.absoluteBar = 0;
        this.cards.clear();
        element("notation-sheet").replaceChildren();
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
        if (this.active && this.model) this.renderSafely(true);
    }

    async show(view) {
        const request = ++this.request;
        this.active = view === "notation";
        element("notation-error").hidden = true;
        this.updateVisibility();
        if (!this.active || !this.lesson) return;

        try {
            const model = this.model ?? lessonNotation(this.lesson);
            await loadRenderer();
            if (request !== this.request || !this.active) return;
            this.model = model;
            renderDrumKey(element("notation-key"), this.lesson.tracks.map(track => track.instrument));
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
        this.absoluteBar = Math.max(0, this.absoluteBar + delta);
        this.renderSafely();
        const card = this.cards.get(this.absoluteBar);
        element("notation-scroll").scrollTop = card.node.offsetTop - element("notation-sheet").offsetTop;
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
            this.absoluteBar = 0;
            this.cards.clear();
            element("notation-sheet").replaceChildren();
            element("notation-scroll").scrollTop = 0;
        }
        if (running && this.model) this.selectFeedbackIteration(scorePosition(beat, this.model.bars.length).loop - 1);
        if (!this.active || !this.model) return;
        const absoluteBar = Math.max(0, Math.floor(beat / BEATS_PER_BAR));
        if (running && absoluteBar !== this.absoluteBar) {
            this.absoluteBar = absoluteBar;
            this.renderSafely();
        } else if (!this.cards.size) this.renderSafely();
        else this.updateMarker();
    }

    renderSafely(rebuild = false) {
        try {
            if (this.running) this.absoluteBar = Math.max(0, Math.floor(this.beat / BEATS_PER_BAR));
            const columns = element("notation-scroll").clientWidth >= 1000 ? 2 : 1;
            if (rebuild || columns !== this.columns) {
                this.cards.clear();
                element("notation-sheet").replaceChildren();
            }
            this.columns = columns;
            const sheet = element("notation-sheet");
            sheet.style.setProperty("--score-columns", columns);
            const window = sheetWindow(this.absoluteBar, columns);
            // Preserve the viewport when old rows leave the bounded window.
            const retained = this.cards.get(window.start);
            const before = retained?.node.offsetTop;
            for (const [index, card] of this.cards) if (index < window.start || index >= window.end) {
                card.node.remove();
                this.cards.delete(index);
            }
            for (let index = window.start; index < window.end; index++) if (!this.cards.has(index)) {
                this.cards.set(index, createScoreBar(sheet, this.model, { absoluteBar: index, columns, cache: this.cache }));
            }
            // Backward navigation or a delayed frame can replace the whole window.
            for (const [index, card] of [...this.cards].sort((a, b) => a[0] - b[0])) {
                if (sheet.children[index - window.start] !== card.node) sheet.append(card.node);
            }
            if (retained && before !== undefined) element("notation-scroll").scrollTop += retained.node.offsetTop - before;
            this.page = this.absoluteBar % this.model.bars.length;
            element("notation-page").textContent = `Bar ${this.page + 1} of ${this.model.bars.length}`;
            element("notation-loop").textContent = `Loop ${Math.floor(this.absoluteBar / this.model.bars.length) + 1}`;
            element("notation-feel").textContent = this.model.feel === "swing" ? "Swing · 2:1 eighths" : "Straight · literal rhythm";
            for (const [index, card] of this.cards) {
                card.node.classList.toggle("is-current", index === this.absoluteBar);
                card.host.removeAttribute("id");
                card.marker.style.display = "none";
            }
            this.geometry = this.cards.get(this.absoluteBar);
            this.geometry.host.id = "notation-score";
            const next = this.cards.get(this.absoluteBar + 1);
            if (next) next.host.id = "notation-next-score";
            this.updateMarker();
        } catch (error) { this.fallback(error); }
    }

    updateMarker() {
        element("notation-previous").disabled = this.running || this.absoluteBar === 0;
        element("notation-next").disabled = this.running;
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
            const viewport = element("notation-scroll"), sheet = element("notation-sheet");
            const row = this.cards.get(this.absoluteBar - this.absoluteBar % this.columns);
            const position = sheetPosition(this.absoluteBar, this.model.bars.length, this.columns, state.tick);
            viewport.scrollTop = Math.max(0, row.node.offsetTop - sheet.offsetTop
                + position.rowProgress * row.node.offsetHeight - viewport.clientHeight / 2);
            const host = this.geometry.host;
            const left = x + this.geometry.paddingLeft;
            if (left < host.scrollLeft + 20 || left > host.scrollLeft + host.clientWidth - 20) {
                host.scrollLeft = Math.max(0, left - host.clientWidth / 2);
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
        this.feedbackRevision++;
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
        const now = performance.now();
        const extras = this.running ? this.extras.filter(extra => extra.expires > now) : [];
        for (const card of this.cards.values()) {
            if (card.feedbackRevision !== this.feedbackRevision) {
                updateScoreFeedback(card, this.assessment, this.disabled);
                card.feedbackRevision = this.feedbackRevision;
            }
            updateScoreExtras(card, extras);
        }
        if (this.displayedResult !== this.latestResult) {
            this.displayedResult = this.latestResult;
            const output = element("notation-feedback");
            output.textContent = this.latestResult ? notationFeedbackText(this.latestResult) : "Play to see timing feedback.";
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
