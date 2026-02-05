import os
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from block_buster.core.http_client import HTTPClient


class _FlakyHandler(BaseHTTPRequestHandler):
    counter = 0

    def log_message(self, format, *args):
        return

    def do_GET(self):
        type(self).counter += 1
        if type(self).counter <= 2:
            self.send_response(503)
            self.end_headers()
            self.wfile.write(b"unavailable")
            return
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"ok")


class TestHTTPClient(unittest.TestCase):
    def test_retries_bounded_backoff(self):
        _FlakyHandler.counter = 0
        httpd = HTTPServer(("127.0.0.1", 0), _FlakyHandler)
        port = httpd.server_port
        t = threading.Thread(target=httpd.serve_forever, daemon=True)
        t.start()
        self.addCleanup(httpd.shutdown)
        self.addCleanup(httpd.server_close)

        sleeps = []
        events = []

        def sleep_fn(seconds):
            sleeps.append(seconds)

        def trace_hook(event, **kwargs):
            events.append(event)

        client = HTTPClient(
            timeout=2,
            max_retries=3,
            backoff_factor=1.0,
            max_backoff_seconds=0.05,
            backoff_jitter=0.0,
            sleep_fn=sleep_fn,
            trace_hook=trace_hook,
        )

        resp = client.get(f"http://127.0.0.1:{port}/")
        self.assertEqual(resp.status_code, 200)

        self.assertEqual(len(sleeps), 2)
        self.assertTrue(all(0.0 <= s <= 0.05 for s in sleeps))
        self.assertIn("http_request_start", events)
        self.assertIn("http_request_end", events)


if __name__ == "__main__":
    unittest.main()
