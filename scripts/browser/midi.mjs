import assert from "node:assert/strict";
import { mockMidi, mockFixtureLessons, selectLesson, setBpm, ready, playing, stopped, observePlayback } from "./helpers.mjs";

export async function midiFlow(browser, url) {
    const context = await browser.newContext();
    await mockMidi(context, { ports: ["kit", "other"] });
    await mockFixtureLessons(context);
    try {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        // Old browser mappings must never override the fixed repository config.
        await page.addInitScript(() => localStorage.setItem("rhythm-trainer.midi.v1", "old custom mappings"));
        await page.goto(url);
        await ready(page);
        await page.waitForFunction(() => document.querySelector("#midi-summary").textContent.includes("connected"));
        assert.deepEqual(await page.evaluate(() => window.midiTest.requests), [{ sysex: false }]);
        assert.equal(await page.locator("#midi-device").count(), 0);
        assert.equal(await page.getByRole("button", { name: "Learn pad", exact: true }).count(), 0);
        await selectLesson(page, "mps-850-check");
        await page.waitForFunction(() => document.querySelectorAll(".track").length === 12);
        await setBpm(page, 300);
        await page.locator("#practice-panel > summary").click();
        await page.locator("#count-in").uncheck();
        await observePlayback(page);
        await page.locator("#start-stop").click();
        await playing(page);
        await page.waitForFunction(() => window.smoke.audio.context.getOutputTimestamp().performanceTime > 0);
        for (const [id, note, beat, expected] of [
            ["kit", 42, 0, "on_time"], ["kit", 42, 1, "extra"], ["kit", 46, 1, "on_time"],
            ["kit", 51, 3, "on_time"], ["kit", 59, 3, "extra"],
            ["other", 38, 6, "on_time"], ["kit", 36, 11, "on_time"],
        ]) {
            const result = await page.evaluate(({ id, note, beat }) => {
                window.midiTest.sendData(id, [0x99, note, 77], window.smoke.stamp(beat));
                return window.smoke.assessment.hits.at(-1);
            }, { id, note, beat });
            assert.equal(result.status, expected);
            assert.equal(result.source, "midi");
            assert.equal(result.velocity, 77);
        }
        const beforePedal = await page.evaluate(() => window.smoke.assessment.hits.length);
        await page.evaluate(() => {
            const stamp = window.smoke.stamp(2);
            for (const data of [[0xb9, 4, 80], [0x99, 44, 90], [0x99, 44, 0], [0xa9, 46, 127]]) {
                window.midiTest.sendData("kit", data, stamp);
            }
        });
        assert.equal(await page.evaluate(() => window.smoke.assessment.hits.length), beforePedal + 1);
        assert.equal(await page.evaluate(() => window.smoke.assessment.hits.at(-1).status), "on_time");
        await page.evaluate(() => window.midiTest.connect("kit", false));
        await stopped(page);
        await page.evaluate(() => window.midiTest.connect("kit", true));
        await page.waitForFunction(() => document.querySelector("#midi-status").textContent.includes("kit"));
        await stopped(page);
        await page.reload();
        await ready(page);
        await page.waitForFunction(() => document.querySelector("#midi-summary").textContent.includes("connected"));
        assert.deepEqual(await page.evaluate(() => window.midiTest.requests), [{ sysex: false }]);
        assert.deepEqual(errors, []);
    } finally { await context.close(); }

    for (const mode of ["denied", "busy", "none", "unsupported"]) {
        const recovery = await browser.newContext();
        await mockMidi(recovery, { ports: mode === "none" ? [] : ["kit"],
            denied: mode === "denied", busy: mode === "busy", unsupported: mode === "unsupported" });
        try {
            const page = await recovery.newPage();
            await page.goto(url);
            await ready(page);
            await page.locator("#midi-panel summary").click();
            if (mode === "unsupported") {
                assert.equal(await page.locator("#midi-connect").isDisabled(), true);
            } else if (mode === "none") {
                await page.waitForFunction(() => document.querySelector("#midi-status").textContent.includes("No MIDI inputs"));
                await page.evaluate(() => window.midiTest.addPort("later"));
                await page.waitForFunction(() => document.querySelector("#midi-summary").textContent.includes("connected"));
            } else {
                await page.waitForFunction(() => document.querySelector("#midi-connect").disabled === false);
                await page.evaluate(() => { window.midiTest.denied = false; window.midiTest.busy = false; });
                await page.locator("#midi-connect").click();
                await page.waitForFunction(() => document.querySelector("#midi-summary").textContent.includes("connected"));
            }
            await page.locator("#practice-panel > summary").click();
            await page.locator("#count-in").uncheck();
            await page.locator("#start-stop").click();
            await playing(page);
        } finally { await recovery.close(); }
    }
    console.log(`PASS automatic MPS-850 MIDI and recovery: ${new URL(url).pathname}`);
}
