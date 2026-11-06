import assert from "node:assert/strict";
import { VOLUME_MAX, positionFromVolume } from "../../src/volume.js";
import { defaultPracticeSettings, PRACTICE_SETTINGS_KEY } from "../../src/practice-settings.js";
import { mockMidi, selectLesson, waitForLesson, selectView, ready, playing, stopped, observePlayback } from "./helpers.mjs";

export async function toolbarFlow(browser, url) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await mockMidi(context, { ports: ["kit"] });
    try {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.goto(url);
        await ready(page);
        await page.locator("#notation-score svg").waitFor();
        assert.equal(await page.locator("#view-notation").getAttribute("aria-pressed"), "true");
        assert.equal(await page.locator(".view-controls").isVisible(), false, "View selection belongs to folded settings");
        assert.equal(await page.locator("#lesson-title, #lesson-detail, .mode-badge").count(), 0);
        assert.equal(await page.locator("#master-volume, #master-mute").count(), 0);
        await selectLesson(page, "swing-ride");
        await waitForLesson(page, "swing-ride");
        assert.equal(await page.locator("#lesson-tempo").textContent(), "");
        assert.equal(await page.locator("#lesson-tempo").isDisabled(), true);
        await page.locator("#bpm").focus();
        for (const [key, expected] of [["ArrowRight", 81], ["ArrowLeft", 80], ["Home", 20], ["ArrowLeft", 20],
            ["End", 300], ["ArrowRight", 300], ["PageDown", 290]]) {
            await page.keyboard.press(key);
            assert.equal(await page.locator("#bpm-level").textContent(), String(expected));
        }
        const range = await page.locator("#bpm").boundingBox();
        const values = [];
        for (const fraction of [0.4, 0.5, 0.8, 0.9]) {
            await page.mouse.click(range.x + range.width * fraction, range.y + range.height / 2);
            values.push(Number(await page.locator("#bpm-level").textContent()));
        }
        assert.ok(values.every(Number.isInteger));
        assert.ok(values[3] - values[2] > values[1] - values[0], "High tempos advance faster for equal pointer travel");
        await page.locator("#lesson-tempo").click();
        assert.equal(await page.locator("#bpm-level").textContent(), "80");
        assert.equal(await page.locator("#lesson-tempo").isDisabled(), true);
        assert.equal(await page.evaluate(key => Object.hasOwn(JSON.parse(localStorage.getItem(key)).tempos, "swing-ride"), PRACTICE_SETTINGS_KEY), false);
        assert.equal(await page.evaluate(() => {
            const controls = [...document.querySelector(".lesson-controls").children];
            return controls.every(node => Math.abs(node.getBoundingClientRect().bottom - controls[0].getBoundingClientRect().bottom) < 2);
        }), true, "Lesson, three sliders and transport share one desktop row");
        if (new URL(url).pathname === "/") await page.screenshot({ path: "/tmp/rhythm-toolbar-desktop.png", fullPage: true });
        // Upgrade a real old fractional override without losing the user's mixer/keys.
        const old = { ...defaultPracticeSettings(), view: "notation", countIn: false, lastBundledLessonId: "swing-ride",
            guideVolume: 18, metronomeVolume: 100, tempos: { "swing-ride": 90.5220994475138 } };
        old.masterVolume = 190;
        old.masterMuted = true;
        await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: PRACTICE_SETTINGS_KEY, value: old });
        await page.reload();
        await ready(page);
        await page.locator("#notation-score svg").waitFor();
        assert.equal(await page.locator("#bpm-level").textContent(), "91");
        assert.equal(await page.locator("#guide-level").textContent(), "18%");
        assert.equal(await page.locator("#metronome-level").textContent(), "100%");
        assert.equal(await page.locator("#master-volume").count(), 0);
        await observePlayback(page);
        await page.locator("#start-stop").click();
        await playing(page);
        const origin = await page.evaluate(() => window.smoke.assessment.origin);
        for (const bus of ["metronome", "guide"]) {
            const slider = page.locator(`#${bus}-volume`);
            await slider.focus();
            await slider.press("End");
            assert.equal(await page.locator(`#${bus}-level`).textContent(), `${VOLUME_MAX[bus]}%`);
            await page.waitForFunction(({bus, gain}) => Math.abs(window.smoke.audio[bus].gain.value - gain) < 0.01,
                {bus, gain: VOLUME_MAX[bus] / 100});
            await page.locator(`#${bus}-mute`).click();
            await page.waitForFunction(bus => window.smoke.audio[bus].gain.value < 0.01, bus);
            await page.locator(`#${bus}-mute`).click();
            await slider.focus();
            await slider.press("Home");
            await page.waitForFunction(bus => window.smoke.audio[bus].gain.value < 0.01, bus);
            await slider.press("ArrowRight");
            assert.equal(await page.locator(`#${bus}-level`).textContent(), "1%");
            for (const [key, expected] of [["PageUp", 11], ["PageDown", 1], ["ArrowDown", 0], ["ArrowLeft", 0],
                ["ArrowUp", 1], ["Shift+ArrowRight", 2], ["End", VOLUME_MAX[bus]], ["ArrowUp", VOLUME_MAX[bus]]]) {
                await slider.press(key);
                assert.equal(await page.locator(`#${bus}-level`).textContent(), `${expected}%`);
            }
            await slider.fill(String(positionFromVolume(bus === "metronome" ? 250 : 18, VOLUME_MAX[bus])));
        }
        await page.waitForFunction(() => Math.abs(window.smoke.audio.metronome.gain.value - 2.5) < 0.01);
        assert.equal(await page.evaluate(key => Object.hasOwn(JSON.parse(localStorage.getItem(key)), "masterVolume"), PRACTICE_SETTINGS_KEY), false);
        await selectView(page, "lanes");
        await selectView(page, "notation");
        assert.equal(await page.evaluate(() => window.smoke.assessment.origin), origin);
        assert.equal(await page.locator("#start-stop").getAttribute("data-running"), "true");
        await page.locator("#lesson-tempo").click();
        await stopped(page);
        assert.equal(await page.locator("#bpm-level").textContent(), "80");
        await page.reload();
        await ready(page);
        assert.equal(await page.locator("#metronome-level").textContent(), "250%");
        assert.equal(await page.locator("#guide-level").textContent(), "18%");
        assert.equal(await page.locator("#bpm-level").textContent(), "80");
        await page.setViewportSize({ width: 390, height: 844 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        if (new URL(url).pathname === "/") await page.screenshot({ path: "/tmp/rhythm-toolbar-narrow.png", fullPage: true });
        assert.deepEqual(errors, []);
        console.log(`PASS compact toolbar, Notation default, integer/log tempo, reset, logarithmic volume/boost, migration/persistence: ${new URL(url).pathname}`);
    } finally { await context.close(); }
}
