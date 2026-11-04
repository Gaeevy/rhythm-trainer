import { DRUM_KEY, NOTATION_PREVIEWS } from "./fixtures/notation.js";
import { renderPreview, renderDrumKey } from "../src/notation/preview.js";

const status = document.getElementById("preview-status");
try {
    // The pinned bundle embeds Bravura and Academico; wait before measuring glyphs.
    await document.fonts.ready;
    if (!document.fonts.check("20px Bravura") || !document.fonts.check("14px Academico")) {
        throw new Error("The bundled notation fonts did not load.");
    }
    const scores = [];
    for (const example of NOTATION_PREVIEWS) {
        const card = document.createElement("section");
        card.className = "example";
        card.dataset.example = example.id;
        const header = document.createElement("header");
        const title = document.createElement("h2");
        title.textContent = example.title;
        const feel = document.createElement("p");
        feel.className = "feel";
        feel.textContent = example.feel;
        header.append(title, feel);
        const host = document.createElement("div");
        host.className = "score";
        host.tabIndex = 0;
        host.setAttribute("aria-label", `${example.title} score; scroll horizontally if needed`);
        const hint = document.createElement("p");
        hint.className = "scroll-hint";
        hint.textContent = "Scroll the score horizontally if needed →";
        const description = document.createElement("p");
        description.className = "description";
        description.textContent = example.description;
        card.append(header, host, hint, description);
        document.getElementById("examples").append(card);
        renderPreview(host, example);
        scores.push([host, example]);
    }
    renderDrumKey(document.getElementById("drum-key"), DRUM_KEY);
    let frame;
    const observer = new ResizeObserver(() => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
            for (const [host, example] of scores) renderPreview(host, example);
        });
    });
    for (const [host] of scores) observer.observe(host);
    status.textContent = "Ready for review · Straight and Swing · One bar each";
    document.documentElement.dataset.previewReady = "true";
} catch (error) {
    status.dataset.error = "true";
    status.textContent = `Could not render notation: ${error.message}. Reload the page to retry.`;
}
