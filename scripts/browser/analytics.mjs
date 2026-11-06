import assert from "node:assert/strict";
import { mockMidi, mockFixtureLessons, selectLesson, waitForLesson, setBpm, selectView, ready, playing, stopped, observePlayback } from "./helpers.mjs";

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
        assert.match(await page.locator(".analytics-total").textContent(), /without consistency/);
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
        assert.equal(await total.textContent(), "50", "One perfect note and one miss share the score weight");
        assert.equal(await page.locator('.analytics-pad[data-instrument="ride"] output').textContent(), "—");
        await page.evaluate(() => window.midiTest.sendData("kit", [0x99, 36, 90], window.smoke.stamp(0)));
        await page.waitForFunction(() => document.querySelector(".analytics-total output").textContent === "100");
        await page.evaluate(() => window.midiTest.sendData("kit", [0x99, 38, 90], window.smoke.stamp(0, 17)));
        await page.waitForFunction(() => document.querySelector(".analytics-total output").textContent === "67");
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
        if (new URL(url).pathname === "/") await page.screenshot({ path: "/tmp/rhythm-analytics-desktop.png", fullPage: true });
        await page.locator("#start-stop").click();
        await page.waitForFunction(() => document.querySelector("#analytics").dataset.completedBars === "0");
        assert.equal(await total.textContent(), "—");
        await page.locator("#start-stop").click();
        await page.getByRole("button", { name: "Disable Kick in notation", exact: true }).click();
        assert.equal(await page.locator('.analytics-pad[data-instrument="kick"]').count(), 0);
        assert.equal(await total.textContent(), "—");
        await selectLesson(page, "swing-01");
        await waitForLesson(page, "swing-01");
        assert.equal(await total.textContent(), "—");
        await page.setViewportSize({ width: 390, height: 844 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        if (new URL(url).pathname === "/") await page.screenshot({ path: "/tmp/rhythm-analytics-narrow.png", fullPage: true });
        assert.deepEqual(errors, []);
        console.log(`PASS weighted pad preview, native completed bars, correction/extras, trends, frame gating, reset and narrow layout: ${new URL(url).pathname}`);
    } finally { await context.close(); }
}
