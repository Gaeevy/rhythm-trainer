import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
    for (const mount of ["/", "/rhythm-trainer/"]) {
        // Preview files are deliberately excluded from the production artifact.
        const server = createServer(async (request, response) => {
            try {
                const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
                assert.ok(pathname.startsWith(mount));
                const path = resolve(root, pathname.slice(mount.length));
                assert.ok(path.startsWith(root + sep));
                const body = await readFile(path);
                response.writeHead(200, { "Content-Type": types[extname(path)] || "application/octet-stream" });
                response.end(body);
            } catch { response.writeHead(404); response.end(); }
        });
        await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
        const origin = `http://127.0.0.1:${server.address().port}`;
        const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
        try {
            const errors = [], requests = [];
            await context.route("**/*", route => {
                const url = route.request().url();
                requests.push(url);
                if (!url.startsWith(origin + mount)) { errors.push(`External request: ${url}`); return route.abort(); }
                return route.continue();
            });
            const page = await context.newPage();
            page.on("pageerror", error => errors.push(error.message));
            page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`); });
            await page.goto(`${origin}${mount}scripts/notation-preview.html`);
            await page.waitForFunction(() => document.documentElement.dataset.previewReady === "true" || document.querySelector("#preview-status").dataset.error);
            assert.equal(await page.locator("#preview-status").getAttribute("data-error"), null,
                await page.locator("#preview-status").textContent());
            assert.equal(await page.locator(".score svg").count(), 2);
            assert.equal(await page.locator("#drum-key li").count(), 5);
            assert.match(await page.locator('[data-example="swing"] .feel').textContent(), /2:1/);
            for (const [name, viewport] of [["desktop", { width: 1440, height: 1100 }], ["narrow", { width: 390, height: 844 }]]) {
                await page.setViewportSize(viewport);
                await page.waitForFunction(() => [...document.querySelectorAll(".score svg")].every(svg =>
                    Number(svg.getAttribute("width")) === Math.max(460, Math.floor(svg.parentElement.clientWidth
                        - parseFloat(getComputedStyle(svg.parentElement).paddingLeft) - parseFloat(getComputedStyle(svg.parentElement).paddingRight)))));
                assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
                assert.equal(await page.evaluate(() => [...document.querySelectorAll("svg")].every(svg => {
                    // Music-font text boxes include invisible ascender/descender space.
                    // Check vector ink (staves/stems/beams) here; inspect glyphs in screenshots.
                    return [...svg.querySelectorAll("path")].every(path => {
                        const box = path.getBBox();
                        const matrix = svg.getScreenCTM().inverse().multiply(path.getScreenCTM());
                        return [[box.x, box.y], [box.x + box.width, box.y + box.height]].every(([x, y]) => {
                            const point = new DOMPoint(x, y).matrixTransform(matrix);
                            return point.x >= 0 && point.y >= 0 && point.x <= Number(svg.getAttribute("width"))
                                && point.y <= Number(svg.getAttribute("height"));
                        });
                    });
                })), true, "No staff, stem, or beam extends outside the SVG");
                if (mount === "/") await page.screenshot({ path: `/tmp/rhythm-notation-${name}.png`, fullPage: true });
            }
            assert.equal(await page.evaluate(() => document.fonts.check("20px Bravura") && document.fonts.check("14px Academico")), true);
            assert.ok(requests.some(url => url.endsWith("/assets/vendor/vexflow/vexflow-bravura.js")));
            assert.deepEqual(errors, []);
            console.log(`PASS notation preview, fonts, local assets, resize: ${mount}`);
        } finally {
            await context.close();
            await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
        }
    }
} finally { await browser.close(); }
