import { barClosingDelay, completedBarCount, scorePractice } from "./analytics.js";
import { INSTRUMENTS } from "./instruments.js";

const text = (node, value) => { if (node.textContent !== value) node.textContent = value; };

function showScore(row, metric) {
    const score = row.querySelector("output"), trend = row.querySelector(".analytics-trend");
    text(score, metric?.score == null ? "—" : String(Math.round(metric.score)));
    const symbols = { up: "↑", down: "↓", steady: "~" };
    text(trend, symbols[metric?.trend] ?? "");
    const label = metric?.change == null ? "Building trend"
        : `${metric.trend === "steady" ? "Approximately unchanged" : metric.trend === "up" ? "Improving" : "Declining"}; `
            + `${Math.abs(metric.change).toFixed(1)} points ${metric.change < 0 ? "lower" : "higher"} than 8 bars ago`;
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
        this.key = null;
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
        this.key = null;
    }

    update(assessment, elapsedSeconds) {
        if (assessment !== this.assessment) {
            this.assessment = assessment;
            this.closingDelay = assessment ? barClosingDelay(assessment) : 0;
            this.key = null;
        }
        const completedBars = assessment ? completedBarCount(assessment, elapsedSeconds, this.closingDelay) : 0;
        const key = `${completedBars}:${assessment?.hits.length ?? 0}:${assessment?.counts.missed ?? 0}`;
        if (key === this.key) return;
        this.key = key;
        const report = assessment && completedBars > 0 ? scorePractice(assessment, completedBars) : null;
        showScore(this.host.querySelector(".analytics-total"), report?.overall);
        const consistency = this.host.querySelector(".analytics-consistency");
        consistency.hidden = !report?.consistency;
        showScore(consistency, report?.consistency);
        text(this.host.querySelector(".analytics-blend"), !report ? ""
            : report.consistency ? "70% pads · 30% consistency" : "Pads only");
        text(this.host.querySelector(".analytics-groups"), !report?.consistency ? ""
            : report.consistency.groups === 0 ? "No groups yet"
                : `${report.consistency.completeGroups}/${report.consistency.groups} groups complete`);
        for (const [instrument, row] of this.rows) showScore(row, report?.pads.find(pad => pad.instrument === instrument));
        this.host.dataset.completedBars = String(completedBars);
        const progress = this.rows.size === 0 ? "No enabled pads"
            : completedBars === 0 ? "Waiting for a completed bar"
            : `${completedBars} completed ${completedBars === 1 ? "bar" : "bars"} · `
                + (report?.overall.score === null ? (report?.padScore.score === null ? "No scored notes" : "Waiting for simultaneous notes")
                    : completedBars < 16 ? `Building trend (${completedBars}/16 bars)`
                    : report?.overall.trend == null ? "Building trend" : "Trend compares with 8 bars ago");
        text(this.host.querySelector(".analytics-progress"), progress);
    }
}
