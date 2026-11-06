import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// Serve only the selected mount. A root-relative asset fails in the subpath run.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../_site");
const artifactHtml = await readFile(resolve(root, "index.html"), "utf8");
export const releasePath = artifactHtml.match(/<base href="\.\/(runtime\/[a-f0-9]{16}\/)"/)[1];
export const runtimeRoot = resolve(root, releasePath);
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".wav": "audio/wav" };
export async function serve(mount) {
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

