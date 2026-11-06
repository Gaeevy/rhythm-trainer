import assert from "node:assert/strict";
import { mockMidi, mockFixtureLessons, selectLesson, waitForLesson, setBpm, selectView, ready, playing, stopped, observePlayback, timedKey } from "./helpers.mjs";

export async function analyticsFlow(browser, url) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    await mockMidi(context, { ports: ["kit"] });
    await mockFixtureLessons(context);
    await context.route("**/lessons/basic-straight.json", route => route.fulfill({ json: {
        version: 1, title: "Analytics example", bpm: 300, bars: 1, time_signature: [4, 4],
        tracks: [{ instrument: "snare", notes: [0] }, { instrument: "kick", notes: [0] }, { instrument: "ride", notes: [] }],
    } }));
    try {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.goto(url);
        await ready(page);
        await selectLesson(page, "basic-straight");
        await waitForLesson(page, "basic-straight");
        await setBpm(page, 300);
        const total = page.locator(".analytics-total output");
        assert.equal(await total.textContent(), "—");
        assert.match(await page.locator(".analytics-total").textContent(), /Score/);
        assert.equal(await page.locator(".analytics-blend, .analytics-groups, .analytics-progress").count(), 0);
        assert.equal(await total.evaluate(node => parseFloat(getComputedStyle(node).fontSize)), 56);
        assert.equal(await page.locator(".analytics-pads").evaluate(node => getComputedStyle(node).borderTopWidth), "1px");
        await observePlayback(page);
        await page.locator("#start-stop").click();
        await playing(page);
        await page.waitForFunction(() => window.smoke.audio.context.getOutputTimestamp().performanceTime > 0);
        await page.evaluate(() => {
            // Timestamped simulated input uses native audio time. Playback/bar
            // completion still runs in real time; never fake its clock or timers.
            for (let bar = 0; bar < 16; bar++) {
                for (const note of [38, 36]) {
                    if (bar === 0 && note === 36) continue;
                    window.midiTest.sendData("kit", [0x99, note, 90], window.smoke.stamp(bar * 4, bar < 8 ? 0 : 100));
                }
            }
        });
        assert.equal(await total.textContent(), "—", "Future hits cannot score unfinished bars");
        await page.waitForFunction(() => document.querySelector("#analytics").dataset.completedBars === "1");
        assert.equal(await total.textContent(), "35", "Pad score 50 plus incomplete-group consistency 0 gives overall 35");
        assert.equal(await page.locator(".analytics-consistency output").textContent(), "0");
        assert.equal(await page.locator('.analytics-pad[data-instrument="ride"] output').textContent(), "—");
        await page.evaluate(() => window.midiTest.sendData("kit", [0x99, 36, 90], window.smoke.stamp(0)));
        await page.waitForFunction(() => document.querySelector(".analytics-total output").textContent === "100");
        assert.equal(await page.locator(".analytics-consistency output").textContent(), "100");
        await page.evaluate(() => window.midiTest.sendData("kit", [0x99, 38, 90], window.smoke.stamp(0, 17)));
        await page.waitForFunction(() => document.querySelector(".analytics-total output").textContent === "77");
        const unfinished = await page.evaluate(() => {
            const assessment = window.smoke.assessment, original = assessment.resultFor;
            let reads = 0;
            assessment.resultFor = function (...args) { reads++; return original.apply(this, args); };
            try {
                // Both duplicate hits are outside the completed score window.
                // Matching and analytics update synchronously; notation's later
                // animation frame is deliberately outside this measurement.
                for (const beat of [4, 8]) window.midiTest.sendData("kit", [0x99, 38, 90], window.smoke.stamp(beat, 17));
                return { reads, completedBars: document.querySelector("#analytics").dataset.completedBars,
                    score: document.querySelector(".analytics-total output").textContent,
                    status: assessment.hits.at(-1).status };
            } finally { assessment.resultFor = original; }
        });
        assert.deepEqual(unfinished, { reads: 0, completedBars: "1", score: "77", status: "extra" },
            "Unfinished/future hits must not re-project completed history");
        // Allow the pending notation feedback frame to consume that input too.
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const work = await page.evaluate(async () => {
            const assessment = window.smoke.assessment, original = assessment.resultFor;
            let reads = 0, writes = 0;
            assessment.resultFor = function (...args) { reads++; return original.apply(this, args); };
            const observer = new MutationObserver(records => { writes += records.length; });
            observer.observe(document.querySelector("#analytics"), { attributes: true, childList: true, subtree: true, characterData: true });
            try {
                for (let i = 0; i < 5; i++) await new Promise(resolve => requestAnimationFrame(resolve));
                return { reads, writes };
            } finally { assessment.resultFor = original; observer.disconnect(); }
        });
        assert.deepEqual(work, { reads: 0, writes: 0 }, "Unchanged frames do not project history or rewrite analytics");
        assert.equal(await page.locator(".analytics-total .analytics-trend").textContent(), "");
        await page.waitForFunction(() => Number(document.querySelector("#analytics").dataset.completedBars) >= 16);
        assert.equal(await page.locator(".analytics-total .analytics-trend").textContent(), "↓");
        assert.match(await page.locator(".analytics-total .analytics-trend").getAttribute("aria-label"), /Declining/);
        assert.equal(await page.locator('.analytics-pad[data-instrument="snare"] .analytics-trend').textContent(), "↓");
        assert.equal(await page.locator(".analytics-consistency output").textContent(), "100", "Uniformly late groups remain tightly coordinated");
        assert.equal(await page.locator(".analytics-consistency .analytics-trend").textContent(), "~");
        const origin = await page.evaluate(() => window.smoke.assessment.origin);
        await page.locator("#guide-volume").fill("1000");
        await selectView(page, "lanes");
        await selectView(page, "notation");
        assert.equal(await page.evaluate(() => window.smoke.assessment.origin), origin);
        await page.locator("#start-stop").click();
        await stopped(page);
        const frozen = await page.locator("#analytics").textContent();
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.equal(await page.locator("#analytics").textContent(), frozen);
        await page.setViewportSize({ width: 2000, height: 1100 });
        await page.waitForFunction(() => getComputedStyle(document.querySelector(".practice-body")).display === "grid");
        const wide = await page.evaluate(() => {
            const view = document.querySelector(".practice-view").getBoundingClientRect();
            const panel = document.querySelector(".practice-analytics").getBoundingClientRect();
            const toolbar = document.querySelector(".lesson-controls").getBoundingClientRect();
            return { sideBySide: Math.abs(view.right - panel.left) < 1 && Math.abs(view.top - panel.top) < 1,
                readable: view.width > 1000, sidebarWidth: panel.width, toolbarAbove: toolbar.bottom <= view.top,
                overflow: document.documentElement.scrollWidth > innerWidth };
        });
        assert.deepEqual(wide, { sideBySide: true, readable: true, sidebarWidth: 300, toolbarAbove: true, overflow: false });
        assert.equal(await page.locator("#analytics").count(), 1, "Sidebar uses the same panel, not duplicated stats");
        assert.equal(await page.locator("#analytics").textContent(), frozen);
        await page.locator(".session-details > summary").click();
        assert.equal(await page.locator("#score-on_time").isVisible(), true);
        await page.locator(".session-details > summary").click();
        await selectView(page, "lanes");
        assert.equal(await page.locator("#timeline").isVisible(), true);
        assert.equal(await page.locator("#analytics").textContent(), frozen);
        await selectView(page, "notation");
        if (new URL(url).pathname === "/") await page.screenshot({ path: "/tmp/rhythm-analytics-wide.png", fullPage: true });
        await page.setViewportSize({ width: 1440, height: 1100 });
        assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".practice-body")).display), "block");
        if (new URL(url).pathname === "/") await page.screenshot({ path: "/tmp/rhythm-analytics-desktop.png", fullPage: true });
        await page.setViewportSize({ width: 390, height: 844 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        if (new URL(url).pathname === "/") await page.screenshot({ path: "/tmp/rhythm-analytics-narrow.png", fullPage: true });
        await page.setViewportSize({ width: 1440, height: 1100 });
        await page.locator("#start-stop").click();
        await page.waitForFunction(() => document.querySelector("#analytics").dataset.completedBars === "0");
        assert.equal(await total.textContent(), "—");
        assert.equal(await page.locator(".analytics-consistency").isVisible(), false);
        await page.locator("#start-stop").click();
        await page.getByRole("button", { name: "Disable Kick in notation", exact: true }).click();
        assert.equal(await page.locator('.analytics-pad[data-instrument="kick"]').count(), 0);
        assert.equal(await total.textContent(), "—");
        await page.locator("#start-stop").click();
        await playing(page);
        await page.waitForFunction(() => window.smoke.audio.context.getOutputTimestamp().performanceTime > 0);
        await timedKey(page, "KeyF", 0);
        await page.waitForFunction(() => document.querySelector("#analytics").dataset.completedBars === "1");
        assert.equal(await total.textContent(), "100");
        assert.equal(await page.locator(".analytics-consistency").isVisible(), false);
        await page.locator("#start-stop").click();
        await selectLesson(page, "swing-01");
        await waitForLesson(page, "swing-01");
        assert.equal(await total.textContent(), "—");
        await page.setViewportSize({ width: 390, height: 844 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.setViewportSize({ width: 1440, height: 1100 });
        await context.route("**/lessons/basic-straight.json", route => route.fulfill({ json: {
            version: 1, title: "Later simultaneous group", bpm: 300, bars: 2, time_signature: [4, 4],
            tracks: [{ instrument: "snare", notes: [0, 384] }, { instrument: "kick", notes: [384] }],
        } }));
        // Restore the disabled group member before loading the two-bar example.
        await page.getByRole("button", { name: "Enable Kick in notation", exact: true }).click();
        await selectLesson(page, "basic-straight");
        await waitForLesson(page, "basic-straight");
        await page.locator("#start-stop").click();
        await playing(page);
        await timedKey(page, "KeyF", 0);
        await page.waitForFunction(() => document.querySelector("#analytics").dataset.completedBars === "1");
        assert.equal(await total.textContent(), "—", "Future groups must not receive invented consistency credit");
        assert.equal(await page.locator(".analytics-consistency output").textContent(), "—");
        await page.waitForFunction(() => document.querySelector("#analytics").dataset.completedBars === "2");
        assert.equal(await page.locator(".analytics-consistency output").textContent(), "0");
        await timedKey(page, "KeyF", 4);
        await timedKey(page, "KeyD", 4);
        await page.waitForFunction(() => document.querySelector(".analytics-total output").textContent === "100");
        await page.locator("#start-stop").click();
        assert.deepEqual(errors, []);
        console.log(`PASS 70/30 overall, pad/consistency trends, group coverage/correction, no-group fallback, native bars, frame gating and reset: ${new URL(url).pathname}`);
    } finally { await context.close(); }
}
