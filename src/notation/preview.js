import { scoreAnchors } from "./position.js";

// SVG engraving from written-rhythm structures. Audio timing stays outside this renderer.
export function renderPreview(host, example, disabledInstruments = []) {
    const { Renderer, Stave, StaveNote, Voice, Formatter, Beam, Barline, Tuplet } = globalThis.VexFlow;
    const style = getComputedStyle(host);
    const width = Math.max(460, Math.floor(host.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)));
    host.replaceChildren();
    const renderer = new Renderer(host, Renderer.Backends.SVG);
    renderer.resize(width, 220);
    const context = renderer.getContext();
    context.setFillStyle("#242820").setStrokeStyle("#242820");
    const stave = new Stave(12, 50, width - 24);
    stave.addClef("percussion").addTimeSignature("4/4").setEndBarType(Barline.type.DOUBLE);
    stave.setContext(context).draw();
    const beams = [], tuplets = [], engravedParts = [];
    const voices = example.voices.map(part => {
        const notes = part.notes.map(note => {
            const engraved = new StaveNote({ ...note, stemDirection: part.stem });
            for (const [index, ref] of (note.refs ?? []).entries()) {
                if (disabledInstruments.includes(ref.instrument)) engraved.setKeyStyle(index, { fillStyle: "#a4a99f", strokeStyle: "#a4a99f" });
            }
            return engraved;
        });
        for (const indices of part.beams) beams.push(new Beam(indices.map(index => notes[index])));
        for (const indices of part.tuplets ?? []) {
            tuplets.push(new Tuplet(indices.map(index => notes[index]), {
                numNotes: 3, notesOccupied: 2, bracketed: true, location: part.stem === -1 ? -1 : 1,
            }));
        }
        engravedParts.push({ part, notes });
        // Tuplet multipliers must be applied before the strict voice totals its ticks.
        return new Voice({ numBeats: 4, beatValue: 4 }).addTickables(notes);
    });
    new Formatter().joinVoices(voices).formatToStave(voices, stave);
    for (const voice of voices) voice.draw(context, stave);
    for (const beam of beams) beam.setContext(context).draw();
    for (const tuplet of tuplets) tuplet.setContext(context).draw();
    const svg = host.querySelector("svg");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `${example.title}. ${example.feel}. ${example.description}`);
    const positions = engravedParts.flatMap(({ part, notes }) => notes.map((engraved, index) => ({
        note: part.notes[index], voice: part.id,
        x: part.notes[index].rest && part.notes[index].durationTicks === 384
            ? stave.getNoteStartX() + 8 : (engraved.getNoteHeadBeginX() + engraved.getNoteHeadEndX()) / 2,
    })));
    const barStart = Math.floor(example.voices[0].notes[0].writtenTick / 384) * 384;
    const anchors = scoreAnchors(positions, { barStart, endX: stave.getNoteEndX() - 3, feel: example.rhythmFeel ?? "straight" });
    return { svg, width, anchors };
}

export function renderDrumKey(host, entries) {
    const { Renderer, Stave, StaveNote, Formatter } = globalThis.VexFlow;
    host.replaceChildren();
    for (const entry of entries) {
        const item = document.createElement("li");
        const symbol = document.createElement("div");
        symbol.className = "key-symbol";
        const renderer = new Renderer(symbol, Renderer.Backends.SVG);
        renderer.resize(100, 160);
        const context = renderer.getContext();
        const stave = new Stave(5, 25, 90).setContext(context);
        stave.draw();
        const note = new StaveNote({ keys: [entry.key], duration: "4", stemDirection: entry.instrument === "hi_hat_pedal" ? -1 : 1 });
        Formatter.FormatAndDraw(context, stave, [note]);
        const label = document.createElement("strong");
        label.textContent = entry.label;
        const position = document.createElement("span");
        position.textContent = entry.position;
        const svg = symbol.querySelector("svg");
        svg.setAttribute("aria-hidden", "true");
        item.append(symbol, label, position);
        host.append(item);
    }
}
