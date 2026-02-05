import unittest

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from block_buster.utils import metrics


class TestMetrics(unittest.TestCase):
    def test_counter_gauge(self):
        registry = metrics.MetricsRegistry()
        registry.clear()
        c = metrics.Counter("test_requests_total", "requests")
        c.inc()
        c.inc(2)
        g = metrics.Gauge("queue_depth", "depth")
        g.set(5)
        self.assertIn("test_requests_total", registry.collect())
        self.assertIn("queue_depth", registry.collect())

    def test_histogram(self):
        registry = metrics.MetricsRegistry()
        registry.clear()
        h = metrics.Histogram("latency_seconds", "latency")
        h.observe(0.2)
        h.observe(1.5)
        out = registry.collect()
        self.assertIn("latency_seconds_sum", out)


if __name__ == "__main__":
    unittest.main()
