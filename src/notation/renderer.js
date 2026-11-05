import { INSTRUMENTS } from "../instruments.js";
import { TICKS_PER_BAR, BEATS_PER_BAR } from "../music-time.js";
import { DRUM_KEY } from "./drum-key.js";
import { minimumBarWidth } from "./sheet.js";
import { scoreAnchors } from "./position.js";

function addHiHatMark(note, index, entry) {
    if (!entry.articulation) return;
    const { Articulation, Glyphs, Modifier } = globalThis.VexFlow;
    note.addModifier(new Articulation(Glyphs[entry.articulation]).setPosition(Modifier.Position.ABOVE), index);
}

export function scoreWidth(host, bar) {
    return Math.max(minimumBarWidth(bar), host.getBoundingClientRect().width);
}

// SVG engraving from written-rhythm structures. Audio timing stays outside this renderer.
export function renderScoreBar(host, example, width = scoreWidth(host, example)) {
    const { Renderer, Stave, StaveNote, Voice, Formatter, Beam, Barline, Tuplet } = globalThis.VexFlow;
    host.replaceChildren();
    const renderer = new Renderer(host, Renderer.Backends.SVG);
    const height = example.voices.some(part => part.stem < 0 && part.tuplets.length) ? 220 : 190;
    renderer.resize(width, height);
    const context = renderer.getContext();
    context.setFillStyle("#242820").setStrokeStyle("#242820");
    const stave = new Stave(0, 50, width);
    if (example.showClef !== false) stave.addClef("percussion");
    if (example.showMeter !== false) stave.addTimeSignature(`${BEATS_PER_BAR}/4`);
    stave.setBegBarType(example.showClef === false ? Barline.type.NONE : Barline.type.SINGLE);
    stave.setEndBarType(Barline.type.SINGLE);
    stave.setContext(context).draw();
    // Mark closed at the start of each bar and after an open hit. Repeating +
    // above every closed sixteenth would hide the rhythm in dense grooves.
    const hiHatMarks = new Set();
    let previousHiHat;
    const hiHatRefs = example.voices.flatMap(part => part.notes.flatMap(note => note.refs ?? []))
        .filter(ref => ["hi_hat_closed", "hi_hat_open"].includes(ref.instrument))
        .sort((a, b) => a.performanceTick - b.performanceTick);
    for (const ref of hiHatRefs) {
        if (ref.instrument === "hi_hat_open" || previousHiHat !== "hi_hat_closed") hiHatMarks.add(ref.id);
        previousHiHat = ref.instrument;
    }
    const beams = [], tuplets = [], engravedParts = [];
    const voices = example.voices.map(part => {
        const notes = part.notes.map(note => {
            const engraved = new StaveNote({ ...note, stemDirection: part.stem });
            for (const [index, ref] of (note.refs ?? []).entries()) {
                if (hiHatMarks.has(ref.id)) addHiHatMark(engraved, index, DRUM_KEY[ref.instrument]);
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
        return new Voice({ numBeats: BEATS_PER_BAR, beatValue: 4 }).addTickables(notes);
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
        x: part.notes[index].rest && part.notes[index].durationTicks === TICKS_PER_BAR
            ? stave.getNoteStartX() + 8 : (engraved.getNoteHeadBeginX() + engraved.getNoteHeadEndX()) / 2,
    })));
    const barStart = Math.floor(example.voices[0].notes[0].writtenTick / TICKS_PER_BAR) * TICKS_PER_BAR;
    const anchors = scoreAnchors(positions, { barStart, endX: stave.getNoteEndX() - 3, feel: example.feel });
    const noteheads = engravedParts.flatMap(({ part, notes }) => notes.flatMap((engraved, index) => {
        return part.notes[index].refs.map((ref, headIndex) => {
            const node = engraved.noteHeads[headIndex].getSVGElement();
            if (!node) throw new Error("A score notehead could not be identified.");
            node.dataset.noteId = ref.id;
            node.dataset.instrument = ref.instrument;
            const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
            node.prepend(title);
            return { ref, node, title, appearance: null };
        });
    }));
    return { svg, width, height, anchors, noteheads };
}

export function renderDrumKey(host, instruments) {
    const { Renderer, Stave, StaveNote, Formatter } = globalThis.VexFlow;
    host.replaceChildren();
    for (const instrument of instruments) {
        const entry = DRUM_KEY[instrument];
        const item = document.createElement("li");
        const symbol = document.createElement("div");
        symbol.className = "key-symbol";
        const renderer = new Renderer(symbol, Renderer.Backends.SVG);
        renderer.resize(100, 160);
        const context = renderer.getContext();
        const stave = new Stave(5, 25, 90).setContext(context);
        stave.draw();
        const note = new StaveNote({ keys: [entry.key], duration: "4", stemDirection: instrument === "hi_hat_pedal" ? -1 : 1 });
        addHiHatMark(note, 0, entry);
        Formatter.FormatAndDraw(context, stave, [note]);
        const label = document.createElement("strong");
        label.textContent = INSTRUMENTS[instrument].label;
        const position = document.createElement("span");
        position.textContent = entry.position;
        const svg = symbol.querySelector("svg");
        svg.setAttribute("aria-hidden", "true");
        item.append(symbol, label, position);
        host.append(item);
    }
}
