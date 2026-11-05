import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { positionFromBpm } from "../src/tempo.js";
import { defaultPracticeSettings, PRACTICE_SETTINGS_KEY } from "../src/practice-settings.js";
import { FIXTURE_LESSONS } from "./fixtures/lessons.js";
import { lessonNotation } from "../src/notation/model.js";
import { BUNDLED_LESSONS } from "../generated/lesson-catalog.js";

// Serve only the selected mount. A root-relative asset fails in the subpath run.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../_site");
const artifactHtml = await readFile(resolve(root, "index.html"), "utf8");
const releasePath = artifactHtml.match(/<base href="\.\/(runtime\/[a-f0-9]{16}\/)"/)[1];
const runtimeRoot = resolve(root, releasePath);
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".wav": "audio/wav" };
async function serve(mount) {
    const server = createServer(async (request, response) => {
        try {
            const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
            if (!pathname.startsWith(mount)) throw new Error("Outside test mount");
            // Seed an older unversioned release in the real HTTP cache. Routing
            // mocks disable that cache, so cacheFlow uses these native responses.
            const legacy = {
                [`${mount}cache-check.html`]: ["text/html", '<link rel="stylesheet" href="./style.css"><script type="module" src="./src/app.js"></script>'],
                [`${mount}style.css`]: ["text/css", ':root { background: white; }'],
                [`${mount}src/app.js`]: ["text/javascript", 'globalThis.legacyRelease = true;'],
            }[pathname];
            if (legacy) {
                response.writeHead(200, { "Content-Type": legacy[0], "Cache-Control": "public, max-age=3600" });
                response.end(legacy[1]);
                return;
            }
            const path = resolve(root, pathname.slice(mount.length) || "index.html");
            if (!path.startsWith(root + sep)) throw new Error("Outside site artifact");
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

async function mockMidi(context, options = {}) {
    // Never enumerate the developer's real devices in automated browser checks.
    await context.addInitScript(({ ports = [], denied = false, busy = false, unsupported = false }) => {
        const makePort = id => ({ id, name: id, state: "connected", onmidimessage: null,
            async open() { if (window.midiTest.busy) throw new Error("Device busy"); }, async close() {} });
        const access = { inputs: new Map(ports.map(id => [id, makePort(id)])), onstatechange: null };
        window.midiTest = {
            denied, busy, requests: [],
            sendData(id, data, timeStamp = performance.now()) {
                const event = new MIDIMessageEvent("midimessage", { data: new Uint8Array(data) });
                Object.defineProperty(event, "timeStamp", { value: timeStamp });
                access.inputs.get(id)?.onmidimessage?.(event);
            },
            connect(id, connected) { access.inputs.get(id).state = connected ? "connected" : "disconnected"; access.onstatechange?.(); },
            addPort(id) { access.inputs.set(id, makePort(id)); access.onstatechange?.(); },
        };
        Object.defineProperty(navigator, "requestMIDIAccess", { configurable: true, value: unsupported ? undefined : async options => {
            window.midiTest.requests.push(options);
            if (window.midiTest.denied) throw new DOMException("Permission denied", "NotAllowedError");
            return access;
        } });
    }, options);
}

async function mockFixtureLessons(context) {
    const catalog = [...BUNDLED_LESSONS, ...Object.entries(FIXTURE_LESSONS).map(([id, lesson]) => ({ id, title: lesson.title }))];
    await context.route("**/generated/lesson-catalog.js", route => route.fulfill({
        contentType: "text/javascript", body: `export const BUNDLED_LESSONS = ${JSON.stringify(catalog)};`,
    }));
    for (const [id, lesson] of Object.entries(FIXTURE_LESSONS)) {
        await context.route(`**/lessons/${id}.json`, route => route.fulfill({
            contentType: "application/json", body: JSON.stringify(lesson),
        }));
    }
}

async function catalogFlow(browser, url) {
    const context = await browser.newContext();
    await mockMidi(context);
    try {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`); });
        await page.goto(url);
        await ready(page);
        assert.equal(await page.locator("#lesson option").count(), BUNDLED_LESSONS.length);
        for (const { id, title } of BUNDLED_LESSONS) {
            await page.locator("#lesson").selectOption(id);
            await waitForLesson(page, id);
        }
        assert.deepEqual(errors, []);
        console.log(`PASS repository lesson catalog: ${new URL(url).pathname}`);
    } finally { await context.close(); }
}

async function waitForLesson(page, id) {
    await page.waitForFunction(id => document.querySelector("#lesson").dataset.loadedId === id, id);
}

async function setBpm(page, bpm) {
    await page.locator("#bpm").fill(String(positionFromBpm(bpm)));
    assert.equal(await page.locator("#bpm-level").textContent(), String(bpm));
}

async function selectView(page, view) {
    const button = page.locator(`#view-${view}`);
    if (await button.getAttribute("aria-pressed") === "true") return;
    const panel = page.locator("#practice-panel");
    const wasOpen = await panel.getAttribute("open") !== null;
    if (!wasOpen) await page.locator("#practice-panel > summary").click();
    await button.click();
    if (!wasOpen) await page.locator("#practice-panel > summary").click();
}

async function oneScoreColumn(page) {
    await page.waitForFunction(() => document.querySelector("#notation-sheet").style.getPropertyValue("--score-columns") === "1");
}

async function seedLanes(context) {
    await context.addInitScript(({ key, settings }) => {
        if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(settings));
    }, { key: PRACTICE_SETTINGS_KEY, settings: { ...defaultPracticeSettings(), view: "lanes" } });
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
        const loadSamples = DrumAudio.prototype.loadSamples;
        DrumAudio.prototype.loadSamples = function (...args) {
            window.smoke.audio = this;
            return loadSamples.apply(this, args);
        };
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
        (document.querySelector("#notation-panel:not([hidden]) #notation-score")
            ?? document.querySelector("#timeline")).dispatchEvent(event);
        return window.smoke.assessment.hits.at(-1);
    }, { code, beat, errorMs });
}

async function practiceFlow(browser, url) {
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
        assert.equal(await page.locator("#lesson option").count(), BUNDLED_LESSONS.length + Object.keys(FIXTURE_LESSONS).length);
        for (const { id } of BUNDLED_LESSONS) {
            const lesson = JSON.parse(await readFile(resolve(runtimeRoot, "lessons", `${id}.json`), "utf8"));
            await page.locator("#lesson").selectOption(id);
            await waitForLesson(page, id);
            assert.deepEqual(await page.locator(".track").evaluateAll(lanes => lanes.map(lane => lane.dataset.instrument)),
                lesson.tracks.map(track => track.instrument));
        }
        await page.locator("#lesson").selectOption("swing-ride");
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
            assert.ok(Math.abs(hit.errorMs - errorMs) < 0.01,
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
        assert.equal(await page.locator("#guide-volume").inputValue(), "20");
        assert.match(await page.locator("#keyboard-hint").textContent(), /R: ride/);
        await page.locator("#start-stop").click();
        await playing(page);
        await page.locator("#lesson").selectOption("basic-straight");
        await page.waitForFunction(() => document.querySelectorAll(".track").length === 3);
        await stopped(page);
        await page.setViewportSize({ width: 390, height: 844 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        assert.deepEqual(errors, []);
        console.log(`PASS practice flow: ${new URL(url).pathname}`);
    } finally { await context.close(); }
}

async function trackFlow(browser, url) {
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
        await page.locator("#lesson").selectOption("swing-01");
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
                && document.querySelectorAll('.lesson-controls input[type="range"]').length === 4;
        }), true);
        assert.deepEqual(errors, []);
        console.log(`PASS track controls and Space transport: ${new URL(url).pathname}`);
    } finally { await context.close(); }
}

async function failureRecovery(browser, url) {
    const context = await browser.newContext();
    let releaseSamples = () => {};
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
        await page.locator("#lesson").selectOption("basic-straight");
        await page.locator("#lesson-error").waitFor();
        assert.match(await page.locator("#lesson-error").textContent(), /invalid JSON/);
        assert.equal(await page.locator("#lesson").getAttribute("data-loaded-id"), previousId);
        assert.equal(await page.locator("#start-stop").isEnabled(), true);
        await page.unroute("**/lessons/basic-straight.json");
        await page.locator("#lesson").selectOption("basic-straight");
        await page.waitForFunction(() => document.querySelectorAll(".track").length === 3);
        const fastLesson = structuredClone(FIXTURE_LESSONS["basic-straight"]);
        fastLesson.bpm = 400;
        await page.route("**/lessons/basic-straight.json", route => route.fulfill({ contentType: "application/json", body: JSON.stringify(fastLesson) }));
        await page.locator("#lesson").selectOption("swing-ride");
        await page.waitForFunction(() => document.querySelectorAll(".track").length === 4);
        await page.locator("#lesson").selectOption("basic-straight");
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
    } finally { releaseSamples(); await context.close(); }
}

async function midiFlow(browser, url) {
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
        await page.locator("#lesson").selectOption("mps-850-check");
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

async function notationFlow(browser, url) {
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
        await page.locator("#lesson").selectOption("swing-03");
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
        await page.locator("#lesson").selectOption("fascination-street");
        await page.waitForFunction(() => document.querySelector("#notation-page").textContent === "Bar 1 of 4");
        await page.locator("#notation-next").click();
        assert.equal(await page.locator("#notation-page").textContent(), "Bar 2 of 4");
        await page.locator("#lesson").selectOption("swing-ride");
        await page.waitForFunction(() => document.querySelector("#notation-page").textContent === "Bar 1 of 1");
        assert.equal(await page.locator("#notation-instruments button").count(), 4, "Empty tracks retain their controls");
        // Unsupported ticks are a test-only fixture; all production lessons now render.
        await page.route("**/lessons/come-undone.json", route => route.fulfill({ json: {
            version: 1, title: "Unsupported test rhythm", bpm: 80, bars: 1, time_signature: [4, 4],
            tracks: [{ instrument: "snare", notes: [0, 383] }],
        } }));
        await page.locator("#lesson").selectOption("come-undone");
        await page.locator("#notation-error").waitFor();
        assert.equal(await page.locator("#timeline").isVisible(), true);
        assert.equal(await page.locator("#start-stop").isEnabled(), true);
        await page.locator("#lesson").selectOption("swing-03");
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

async function scoreFollowingFlow(browser, url) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    await mockMidi(context);
    try {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.goto(url);
        await ready(page);
        await page.locator("#lesson").selectOption("fascination-street");
        await waitForLesson(page, "fascination-street");
        await selectView(page, "notation");
        await page.locator("#notation-next-score svg").waitFor();
        // Check the real engraver, not a hand-authored x-axis: hit centers must
        // be reached at performance ticks even when written swing positions differ.
        const geometryChecks = await page.evaluate(async () => {
            const { lessonNotation } = await import("./src/notation/model.js");
            const { renderScoreBar } = await import("./src/notation/renderer.js");
            const { markerX } = await import("./src/notation/position.js");
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
                    const response = await fetch(`./lessons/${id}.json`);
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

async function notationFeedbackFlow(browser, url) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    await mockMidi(context, { ports: ["kit"] });
    try {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.goto(url);
        await ready(page);
        await page.locator("#lesson").selectOption("swing-01");
        await waitForLesson(page, "swing-01");
        await selectView(page, "notation");
        await page.locator("#notation-score svg").waitFor();
        await page.locator("#practice-panel > summary").click();
        await page.locator("#count-in").uncheck();
        await page.locator("#tolerance").fill("10");
        await setBpm(page, 60);
        await observePlayback(page);
        await page.locator("#start-stop").click();
        await playing(page);
        await page.waitForFunction(() => window.smoke.audio.context.getOutputTimestamp().performanceTime > 0);
        const headsBefore = await page.locator("#notation-score [data-note-id]").count();
        const stemBefore = await page.locator("#notation-score .vf-stem path").first().evaluate(node => getComputedStyle(node).stroke);
        assert.equal((await timedKey(page, "KeyK", 0, -20)).status, "early");
        assert.equal((await timedKey(page, "KeyF", 0, 20)).status, "late");
        assert.equal((await timedKey(page, "KeyH", 1)).status, "on_time");
        await page.waitForFunction(() => document.querySelector('[data-note-id="snare:0"]').dataset.timing === "late");
        const shared = await page.evaluate(() => {
            const ride = document.querySelector('#notation-score [data-note-id="ride:0"]');
            const snare = document.querySelector('#notation-score [data-note-id="snare:0"]');
            const pedal = document.querySelector('#notation-score [data-note-id="hi_hat_pedal:96"]');
            return { sameStem: ride.closest(".vf-stavenote") === snare.closest(".vf-stavenote"),
                states: [ride.dataset.timing, snare.dataset.timing, pedal.dataset.timing],
                colors: [ride, snare, pedal].map(head => getComputedStyle(head.querySelector("text")).fill),
                stem: getComputedStyle(ride.closest(".vf-stavenote").querySelector(".vf-stem path")).stroke };
        });
        assert.equal(shared.sameStem, true);
        assert.deepEqual(shared.states, ["early", "late", "on_time"]);
        assert.equal(new Set(shared.colors).size, 3);
        assert.equal(shared.stem, stemBefore, "Keep shared stems/beam unchanged");
        for (const [note, beat] of [[51, 1], [59, 2]]) {
            assert.equal(await page.evaluate(({ note, beat }) => {
                window.midiTest.sendData("kit", [0x99, note, 77], window.smoke.stamp(beat));
                return window.smoke.assessment.hits.at(-1).status;
            }, { note, beat }), "on_time");
        }
        await page.waitForFunction(() => document.querySelector('#notation-score [data-note-id="ride:192"]').dataset.timing === "on_time");
        await page.evaluate(() => window.midiTest.sendData("kit", [0x99, 59, 114], window.smoke.stamp(0, 17)));
        await page.locator("#notation-score .notation-extra-hit").waitFor();
        assert.equal(await page.locator('#notation-score [data-note-id="ride:0"]').getAttribute("data-timing"), "early");
        assert.equal(await page.locator("#notation-score [data-note-id]").count(), headsBefore, "Extra hits do not create written noteheads");
        assert.match(await page.locator("#notation-feedback").textContent(), /Ride.*Extra/);
        await page.waitForFunction(() => document.querySelector('#notation-score [data-note-id="kick:0"]').dataset.timing === "missed");
        assert.equal((await timedKey(page, "KeyD", 0, 5)).status, "on_time");
        await page.waitForFunction(() => document.querySelector('#notation-score [data-note-id="kick:0"]').dataset.timing === "on_time");
        assert.match(await page.locator('#notation-score [data-note-id="kick:0"] title').textContent(), /Kick.*On time \+5.0 ms/);
        await page.waitForFunction(() => document.querySelector('#notation-score [data-note-id="snare:160"]').dataset.timing === "missed");
        await page.evaluate(() => window.midiTest.sendData("kit", [0x99, 59, 114], window.smoke.stamp(0, 17)));
        await page.locator("#notation-score .notation-extra-hit").waitFor();
        if (new URL(url).pathname === "/") await page.screenshot({ path: "/tmp/rhythm-notation-feedback-desktop.png", fullPage: true });
        await page.waitForFunction(() => document.querySelectorAll("#notation-score .notation-extra-hit").length === 0);
        await page.waitForFunction(() => Number(document.querySelector("#session-loops").textContent) >= 1);
        const newLoop = await page.locator('#notation-score [data-note-id="ride:0"]').getAttribute("data-iteration");
        assert.equal(newLoop, "1");
        assert.ok(["waiting", "missed"].includes(await page.locator('#notation-score [data-note-id="ride:0"]').getAttribute("data-timing")), "Do not reuse the prior loop's early hit");
        assert.equal(await page.locator('[data-absolute-bar="0"] [data-note-id="ride:0"]').getAttribute("data-timing"), "early",
            "Prior rows preserve their own loop feedback");
        await page.locator("#start-stop").click();
        await stopped(page);
        const summary = await page.locator(".session-summary").textContent();
        const state = await page.locator('#notation-score [data-note-id="ride:0"]').getAttribute("data-timing");
        await selectView(page, "lanes");
        await selectView(page, "notation");
        await page.locator("#notation-score svg").waitFor();
        assert.equal(await page.locator(".session-summary").textContent(), summary);
        assert.equal(await page.locator('#notation-score [data-note-id="ride:0"]').getAttribute("data-timing"), state);
        await page.locator("#count-in").check();
        await page.locator("#start-stop").click();
        await page.waitForFunction(() => document.querySelector("#status").textContent.startsWith("Count-in"));
        assert.equal(await page.locator('#notation-score [data-note-id="ride:0"]').getAttribute("data-timing"), "waiting");
        assert.equal(await page.locator("#notation-feedback").textContent(), "Play to see timing feedback.");
        await page.locator("#start-stop").click();
        await page.getByRole("button", { name: "Disable Snare in notation", exact: true }).click();
        assert.equal(await page.locator('#notation-score [data-note-id="snare:0"]').getAttribute("data-timing"), "disabled");
        assert.equal(await page.locator("#score-on_time").textContent(), "0");
        await page.setViewportSize({ width: 390, height: 844 });
        await oneScoreColumn(page);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        assert.deepEqual(errors, []);
        console.log(`PASS independent notehead feedback, precise text, MIDI zones, miss correction, extras, loop reset: ${new URL(url).pathname}`);
    } finally { await context.close(); }
}

async function notationCoverageFlow(browser, url) {
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
            const lesson = FIXTURE_LESSONS[id] ?? JSON.parse(await readFile(resolve(runtimeRoot, "lessons", `${id}.json`), "utf8"));
            await page.locator("#lesson").selectOption(id);
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
                if (id === "swing-01" && bar === 0) {
                    const aligned = await page.locator("#notation-score").evaluate(host => {
                        const snare = host.querySelector('[data-note-id="snare:0"]').getBoundingClientRect();
                        const kick = host.querySelector('[data-note-id="kick:0"]').getBoundingClientRect();
                        return Math.abs(snare.x - kick.x) < 0.01;
                    });
                    assert.equal(aligned, true, "Simultaneous snare and bass heads align vertically");
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
        await page.locator("#lesson").selectOption("notation-sixteen-bars");
        await page.waitForFunction(() => document.querySelector("#notation-page").textContent === "Bar 1 of 16");
        if (await page.locator("#practice-panel").getAttribute("open") === null) await page.locator("#practice-panel > summary").click();
        await page.locator(".notation-legend summary").click();
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

async function toolbarFlow(browser, url) {
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
        assert.equal(await page.locator("#master-volume").inputValue(), "150");
        assert.equal(await page.locator("#master-level").textContent(), "150%");
        await page.locator("#lesson").selectOption("swing-ride");
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
        }), true, "Lesson, four sliders and transport share one desktop row");
        if (new URL(url).pathname === "/") await page.screenshot({ path: "/tmp/rhythm-toolbar-desktop.png", fullPage: true });
        // Upgrade a real old fractional override without losing the user's mixer/keys.
        const old = { ...defaultPracticeSettings(), view: "notation", countIn: false, lastBundledLessonId: "swing-ride",
            guideVolume: 18, metronomeVolume: 100, tempos: { "swing-ride": 90.5220994475138 } };
        delete old.masterVolume;
        delete old.masterMuted;
        await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: PRACTICE_SETTINGS_KEY, value: old });
        await page.reload();
        await ready(page);
        await page.locator("#notation-score svg").waitFor();
        assert.equal(await page.locator("#bpm-level").textContent(), "91");
        assert.equal(await page.locator("#guide-volume").inputValue(), "18");
        assert.equal(await page.locator("#metronome-volume").inputValue(), "100");
        assert.equal(await page.locator("#master-volume").inputValue(), "150");
        await observePlayback(page);
        await page.locator("#start-stop").click();
        await playing(page);
        const origin = await page.evaluate(() => window.smoke.assessment.origin);
        await page.locator("#master-volume").fill("190");
        await page.waitForFunction(() => Math.abs(window.smoke.audio.master.gain.value - 1.9) < 0.01);
        await page.locator("#master-mute").click();
        await page.waitForFunction(() => window.smoke.audio.master.gain.value < 0.01);
        await page.locator("#master-mute").click();
        await page.waitForFunction(() => Math.abs(window.smoke.audio.master.gain.value - 1.9) < 0.01);
        assert.equal(await page.locator("#guide-volume").inputValue(), "18");
        await selectView(page, "lanes");
        await selectView(page, "notation");
        assert.equal(await page.evaluate(() => window.smoke.assessment.origin), origin);
        assert.equal(await page.locator("#start-stop").getAttribute("data-running"), "true");
        await page.locator("#lesson-tempo").click();
        await stopped(page);
        assert.equal(await page.locator("#bpm-level").textContent(), "80");
        await page.reload();
        await ready(page);
        assert.equal(await page.locator("#master-volume").inputValue(), "190");
        assert.equal(await page.locator("#bpm-level").textContent(), "80");
        await page.setViewportSize({ width: 390, height: 844 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        if (new URL(url).pathname === "/") await page.screenshot({ path: "/tmp/rhythm-toolbar-narrow.png", fullPage: true });
        assert.deepEqual(errors, []);
        console.log(`PASS compact toolbar, Notation default, integer/log tempo, reset, master, migration/persistence: ${new URL(url).pathname}`);
    } finally { await context.close(); }
}

async function sheetLayoutFlow(browser, url) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await mockMidi(context);
    await seedLanes(context);
    try {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.goto(url);
        await ready(page);
        await page.locator("#lesson").selectOption("swing-ride");
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

async function renderUpdatesFlow(browser, url) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await mockMidi(context);
    try {
        const page = await context.newPage();
        await page.goto(url);
        await ready(page);
        await page.locator("#lesson").selectOption("swing-01");
        await selectView(page, "notation");
        await page.locator("#notation-score svg").waitFor();
        await setBpm(page, 60);
        await observePlayback(page);
        await page.locator("#start-stop").click();
        await page.waitForFunction(() => document.querySelector("#status").textContent.startsWith("Count-in"));
        // Settle initial layout, then observe real frames with unchanged results.
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const work = await page.evaluate(async () => {
            const assessment = window.smoke.assessment;
            const resultFor = assessment.resultFor.bind(assessment);
            let reads = 0, writes = 0;
            assessment.resultFor = (...args) => { reads++; return resultFor(...args); };
            const observer = new MutationObserver(records => { writes += records.length; });
            observer.observe(document.querySelector(".session-summary"), { childList: true, subtree: true, characterData: true });
            try {
                for (let index = 0; index < 8; index++) await new Promise(resolve => requestAnimationFrame(resolve));
                return { reads, writes };
            } finally { observer.disconnect(); assessment.resultFor = resultFor; }
        });
        assert.deepEqual(work, { reads: 0, writes: 0 }, "Unchanged animation frames do not re-project note feedback or rewrite summary text");
        await page.locator("#start-stop").click();
        await stopped(page);
        console.log(`PASS unchanged frames skip note projection and summary DOM writes: ${new URL(url).pathname}`);
    } finally { await context.close(); }
}

async function cacheFlow(browser, url) {
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

let browser;
try {
    // launch() creates a disposable profile. Never use connectOverCDP or launchPersistentContext.
    browser = await chromium.launch({ channel: "chrome", headless: true });
    for (const mount of ["/", "/rhythm-trainer/"]) {
        const server = await serve(mount);
        try {
            if (process.argv.includes("--notation-coverage")) {
                await notationCoverageFlow(browser, server.url);
                await cacheFlow(browser, server.url);
                continue;
            }
            await catalogFlow(browser, server.url);
            await practiceFlow(browser, server.url);
            await trackFlow(browser, server.url);
            await failureRecovery(browser, server.url);
            await midiFlow(browser, server.url);
            await notationFlow(browser, server.url);
            await scoreFollowingFlow(browser, server.url);
            await notationFeedbackFlow(browser, server.url);
            await notationCoverageFlow(browser, server.url);
            await cacheFlow(browser, server.url);
            await renderUpdatesFlow(browser, server.url);
            await toolbarFlow(browser, server.url);
            await sheetLayoutFlow(browser, server.url);
        } finally { await server.close(); }
    }
    console.log("Browser checks passed. Real-kit timing and audible sound quality still need manual checks.");
} finally { await browser?.close(); }
