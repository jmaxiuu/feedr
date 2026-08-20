#!/usr/bin/env python3
"""Local dev server for Feedr.

    python3 tools/serve.py [port]        # default 8765

Same as `python3 -m http.server`, except it sends `Cache-Control: no-store` on
everything. Plain http.server sends no cache headers at all, so browsers fall back
to heuristic caching and will happily serve you yesterday's styles.css against
today's index.html — which looks exactly like the app is broken.
"""

import functools
import http.server
import os
import socketserver
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Service-Worker-Allowed", "/")
        super().end_headers()

    def log_message(self, fmt, *args):        # quiet unless something failed
        if not args or not str(args[1]).startswith("2"):
            sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


class Server(socketserver.TCPServer):
    allow_reuse_address = True


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    os.chdir(ROOT)
    handler = functools.partial(NoCache, directory=str(ROOT))
    with Server(("", port), handler) as httpd:
        print(f"Feedr on http://localhost:{port}  (no-store, Ctrl-C to stop)")
        httpd.serve_forever()
