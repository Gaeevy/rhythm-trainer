import assert from "node:assert/strict";
import { BUNDLED_LESSONS } from "../../generated/lesson-catalog.js";
import { releasePath } from "./server.mjs";
import { mockMidi, selectLesson, waitForLesson, setBpm, selectView, ready, playing, stopped, observePlayback } from "./helpers.mjs";

export async function catalogFlow(browser, url) {
    const context = await browser.newContext();
    await mockMidi(context);
    try {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`); });
        await page.goto(url);
        await ready(page);
        assert.deepEqual(await page.locator("#lesson-menu > [data-folder]").evaluateAll(options => options.map(option => option.textContent)),
            ["Songs", "Swing", "Swing [YouTube]"]);
        for (const { id, title, group } of BUNDLED_LESSONS) {
            await selectLesson(page, id);
            await waitForLesson(page, id);
            assert.equal(await page.locator(`[data-lesson-id="${id}"]`).textContent(), title);
            assert.equal(await page.locator("#lesson").getAttribute("data-group"), group);
            assert.deepEqual(await page.locator(`#lesson-menu [role="menu"][data-group="${group}"] [data-lesson-id]`).evaluateAll(options => options.map(option => option.dataset.lessonId)),
                BUNDLED_LESSONS.filter(entry => entry.group === group).map(entry => entry.id));
        }
        assert.deepEqual(errors, []);
        await selectLesson(page, "swing-exercise-07");
        await waitForLesson(page, "swing-exercise-07");
        await page.locator("#notation-sheet svg").first().waitFor();
        const barline = page.locator("#notation-sheet .notation-barline").first();
        assert.equal(await barline.evaluate(line => getComputedStyle(line).strokeWidth), "1.8px");
        assert.equal(await barline.evaluate(line => getComputedStyle(line).stroke), "rgb(36, 40, 32)");
        assert.equal(await barline.evaluate(line => Number(line.getAttribute("y2")) - Number(line.getAttribute("y1"))), 40);
        if (new URL(url).pathname === "/") await page.screenshot({ path: "/tmp/rhythm-swing-exercise-07.png", fullPage: true });
        await selectView(page, "lanes");
        assert.equal(await page.locator(".track").count(), 3);
        await setBpm(page, 93);
        await page.reload();
        await waitForLesson(page, "swing-exercise-07");
        assert.equal(await page.locator("#bpm-level").textContent(), "93");
        assert.equal(await page.locator("#lesson").getAttribute("data-group"), "Swing");
        assert.equal(await page.locator('#lesson-menu [data-group="Swing"] [data-lesson-id]').count(), 14);
        await selectLesson(page, "swing-exercise-08");
        await waitForLesson(page, "swing-exercise-08");
        await selectView(page, "notation");
        await page.locator("#notation-sheet svg").first().waitFor();
        if (new URL(url).pathname === "/") await page.screenshot({ path: "/tmp/rhythm-swing-exercise-08.png", fullPage: true });
        assert.deepEqual(errors, []);
        console.log(`PASS grouped repository lesson catalog, nested assets, new exercises and persistence: ${new URL(url).pathname}`);
    } finally { await context.close(); }
}

export async function lessonMenuFlow(browser, url) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, hasTouch: true });
    await mockMidi(context);
    try {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.goto(url);
        await ready(page);
        await page.locator("#lesson").click();
        assert.equal(await page.getByRole("menuitemradio").count(), 0, "Start with folders only");
        await page.getByRole("menuitem", { name: "Swing", exact: true }).hover();
        assert.equal(await page.getByRole("menuitemradio").count(), 14);
        if (new URL(url).pathname === "/") await page.screenshot({ path: "/tmp/rhythm-nested-desktop.png" });
        await page.getByRole("menuitem", { name: "Songs", exact: true }).hover();
        assert.equal(await page.getByRole("menuitemradio").count(), 4);
        await page.keyboard.press("Escape");
        await selectLesson(page, "swing-exercise-20");
        await waitForLesson(page, "swing-exercise-20");
        await page.reload();
        await waitForLesson(page, "swing-exercise-20");
        assert.equal(await page.locator('#lesson-menu [data-lesson-id="swing-exercise-20"]').getAttribute("aria-checked"), "true");
        await page.locator("#practice-panel > summary").click();
        await page.locator("#count-in").uncheck();
        await page.locator("#practice-panel > summary").click();
        await observePlayback(page);
        await page.locator("#start-stop").click();
        await playing(page);
        const origin = await page.evaluate(() => window.smoke.assessment.origin);
        await page.locator("#lesson").focus();
        await page.keyboard.press("ArrowDown");
        assert.equal(await page.evaluate(() => document.activeElement.dataset.folder), "Songs");
        await page.keyboard.press("ArrowRight");
        assert.equal(await page.evaluate(() => document.activeElement.dataset.lessonId), "californication");
        await page.keyboard.press("End");
        assert.equal(await page.evaluate(() => document.activeElement.dataset.lessonId), "fascination-street");
        await page.keyboard.press("ArrowLeft");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowRight");
        assert.equal(await page.evaluate(() => document.activeElement.dataset.lessonId), "swing-exercise-07");
        await page.keyboard.press("End");
        await page.keyboard.press("Escape");
        assert.equal(await page.locator("#lesson").evaluate(button => button === document.activeElement), true);
        assert.equal(await page.evaluate(() => window.smoke.assessment.origin), origin, "Browsing does not restart playback");
        assert.equal(await page.locator("#start-stop").getAttribute("data-running"), "true");
        await page.locator("#lesson").press("Enter");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("Enter");
        await waitForLesson(page, "swing-exercise-07");
        await stopped(page);
        assert.equal(await page.locator("#lesson-previous").isDisabled(), true);
        let release;
        const held = new Promise(resolve => { release = resolve; });
        await page.route("**/swing-exercise-08.json", async route => {
            await held;
            await route.fulfill({ status: 503, body: "Unavailable" });
        });
        await page.locator("#start-stop").click();
        await playing(page);
        await page.getByRole("button", { name: "Next lesson", exact: true }).click();
        await stopped(page);
        assert.equal(await page.locator("#lesson-previous").isDisabled(), true);
        assert.equal(await page.locator("#lesson-next").isDisabled(), true);
        assert.equal(await page.locator("#start-stop").isDisabled(), true);
        assert.equal(await page.locator("#start-stop").getAttribute("aria-busy"), "true");
        assert.equal(await page.locator("#start-stop").evaluate(button => getComputedStyle(button).opacity), "1");
        release();
        await page.locator("#lesson-error").waitFor({ state: "visible" });
        assert.equal(await page.locator("#start-stop").getAttribute("aria-busy"), null);
        assert.equal(await page.locator("#start-stop").isEnabled(), true);
        assert.equal(await page.locator("#lesson").evaluate(button => button.value), "swing-exercise-07");
        await page.unroute("**/swing-exercise-08.json");
        await page.locator("#lesson-next").click();
        await waitForLesson(page, "swing-exercise-08");
        await page.getByRole("button", { name: "Previous lesson", exact: true }).press("Enter");
        await waitForLesson(page, "swing-exercise-07");
        await page.reload();
        await waitForLesson(page, "swing-exercise-07");
        await selectLesson(page, "californication");
        assert.equal(await page.locator("#lesson-previous").isDisabled(), true);
        await page.locator("#lesson-next").click();
        await waitForLesson(page, "chop-suey");
        await selectLesson(page, "fascination-street");
        assert.equal(await page.locator("#lesson-next").isDisabled(), true);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.locator("#lesson").tap();
        await page.getByRole("menuitem", { name: "Swing", exact: true }).tap();
        const fit = await page.locator('#lesson-menu, .lesson-submenu:not([hidden])').evaluateAll(menus => menus.every(menu => {
            const rect = menu.getBoundingClientRect();
            return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight;
        }));
        assert.equal(fit, true, "Folder and flyout fit a narrow screen");
        if (new URL(url).pathname === "/") await page.screenshot({ path: "/tmp/rhythm-nested-narrow.png" });
        await page.getByRole("menuitemradio", { name: "Swing exercise 20", exact: true }).tap();
        await waitForLesson(page, "swing-exercise-20");
        assert.equal(await page.locator("#lesson-next").isDisabled(), true);
        await page.locator("#lesson-previous").tap();
        await waitForLesson(page, "swing-exercise-19");
        await page.locator("#lesson-next").tap();
        await waitForLesson(page, "swing-exercise-20");
        await page.locator("#lesson").tap();
        await page.locator(".wordmark").tap();
        assert.equal(await page.locator("#lesson-menu").evaluate(menu => menu.matches(":popover-open")), false);
        assert.deepEqual(errors, []);
        console.log(`PASS nested lesson menu, hover, keyboard, touch, focus, persistence and playback continuity: ${new URL(url).pathname}`);
    } finally { await context.close(); }
}

export async function cacheFlow(browser, url) {
    const context = await browser.newContext();
    await mockMidi(context);
    try {
        const page = await context.newPage();
        await page.goto(new URL("cache-check.html", url).href);
        await page.waitForFunction(() => globalThis.legacyRelease === true);
        assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor), "rgb(255, 255, 255)");
        const requests = [];
        page.on("request", request => requests.push(request.url()));
        await page.goto(url);
        await ready(page);
        await selectView(page, "notation");
        await page.locator("#notation-score svg").waitFor();
        assert.equal(await page.evaluate(() => Boolean(globalThis.legacyRelease)), false, "The cached old module is not used");
        assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor), "rgb(23, 34, 28)");
        const assets = requests.filter(url => /\.(css|js|json|wav)$/.test(url));
        assert.ok(assets.length > 10);
        assert.ok(assets.every(url => url.includes(`/${releasePath}`)), "The whole runtime uses one release path");
        assert.ok(assets.every(asset => new URL(asset).origin === new URL(url).origin), "No external assets");
        console.log(`PASS cached prior CSS/module cannot mix with versioned release: ${new URL(url).pathname}`);
    } finally { await context.close(); }
}
