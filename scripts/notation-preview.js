import { DRUM_KEY } from "../src/notation/drum-key.js";
import { lessonNotation } from "../src/notation/model.js";
import { parseLesson } from "../src/lesson.js";
import { renderPreview, renderDrumKey } from "../src/notation/preview.js";

const status = document.getElementById("preview-status");
try {
    await document.fonts.ready;
    if (!document.fonts.check("20px Bravura") || !document.fonts.check("14px Academico")) {
        throw new Error("The bundled notation fonts did not load.");
    }
    const scores = [];
    for (const id of ["californication", "swing-01", "swing-03"]) {
        const response = await fetch(new URL(`../lessons/${id}.json`, import.meta.url));
        if (!response.ok) throw new Error(`Could not load ${id} (HTTP ${response.status})`);
        const lesson = parseLesson(await response.text());
        const model = lessonNotation(lesson);
        const card = document.createElement("section");
        card.className = "example";
        card.dataset.example = id;
        const header = document.createElement("header");
        const title = document.createElement("h2");
        title.textContent = model.title;
        const feel = document.createElement("p");
        feel.className = "feel";
        feel.textContent = model.feel === "swing" ? "Swing · eighth notes played long–short (2:1)" : "Straight · even subdivisions";
        header.append(title, feel);
        card.append(header);
        document.getElementById("examples").append(card);
        for (const bar of model.bars) {
            const label = document.createElement("p");
            label.className = "bar-label";
            label.textContent = `Bar ${bar.index + 1} of ${lesson.bars}`;
            const host = document.createElement("div");
            host.className = "score";
            host.tabIndex = 0;
            host.dataset.bar = String(bar.index);
            host.setAttribute("aria-label", `${model.title}, ${label.textContent}; scroll horizontally if needed`);
            const example = { title: `${model.title}, ${label.textContent}`, feel: feel.textContent, rhythmFeel: model.feel,
                description: "Converted from the lesson JSON; playback ticks are unchanged.", voices: bar.voices };
            card.append(label, host);
            renderPreview(host, example);
            scores.push([host, example]);
        }
        const hint = document.createElement("p");
        hint.className = "scroll-hint";
        hint.textContent = "Scroll the score horizontally if needed →";
        const description = document.createElement("p");
        description.className = "description";
        description.textContent = id === "swing-03"
            ? "Bar 2: the snare's beat 3 starts with an eighth-note triplet rest, then two snare notes. The ride keeps its quarter note."
            : "Read directly from the lesson JSON. The guide and scoring use the original hit times.";
        card.append(hint, description);
        const details = document.createElement("details");
        details.className = "json-example";
        const summary = document.createElement("summary");
        summary.textContent = "Lesson notation metadata";
        const pre = document.createElement("pre");
        pre.textContent = JSON.stringify({ version: lesson.version, notation: lesson.notation }, null, 2);
        details.append(summary, pre);
        card.append(details);
    }
    renderDrumKey(document.getElementById("drum-key"), Object.entries(DRUM_KEY)
        .filter(([id]) => ["hi_hat_closed", "ride", "snare", "kick", "hi_hat_pedal"].includes(id)).map(([, key]) => key));
    let frame;
    const observer = new ResizeObserver(() => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
            for (const [host, example] of scores) renderPreview(host, example);
        });
    });
    for (const [host] of scores) observer.observe(host);
    status.textContent = "Ready for review · Three lessons loaded from JSON · Playback ticks unchanged";
    document.documentElement.dataset.previewReady = "true";
} catch (error) {
    status.dataset.error = "true";
    status.textContent = `Could not render notation: ${error.message}. Reload the page to retry.`;
}
