import { TICKS_PER_BAR } from "../music-time.js";
import { renderScoreBar, scoreWidth } from "./renderer.js";
import { markerX } from "./position.js";
import { noteAppearance, noteheadShift, NOTATION_COLORS } from "./feedback.js";

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
    label.textContent = String(absoluteBar + 1);
    const host = document.createElement("div");
    host.className = "notation-score";
    host.tabIndex = 0;
    host.setAttribute("aria-label", `Loop ${iteration + 1}, bar ${barIndex + 1}; scroll horizontally if needed`);
    node.append(label, host);
    sheet.append(node);
    const width = scoreWidth(host, model.bars[barIndex]);
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
    marker.setAttribute("y2", String(template.height - 20));
    marker.setAttribute("aria-hidden", "true");
    marker.style.display = "none";
    svg.append(marker);
    const extraLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    extraLayer.setAttribute("aria-hidden", "true");
    extraLayer.classList.add("notation-extra-hits");
    svg.append(extraLayer);
    const noteheads = template.noteheads.map(head => {
        const node = svg.querySelector(`[data-note-id="${head.ref.id}"]`);
        // Wrap the glyph, preserving VexFlow's transforms and fixed stems/beams.
        // Cached templates and later loop copies must never inherit a played offset.
        const bounds = node.getBBox();
        const motion = document.createElementNS("http://www.w3.org/2000/svg", "g");
        motion.classList.add("notation-notehead-motion");
        node.before(motion);
        motion.append(node);
        const tick = head.ref.performanceTick % TICKS_PER_BAR;
        const targetX = markerX(tick, template.anchors);
        // Bound motion inside neighboring time columns, including dense subdivisions.
        const gap = Math.min(...template.anchors.filter(anchor => anchor.tick !== tick)
            .map(anchor => Math.abs(anchor.x - targetX)).filter(distance => distance > 0));
        // Halve the full geometry budget too, so capped offsets also move half as far.
        const availableTravel = Math.max(0, Math.min(gap * 0.4,
            bounds.x - 2, template.width - bounds.x - bounds.width - 2)) * 0.5;
        return { ref: head.ref, node, motion, availableTravel,
            title: node.querySelector("title"), appearance: null };
    });
    return { node, host, barIndex, iteration, svg, marker, extraLayer, noteheads,
        anchors: template.anchors, height: template.height, extraSignature: "", feedbackRevision: -1,
        paddingLeft: parseFloat(getComputedStyle(host).paddingLeft) };
}

export function updateScoreFeedback(bar, assessment, disabled) {
    for (const head of bar.noteheads) {
        const appearance = noteAppearance(assessment, head.ref, bar.iteration, disabled);
        const signature = `${bar.iteration}:${appearance.status}:${appearance.errorMs}`;
        if (head.appearance === signature) continue;
        // Shake only a newly missed displayed head, never a replayed historical miss
        // after resize/view changes. Correction/reset removes the class immediately.
        const newMiss = head.appearance !== null && head.node.dataset.timing !== "missed" && appearance.status === "missed";
        head.motion.classList.toggle("is-new-miss", newMiss);
        head.appearance = signature;
        head.node.dataset.timing = appearance.status;
        head.node.dataset.iteration = String(bar.iteration);
        const shift = noteheadShift(appearance, head.availableTravel);
        head.motion.dataset.timing = appearance.status;
        head.motion.dataset.shift = String(shift);
        head.motion.style.transform = `translateX(${shift}px)`;
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
            text.setAttribute("y", String(bar.height - 32 + index * 14));
            text.setAttribute("fill", NOTATION_COLORS.extra);
            text.dataset.instrument = extra.result.instrument;
            text.dataset.tick = String(extra.tick);
            text.textContent = "+";
            bar.extraLayer.append(text);
        }
    }
}
