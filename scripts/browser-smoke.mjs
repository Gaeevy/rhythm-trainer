import { chromium } from "playwright";
import { serve } from "./browser/server.mjs";
import { catalogFlow, lessonMenuFlow, cacheFlow } from "./browser/lessons.mjs";
import { practiceFlow, trackFlow, failureRecovery } from "./browser/transport.mjs";
import { midiFlow } from "./browser/midi.mjs";
import { notationFlow, notationLifecycleFlow, scoreFollowingFlow, notationCoverageFlow, sheetLayoutFlow } from "./browser/notation.mjs";
import { notationFeedbackFlow, noteheadMotionFlow, missedNoteFlow, severityMotionFlow, renderUpdatesFlow } from "./browser/notation-feedback.mjs";
import { toolbarFlow } from "./browser/toolbar.mjs";
import { analyticsFlow } from "./browser/analytics.mjs";

let browser;
try {
    // launch() creates a disposable profile. Never use connectOverCDP or launchPersistentContext.
    browser = await chromium.launch({ channel: "chrome", headless: true });
    for (const mount of ["/", "/rhythm-trainer/"]) {
        const server = await serve(mount);
        try {
            if (process.argv.includes("--polish-only")) {
                await analyticsFlow(browser, server.url);
                await severityMotionFlow(browser, server.url);
                continue;
            }
            if (process.argv.includes("--analytics-only")) {
                await analyticsFlow(browser, server.url);
                continue;
            }
            if (process.argv.includes("--cleanup-only")) {
                await failureRecovery(browser, server.url);
                await notationLifecycleFlow(browser, server.url);
                await toolbarFlow(browser, server.url);
                continue;
            }
            if (process.argv.includes("--notehead-motion-only")) {
                await noteheadMotionFlow(browser, server.url);
                await missedNoteFlow(browser, server.url);
                continue;
            }
            if (process.argv.includes("--notation-feedback-only")) {
                await notationFeedbackFlow(browser, server.url);
                continue;
            }
            if (process.argv.includes("--lesson-menu-only")) {
                await catalogFlow(browser, server.url);
                await lessonMenuFlow(browser, server.url);
                continue;
            }
            if (process.argv.includes("--notation-coverage")) {
                await notationCoverageFlow(browser, server.url);
                await cacheFlow(browser, server.url);
                continue;
            }
            await catalogFlow(browser, server.url);
            await lessonMenuFlow(browser, server.url);
            await practiceFlow(browser, server.url);
            await trackFlow(browser, server.url);
            await failureRecovery(browser, server.url);
            await midiFlow(browser, server.url);
            await notationFlow(browser, server.url);
            await notationLifecycleFlow(browser, server.url);
            await scoreFollowingFlow(browser, server.url);
            await notationFeedbackFlow(browser, server.url);
            await noteheadMotionFlow(browser, server.url);
            await missedNoteFlow(browser, server.url);
            await severityMotionFlow(browser, server.url);
            await notationCoverageFlow(browser, server.url);
            await cacheFlow(browser, server.url);
            await renderUpdatesFlow(browser, server.url);
            await toolbarFlow(browser, server.url);
            await analyticsFlow(browser, server.url);
            await sheetLayoutFlow(browser, server.url);
        } finally { await server.close(); }
    }
    console.log("Browser checks passed. Real-kit timing and audible sound quality still need manual checks.");
} finally { await browser?.close(); }
