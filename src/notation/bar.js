import { renderScoreBar, scoreWidth } from "./renderer.js";
import { markerX } from "./position.js";
import { noteAppearance, NOTATION_COLORS } from "./feedback.js";

/** Clone cached engraving into a bar with independent noteheads and overlays. */
export function createScoreBar(sheet, model, { absoluteBar, columns, cache }) {
    const barIndex = absoluteBar % model.bars.length;
    const iteration = Math.floor(absoluteBar / model.bars.length);
    const node = document.createElement("section");
    node.className = "notation-bar";
    node.dataset.absoluteBar = String(absoluteBar);
    node.dataset.barIndex = String(barIndex);
    node.dataset.iteration = String(iteration);
    const label = document.createElement("p");
    label.className = "notation-bar-label";
    label.textContent = `Loop ${iteration + 1} · Bar ${barIndex + 1}`;
    const host = document.createElement("div");
    host.className = "notation-score";
    host.tabIndex = 0;
    host.setAttribute("aria-label", `${label.textContent}; scroll horizontally if needed`);
    node.append(label, host);
    sheet.append(node);
    const width = scoreWidth(host);
    const rowStart = absoluteBar % columns === 0;
    const signature = absoluteBar === 0 ? "initial" : rowStart ? "row" : "continuation";
    const key = `${barIndex}:${width}:${signature}`;
    let template = cache.get(key);
    if (!template) {
        template = renderScoreBar(host, {
            title: model.title, feel: model.feel,
            description: `Bar ${barIndex + 1}`, voices: model.bars[barIndex].voices,
            showClef: rowStart, showMeter: absoluteBar === 0,
        }, width);
        cache.set(key, template);
    }
    const svg = template.svg.cloneNode(true);
    // VexFlow's internal IDs are not used by this view. Do not duplicate them
    // when a repeated bar is cloned; bind each hit through its source note ID.
    for (const child of svg.querySelectorAll("[id]")) child.removeAttribute("id");
    svg.removeAttribute("id");
    host.replaceChildren(svg);
    const marker = document.createElementNS("http://www.w3.org/2000/svg", "line");
    marker.classList.add("notation-playhead");
    marker.setAttribute("y1", "32");
    marker.setAttribute("y2", "188");
    marker.setAttribute("aria-hidden", "true");
    marker.style.display = "none";
    svg.append(marker);
    const extraLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    extraLayer.setAttribute("aria-hidden", "true");
    extraLayer.classList.add("notation-extra-hits");
    svg.append(extraLayer);
    const noteheads = template.noteheads.map(head => {
        const node = svg.querySelector(`[data-note-id="${head.ref.id}"]`);
        return { ref: head.ref, node, title: node.querySelector("title"), appearance: null };
    });
    return { node, host, barIndex, iteration, svg, marker, extraLayer, noteheads,
        anchors: template.anchors, extraSignature: "", feedbackRevision: -1,
        paddingLeft: parseFloat(getComputedStyle(host).paddingLeft) };
}

export function updateScoreFeedback(bar, assessment, disabled) {
    for (const head of bar.noteheads) {
        const appearance = noteAppearance(assessment, head.ref, bar.iteration, disabled);
        const signature = `${bar.iteration}:${appearance.status}:${appearance.errorMs}`;
        if (head.appearance === signature) continue;
        head.appearance = signature;
        head.node.dataset.timing = appearance.status;
        head.node.dataset.iteration = String(bar.iteration);
        head.node.setAttribute("aria-label", appearance.text);
        head.title.textContent = appearance.text;
        for (const glyph of head.node.querySelectorAll("text, path")) {
            glyph.style.fill = appearance.color;
            glyph.style.stroke = glyph.tagName.toLowerCase() === "text" ? "none" : appearance.color;
        }
    }
}

export function updateScoreExtras(bar, extras) {
    const visible = extras.filter(extra => extra.iteration === bar.iteration && extra.barIndex === bar.barIndex).slice(-3);
    const signature = visible.map(extra => extra.id).join(":");
    if (signature !== bar.extraSignature) {
        bar.extraSignature = signature;
        bar.extraLayer.replaceChildren();
        for (const [index, extra] of visible.entries()) {
            const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
            text.classList.add("notation-extra-hit");
            text.setAttribute("x", String(markerX(extra.tick, bar.anchors)));
            text.setAttribute("y", String(178 + index * 14));
            text.setAttribute("fill", NOTATION_COLORS.extra);
            text.dataset.instrument = extra.result.instrument;
            text.dataset.tick = String(extra.tick);
            text.textContent = "+";
            bar.extraLayer.append(text);
        }
    }
}
