import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { BUNDLED_LESSONS } from "../src/lesson-catalog.js";

// Serve only the selected mount. A root-relative asset fails in the subpath run.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".wav": "audio/wav" };
async function serve(mount) {
    const server = createServer(async (request, response) => {
        try {
            const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
            if (!pathname.startsWith(mount)) throw new Error("Outside test mount");
            const path = resolve(root, pathname.slice(mount.length) || "index.html");
            if (!path.startsWith(root + sep)) throw new Error("Outside repository");
            const body = await readFile(path);
            response.writeHead(200, { "Content-Type": types[extname(path)] || "application/octet-stream" });
            response.end(body);
        } catch {
            response.writeHead(404);
            response.end("Not found");
        }
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    return {
        url: `http://127.0.0.1:${server.address().port}${mount}`,
        close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }),
    };
}

async function ready(page) {
    await page.waitForFunction(() => document.querySelector("#start-stop")?.disabled === false);
}
async function playing(page) {
    await page.waitForFunction(() => document.querySelector("#status").textContent.startsWith("Playing"));
}
async function stopped(page) {
    assert.equal(await page.locator("#start-stop").getAttribute("data-running"), "false");
}

// Observe the real audio and assessment calls; keep native timers and audio running.
async function observePlayback(page) {
    await page.evaluate(async () => {
        const { Assessment } = await import("./src/assessment.js");
        const { DrumAudio } = await import("./src/audio.js");
        window.smoke = { scheduled: [], nativeSetInterval: window.setInterval, nativeClearInterval: window.clearInterval };
        const schedule = DrumAudio.prototype.schedule;
        DrumAudio.prototype.schedule = function (...args) {
            window.smoke.audio = this;
            window.smoke.scheduled.push(args);
            return schedule.apply(this, args);
        };
        const advance = Assessment.prototype.advance;
        Assessment.prototype.advance = function (...args) {
            window.smoke.assessment = this;
            return advance.apply(this, args);
        };
        window.smoke.stamp = (beat, errorMs = 0) => {
            const anchor = window.smoke.audio.context.getOutputTimestamp();
            const session = window.smoke.assessment;
            return anchor.performanceTime + (session.origin + beat * 60 / session.bpm - anchor.contextTime) * 1000 + errorMs;
        };
    });
}
async function timedKey(page, code, beat, errorMs = 0) {
    return page.evaluate(({ code, beat, errorMs }) => {
        const event = new KeyboardEvent("keydown", { code, bubbles: true, cancelable: true });
        Object.defineProperty(event, "timeStamp", { value: window.smoke.stamp(beat, errorMs) });
        document.querySelector("#timeline").dispatchEvent(event);
        return window.smoke.assessment.hits.at(-1);
    }, { code, beat, errorMs });
}

async function practiceFlow(browser, url) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    try {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
        page.on("requestfailed", request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
        page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`); });
        await page.goto(url);
        await ready(page);
        assert.equal(await page.locator("#lesson option").count(), BUNDLED_LESSONS.length);
        for (const { id } of BUNDLED_LESSONS) {
            const lesson = JSON.parse(await readFile(resolve(root, "lessons", `${id}.json`), "utf8"));
            await page.locator("#lesson").selectOption(id);
            await page.waitForFunction(title => document.querySelector("#lesson-title").textContent === title, lesson.title);
            assert.deepEqual(await page.locator(".track").evaluateAll(lanes => lanes.map(lane => lane.dataset.instrument)),
                lesson.tracks.map(track => track.instrument));
        }
        await page.locator("#lesson").selectOption("swing-ride");
        await page.waitForFunction(() => document.querySelectorAll(".track").length === 4 && document.querySelector("#lesson-title").textContent === "Swing ride and hi-hat");
        await page.locator("#bpm").fill("240");
        await page.locator("#practice-panel summary").click();
        await page.locator("#tolerance").fill("10");
        await page.locator("#latency-offset").fill("");
        await page.locator("#practice-panel summary").click();
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
        await page.waitForFunction(() => window.smoke.audio.context.getOutputTimestamp().performanceTime > 0);
        for (const [code, beat, errorMs, expected] of [
            ["KeyK", 0, 0, "on_time"], ["KeyJ", 1, -20, "early"], ["KeyK", 1, 20, "late"],
        ]) {
            const hit = await timedKey(page, code, beat, errorMs);
            assert.equal(hit.status, expected);
            assert.equal(hit.source, "keyboard");
            assert.ok(Math.abs(hit.errorMs - errorMs) < 0.01);
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
            await page.locator(`#${bus}-volume`).fill("20");
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
            await page.locator("#practice-panel summary").click();
        }
        await page.locator("#count-in").uncheck();
        await page.locator("#start-stop").click();
        await playing(page);
        assert.equal(await page.evaluate(() => window.smoke.assessment.hits.length), 0);
        await page.locator("#bpm").fill("180");
        await stopped(page);
        await page.locator("#keyboard-panel summary").click();
        await page.getByRole("combobox", { name: "Ride key", exact: true }).selectOption("KeyR");
        assert.match(await page.locator("#keyboard-hint").textContent(), /R: ride/);
        await page.reload();
        await ready(page);
        assert.equal(await page.locator("#bpm").inputValue(), "180");
        assert.equal(await page.locator("#bpm-level").textContent(), "180");
        assert.equal(await page.locator("#practice-panel").getAttribute("open"), null);
        await page.locator("#bpm").focus();
        await page.keyboard.press("ArrowRight");
        assert.ok(Number(await page.locator("#bpm").inputValue()) > 180);
        assert.equal(await page.locator("#bpm-level").textContent(), await page.locator("#bpm").inputValue());
        assert.equal(await page.locator("#count-in").isChecked(), false);
        assert.equal(await page.locator("#guide-volume").inputValue(), "20");
        assert.match(await page.locator("#keyboard-hint").textContent(), /R: ride/);
        await page.locator("#start-stop").click();
        await playing(page);
        await page.locator("#lesson").selectOption("basic-straight");
        await page.waitForFunction(() => document.querySelectorAll(".track").length === 3);
        await stopped(page);
        await page.setViewportSize({ width: 390, height: 844 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        // The preserved metronome must also resolve its relative assets at either mount.
        await page.getByRole("link", { name: /Original metronome/ }).click();
        await page.locator("#startStop").waitFor();
        assert.deepEqual(errors, []);
        console.log(`PASS practice flow: ${new URL(url).pathname}`);
    } finally { await context.close(); }
}

async function trackFlow(browser, url) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    try {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.goto(url);
        await ready(page);
        await page.locator("#bpm").fill("300");
        if (await page.locator("#practice-panel").getAttribute("open") === null) {
            await page.locator("#practice-panel summary").click();
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
        for (const name of ["Hi-hat", "Snare", "Kick"]) {
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

async function failureRecovery(browser, url) {
    const context = await browser.newContext();
    try {
        const page = await context.newPage();
        await page.route("**/src/lesson-catalog.js", route => route.abort("connectionfailed"));
        await page.goto(url);
        await page.getByRole("button", { name: "Reload page", exact: true }).waitFor();
        assert.equal(await page.locator("#start-stop").isDisabled(), true);
        await page.unroute("**/src/lesson-catalog.js");
        await page.getByRole("button", { name: "Reload page", exact: true }).click();
        await ready(page);
        const previousTitle = await page.locator("#lesson-title").textContent();
        await page.route("**/lessons/basic-straight.json", route => route.fulfill({ contentType: "application/json", body: "{bad}" }));
        await page.locator("#lesson").selectOption("basic-straight");
        await page.locator("#lesson-error").waitFor();
        assert.match(await page.locator("#lesson-error").textContent(), /invalid JSON/);
        assert.equal(await page.locator("#lesson-title").textContent(), previousTitle);
        assert.equal(await page.locator("#start-stop").isEnabled(), true);
        await page.unroute("**/lessons/basic-straight.json");
        await page.locator("#lesson").selectOption("basic-straight");
        await page.waitForFunction(() => document.querySelectorAll(".track").length === 3);
        const fastLesson = JSON.parse(await readFile(resolve(root, "lessons/basic-straight.json"), "utf8"));
        fastLesson.bpm = 400;
        await page.route("**/lessons/basic-straight.json", route => route.fulfill({ contentType: "application/json", body: JSON.stringify(fastLesson) }));
        await page.locator("#lesson").selectOption("swing-ride");
        await page.waitForFunction(() => document.querySelectorAll(".track").length === 4);
        await page.locator("#lesson").selectOption("basic-straight");
        await page.waitForFunction(() => document.querySelector("#bpm-level").textContent === "300");
        assert.match(await page.locator("#status").textContent(), /Tempo set to 300 BPM/);
        console.log(`PASS loading failure recovery: ${new URL(url).pathname}`);
    } finally { await context.close(); }
}

async function midiFlow(browser, url) {
    const context = await browser.newContext();
    try {
        await context.addInitScript(() => {
            const kit = { id: "kit", name: "Simulated MPS-850", manufacturer: "Test", state: "connected", onmidimessage: null,
                async open() {}, async close() {} };
            const access = { inputs: new Map([[kit.id, kit]]), onstatechange: null };
            window.midiTest = {
                requests: [],
                send(note, velocity = 90, timeStamp = performance.now()) {
                    const event = new MIDIMessageEvent("midimessage", { data: new Uint8Array([0x99, note, velocity]) });
                    Object.defineProperty(event, "timeStamp", { value: timeStamp });
                    kit.onmidimessage?.(event);
                },
                connect(connected) { kit.state = connected ? "connected" : "disconnected"; access.onstatechange?.(); },
            };
            Object.defineProperty(navigator, "requestMIDIAccess", { configurable: true, value: async options => {
                window.midiTest.requests.push(options);
                return access;
            } });
        });
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.goto(url);
        await ready(page);
        assert.deepEqual(await page.evaluate(() => window.midiTest.requests), []);
        await page.locator("#midi-panel summary").click();
        await page.locator("#midi-connect").click();
        await page.waitForFunction(() => !document.querySelector("#midi-device").disabled);
        assert.deepEqual(await page.evaluate(() => window.midiTest.requests), [{ sysex: false }]);
        assert.equal(await page.locator("#midi-device").inputValue(), "");
        await page.locator("#midi-device").selectOption("kit");
        for (const [instrument, note] of [["kick", 36], ["snare", 38], ["hi_hat", 42], ["hi_hat", 44], ["ride", 59]]) {
            await page.locator(`.midi-learn[data-instrument="${instrument}"]`).click();
            await page.evaluate(note => window.midiTest.send(note), note);
        }
        assert.equal(await page.locator(".midi-note").count(), 5);
        if (await page.locator("#practice-panel").getAttribute("open") === null) {
            await page.locator("#practice-panel summary").click();
        }
        await page.locator("#count-in").uncheck();
        await observePlayback(page);
        await page.locator("#start-stop").click();
        await playing(page);
        await page.waitForFunction(() => window.smoke.audio.context.getOutputTimestamp().performanceTime > 0);
        const hit = await page.evaluate(() => {
            window.midiTest.send(59, 77, window.smoke.stamp(0));
            return window.smoke.assessment.hits.at(-1);
        });
        assert.equal(hit.status, "on_time");
        assert.equal(hit.source, "midi");
        assert.equal(hit.velocity, 77);
        assert.ok(Math.abs(hit.errorMs) < 0.01);
        const count = await page.evaluate(() => window.smoke.assessment.hits.length);
        await page.evaluate(() => window.midiTest.send(59, 0));
        assert.equal(await page.evaluate(() => window.smoke.assessment.hits.length), count);
        await page.getByRole("button", { name: "Disable Ride track", exact: true }).click();
        await stopped(page);
        await page.keyboard.press("Space");
        await playing(page);
        await page.evaluate(() => window.midiTest.send(59));
        assert.equal(await page.evaluate(() => window.smoke.assessment.hits.length), 0);
        assert.match(await page.locator("#midi-monitor").textContent(), /Ride/);
        await page.evaluate(() => window.midiTest.connect(false));
        await stopped(page);
        await page.evaluate(() => window.midiTest.connect(true));
        await page.waitForFunction(() => document.querySelector("#midi-status").textContent.includes("Listening"));
        await stopped(page);
        await page.reload();
        await ready(page);
        assert.deepEqual(await page.evaluate(() => window.midiTest.requests), []);
        await page.locator("#midi-panel summary").click();
        assert.equal(await page.locator(".midi-note").count(), 5);
        await page.locator("#midi-connect").click();
        await page.waitForFunction(() => document.querySelector("#midi-status").textContent.includes("Listening"));
        assert.equal(await page.locator("#midi-device").inputValue(), "kit");
        assert.deepEqual(errors, []);
        console.log(`PASS simulated MIDI: ${new URL(url).pathname}`);
    } finally { await context.close(); }
}

let browser;
try {
    // launch() creates a disposable profile. Never use connectOverCDP or launchPersistentContext.
    browser = await chromium.launch({ channel: "chrome", headless: true });
    for (const mount of ["/", "/rhythm-trainer/"]) {
        const server = await serve(mount);
        try {
            await practiceFlow(browser, server.url);
            await trackFlow(browser, server.url);
            await failureRecovery(browser, server.url);
            await midiFlow(browser, server.url);
        } finally { await server.close(); }
    }
    console.log("Browser checks passed. Real-kit timing and audible sound quality still need manual checks.");
} finally { await browser?.close(); }
