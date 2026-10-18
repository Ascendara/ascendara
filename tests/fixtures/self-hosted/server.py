"""Local-only private source fixture. Run: python tests/fixtures/self-hosted/server.py"""
import argparse
import hashlib
import http.server
import json
import mimetypes
from pathlib import Path
import re
import struct
import urllib.parse
import zipfile
import zlib

ROOT = Path(__file__).resolve().parent / "data"


def fixtures():
    (ROOT / "games").mkdir(parents=True, exist_ok=True)
    (ROOT / "artwork").mkdir(exist_ok=True)
    # These are inert text, deliberately NOT executable or mountable images.
    for name in ["Test Game Setup.exe", "Forza.Horizon.5.iso"]:
        (ROOT / "games" / name).write_bytes(b"ASCENDARA INERT DOWNLOAD TEST FILE\n" * 65536)
    with zipfile.ZipFile(ROOT / "games" / "Test Archive.zip", "w") as archive:
        archive.writestr("Test Archive/README.txt", "Safe extraction fixture. No executable is included.\n")
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    width, height = 460, 215
    rows = b"".join(b"\0" + bytes([35 + y // 4, 55, 125]) * width for y in range(height))
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">2I5B", width, height, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b"")
    (ROOT / "artwork" / "test-cover.png").write_bytes(png)
    games = []
    for file in sorted((ROOT / "games").iterdir()):
        games.append(dict(id=file.stem, title=file.stem.replace(".", " "), sourceId="ascendara-local-fixture",
                          path="games/" + file.name, size=file.stat().st_size, type=file.suffix[1:],
                          sha256=hashlib.sha256(file.read_bytes()).hexdigest(),
                          artwork=dict(cover="artwork/test-cover.png", hero="artwork/test-cover.png"),
                          metadata=dict(description="Safe development fixture. This is not a playable game.")))
    (ROOT / "index.json").write_text(json.dumps(dict(version=1, sourceId="ascendara-local-fixture", name="Local test library", games=games), indent=2), encoding="utf-8")


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.server.token and self.headers.get("Authorization") != "Bearer " + self.server.token:
            self.send_error(401)
            return
        raw = urllib.parse.unquote(urllib.parse.urlsplit(self.path).path)
        parts = raw.lstrip("/").split("/")
        if any(p in ("", ".", "..") or "\\" in p or ":" in p for p in parts):
            self.send_error(403)
            return
        file = ROOT.joinpath(*parts).resolve()
        # Only generated public fixtures, never the repo, server code, or directory listings.
        if not file.is_relative_to(ROOT.resolve()) or not file.is_file() or parts[0] not in ("games", "artwork", "index.json"):
            self.send_error(404)
            return
        size = file.stat().st_size
        start, end, status = 0, size - 1, 200
        if self.headers.get("Range") and not self.server.no_range:
            match = re.fullmatch(r"bytes=(\d+)-(\d*)", self.headers["Range"])
            if not match or int(match[1]) >= size:
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{size}")
                self.end_headers()
                return
            start, end, status = int(match[1]), min(int(match[2]) if match[2] else size - 1, size - 1), 206
            if end < start:
                self.send_error(416)
                return
        self.send_response(status)
        self.send_header("Content-Type", mimetypes.guess_type(file.name)[0] or "application/octet-stream")
        self.send_header("Content-Length", str(end - start + 1))
        self.send_header("Accept-Ranges", "none" if self.server.no_range else "bytes")
        if status == 206:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.end_headers()
        try:
            with file.open("rb") as stream:
                stream.seek(start)
                left = end - start + 1
                while left:
                    block = stream.read(min(left, 65536))
                    if not block:
                        break
                    self.wfile.write(block)
                    left -= len(block)
        except (BrokenPipeError, ConnectionResetError):
            pass


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--lan", action="store_true", help="Expose fixture files on all network interfaces")
    parser.add_argument("--token", help="Require a fixture-only Bearer token")
    parser.add_argument("--no-range", action="store_true", help="Test full-response fallback")
    parser.add_argument("--generate-only", action="store_true")
    args = parser.parse_args()
    fixtures()
    if not args.generate_only:
        server = http.server.ThreadingHTTPServer(("0.0.0.0" if args.lan else "127.0.0.1", args.port), Handler)
        server.token, server.no_range = args.token, args.no_range
        print(f"Fixture index: http://localhost:{args.port}/index.json", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            server.server_close()
