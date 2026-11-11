import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mockMidi, mockFixtureLessons, selectLesson, setBpm, selectView, oneScoreColumn, ready, playing, stopped, observePlayback, timedKey, prepareNotationPractice, startPlayback } from "./helpers.mjs";

export async function notationFeedbackFlow(browser, url) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    await mockMidi(context, { ports: ["kit"] });
    try {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.goto(url);
        await ready(page);
        await prepareNotationPractice(page, "swing-01");
        await startPlayback(page);
        const headsBefore = await page.locator("#notation-score [data-note-id]").count();
        const stemBefore = await page.locator("#notation-score .vf-stem path").first().evaluate(node => getComputedStyle(node).stroke);
        assert.equal((await timedKey(page, "KeyK", 0, -20)).status, "early");
        assert.equal((await timedKey(page, "KeyF", 0, 20)).status, "late");
        assert.equal((await timedKey(page, "KeyH", 1)).status, "on_time");
        await page.waitForFunction(() => [
            ["ride:0", "early"], ["snare:0", "late"], ["hi_hat_pedal:96", "on_time"],
        ].every(([id, timing]) => document.querySelector(`#notation-score [data-note-id="${id}"]`)?.dataset.timing === timing));
        const shared = await page.evaluate(() => {
            const ride = document.querySelector('#notation-score [data-note-id="ride:0"]');
            const snare = document.querySelector('#notation-score [data-note-id="snare:0"]');
            const pedal = document.querySelector('#notation-score [data-note-id="hi_hat_pedal:96"]');
            return { sameStem: ride.closest(".vf-stavenote") === snare.closest(".vf-stavenote"),
                states: [ride.dataset.timing, snare.dataset.timing, pedal.dataset.timing],
                colors: [ride, snare, pedal].map(head => getComputedStyle(head.querySelector("text")).fill),
                stem: getComputedStyle(ride.closest(".vf-stavenote").querySelector(".vf-stem path")).stroke };
        });
        assert.equal(shared.sameStem, false, "Ride and snare use independent stems");
        assert.deepEqual(shared.states, ["early", "late", "on_time"]);
        assert.equal(new Set(shared.colors).size, 3);
        assert.equal(shared.stem, stemBefore, "Feedback does not recolor the cymbal stem");
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
        await page.evaluate(() => {
            window.extraProbe = document.querySelector("#notation-score .notation-extra-hit");
            window.midiTest.sendData("kit", [0x99, 38, 90], window.smoke.stamp(0, 50));
            window.midiTest.sendData("kit", [0x99, 36, 90], window.smoke.stamp(0, 70));
        });
        await page.waitForFunction(() => document.querySelectorAll("#notation-score .notation-extra-hit").length === 3);
        const overlays = await page.locator("#notation-score").evaluate(host => {
            return [...host.querySelectorAll(".notation-extra-hit")].map(extra => {
                const head = host.querySelector(`[data-instrument="${extra.dataset.instrument}"][data-note-id]`);
                const bounds = head.getBBox();
                return { instrument: extra.dataset.instrument, tag: extra.tagName,
                    y: Number(extra.getAttribute("cy")), expectedY: bounds.y + bounds.height / 2,
                    x: Number(extra.getAttribute("cx")), tick: Number(extra.dataset.tick),
                    fill: getComputedStyle(extra).fill, animation: getComputedStyle(extra).animationName };
            });
        });
        assert.deepEqual(overlays.map(extra => extra.instrument).sort(), ["kick", "ride", "snare"]);
        for (const extra of overlays) {
            assert.equal(extra.tag, "ellipse", "Extra hits use hollow noteheads without stems");
            assert.ok(Math.abs(extra.y - extra.expectedY) < 2, `${extra.instrument}: same staff position as written head`);
            assert.equal(extra.fill, "rgb(248, 245, 236)");
            assert.equal(extra.animation, "notation-extra-fade");
        }
        assert.ok(overlays[0].x < overlays[1].x && overlays[1].x < overlays[2].x, "Extras preserve precise timing order");
        assert.equal(await page.evaluate(() => window.extraProbe.isConnected), true, "New extras retain existing fades");
        assert.equal(await page.locator("#notation-score [data-note-id]").count(), headsBefore);
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
        await page.locator("#practice-panel > summary").click();
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

export async function noteheadMotionFlow(browser, url) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: "no-preference" });
    await mockMidi(context, { ports: ["kit"] });
    try {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.goto(url);
        await ready(page);
        await prepareNotationPractice(page, "californication");
        await startPlayback(page);
        await page.evaluate(() => {
            const host = document.querySelector('[data-absolute-bar="0"] .notation-score');
            const hat = host.querySelector('[data-note-id="hi_hat_closed:0"]');
            const kick = host.querySelector('[data-note-id="kick:0"]');
            window.motionProbe = { hatX: hat.getBoundingClientRect().x, kickX: kick.getBoundingClientRect().x,
                sameStem: hat.closest(".vf-stavenote") === kick.closest(".vf-stavenote"),
                paths: [...host.querySelectorAll(".vf-stem path, .vf-beam path")].map(path => path.getAttribute("d")),
                count: host.querySelectorAll("[data-note-id]").length, transitions: 0 };
            for (const head of [hat, kick]) head.parentElement.addEventListener("transitionrun", event => {
                if (event.propertyName === "transform") window.motionProbe.transitions++;
            });
        });
        assert.equal(await page.evaluate(() => window.motionProbe.sameStem), true);
        assert.equal((await timedKey(page, "KeyJ", 0, -40)).status, "early");
        assert.equal((await timedKey(page, "KeyD", 0, 40)).status, "late");
        await page.waitForFunction(() => {
            const host = document.querySelector('[data-absolute-bar="0"]');
            return Number(host.querySelector('[data-note-id="hi_hat_closed:0"]').parentElement.dataset.shift) < 0
                && Number(host.querySelector('[data-note-id="kick:0"]').parentElement.dataset.shift) > 0;
        });
        assert.equal(await page.locator('[data-absolute-bar="0"] .notation-notehead-motion').first()
            .evaluate(node => getComputedStyle(node).transitionDuration), "0.18s");
        await page.waitForFunction(() => [...document.querySelectorAll('[data-absolute-bar="0"] .notation-notehead-motion')]
            .every(node => Math.abs(new DOMMatrixReadOnly(getComputedStyle(node).transform).m41 - Number(node.dataset.shift)) < 0.01));
        assert.equal(await page.evaluate(() => window.motionProbe.transitions), 2, "Actual CSS transitions run for both heads");
        const moved = await page.evaluate(() => {
            const host = document.querySelector('[data-absolute-bar="0"] .notation-score');
            const hat = host.querySelector('[data-note-id="hi_hat_closed:0"]');
            const kick = host.querySelector('[data-note-id="kick:0"]');
            return { hat: hat.getBoundingClientRect().x - window.motionProbe.hatX,
                kick: kick.getBoundingClientRect().x - window.motionProbe.kickX,
                hatTarget: Number(hat.parentElement.dataset.shift), kickTarget: Number(kick.parentElement.dataset.shift),
                fixed: JSON.stringify([...host.querySelectorAll(".vf-stem path, .vf-beam path")].map(path => path.getAttribute("d")))
                    === JSON.stringify(window.motionProbe.paths), count: host.querySelectorAll("[data-note-id]").length,
                future: Number(document.querySelector('[data-absolute-bar="1"] [data-note-id="hi_hat_closed:0"]').parentElement.dataset.shift) };
        });
        assert.ok(moved.hat < 0 && moved.kick > 0);
        assert.ok(Math.abs(moved.hat - moved.hatTarget) < 0.02 && Math.abs(moved.kick - moved.kickTarget) < 0.02);
        assert.ok(Math.abs(moved.hat) <= 9 && moved.kick <= 9);
        assert.equal(moved.fixed, true, "Shared stems and beams never move");
        assert.equal(moved.future, 0, "A future loop copy never inherits a played offset");
        assert.equal(moved.count, await page.evaluate(() => window.motionProbe.count), "No duplicate glyphs or extra markers");
        await page.emulateMedia({ reducedMotion: "reduce" });
        assert.equal(await page.locator('[data-absolute-bar="0"] .notation-notehead-motion').first()
            .evaluate(node => getComputedStyle(node).transitionDuration), "0s");
        assert.equal(await page.evaluate(() => {
            window.midiTest.sendData("kit", [0x99, 38, 85], window.smoke.stamp(1, 0));
            return window.smoke.assessment.hits.at(-1).status;
        }), "on_time");
        await page.waitForFunction(() => document.querySelector('[data-absolute-bar="0"] [data-note-id="snare:96"]').dataset.timing === "on_time");
        assert.equal(await page.locator('[data-absolute-bar="0"] [data-note-id="snare:96"]').evaluate(node => Number(node.parentElement.dataset.shift)), 0);
        assert.equal(await page.evaluate(() => {
            window.midiTest.sendData("kit", [0x99, 42, 85], window.smoke.stamp(1, 80));
            return window.smoke.assessment.hits.at(-1).status;
        }), "late");
        await page.waitForFunction(() => Number(document.querySelector('[data-absolute-bar="0"] [data-note-id="hi_hat_closed:96"]').parentElement.dataset.shift) > 0);
        assert.equal(await page.evaluate(() => {
            window.midiTest.sendData("kit", [0x99, 42, 85], window.smoke.stamp(4, -140));
            return window.smoke.assessment.hits.at(-1).status;
        }), "early");
        await page.waitForFunction(() => Number(document.querySelector('[data-absolute-bar="1"] [data-note-id="hi_hat_closed:0"]').parentElement.dataset.shift) < 0);
        assert.equal(await page.locator('[data-absolute-bar="1"] [data-note-id="hi_hat_closed:0"]').evaluate(head => {
            const svg = head.closest("svg").getBoundingClientRect(), glyph = head.getBoundingClientRect();
            return glyph.left >= svg.left + 1.9 && glyph.right <= svg.right - 1.9;
        }), true, "Early hits at continuation bars remain inside the SVG");
        await page.locator("#start-stop").click();
        await stopped(page);
        if (new URL(url).pathname === "/") await page.screenshot({ path: "/tmp/rhythm-notehead-motion.png", fullPage: true });
        await selectView(page, "lanes");
        await selectView(page, "notation");
        await page.waitForFunction(() => Number(document.querySelector('[data-absolute-bar="0"] [data-note-id="hi_hat_closed:0"]').parentElement.dataset.shift) < 0);
        await page.setViewportSize({ width: 390, height: 844 });
        await oneScoreColumn(page);
        assert.ok(await page.locator('[data-absolute-bar="0"] [data-note-id="hi_hat_closed:0"]').evaluate(node => Number(node.parentElement.dataset.shift)) < 0);
        await page.locator("#start-stop").click();
        await playing(page);
        assert.equal(await page.locator('[data-absolute-bar="0"] [data-note-id="hi_hat_closed:0"]').evaluate(node => Number(node.parentElement.dataset.shift)), 0);
        await page.locator("#start-stop").click();
        await page.getByRole("button", { name: "Disable Hi-hat closed in notation", exact: true }).click();
        assert.equal(await page.locator('[data-absolute-bar="0"] [data-note-id="hi_hat_closed:0"]').evaluate(node => Number(node.parentElement.dataset.shift)), 0);
        assert.deepEqual(errors, []);
        console.log(`PASS independent animated noteheads, fixed beams, keyboard/MIDI, reduced motion, loop copies and reset: ${new URL(url).pathname}`);
    } finally { await context.close(); }
}

export async function missedNoteFlow(browser, url) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: "no-preference" });
    await mockMidi(context, { ports: ["kit"] });
    await mockFixtureLessons(context);
    try {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.goto(url);
        await ready(page);
        await prepareNotationPractice(page, "basic-straight", { bpm: 120, countIn: true });
        await page.locator("#start-stop").click();
        await page.waitForFunction(() => document.querySelector("#status").textContent.startsWith("Count-in"));
        await page.evaluate(() => {
            window.missProbe = { starts: [], ends: [], y: [] };
            for (const id of ["kick:0", "snare:96"]) {
                const motion = document.querySelector(`[data-absolute-bar="0"] [data-note-id="${id}"]`).parentElement;
                motion.addEventListener("animationstart", event => {
                    if (event.animationName !== "notation-missed-shake") return;
                    window.missProbe.starts.push(id);
                    if (id === "snare:96") {
                        // Deliver an originally late hit while its miss animation is active.
                        window.midiTest.sendData("kit", [0x99, 38, 90], window.smoke.stamp(1, 40));
                    } else {
                        const sample = () => {
                            window.missProbe.y.push(new DOMMatrixReadOnly(getComputedStyle(motion).transform).m42);
                            if (motion.getAnimations().some(animation => animation.animationName === "notation-missed-shake")) requestAnimationFrame(sample);
                        };
                        requestAnimationFrame(sample);
                    }
                });
                motion.addEventListener("animationend", event => {
                    if (event.animationName === "notation-missed-shake") window.missProbe.ends.push(id);
                });
            }
        });
        await page.waitForFunction(() => window.missProbe.ends.includes("kick:0"));
        assert.equal(await page.evaluate(() => window.missProbe.y.some(y => Math.abs(y) > 0.25)), true, "Missed head visibly shakes vertically");
        const dimmed = await page.locator('[data-absolute-bar="0"] [data-note-id="kick:0"]').evaluate(head => {
            const style = getComputedStyle(head.parentElement), matrix = new DOMMatrixReadOnly(style.transform);
            return { opacity: Number(style.opacity), x: matrix.m41, y: matrix.m42 };
        });
        assert.deepEqual(dimmed, { opacity: 0.55, x: 0, y: 0 });
        await page.waitForFunction(() => document.querySelector('[data-absolute-bar="0"] [data-note-id="snare:96"]').dataset.timing === "late");
        const corrected = await page.locator('[data-absolute-bar="0"] [data-note-id="snare:96"]').evaluate(head => ({
            opacity: getComputedStyle(head.parentElement).opacity,
            shake: head.parentElement.classList.contains("is-new-miss"),
            animation: getComputedStyle(head.parentElement).animationName,
            shift: Number(head.parentElement.dataset.shift),
        }));
        assert.equal(corrected.opacity, "1");
        assert.equal(corrected.shake, false);
        assert.equal(corrected.animation, "none");
        assert.ok(corrected.shift > 0 && corrected.shift <= 9);
        assert.equal(await page.evaluate(() => window.missProbe.starts.filter(id => id === "kick:0").length), 1);
        await page.locator("#start-stop").click();
        await stopped(page);
        if (new URL(url).pathname === "/") await page.screenshot({ path: "/tmp/rhythm-missed-feedback.png", fullPage: true });
        await selectView(page, "lanes");
        await selectView(page, "notation");
        await page.locator("#notation-score svg").waitFor();
        assert.equal(await page.locator('[data-absolute-bar="0"] [data-note-id="kick:0"]').evaluate(head =>
            !head.parentElement.classList.contains("is-new-miss") && getComputedStyle(head.parentElement).animationName === "none"
                && Number(getComputedStyle(head.parentElement).opacity) === 0.55), true, "Historical misses stay dim without shaking again");
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.locator("#practice-panel > summary").click();
        await page.locator("#count-in").uncheck();
        await page.locator("#practice-panel > summary").click();
        await page.locator("#start-stop").click();
        await playing(page);
        await page.waitForFunction(() => document.querySelector('[data-absolute-bar="0"] [data-note-id="kick:0"]').dataset.timing === "missed");
        assert.equal(await page.locator('[data-absolute-bar="0"] [data-note-id="kick:0"]').evaluate(head =>
            getComputedStyle(head.parentElement).animationName === "none" && Number(getComputedStyle(head.parentElement).opacity) === 0.55), true);
        await page.locator("#start-stop").click();
        await page.getByRole("button", { name: "Disable Kick in notation", exact: true }).click();
        assert.equal(await page.locator('[data-absolute-bar="0"] [data-note-id="kick:0"]').evaluate(head =>
            !head.parentElement.classList.contains("is-new-miss") && getComputedStyle(head.parentElement).opacity === "1"), true);
        assert.deepEqual(errors, []);
        console.log(`PASS missed shake/dimming, live correction, no replay, reduced motion and reset: ${new URL(url).pathname}`);
    } finally { await context.close(); }
}

export async function severityMotionFlow(browser, url) {
    const context = await browser.newContext({ viewport: { width: 2000, height: 1100 }, reducedMotion: "no-preference" });
    await mockMidi(context, { ports: ["kit"] });
    await mockFixtureLessons(context);
    try {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.goto(url);
        await ready(page);
        await prepareNotationPractice(page, "basic-straight", { toleranceMs: 30 });
        await startPlayback(page);
        await page.evaluate(() => {
            window.severityProbe = { ended: [], samples: [], paths: [...document.querySelectorAll('[data-absolute-bar="0"] .vf-stem path, [data-absolute-bar="0"] .vf-beam path')].map(path => path.getAttribute("d")) };
            for (const id of ["hi_hat_closed:0", "kick:0"]) {
                const motion = document.querySelector(`[data-absolute-bar="0"] [data-note-id="${id}"]`).parentElement;
                motion.addEventListener("animationstart", event => {
                    if (event.animationName !== "notation-severe-settle") return;
                    const sample = () => {
                        const matrix = new DOMMatrixReadOnly(getComputedStyle(motion).transform);
                        window.severityProbe.samples.push({ x: matrix.m41, y: matrix.m42, shift: Number(motion.dataset.shift) });
                        if (motion.getAnimations().some(animation => animation.animationName === "notation-severe-settle")) requestAnimationFrame(sample);
                    };
                    requestAnimationFrame(sample);
                });
                motion.addEventListener("animationend", event => {
                    if (event.animationName === "notation-severe-settle") window.severityProbe.ended.push(id);
                });
            }
        });
        assert.equal((await timedKey(page, "KeyJ", 0, -100)).status, "early");
        assert.equal((await timedKey(page, "KeyD", 0, 100)).status, "late");
        assert.equal((await timedKey(page, "KeyF", 1, 40)).status, "late");
        await page.waitForFunction(() => window.severityProbe.ended.length === 2);
        assert.equal(await page.evaluate(() => window.severityProbe.samples.some(sample => sample.x < -0.1)
            && window.severityProbe.samples.some(sample => sample.x > 0.1)), true, "Both severe directions visibly animate");
        assert.equal(await page.evaluate(() => window.severityProbe.samples.every(({ x, y, shift }) => y === 0
            && x >= Math.min(0, shift) - 0.01 && x <= Math.max(0, shift) + 0.01)), true, "Severe settling stays inside its capped horizontal range");
        const heads = await page.locator('[data-absolute-bar="0"]').evaluate(host => {
            return ["hi_hat_closed:0", "kick:0", "snare:96"].map(id => {
                const motion = host.querySelector(`[data-note-id="${id}"]`).parentElement;
                const style = getComputedStyle(motion);
                return { severity: motion.dataset.severity, animation: style.animationName, transition: style.transitionDuration,
                    x: new DOMMatrixReadOnly(style.transform).m41, shift: Number(motion.dataset.shift) };
            });
        });
        assert.deepEqual(heads.map(head => head.severity), ["severe", "severe", "mild"]);
        assert.equal(heads[2].animation, "none");
        assert.equal(heads[2].transition, "0.18s");
        for (const head of heads) assert.ok(Math.abs(head.x - head.shift) < 0.01);
        assert.deepEqual(await page.locator('[data-absolute-bar="0"] .vf-stem path, [data-absolute-bar="0"] .vf-beam path')
            .evaluateAll(paths => paths.map(path => path.getAttribute("d"))), await page.evaluate(() => window.severityProbe.paths));
        await page.setViewportSize({ width: 1440, height: 1100 });
        await page.waitForFunction(() => !document.querySelector('[data-absolute-bar="0"] .is-new-severe'));
        assert.equal(await page.locator('[data-absolute-bar="0"] [data-severity="severe"]').count(), 2, "Resize preserves severe offsets without replay");
        await page.emulateMedia({ reducedMotion: "reduce" });
        assert.equal((await timedKey(page, "KeyF", 3, 100)).status, "late");
        await page.waitForFunction(() => document.querySelector('[data-absolute-bar="0"] [data-note-id="snare:288"]').parentElement.dataset.severity === "severe");
        assert.equal(await page.locator('[data-absolute-bar="0"] [data-note-id="snare:288"]').evaluate(head => {
            const style = getComputedStyle(head.parentElement);
            return style.animationName === "none" && style.transitionDuration === "0s"
                && Math.abs(new DOMMatrixReadOnly(style.transform).m41 - Number(head.parentElement.dataset.shift)) < 0.01;
        }), true, "Reduced motion retains only the final severe offset");
        await page.locator("#start-stop").click();
        await page.getByRole("button", { name: "Disable Snare in notation", exact: true }).click();
        assert.equal(await page.locator(".is-new-severe").count(), 0);
        assert.deepEqual(errors, []);
        console.log(`PASS mild/severe motion, bounded settling, fixed stems/beams, resize history, reduced motion and reset: ${new URL(url).pathname}`);
    } finally { await context.close(); }
}

export async function renderUpdatesFlow(browser, url) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await mockMidi(context);
    try {
        const page = await context.newPage();
        await page.goto(url);
        await ready(page);
        await selectLesson(page, "swing-01");
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
