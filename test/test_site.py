"""Checks for lesson discovery, live refresh, and the Pages artifact."""

from __future__ import annotations

import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path

from scripts.site import CATALOG_PATH, build_site, catalog_source, create_server


class SiteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        (self.root / "lessons").mkdir()
        self.add_lesson("swing-02", "Second")
        self.add_lesson("swing-01", 'First "lesson"')

    def add_lesson(self, name: str, title: str) -> None:
        (self.root / "lessons" / f"{name}.json").write_text(json.dumps({"title": title}))

    def test_discovery_uses_filename_order_and_json_titles(self) -> None:
        source = catalog_source(self.root)
        catalog = json.loads(source.split("Object.freeze(")[1].removesuffix(");\n"))
        self.assertEqual(catalog, [
            {"id": "swing-01", "title": 'First "lesson"'},
            {"id": "swing-02", "title": "Second"},
        ])

    def test_invalid_catalog_has_filename_in_error(self) -> None:
        path = self.root / "lessons/swing-01.json"
        for content in ('{', 'null', '{"title": " "}', '{"title": 12}'):
            with self.subTest(content=content):
                path.write_text(content)
                with self.assertRaisesRegex(ValueError, "swing-01.json"):
                    catalog_source(self.root)

    def test_invalid_filename_empty_directory_and_symlinks_fail(self) -> None:
        self.add_lesson("Unsafe Name", "Unsafe")
        with self.assertRaisesRegex(ValueError, "lowercase"):
            catalog_source(self.root)
        for path in (self.root / "lessons").iterdir():
            path.unlink()
        with self.assertRaisesRegex(ValueError, "at least one"):
            catalog_source(self.root)
        target = self.root / "outside.json"
        target.write_text('{"title": "Outside"}')
        (self.root / "lessons/link.json").symlink_to(target)
        with self.assertRaisesRegex(ValueError, "regular JSON"):
            catalog_source(self.root)

    def test_server_discovers_additions_and_deletions_without_restart(self) -> None:
        server = create_server(self.root, port=0)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            connection = http.client.HTTPConnection("127.0.0.1", server.server_port)
            self.addCleanup(connection.close)
            def request(method: str = "GET") -> tuple[int, bytes]:
                connection.request(method, "/" + CATALOG_PATH)
                response = connection.getresponse()
                self.assertEqual(response.getheader("Cache-Control"), "no-store")
                return response.status, response.read()
            self.assertEqual(request()[0], 200)
            self.add_lesson("new-lesson", "New lesson")
            self.assertIn(b'"id": "new-lesson"', request()[1])
            (self.root / "lessons/new-lesson.json").unlink()
            self.assertNotIn(b'"id": "new-lesson"', request()[1])
            self.assertEqual(request("HEAD"), (200, b""))
            (self.root / "lessons/swing-01.json").write_text("broken")
            self.assertEqual(request()[0], 422)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

    def test_build_copies_only_runtime_files_and_replaces_old_output(self) -> None:
        for name in ("src", "config", "assets"):
            (self.root / name).mkdir()
            (self.root / name / "asset.js").write_text("test")
            (self.root / name / ".secret").write_text("private")
        for name in ("index.html", "style.css", "AGENTS.md", "private.txt"):
            (self.root / name).write_text("test")
        output = build_site(self.root)
        self.assertEqual((output / CATALOG_PATH).read_text(), catalog_source(self.root))
        self.assertTrue((output / "assets/asset.js").exists())
        self.assertFalse((output / "assets/.secret").exists())
        self.assertFalse((output / "AGENTS.md").exists())
        self.assertFalse((output / "private.txt").exists())
        (output / "stale.txt").touch()
        build_site(self.root)
        self.assertFalse((output / "stale.txt").exists())
        (self.root / "assets/link").symlink_to(self.root / "private.txt")
        with self.assertRaisesRegex(ValueError, "symbolic links"):
            build_site(self.root)
        self.assertTrue((output / "index.html").exists())


if __name__ == "__main__":
    unittest.main()
