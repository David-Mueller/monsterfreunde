"""Dependency-free local server compatible with the Sites preview flags."""
from __future__ import annotations

import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


parser = argparse.ArgumentParser()
parser.add_argument("--host", default="127.0.0.1")
parser.add_argument("--port", type=int, default=5173)
parser.add_argument("--strictPort", action="store_true")
args = parser.parse_args()

directory = str(Path(__file__).resolve().parents[1] / "dist")
handler = lambda *handler_args, **kwargs: SimpleHTTPRequestHandler(
    *handler_args, directory=directory, **kwargs
)
ThreadingHTTPServer((args.host, args.port), handler).serve_forever()
