import assert from "node:assert/strict";
import { positionFromBpm } from "../../src/tempo.js";
import { defaultPracticeSettings, PRACTICE_SETTINGS_KEY } from "../../src/practice-settings.js";
import { FIXTURE_LESSONS } from "../fixtures/lessons.js";
import { BUNDLED_LESSONS } from "../../generated/lesson-catalog.js";

export async function mockMidi(context, options = {}) {
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

export async function mockFixtureLessons(context) {
    const catalog = [...BUNDLED_LESSONS, ...Object.entries(FIXTURE_LESSONS).map(([id, lesson]) => ({ id, title: lesson.title, path: `${id}.json`, group: "Test fixtures" }))];
    await context.route("**/generated/lesson-catalog.js", route => route.fulfill({
        contentType: "text/javascript", body: `export const BUNDLED_LESSONS = ${JSON.stringify(catalog)};`,
    }));
    for (const [id, lesson] of Object.entries(FIXTURE_LESSONS)) {
        await context.route(`**/lessons/${id}.json`, route => route.fulfill({
            contentType: "application/json", body: JSON.stringify(lesson),
        }));
    }
}

export async function selectLesson(page, id) {
    const group = BUNDLED_LESSONS.find(entry => entry.id === id)?.group ?? "Test fixtures";
    await page.locator("#lesson").click();
    await page.getByRole("menuitem", { name: group || "Other", exact: true }).click();
    await page.locator(`[data-lesson-id="${id}"]`).click();
}

export async function waitForLesson(page, id) {
    await page.waitForFunction(id => document.querySelector("#lesson").dataset.loadedId === id, id);
}

export async function setBpm(page, bpm) {
    await page.locator("#bpm").fill(String(positionFromBpm(bpm)));
    assert.equal(await page.locator("#bpm-level").textContent(), String(bpm));
}

export async function selectView(page, view) {
    const button = page.locator(`#view-${view}`);
    if (await button.getAttribute("aria-pressed") === "true") return;
    const panel = page.locator("#practice-panel");
    const wasOpen = await panel.getAttribute("open") !== null;
    if (!wasOpen) await page.locator("#practice-panel > summary").click();
    await button.click();
    if (!wasOpen) await page.locator("#practice-panel > summary").click();
}

export async function oneScoreColumn(page) {
    await page.waitForFunction(() => document.querySelector("#notation-sheet").style.getPropertyValue("--score-columns") === "1");
}

export async function seedLanes(context) {
    await context.addInitScript(({ key, settings }) => {
        if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(settings));
    }, { key: PRACTICE_SETTINGS_KEY, settings: { ...defaultPracticeSettings(), view: "lanes" } });
}

export async function ready(page) {
    await page.waitForFunction(() => document.querySelector("#start-stop")?.disabled === false);
}

export async function playing(page) {
    await page.waitForFunction(() => document.querySelector("#status").textContent.startsWith("Playing"));
}

export async function stopped(page) {
    assert.equal(await page.locator("#start-stop").getAttribute("data-running"), "false");
}

// Observe the real audio and assessment calls; keep native timers and audio running.

export async function observePlayback(page) {
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

export async function timedKey(page, code, beat, errorMs = 0) {
    return page.evaluate(({ code, beat, errorMs }) => {
        const event = new KeyboardEvent("keydown", { code, bubbles: true, cancelable: true });
        Object.defineProperty(event, "timeStamp", { value: window.smoke.stamp(beat, errorMs) });
        (document.querySelector("#notation-panel:not([hidden]) #notation-score")
            ?? document.querySelector("#timeline")).dispatchEvent(event);
        return window.smoke.assessment.hits.at(-1);
    }, { code, beat, errorMs });
}
