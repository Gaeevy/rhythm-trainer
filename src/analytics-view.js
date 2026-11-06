import { barClosingDelay, completedBarCount, resultBar, scorePractice, TREND_BARS } from "./analytics.js";
import { INSTRUMENTS } from "./instruments.js";

const text = (node, value) => { if (node.textContent !== value) node.textContent = value; };

function showScore(row, metric) {
    const score = row.querySelector("output"), trend = row.querySelector(".analytics-trend");
    text(score, metric?.score == null ? "—" : String(Math.round(metric.score)));
    const symbols = { up: "↑", down: "↓", steady: "~" };
    text(trend, symbols[metric?.trend] ?? "");
    const label = metric?.change == null ? "Building trend"
        : `${metric.trend === "steady" ? "Approximately unchanged" : metric.trend === "up" ? "Improving" : "Declining"}; `
            + `${Math.abs(metric.change).toFixed(1)} points ${metric.change < 0 ? "lower" : "higher"} than ${TREND_BARS} bars ago`;
    if (trend.title !== label) {
        trend.title = label;
        trend.setAttribute("aria-label", label);
    }
}

/** Display-only snapshot, gated on completed bars and canonical result changes. */
export class AnalyticsView {
    constructor(host) {
        this.host = host;
        this.rows = new Map();
        this.assessment = null;
        this.completedBars = null;
        this.dirty = false;
    }

    setInstruments(instruments) {
        this.rows.clear();
        for (const instrument of instruments) {
            const row = document.createElement("div");
            row.className = "analytics-pad";
            row.dataset.instrument = instrument;
            const name = document.createElement("span");
            name.textContent = INSTRUMENTS[instrument].label;
            const score = document.createElement("output");
            score.setAttribute("aria-label", `${INSTRUMENTS[instrument].label} score out of 100`);
            const trend = document.createElement("span");
            trend.className = "analytics-trend";
            row.append(name, score, trend);
            this.rows.set(instrument, row);
            showScore(row, null);
        }
        this.host.querySelector(".analytics-pads").replaceChildren(...this.rows.values());
        this.completedBars = null;
    }

    onResult(result) {
        // An unfinished bar cannot affect displayed scores. Late corrections
        // and extras in completed bars can, even when no new bar has elapsed.
        if (this.assessment && this.completedBars > 0 && resultBar(this.assessment, result) < this.completedBars) {
            this.dirty = true;
        }
    }

    update(assessment, elapsedSeconds) {
        if (assessment !== this.assessment) {
            this.assessment = assessment;
            this.closingDelay = assessment ? barClosingDelay(assessment) : 0;
            this.completedBars = null;
            this.dirty = false;
        }
        const completedBars = assessment ? completedBarCount(assessment, elapsedSeconds, this.closingDelay) : 0;
        if (completedBars === this.completedBars && !this.dirty) return;
        this.completedBars = completedBars;
        this.dirty = false;
        const report = assessment && completedBars > 0 ? scorePractice(assessment, completedBars) : null;
        showScore(this.host.querySelector(".analytics-total"), report?.overall);
        const consistency = this.host.querySelector(".analytics-consistency");
        consistency.hidden = !report?.consistency;
        showScore(consistency, report?.consistency);
        for (const [instrument, row] of this.rows) showScore(row, report?.pads.find(pad => pad.instrument === instrument));
        this.host.dataset.completedBars = String(completedBars);
    }
}
