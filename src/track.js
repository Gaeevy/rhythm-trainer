import { INSTRUMENTS } from "./instruments.js";
import { TICKS_PER_BEAT } from "./music-time.js";
import { FEEDBACK, feedbackText } from "./feedback.js";

export const VISIBLE_BEATS = 8;
export const PLAYHEAD_POSITION = 0.22;

/** One lesson track and its lane, regardless of instrument or note density. */
export class Track {
    constructor(track, loopBeats, keyLabel = "") {
        this.data = track;
        this.loopBeats = loopBeats;
        this.element = document.createElement("div");
        this.element.className = "track";
        this.element.dataset.instrument = track.instrument;
        const instrument = INSTRUMENTS[track.instrument];
        this.element.style.setProperty("--track-color", instrument.color);
        const label = document.createElement("div");
        label.className = "track-label";
        const symbol = document.createElement("span");
        symbol.className = "instrument-symbol";
        symbol.textContent = instrument.symbol;
        const name = document.createElement("span");
        name.className = "track-name";
        name.textContent = instrument.label;
        const key = document.createElement("kbd");
        key.textContent = keyLabel;
        this.key = key;
        name.append(key);
        const details = document.createElement("div");
        details.className = "track-details";
        this.feedback = document.createElement("span");
        this.feedback.className = "track-feedback";
        this.feedback.setAttribute("role", "status");
        this.feedback.setAttribute("aria-label", `${instrument.label} timing`);
        this.showFeedback(null);
        details.append(name, this.feedback);
        label.append(symbol, details);
        this.canvas = document.createElement("canvas");
        this.canvas.setAttribute("role", "img");
        this.canvas.setAttribute("aria-label", `${instrument.label}: ${track.notes.length} notes per loop`);
        this.element.append(label, this.canvas);
    }

    setKeyLabel(label) {
        this.key.textContent = label;
    }

    showFeedback(result) {
        this.feedback.textContent = result ? feedbackText(result) : "Waiting";
        this.feedback.dataset.status = result?.status ?? "waiting";
        this.feedback.style.color = result ? FEEDBACK[result.status].color : "";
    }

    render(beat, assessment = null) {
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;
        const ratio = window.devicePixelRatio || 1;
        if (this.canvas.width !== Math.round(width * ratio) || this.canvas.height !== Math.round(height * ratio)) {
            this.canvas.width = Math.round(width * ratio);
            this.canvas.height = Math.round(height * ratio);
        }
        const context = this.canvas.getContext("2d");
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.clearRect(0, 0, width, height);
        const scale = width / VISIBLE_BEATS;
        const noteWidth = Math.min(10, scale / 10);
        const left = beat - VISIBLE_BEATS * PLAYHEAD_POSITION;
        const right = left + VISIBLE_BEATS;
        for (let gridBeat = Math.ceil(left); gridBeat <= right; gridBeat++) {
            const x = (gridBeat - left) * scale;
            context.strokeStyle = gridBeat % 4 === 0 ? "#475348" : "#2c3730";
            context.lineWidth = 1;
            context.beginPath();
            context.moveTo(x, 0);
            context.lineTo(x, height);
            context.stroke();
        }
        context.strokeStyle = "#364137";
        context.beginPath();
        context.moveTo(0, height / 2);
        context.lineTo(width, height / 2);
        context.stroke();
        for (let loop = Math.max(0, Math.floor(left / this.loopBeats)); loop <= Math.floor(right / this.loopBeats); loop++) {
            for (const [index, tick] of this.data.notes.entries()) {
                const noteBeat = loop * this.loopBeats + tick / TICKS_PER_BEAT;
                if (noteBeat < left || noteBeat > right) continue;
                const x = (noteBeat - left) * scale;
                context.globalAlpha = noteBeat < beat - 0.08 ? 0.3 : 1;
                const result = assessment?.resultFor(this.data.instrument, loop, index);
                context.fillStyle = result ? FEEDBACK[result.status].color : INSTRUMENTS[this.data.instrument].color;
                context.beginPath();
                context.roundRect(x - noteWidth / 2, height / 2 - 13, noteWidth, 26, 2);
                context.fill();
                if (result?.status === "missed") {
                    context.globalAlpha = 1;
                    context.font = "14px sans-serif";
                    context.textAlign = "center";
                    context.fillText("×", x, height / 2 - 21);
                }
            }
        }
        context.globalAlpha = 1;
        if (assessment) {
            context.font = "bold 13px sans-serif";
            context.textAlign = "center";
            for (const hit of assessment.tracks.get(this.data.instrument).hits) {
                const hitBeat = (hit.correctedTime - assessment.origin) / assessment.secondsPerBeat;
                if (hitBeat < left || hitBeat > right) continue;
                const x = (hitBeat - left) * scale;
                context.fillStyle = FEEDBACK[hit.status].color;
                context.fillText(FEEDBACK[hit.status].symbol, x, height / 2 + 30);
            }
        }
        context.fillStyle = "#f4e7b9";
        context.fillRect(width * PLAYHEAD_POSITION - 1, 0, 2, height);
    }
}
