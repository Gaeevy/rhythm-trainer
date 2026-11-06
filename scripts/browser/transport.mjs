import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { VOLUME_MAX, positionFromVolume } from "../../src/volume.js";
import { FIXTURE_LESSONS } from "../fixtures/lessons.js";
import { BUNDLED_LESSONS } from "../../generated/lesson-catalog.js";
import { runtimeRoot } from "./server.mjs";
import { mockMidi, mockFixtureLessons, selectLesson, waitForLesson, setBpm, selectView, ready, playing, stopped, observePlayback, timedKey } from "./helpers.mjs";

export async function practiceFlow(browser, url) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    await mockMidi(context);
    await mockFixtureLessons(context);
    try {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
        page.on("requestfailed", request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
        page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`); });
        await page.goto(url);
        await ready(page);
        await selectView(page, "lanes");
        assert.equal(await page.locator("#lesson-menu > [data-folder]").count(), 4);
        for (const { id } of BUNDLED_LESSONS) {
            const lesson = JSON.parse(await readFile(resolve(runtimeRoot, "lessons", BUNDLED_LESSONS.find(lesson => lesson.id === id).path), "utf8"));
            await selectLesson(page, id);
            await waitForLesson(page, id);
            assert.deepEqual(await page.locator(".track").evaluateAll(lanes => lanes.map(lane => lane.dataset.instrument)),
                lesson.tracks.map(track => track.instrument));
        }
        await selectLesson(page, "swing-ride");
        await waitForLesson(page, "swing-ride");
        await setBpm(page, 240);
        await page.locator("#practice-panel > summary").click();
        await page.locator("#tolerance").fill("10");
        await page.locator("#latency-offset").fill("");
        await page.locator("#practice-panel > summary").click();
        await page.locator("#start-stop").click();
        assert.equal(await page.locator("#practice-panel").getAttribute("open"), "");
        await stopped(page);
        await page.locator("#latency-offset").fill("0");
        await observePlayback(page);
        await page.locator("#timeline").focus();
        await page.keyboard.down("Space");
        await page.keyboard.down("Space");
        await page.keyboard.up("Space");
        await page.waitForFunction(() => document.querySelector("#status").textContent.startsWith("Count-in"));
        await page.keyboard.press("f");
        assert.equal(await page.evaluate(() => window.smoke.assessment.hits.length), 0);
        await playing(page);
        assert.equal(await page.evaluate(() => window.smoke.audio.samples.size), 12);
        await page.waitForFunction(() => window.smoke.audio.context.getOutputTimestamp().performanceTime > 0);
        for (const [code, beat, errorMs, expected] of [
            ["KeyK", 0, 0, "on_time"], ["KeyH", 1, -20, "early"], ["KeyK", 1, 20, "late"],
        ]) {
            const hit = await timedKey(page, code, beat, errorMs);
            assert.equal(hit.status, expected);
            assert.equal(hit.source, "keyboard");
            // stamp() and the app sample the live output clock separately.
            // Allow sub-millisecond anchor jitter; exact conversion math is unit-tested.
            assert.ok(Math.abs(hit.errorMs - errorMs) < 0.25,
                `Native clock precision: expected ${errorMs} ms, got ${hit.errorMs} ms (${code}, beat ${beat})`);
        }
        assert.equal((await timedKey(page, "KeyK", 0)).status, "extra");
        await page.keyboard.press("f"); // A real browser key; snare has no expected notes.
        assert.equal(await page.evaluate(() => window.smoke.assessment.hits.at(-1).status), "extra");
        const beforeRepeat = await page.evaluate(() => window.smoke.assessment.hits.length);
        await page.keyboard.down("f");
        await page.keyboard.down("f");
        await page.keyboard.up("f");
        assert.equal(await page.evaluate(() => window.smoke.assessment.hits.length), beforeRepeat + 1);
        const hitCount = await page.evaluate(() => window.smoke.assessment.hits.length);
        await page.locator("#bpm").focus();
        await page.keyboard.press("f");
        assert.equal(await page.evaluate(() => window.smoke.assessment.hits.length), hitCount);
        const origin = await page.evaluate(() => window.smoke.assessment.origin);
        for (const bus of ["guide", "metronome"]) {
            await page.locator(`#${bus}-volume`).fill(String(positionFromVolume(20, VOLUME_MAX[bus])));
            await page.locator(`#${bus}-mute`).click();
            assert.equal(await page.locator(`#${bus}-mute`).getAttribute("aria-pressed"), "true");
            await page.waitForFunction(bus => window.smoke.audio[bus].gain.value < 0.001, bus);
            await page.locator(`#${bus}-mute`).click();
            await page.waitForFunction(bus => Math.abs(window.smoke.audio[bus].gain.value - 0.2) < 0.001, bus);
        }
        assert.equal(await page.evaluate(() => window.smoke.assessment.origin), origin);
        await page.waitForFunction(() => Number(document.querySelector("#session-loops").textContent) >= 2);
        assert.ok(await page.evaluate(() => window.smoke.assessment.counts.missed > 0));
        assert.ok(await page.evaluate(() => window.smoke.scheduled.some(([instrument]) => instrument === "ride")
            && window.smoke.scheduled.some(([instrument]) => instrument === "metronome")));
        await page.locator("#timeline").focus();
        await page.keyboard.press("Space");
        await stopped(page);
        const frozen = await page.locator(".session-summary").textContent();
        const scheduled = await page.evaluate(() => window.smoke.scheduled.length);
        await page.waitForTimeout(200); // Ensure stopped timers do not schedule more sounds or misses.
        assert.equal(await page.locator(".session-summary").textContent(), frozen);
        assert.equal(await page.evaluate(() => window.smoke.scheduled.length), scheduled);
        assert.equal(await page.evaluate(() => window.smoke.audio.sources.size), 0);
        assert.equal(await page.evaluate(() => window.setInterval === window.smoke.nativeSetInterval
            && window.clearInterval === window.smoke.nativeClearInterval), true);
        if (await page.locator("#practice-panel").getAttribute("open") === null) {
            await page.locator("#practice-panel > summary").click();
        }
        await page.locator("#count-in").uncheck();
        await page.locator("#start-stop").click();
        await playing(page);
        assert.equal(await page.evaluate(() => window.smoke.assessment.hits.length), 0);
        await setBpm(page, 180);
        await stopped(page);
        await page.locator("#keyboard-panel summary").click();
        await page.getByRole("combobox", { name: "Ride key", exact: true }).selectOption("KeyR");
        assert.match(await page.locator("#keyboard-hint").textContent(), /R: ride/);
        await page.reload();
        await ready(page);
        assert.equal(await page.locator("#bpm").getAttribute("aria-valuenow"), "180");
        assert.equal(await page.locator("#bpm-level").textContent(), "180");
        assert.equal(await page.locator("#practice-panel").getAttribute("open"), null);
        await page.locator("#bpm").focus();
        await page.keyboard.press("ArrowRight");
        assert.ok(Number(await page.locator("#bpm").getAttribute("aria-valuenow")) === 181);
        assert.equal(await page.locator("#bpm-level").textContent(), await page.locator("#bpm").getAttribute("aria-valuenow"));
        assert.equal(await page.locator("#count-in").isChecked(), false);
        assert.equal(await page.locator("#guide-level").textContent(), "20%");
        assert.match(await page.locator("#keyboard-hint").textContent(), /R: ride/);
        await page.locator("#start-stop").click();
        await playing(page);
        await selectLesson(page, "basic-straight");
        await page.waitForFunction(() => document.querySelectorAll(".track").length === 3);
        await stopped(page);
        await page.setViewportSize({ width: 390, height: 844 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        assert.deepEqual(errors, []);
        console.log(`PASS practice flow: ${new URL(url).pathname}`);
    } finally { await context.close(); }
}

export async function trackFlow(browser, url) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await mockMidi(context);
    await mockFixtureLessons(context);
    try {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.goto(url);
        await ready(page);
        await selectView(page, "lanes");
        // This scenario requires four specific tracks, regardless of catalog order.
        await selectLesson(page, "swing-01");
        await waitForLesson(page, "swing-01");
        await setBpm(page, 300);
        if (await page.locator("#practice-panel").getAttribute("open") === null) {
            await page.locator("#practice-panel > summary").click();
        }
        await page.locator("#count-in").uncheck();
        await observePlayback(page);
        await page.locator("#timeline").focus();
        await page.keyboard.press("Space");
        await playing(page);
        await page.getByRole("button", { name: "Disable Ride track", exact: true }).click();
        await stopped(page);
        assert.equal(await page.locator('.track[data-instrument="ride"]').getAttribute("data-disabled"), "true");
        assert.equal(await page.locator("#score-missed").textContent(), "0");
        const restartedAt = await page.evaluate(() => window.smoke.scheduled.length);
        await page.keyboard.press("Space");
        await playing(page);
        const count = await page.evaluate(() => window.smoke.assessment.hits.length);
        await page.keyboard.press("k");
        assert.equal(await page.evaluate(() => window.smoke.assessment.hits.length), count);
        assert.equal(await page.evaluate(() => window.smoke.assessment.tracks.has("ride")), false);
        assert.equal(await page.evaluate(index => window.smoke.scheduled.slice(index).some(([instrument]) => instrument === "ride"), restartedAt), false);
        for (const name of ["Hi-hat pedal", "Snare", "Kick"]) {
            await page.getByRole("button", { name: `Disable ${name} track`, exact: true }).click();
        }
        await page.keyboard.press("Space");
        await playing(page);
        assert.equal(await page.evaluate(() => window.smoke.assessment.tracks.size), 0);
        const afterStart = await page.evaluate(() => window.smoke.scheduled.length);
        await page.waitForFunction(() => Number(document.querySelector("#session-loops").textContent) >= 1);
        assert.ok(await page.evaluate(index => window.smoke.scheduled.slice(index).every(([instrument]) => instrument === "metronome"), afterStart));
        assert.equal(await page.locator("#score-missed").textContent(), "0");
        await page.keyboard.press("d");
        assert.equal(await page.locator("#score-extra").textContent(), "0");
        await page.keyboard.press("Space");
        await stopped(page);
        await page.reload();
        await ready(page);
        assert.equal(await page.locator('.track[data-disabled="true"]').count(), 4);
        await page.getByRole("button", { name: "Enable Ride track", exact: true }).click();
        await page.keyboard.press("Space");
        await playing(page);
        await page.keyboard.press("Space");
        await stopped(page);
        // Keep the moderate lane size and the entire toolbar on one desktop row.
        assert.equal(await page.evaluate(() => {
            const timeline = document.querySelector("#timeline").getBoundingClientRect();
            const mixer = document.querySelector(".lesson-controls").getBoundingClientRect();
            return timeline.width > innerWidth * 0.9 && timeline.height > innerHeight * 0.5 && timeline.height < innerHeight * 0.65
                && mixer.bottom <= timeline.top && timeline.top < innerHeight / 3;
        }), true);
        assert.equal(await page.evaluate(() => {
            const controls = [...document.querySelector(".lesson-controls").children];
            const bottom = controls[0].getBoundingClientRect().bottom;
            return controls.every(control => Math.abs(control.getBoundingClientRect().bottom - bottom) < 2)
                && document.querySelectorAll('.lesson-controls input[type="range"]').length === 3;
        }), true);
        assert.deepEqual(errors, []);
        console.log(`PASS track controls and Space transport: ${new URL(url).pathname}`);
    } finally { await context.close(); }
}

export async function failureRecovery(browser, url) {
    const context = await browser.newContext();
    let releaseSamples = () => {};
    let releaseLesson = () => {};
    await mockMidi(context);
    await mockFixtureLessons(context);
    try {
        const page = await context.newPage();
        await page.route("**/generated/lesson-catalog.js", route => route.abort("connectionfailed"));
        await page.goto(url);
        await page.getByRole("button", { name: "Reload page", exact: true }).waitFor();
        assert.equal(await page.locator("#start-stop").isDisabled(), true);
        await page.unroute("**/generated/lesson-catalog.js");
        await page.getByRole("button", { name: "Reload page", exact: true }).click();
        await ready(page);
        const previousId = await page.locator("#lesson").getAttribute("data-loaded-id");
        await page.route("**/lessons/basic-straight.json", route => route.fulfill({ contentType: "application/json", body: "{bad}" }));
        await selectLesson(page, "basic-straight");
        await page.locator("#lesson-error").waitFor();
        assert.match(await page.locator("#lesson-error").textContent(), /invalid JSON/);
        assert.equal(await page.locator("#lesson").getAttribute("data-loaded-id"), previousId);
        assert.equal(await page.locator("#start-stop").isEnabled(), true);
        await page.unroute("**/lessons/basic-straight.json");
        // A late success or failure must not replace the newer chosen lesson.
        for (const staleFailure of [false, true]) {
            const pending = new Promise(resolve => { releaseLesson = resolve; });
            let requested;
            const requestStarted = new Promise(resolve => { requested = resolve; });
            const pattern = "**/lessons/basic-straight.json";
            await page.route(pattern, async route => {
                requested();
                await pending;
                await route.fulfill({ contentType: "application/json", body: staleFailure ? "{bad}"
                    : JSON.stringify(FIXTURE_LESSONS["basic-straight"]) });
            });
            const finished = page.waitForResponse(response => response.url().endsWith("/lessons/basic-straight.json"));
            await selectLesson(page, "basic-straight");
            await requestStarted;
            await selectLesson(page, "swing-ride");
            await waitForLesson(page, "swing-ride");
            releaseLesson();
            await finished;
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            assert.equal(await page.locator("#lesson").getAttribute("data-loaded-id"), "swing-ride");
            assert.equal(await page.locator("#lesson-error").isVisible(), false);
            assert.equal(await page.locator("#start-stop").isEnabled(), true);
            await page.unroute(pattern);
        }
        await selectLesson(page, "basic-straight");
        await page.waitForFunction(() => document.querySelectorAll(".track").length === 3);
        const fastLesson = structuredClone(FIXTURE_LESSONS["basic-straight"]);
        fastLesson.bpm = 400;
        await page.route("**/lessons/basic-straight.json", route => route.fulfill({ contentType: "application/json", body: JSON.stringify(fastLesson) }));
        await selectLesson(page, "swing-ride");
        await page.waitForFunction(() => document.querySelectorAll(".track").length === 4);
        await selectLesson(page, "basic-straight");
        await page.waitForFunction(() => document.querySelector("#bpm-level").textContent === "300");
        assert.match(await page.locator("#status").textContent(), /Tempo set to 300 BPM/);
        await page.route("**/config/drumkits/mps-850.json", route => route.fulfill({ status: 404, body: "Missing profile" }));
        await page.reload();
        await ready(page);
        await page.waitForFunction(() => document.querySelector("#midi-status").textContent.includes("Could not load"));
        await page.locator("#midi-panel summary").click();
        assert.equal(await page.locator("#midi-connect").isVisible(), true);
        assert.equal(await page.locator("#start-stop").isEnabled(), true);
        const pendingSamples = new Promise(resolve => { releaseSamples = resolve; });
        await page.route("**/assets/drums/kick.wav", async route => { await pendingSamples; await route.continue(); });
        await observePlayback(page);
        await page.locator("#start-stop").click();
        await page.waitForFunction(() => document.querySelector("#status").textContent === "Loading drum sounds…");
        await page.locator("#start-stop").click();
        await stopped(page);
        releaseSamples();
        await page.waitForFunction(() => window.smoke.audio.samples.size === 12);
        await stopped(page);
        assert.equal(await page.evaluate(() => window.smoke.scheduled.length), 0);
        await page.unroute("**/assets/drums/kick.wav");
        await page.reload();
        await ready(page);
        await page.route("**/assets/drums/kick.wav", route => route.fulfill({ status: 404, body: "Missing sample" }));
        await page.locator("#practice-panel > summary").click();
        await page.locator("#count-in").uncheck();
        await observePlayback(page);
        await page.locator("#start-stop").click();
        await page.waitForFunction(() => document.querySelector("#status").textContent.startsWith("Could not start playback"));
        await stopped(page);
        assert.match(await page.locator("#guide-sound-status").textContent(), /press Start to retry/);
        assert.equal(await page.locator("#status").isVisible(), true, "Actionable errors remain visible even without the routine status strip");
        assert.equal(await page.evaluate(() => window.smoke.audio.samples.size), 0);
        assert.equal(await page.evaluate(() => window.smoke.scheduled.length), 0, "Missing recordings must not schedule substitute sounds");
        assert.equal(await page.evaluate(() => Boolean(window.smoke.assessment)), false);
        await page.unroute("**/assets/drums/kick.wav");
        await page.locator("#start-stop").click();
        await playing(page);
        assert.equal(await page.evaluate(() => window.smoke.audio.samples.size), 12);
        assert.match(await page.locator("#guide-sound-status").textContent(), /acoustic recordings/);
        console.log(`PASS loading failure recovery: ${new URL(url).pathname}`);
    } finally { releaseSamples(); releaseLesson(); await context.close(); }
}
