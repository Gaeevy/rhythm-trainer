import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { FIXTURE_LESSONS } from "../fixtures/lessons.js";
import { lessonNotation } from "../../src/notation/model.js";
import { BUNDLED_LESSONS } from "../../generated/lesson-catalog.js";
import { runtimeRoot } from "./server.mjs";
import { mockMidi, mockFixtureLessons, selectLesson, waitForLesson, setBpm, selectView, oneScoreColumn, seedLanes, ready, playing, stopped, observePlayback, timedKey } from "./helpers.mjs";

export async function notationFlow(browser, url) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await mockMidi(context, { ports: ["kit"] });
    await seedLanes(context);
    try {
        const page = await context.newPage();
        const errors = [], rendererRequests = [];
        page.on("pageerror", error => errors.push(error.message));
        page.on("request", request => { if (request.url().includes("vexflow-bravura.js")) rendererRequests.push(request.url()); });
        page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`); });
        await page.goto(url);
        await ready(page);
        assert.equal(await page.locator("#timeline").isVisible(), true);
        assert.equal(rendererRequests.length, 0, "Lanes does not load the notation library");
        await selectLesson(page, "swing-03");
        await waitForLesson(page, "swing-03");
        await selectView(page, "notation");
        await page.locator("#notation-score svg").waitFor();
        assert.equal(await page.locator("#timeline").isVisible(), false);
        assert.equal(await page.locator("#notation-page").textContent(), "Bar 1 of 2");
        await page.locator("#notation-next").click();
        assert.equal(await page.locator("#notation-page").textContent(), "Bar 2 of 2");
        assert.equal(await page.locator("#notation-score .vf-tuplet").count(), 1);
        await page.setViewportSize({ width: 390, height: 844 });
        await oneScoreColumn(page);
        assert.equal(await page.locator("#notation-page").textContent(), "Bar 2 of 2");
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        if (new URL(url).pathname === "/") await page.screenshot({ path: "/tmp/rhythm-notation-app-narrow.png", fullPage: true });
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.locator("#practice-panel > summary").click();
        await page.locator("#count-in").uncheck();
        await setBpm(page, 300);
        await observePlayback(page);
        await page.locator("#notation-score").focus();
        await page.keyboard.press("Space");
        await playing(page);
        await page.waitForFunction(() => window.smoke.audio.context.getOutputTimestamp().performanceTime > 0);
        const origin = await page.evaluate(() => window.smoke.assessment.origin);
        await selectView(page, "lanes");
        await selectView(page, "notation");
        await page.locator("#notation-score svg").waitFor();
        assert.equal(await page.locator("#start-stop").getAttribute("data-running"), "true");
        assert.equal(await page.evaluate(() => window.smoke.assessment.origin), origin);
        const result = await timedKey(page, "KeyF", 0);
        assert.equal(result.status, "on_time");
        for (const [note, expected] of [[51, "on_time"], [59, "extra"]]) {
            assert.equal(await page.evaluate(({ note }) => {
                window.midiTest.sendData("kit", [0x99, note, 77], window.smoke.stamp(0));
                return window.smoke.assessment.hits.at(-1).status;
            }, { note }), expected);
        }
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.evaluate(() => {
            window.twoBarNodes = [0, 1].map(index => {
                const node = document.querySelector(`[data-absolute-bar="${index}"]`);
                return { node, x: node.getBoundingClientRect().x };
            });
        });
        await page.waitForFunction(() => Number(document.querySelector("#session-loops").textContent) >= 1);
        assert.equal(await page.evaluate(() => window.twoBarNodes.every(({ node, x }, index) =>
            document.querySelector(`[data-absolute-bar="${index}"]`) === node && node.getBoundingClientRect().x === x)), true,
        "A two-bar lesson stays left/right in the same row across bar and loop transitions");
        await page.locator("#notation-score").focus();
        const beforeRealKey = await page.evaluate(() => window.smoke.assessment.hits.length);
        await page.keyboard.press("f");
        assert.equal(await page.evaluate(() => window.smoke.assessment.hits.length), beforeRealKey + 1);
        assert.equal(await page.evaluate(() => window.smoke.assessment.hits.at(-1).source), "keyboard");
        await page.getByRole("button", { name: "Disable Ride in notation", exact: true }).click();
        await stopped(page);
        assert.equal(await page.locator("#score-on_time").textContent(), "0");
        assert.equal(await page.evaluate(() => [...document.querySelectorAll("#notation-score text")]
            .some(node => getComputedStyle(node).fill === "rgb(164, 169, 159)")), true, "Disabled noteheads are dimmed");
        for (const name of ["Hi-hat pedal", "Snare", "Kick"]) {
            await page.getByRole("button", { name: `Disable ${name} in notation`, exact: true }).click();
        }
        await page.locator("#notation-score").focus();
        await page.keyboard.press("Space");
        await playing(page);
        assert.equal(await page.evaluate(() => window.smoke.assessment.tracks.size), 0);
        await page.keyboard.press("Space");
        await stopped(page);
        await page.reload();
        await ready(page);
        await page.locator("#notation-score svg").waitFor();
        assert.equal(await page.locator('#notation-instruments button[aria-pressed="false"]').count(), 4);
        assert.equal(await page.locator("#view-notation").getAttribute("aria-pressed"), "true");
        await selectLesson(page, "fascination-street");
        await page.waitForFunction(() => document.querySelector("#notation-page").textContent === "Bar 1 of 4");
        await page.locator("#notation-next").click();
        assert.equal(await page.locator("#notation-page").textContent(), "Bar 2 of 4");
        await selectLesson(page, "swing-ride");
        await page.waitForFunction(() => document.querySelector("#notation-page").textContent === "Bar 1 of 1");
        assert.equal(await page.locator("#notation-instruments button").count(), 4, "Empty tracks retain their controls");
        // Unsupported ticks are a test-only fixture; all production lessons now render.
        await page.route("**/lessons/Songs/come-undone.json", route => route.fulfill({ json: {
            version: 1, title: "Unsupported test rhythm", bpm: 80, bars: 1, time_signature: [4, 4],
            tracks: [{ instrument: "snare", notes: [0, 383] }],
        } }));
        await selectLesson(page, "come-undone");
        await page.locator("#notation-error").waitFor();
        assert.equal(await page.locator("#timeline").isVisible(), true);
        assert.equal(await page.locator("#start-stop").isEnabled(), true);
        await selectLesson(page, "swing-03");
        await page.locator("#notation-score svg").waitFor();
        assert.equal(await page.locator("#notation-error").isVisible(), false);
        if (new URL(url).pathname === "/") await page.screenshot({ path: "/tmp/rhythm-notation-app-desktop.png", fullPage: true });
        assert.deepEqual(errors, []);
    } finally { await context.close(); }

    const recovery = await browser.newContext();
    await mockMidi(recovery);
    await seedLanes(recovery);
    try {
        const page = await recovery.newPage();
        await page.goto(url);
        await ready(page);
        await page.route("**/assets/vendor/vexflow/vexflow-bravura.js", route => route.fulfill({ status: 404, body: "Test renderer unavailable" }));
        await selectView(page, "notation");
        await page.locator("#notation-error").waitFor();
        assert.equal(await page.locator("#timeline").isVisible(), true);
        assert.equal(await page.locator("#start-stop").isEnabled(), true);
        await page.unroute("**/assets/vendor/vexflow/vexflow-bravura.js");
        await page.locator("#notation-retry").click();
        await page.locator("#notation-score svg").waitFor();
        await selectView(page, "lanes");
        await page.evaluate(() => {
            const draw = window.VexFlow.Stave.prototype.draw;
            window.restoreNotationDraw = () => { window.VexFlow.Stave.prototype.draw = draw; };
            window.VexFlow.Stave.prototype.draw = () => { throw new Error("Test engraving failure"); };
        });
        await selectView(page, "notation");
        await page.locator("#notation-error").waitFor();
        assert.equal(await page.locator("#timeline").isVisible(), true);
        await page.evaluate(() => window.restoreNotationDraw());
        await page.locator("#notation-retry").click();
        await page.locator("#notation-score svg").waitFor();
    } finally { await recovery.close(); }
    console.log(`PASS notation view, paging, controls, input, persistence, failure recovery: ${new URL(url).pathname}`);
}

export async function notationLifecycleFlow(browser, url) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await mockMidi(context);
    try {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.goto(url);
        await ready(page);
        await selectLesson(page, "swing-01");
        await waitForLesson(page, "swing-01");
        await page.locator("#notation-score svg").waitFor();
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.equal(await page.locator("#notation-key li").count(), 0, "Folded drum key is not engraved");
        await page.evaluate(() => {
            window.staveDraws = 0;
            const draw = window.VexFlow.Stave.prototype.draw;
            window.VexFlow.Stave.prototype.draw = function (...args) { window.staveDraws++; return draw.apply(this, args); };
        });
        for (const action of ["Disable", "Enable"]) {
            await page.getByRole("button", { name: `${action} Snare in notation`, exact: true }).click();
            assert.equal(await page.locator('[data-note-id="snare:0"]').first().getAttribute("data-timing"),
                action === "Disable" ? "disabled" : "waiting");
        }
        assert.equal(await page.evaluate(() => window.staveDraws), 0, "Instrument toggles reuse cached engraving");
        await page.locator("#practice-panel > summary").click();
        await page.locator(".notation-legend summary").click();
        await page.waitForFunction(() => document.querySelectorAll("#notation-key li").length === 4);
        await page.evaluate(() => { window.firstKey = document.querySelector("#notation-key li"); });
        assert.equal(await page.evaluate(() => window.staveDraws), 4, "Drum key engraves only its four instruments");
        await page.locator(".notation-legend summary").click();
        await page.locator(".notation-legend summary").click();
        await selectView(page, "lanes");
        await selectView(page, "notation");
        assert.equal(await page.evaluate(() => document.querySelector("#notation-key li") === window.firstKey), true);
        assert.equal(await page.evaluate(() => window.staveDraws), 4, "Reopening key/view reuses existing engraving");
        await selectLesson(page, "fascination-street");
        await waitForLesson(page, "fascination-street");
        await page.waitForFunction(() => document.querySelectorAll("#notation-key li").length === 3);
        assert.equal(await page.evaluate(() => document.querySelector("#notation-key li") === window.firstKey), false);
        assert.deepEqual(errors, []);
    } finally { await context.close(); }

    // A folded key can independently load/retry the renderer from Lanes.
    const recovery = await browser.newContext();
    await mockMidi(recovery);
    await seedLanes(recovery);
    try {
        const page = await recovery.newPage();
        await page.route("**/assets/vendor/vexflow/vexflow-bravura.js", route => route.abort());
        await page.goto(url);
        await ready(page);
        await page.locator("#practice-panel > summary").click();
        await page.locator(".notation-legend summary").click();
        await page.waitForFunction(() => document.querySelector("#notation-key").textContent.includes("unavailable"));
        assert.equal(await page.locator("#timeline").isVisible(), true);
        await page.unroute("**/assets/vendor/vexflow/vexflow-bravura.js");
        await page.locator(".notation-legend summary").click();
        await page.locator(".notation-legend summary").click();
        await page.locator("#notation-key svg").first().waitFor();
        assert.equal(await page.locator("#notation-key").textContent().then(text => text.includes("unavailable")), false);
        console.log(`PASS notation resets/cache, lazy drum key reuse, lesson refresh and retry: ${new URL(url).pathname}`);
    } finally { await recovery.close(); }
}

export async function scoreFollowingFlow(browser, url) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    await mockMidi(context);
    try {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.goto(url);
        await ready(page);
        await selectLesson(page, "fascination-street");
        await waitForLesson(page, "fascination-street");
        await selectView(page, "notation");
        await page.locator("#notation-next-score svg").waitFor();
        // Check the real engraver, not a hand-authored x-axis: hit centers must
        // be reached at performance ticks even when written swing positions differ.
        const geometryChecks = await page.evaluate(async () => {
            const { lessonNotation } = await import("./src/notation/model.js");
            const { renderScoreBar } = await import("./src/notation/renderer.js");
            const { markerX } = await import("./src/notation/position.js");
            const { BUNDLED_LESSONS } = await import("./generated/lesson-catalog.js");
            const host = document.createElement("div");
            host.style.cssText = "position:absolute;left:-2000px;width:700px";
            document.body.append(host);
            const checks = [];
            try {
                for (const [id, barIndex, instrument, ticks] of [
                    ["californication", 0, "snare", [120, 168]],
                    ["swing-01", 0, "ride", [160, 352]],
                    ["swing-03", 1, "snare", [608, 640]],
                ]) {
                    const response = await fetch(`./lessons/${BUNDLED_LESSONS.find(lesson => lesson.id === id).path}`);
                    const model = lessonNotation(await response.json());
                    const bar = model.bars[barIndex];
                    const engraved = [];
                    const draw = window.VexFlow.StaveNote.prototype.draw;
                    let geometry;
                    try {
                        window.VexFlow.StaveNote.prototype.draw = function (...args) { engraved.push(this); return draw.apply(this, args); };
                        geometry = renderScoreBar(host, { title: id, feel: model.feel, description: "Geometry check", voices: bar.voices });
                    } finally { window.VexFlow.StaveNote.prototype.draw = draw; }
                    const notes = bar.voices.flatMap(voice => voice.notes);
                    if (engraved.length !== notes.length) throw new Error("Unexpected engraving note count");
                    for (const tick of ticks) {
                        const index = notes.findIndex(note => note.refs.some(ref => ref.instrument === instrument && ref.performanceTick === tick));
                        const note = engraved[index];
                        const center = (note.getNoteHeadBeginX() + note.getNoteHeadEndX()) / 2;
                        const relative = tick - barIndex * 384;
                        const actual = markerX(relative, geometry.anchors);
                        if (Math.abs(actual - center) > 1e-6 || markerX(relative - 0.01, geometry.anchors) >= center
                            || markerX(relative + 0.01, geometry.anchors) <= center) throw new Error(`${id}: marker missed note ${tick}`);
                        checks.push(`${id}:${tick}`);
                    }
                }
                const empty = lessonNotation({ version: 2, title: "Silent second bar", bpm: 80, bars: 2,
                    time_signature: [4, 4], notation: { feel: "straight" }, tracks: [{ instrument: "snare", notes: [0] }] });
                const geometry = renderScoreBar(host, { title: empty.title, feel: empty.feel,
                    description: "Empty bar check", voices: empty.bars[1].voices });
                if (geometry.anchors[0].x > geometry.width / 3 || geometry.anchors.at(-1).x < geometry.width * 0.8) {
                    throw new Error("An empty bar must span the score, not begin at its centered whole-bar rest");
                }
                checks.push("empty-bar");
            } finally { host.remove(); }
            return checks;
        });
        assert.equal(geometryChecks.length, 7);
        await setBpm(page, 300);
        await page.locator("#practice-panel > summary").click();
        await page.locator("#count-in").check();
        await observePlayback(page);
        await page.evaluate(async () => {
            const { NotationView } = await import("./src/notation/view.js");
            const update = NotationView.prototype.updatePlayback;
            NotationView.prototype.updatePlayback = function (...args) {
                window.scoreView = this;
                return update.apply(this, args);
            };
            window.scoreProbe = { frames: [] };
            const probe = window.scoreProbe;
            probe.observer = new MutationObserver(() => {
                const marker = document.querySelector("#notation-score .notation-playhead");
                if (!marker || marker.style.display === "none") return;
                probe.frames.push({ absoluteBar: Number(marker.closest(".notation-bar").dataset.absoluteBar),
                    tick: Number(marker.dataset.tick), x: Number(marker.getAttribute("x1")) });
            });
            probe.observer.observe(document.querySelector("#notation-sheet"), { subtree: true,
                childList: true, attributes: true, attributeFilter: ["x1"] });
        });
        await page.locator("#start-stop").click();
        await page.waitForFunction(() => document.querySelector("#status").textContent.startsWith("Count-in"));
        assert.equal(await page.locator("#notation-score .notation-playhead").isVisible(), false);
        assert.equal(await page.locator("#notation-next").isDisabled(), true);
        await playing(page);
        await page.waitForFunction(() => window.scoreProbe.frames.length > 2);
        const origin = await page.evaluate(() => window.smoke.assessment.origin);
        await page.evaluate(() => {
            window.retainedScore = document.querySelector('[data-absolute-bar="8"] svg');
            window.retainedScoreX = window.retainedScore.getBoundingClientRect().x;
        });
        await page.waitForFunction(() => Number(document.querySelector("#session-loops").textContent) >= 2);
        assert.equal(await page.evaluate(() => document.querySelector('[data-absolute-bar="8"] svg') === window.retainedScore), true,
            "Repeated bars keep their original position/node instead of swapping left and right");
        assert.equal(await page.evaluate(() => window.retainedScore.getBoundingClientRect().x),
            await page.evaluate(() => window.retainedScoreX));
        assert.equal(await page.locator(".notation-bar").count(), 12);
        assert.equal(await page.evaluate(() => window.scoreView.cache.size), 5, "Engrave each source bar/signature once per width");
        const frames = await page.evaluate(() => window.scoreProbe.frames);
        for (let index = 1; index < frames.length; index++) if (frames[index].absoluteBar === frames[index - 1].absoluteBar) {
            assert.ok(frames[index].tick >= frames[index - 1].tick && frames[index].x >= frames[index - 1].x);
        }
        assert.ok(await page.locator("#notation-scroll").evaluate(node => node.scrollTop) > 0);
        await page.evaluate(() => window.scoreProbe.observer.disconnect());
        // Hold only animation; the native audio scheduler continues independently.
        await page.evaluate(() => {
            window.savedScoreRAF = window.requestAnimationFrame;
            window.freezeScore = true;
            window.requestAnimationFrame = callback => window.savedScoreRAF(time => {
                if (window.freezeScore) window.heldScoreFrame = callback;
                else callback(time);
            });
        });
        await page.waitForFunction(() => Boolean(window.heldScoreFrame));
        const beforePause = await page.evaluate(() => ({ tick: document.querySelector("#notation-score .notation-playhead").dataset.tick,
            scheduled: window.smoke.scheduled.length, until: window.smoke.audio.context.currentTime + 0.45 }));
        await page.waitForFunction(until => window.smoke.audio.context.currentTime >= until, beforePause.until);
        assert.equal(await page.locator("#notation-score .notation-playhead").getAttribute("data-tick"), beforePause.tick);
        assert.ok(await page.evaluate(count => window.smoke.scheduled.length > count, beforePause.scheduled));
        // Jump the display beyond 100 loops: retain a small DOM and never touch audio/scoring.
        const far = await page.evaluate(() => {
            const scheduled = window.smoke.scheduled.length, totals = JSON.stringify(window.smoke.assessment.counts);
            window.scoreView.updatePlayback(1600.5, true, window.scoreView.assessment);
            return { count: document.querySelectorAll(".notation-bar").length,
                absolute: document.querySelector("#notation-score").closest(".notation-bar").dataset.absoluteBar,
                loop: document.querySelector("#notation-loop").textContent,
                unchanged: scheduled === window.smoke.scheduled.length && totals === JSON.stringify(window.smoke.assessment.counts) };
        });
        assert.deepEqual(far, { count: 12, absolute: "400", loop: "Loop 101", unchanged: true });
        await page.evaluate(() => {
            window.freezeScore = false;
            window.requestAnimationFrame = window.savedScoreRAF;
            window.requestAnimationFrame(window.heldScoreFrame);
            window.heldScoreFrame = null;
        });
        await page.waitForFunction(() => Number(document.querySelector("#notation-score").closest(".notation-bar").dataset.absoluteBar) < 100);
        assert.equal(await page.evaluate(() => window.smoke.assessment.origin), origin);
        await selectView(page, "lanes");
        await selectView(page, "notation");
        await page.waitForFunction(() => document.querySelector("#notation-score .notation-playhead")?.style.display !== "none");
        assert.equal(await page.evaluate(() => window.smoke.assessment.origin), origin);
        await page.setViewportSize({ width: 390, height: 844 });
        await oneScoreColumn(page);
        assert.equal(await page.locator(".notation-bar").count(), 6);
        await page.waitForFunction(() => document.querySelector("#notation-score").scrollLeft > 0);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        if (new URL(url).pathname === "/") await page.screenshot({ path: "/tmp/rhythm-notation-follow-narrow.png", fullPage: true });
        await page.setViewportSize({ width: 1440, height: 1100 });
        await page.waitForFunction(() => document.querySelectorAll(".notation-bar").length === 12);
        if (new URL(url).pathname === "/") await page.screenshot({ path: "/tmp/rhythm-notation-follow-desktop.png", fullPage: true });
        await setBpm(page, 180);
        await stopped(page);
        assert.equal(await page.locator("#notation-score .notation-playhead").isVisible(), false);
        await page.locator("#count-in").uncheck();
        await page.locator("#start-stop").click();
        await playing(page);
        assert.equal(await page.locator("#notation-page").textContent(), "Bar 1 of 4");
        assert.equal(await page.locator("#notation-score .notation-playhead").getAttribute("data-loop"), "1");
        assert.notEqual(await page.evaluate(() => window.smoke.assessment.origin), origin);
        await page.evaluate(() => {
            Object.defineProperty(document, "hidden", { configurable: true, value: true });
            document.dispatchEvent(new Event("visibilitychange"));
        });
        await stopped(page);
        assert.equal(await page.locator("#notation-score .notation-playhead").isVisible(), false);
        await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event("visibilitychange")); });
        await stopped(page);
        assert.deepEqual(errors, []);
        console.log(`PASS continuous sheet, bounded repetition past 100 loops, native clock, resize and restart: ${new URL(url).pathname}`);
    } finally { await context.close(); }
}

export async function notationCoverageFlow(browser, url) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await mockMidi(context);
    await mockFixtureLessons(context);
    try {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.goto(url);
        await ready(page);
        await selectView(page, "notation");
        for (const id of [...BUNDLED_LESSONS.map(lesson => lesson.id), ...Object.keys(FIXTURE_LESSONS)]) {
            const lesson = FIXTURE_LESSONS[id] ?? JSON.parse(await readFile(resolve(runtimeRoot, "lessons", BUNDLED_LESSONS.find(lesson => lesson.id === id).path), "utf8"));
            await selectLesson(page, id);
            await waitForLesson(page, id);
            await page.locator("#notation-score svg").waitFor();
            await page.waitForFunction(() => [...document.querySelectorAll(".notation-score svg")].every(svg => {
                const host = svg.parentElement;
                return Number(svg.getAttribute("width")) >= 300
                    && Math.abs(Number(svg.getAttribute("width")) - host.getBoundingClientRect().width) < 0.01;
            }));
            const model = lessonNotation(lesson);
            for (let bar = 0; bar < lesson.bars; bar++) {
                assert.equal(await page.locator("#notation-page").textContent(), `Bar ${bar + 1} of ${lesson.bars}`, id);
                const expected = lesson.tracks.flatMap(track => track.notes.filter(tick => Math.floor(tick / 384) === bar)
                    .map(tick => `${track.instrument}:${tick}`)).sort();
                const actual = await page.locator("#notation-score [data-note-id]").evaluateAll(nodes => nodes.map(node => node.dataset.noteId).sort());
                assert.equal(await page.locator("#notation-score .vf-tuplet").count(),
                    model.bars[bar].voices.reduce((sum, voice) => sum + voice.tuplets.length, 0), `${id}: explicit triplet brackets are present`);
                assert.equal(await page.locator("#notation-score .vf-beam").count(),
                    model.bars[bar].voices.reduce((sum, voice) => sum + voice.beams.length, 0), `${id}: model beam groups are engraved`);
                const hiddenRests = model.bars[bar].voices.flatMap(voice => voice.notes).filter(note => note.hidden).length;
                assert.equal(await page.locator('#notation-score .vf-stavenote[visibility="hidden"]').count(), hiddenRests,
                    `${id}: inactive rests remain formatted but invisible`);
                assert.equal(await page.locator('#notation-score [visibility="hidden"] [data-note-id]').count(), 0,
                    `${id}: every played head remains visible`);
                if (id === "swing-01" && bar === 0) {
                    const aligned = await page.locator("#notation-score").evaluate(host => {
                        const snare = host.querySelector('[data-note-id="snare:0"]').getBoundingClientRect();
                        const kick = host.querySelector('[data-note-id="kick:0"]').getBoundingClientRect();
                        return Math.abs(snare.x - kick.x) < 0.01;
                    });
                    assert.equal(aligned, true, "Simultaneous snare and bass heads align vertically");
                }
                const thicknesses = await page.locator("#notation-score .vf-beam path").evaluateAll(paths => paths
                    .map(path => path.getAttribute("d")).filter(d => d.endsWith("Z"))
                    .map(d => d.match(/-?\d*\.?\d+(?:e[+-]?\d+)?/gi).map(Number))
                    .map(points => Math.abs(points[1] - points[3])));
                assert.ok(thicknesses.every(width => Math.abs(width - 3) < 0.001), `${id}: 3px beams`);
                const combined = model.bars[bar].voices.some(voice => voice.id === "combined");
                assert.equal(await page.locator("#notation-score svg").getAttribute("data-layout"), combined ? "combined" : "separate");
                if (combined) {
                    const ink = await page.locator("#notation-score").evaluate(host => {
                        const stem = host.querySelector(".vf-stem path");
                        const beam = host.querySelector(".vf-beam path");
                        const head = host.querySelector("[data-note-id] text, [data-note-id] path");
                        return { stem: stem && getComputedStyle(stem).stroke, beam: beam && getComputedStyle(beam).fill,
                            head: head && getComputedStyle(head).fill, bar: getComputedStyle(host.querySelector(".notation-barline")).stroke };
                    });
                    if (ink.stem) assert.equal(ink.stem, "rgb(119, 123, 115)", `${id}: lighter combined stems`);
                    if (ink.beam) assert.equal(ink.beam, "rgb(119, 123, 115)", `${id}: lighter combined beams`);
                    if (ink.head) assert.equal(ink.head, "rgb(36, 40, 32)", `${id}: dark noteheads`);
                    assert.equal(ink.bar, "rgb(36, 40, 32)", `${id}: dark bar lines`);
                }
                assert.deepEqual(actual, expected, `${id}, bar ${bar + 1}: every expected notehead is present exactly once`);
                assert.equal(await page.locator("#notation-error").isVisible(), false);
                if (new URL(url).pathname === "/" && !id.startsWith("notation-silent")) {
                    await page.locator("#notation-panel").screenshot({ path: `/tmp/rhythm-score-${id}-${bar + 1}.png` });
                }
                if (bar < lesson.bars - 1) await page.locator("#notation-next").click();
            }
            await page.setViewportSize({ width: 390, height: 844 });
            await oneScoreColumn(page);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, id);
            await page.setViewportSize({ width: 1440, height: 1000 });
        }
        assert.equal(await page.evaluate(() => document.fonts.check("20px Bravura") && document.fonts.check("14px Academico")), true,
            "The app uses the bundled notation fonts");
        await selectLesson(page, "notation-sixteen-bars");
        await page.waitForFunction(() => document.querySelector("#notation-page").textContent === "Bar 1 of 16");
        if (await page.locator("#practice-panel").getAttribute("open") === null) await page.locator("#practice-panel > summary").click();
        await page.locator(".notation-legend summary").click();
        await page.waitForFunction(() => document.querySelectorAll("#notation-key li").length === 12);
        assert.equal(await page.locator("#notation-key li").count(), 12);
        const hiHatGlyphs = await page.locator("#notation-score svg").textContent();
        assert.ok(hiHatGlyphs.includes("\uE5E5") && hiHatGlyphs.includes("\uE5E7"), "Open circle and closed + both render");
        const collision = await page.locator('#notation-score [data-note-id^="hi_hat_"]').evaluateAll(nodes => nodes.map(node => {
            const box = node.getBoundingClientRect(); return { id: node.dataset.noteId, x: box.x, y: box.y };
        }));
        assert.notEqual(collision.find(node => node.id === "hi_hat_closed:0").x,
            collision.find(node => node.id === "hi_hat_open:0").x, "Same-position heads are displaced rather than hidden");
        if (new URL(url).pathname === "/") await page.screenshot({ path: "/tmp/rhythm-score-full-kit.png", fullPage: true });
        assert.deepEqual(errors, []);
        console.log(`PASS whole catalog, full kit, dense subdivisions, silent/sixteen-bar scores: ${new URL(url).pathname}`);
    } finally { await context.close(); }
}

export async function sheetLayoutFlow(browser, url) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await mockMidi(context);
    await seedLanes(context);
    try {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.goto(url);
        await ready(page);
        await selectLesson(page, "swing-ride");
        await waitForLesson(page, "swing-ride");
        await page.locator("#practice-panel > summary").click();
        await page.locator("#practice-panel .notation-legend summary").click();
        await page.waitForFunction(() => document.querySelectorAll("#notation-key li").length === 4);
        assert.equal(await page.locator("#timeline").isVisible(), true, "Drum key loads in settings even when Lanes was saved");
        await selectView(page, "notation");
        await page.locator("#practice-panel > summary").click();
        await page.waitForFunction(() => document.querySelectorAll(".notation-bar").length === 18);
        assert.equal(await page.locator(".notation-caption, .transport-info").count(), 0);
        const joined = await page.locator("#notation-sheet").evaluate(sheet => {
            const bars = [...sheet.children].slice(0, 3);
            return bars.every((bar, index) => {
                const svg = bar.querySelector("svg"), box = svg.getBoundingClientRect();
                const width = Number(svg.getAttribute("width"));
                const lines = [...svg.querySelectorAll("path, rect, line")].map(node => node.getBBox())
                    .filter(line => line.height <= 2 && Math.abs(line.width - width) < 2);
                return lines.length >= 5 && lines.every(line => Math.abs(line.x) < 2)
                    && (index === 0 || Math.abs(box.left - bars[index - 1].querySelector("svg").getBoundingClientRect().right) < 0.1)
                    && Math.abs(box.top - bars[0].querySelector("svg").getBoundingClientRect().top) < 0.1;
            });
        });
        assert.equal(joined, true, "The staff spans three adjacent SVGs with no gutter or vertical misalignment");
        const ratio = await page.evaluate(() => document.querySelector("#bpm").getBoundingClientRect().width
            / document.querySelector("#metronome-volume").getBoundingClientRect().width);
        assert.ok(ratio > 2.7 && ratio < 3.5, "BPM is roughly three times the shortened audio sliders");
        assert.equal(await page.locator("#notation-feedback").evaluate(node => node.getBoundingClientRect().height <= 1), true);
        assert.equal(await page.locator("#status").evaluate(node => node.getBoundingClientRect().height <= 1), true);
        await setBpm(page, 300);
        await page.locator("#practice-panel > summary").click();
        await page.locator("#count-in").uncheck();
        await page.locator("#practice-panel > summary").click();
        await observePlayback(page);
        await page.locator("#start-stop").click();
        await playing(page);
        await page.evaluate(() => { window.futureBar = document.querySelector('[data-absolute-bar="12"] svg'); });
        await page.waitForFunction(() => Number(document.querySelector("#session-loops").textContent) >= 10);
        assert.equal(await page.locator(".notation-bar").count(), 18);
        assert.equal(await page.evaluate(() => document.querySelector('[data-absolute-bar="12"] svg') === window.futureBar), true);
        assert.ok(await page.locator("#notation-scroll").evaluate(node => node.scrollTop) > 0);
        await page.locator("#start-stop").click();
        await page.setViewportSize({ width: 1000, height: 900 });
        await page.waitForFunction(() => document.querySelectorAll(".notation-bar").length === 12);
        await page.setViewportSize({ width: 390, height: 844 });
        await oneScoreColumn(page);
        assert.equal(await page.locator(".notation-bar").count(), 6);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        assert.deepEqual(errors, []);
        console.log(`PASS seamless three-bar staff, responsive density, slider ratio, folded drum key and bounded scrolling: ${new URL(url).pathname}`);
    } finally { await context.close(); }
}
