"""Serve locally or package the static site with a generated lesson catalog."""

from __future__ import annotations

import argparse
import json
import re
import shutil
from functools import partial
from io import BytesIO
from typing import BinaryIO
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
CATALOG_PATH = "generated/lesson-catalog.js"


def catalog_source(root: Path) -> str:
    """Read catalog metadata. Full lesson validation belongs to src/lesson.js."""
    lessons = []
    for path in sorted((root / "lessons").glob("*.json")):
        if path.is_symlink() or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", path.stem):
            raise ValueError(f"{path.name}: use a regular JSON file with a lowercase hyphenated name")
        try:
            lesson = json.loads(path.read_text(encoding="utf-8"))
        except (ValueError, OSError) as error:
            raise ValueError(f"{path.name}: {error}") from error
        title = lesson.get("title") if isinstance(lesson, dict) else None
        if not isinstance(title, str) or not title.strip():
            raise ValueError(f"{path.name}: title must be a nonempty string")
        lessons.append({"id": path.stem, "title": title})
    if not lessons:
        raise ValueError("lessons/: at least one JSON lesson is required")
    return "export const BUNDLED_LESSONS = Object.freeze(" + json.dumps(lessons, indent=2) + ");\n"


def write_catalog(root: Path) -> None:
    source = catalog_source(root)
    target = root / CATALOG_PATH
    target.parent.mkdir(exist_ok=True)
    target.write_text(source, encoding="utf-8")


def build_site(root: Path) -> Path:
    """Package runtime files only, without source compilation or dependencies."""
    source = catalog_source(root)
    names = ("index.html", "style.css", "src", "lessons", "config", "assets")
    # Pages artifacts cannot contain links. Check before replacing an old build.
    for name in names:
        path = root / name
        if not path.exists():
            raise ValueError(f"Missing site asset: {name}")
        if path.is_symlink() or any(item.is_symlink() for item in path.rglob("*")):
            raise ValueError(f"Site assets must not contain symbolic links: {name}")
    output = root / "_site"
    if output.is_symlink():
        raise ValueError("_site must not be a symbolic link")
    if output.exists():
        shutil.rmtree(output)
    output.mkdir()
    for name in names:
        path = root / name
        if path.is_dir():
            shutil.copytree(path, output / name, ignore=shutil.ignore_patterns(".*", "__pycache__", "*.pyc"))
        else:
            shutil.copyfile(path, output / name)
    (output / "generated").mkdir()
    (output / CATALOG_PATH).write_text(source, encoding="utf-8")
    (output / ".nojekyll").touch()
    return output


class SiteHandler(SimpleHTTPRequestHandler):
    """Generate the catalog on each request so adding a lesson needs a refresh."""

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_head(self) -> BinaryIO | None:
        if urlsplit(self.path).path != "/" + CATALOG_PATH:
            return super().send_head()
        try:
            body = catalog_source(Path(self.directory)).encode("utf-8")
        except (ValueError, OSError) as error:
            self.send_error(422, str(error))
            return None
        self.send_response(200)
        self.send_header("Content-Type", "text/javascript; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        return BytesIO(body)


class SiteServer(ThreadingHTTPServer):
    request_queue_size = 128


def create_server(root: Path, port: int = 8000, bind: str = "127.0.0.1") -> SiteServer:
    return SiteServer((bind, port), partial(SiteHandler, directory=str(root)))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", nargs="?", choices=("serve", "catalog", "build"), default="serve")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    try:
        if args.command == "catalog":
            write_catalog(ROOT)
        elif args.command == "build":
            print(build_site(ROOT))
        else:
            catalog_source(ROOT)
            with create_server(ROOT, args.port) as server:
                print(f"Rhythm Trainer: http://127.0.0.1:{server.server_port}", flush=True)
                server.serve_forever()
    except (OSError, ValueError) as error:
        parser.exit(1, f"{error}\n")
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
