"""Simple metrics collector - prometheus-client replacement.

Provides basic metrics collection and Prometheus exposition format.
No third-party dependencies - uses only Python stdlib.

For full Prometheus features (histograms, summaries, push gateway),
use prometheus-client. This module provides simple counters and gauges.
"""

import threading
import time
from collections import defaultdict
from typing import Dict, List, Optional, Tuple


class MetricsRegistry:
    """Global metrics registry (singleton)."""
    
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._metrics: Dict[str, 'Metric'] = {}
        return cls._instance
    
    def register(self, metric: 'Metric') -> None:
        """Register a metric."""
        self._metrics[metric.name] = metric
    
    def unregister(self, name: str) -> None:
        """Unregister a metric."""
        self._metrics.pop(name, None)
    
    def collect(self) -> str:
        """Collect all metrics in Prometheus text format."""
        lines = []
        for metric in self._metrics.values():
            lines.extend(metric.collect())
        return "\n".join(lines) + "\n"
    
    def clear(self) -> None:
        """Clear all metrics (for testing)."""
        self._metrics.clear()


class Metric:
    """Base metric class."""
    
    def __init__(self, name: str, documentation: str, labelnames: Optional[List[str]] = None):
        self.name = name
        self.documentation = documentation
        self.labelnames = labelnames or []
        MetricsRegistry().register(self)
    
    def collect(self) -> List[str]:
        """Collect metric in Prometheus format."""
        raise NotImplementedError


class Counter(Metric):
    """Counter metric (monotonically increasing).
    
    Example:
        requests = Counter('http_requests_total', 'Total HTTP requests')
        requests.inc()
        requests.inc(5)
    """
    
    def __init__(self, name: str, documentation: str, labelnames: Optional[List[str]] = None):
        super().__init__(name, documentation, labelnames)
        self._value = 0.0
        self._lock = threading.Lock()
        self._labels: Dict[Tuple, float] = defaultdict(float)
    
    def inc(self, amount: float = 1.0) -> None:
        """Increment counter."""
        if amount < 0:
            raise ValueError("Counter cannot decrease")
        with self._lock:
            self._value += amount
    
    def labels(self, **labels) -> 'LabeledCounter':
        """Return counter with labels."""
        return LabeledCounter(self, labels)
    
    def collect(self) -> List[str]:
        """Collect counter in Prometheus format."""
        lines = [
            f"# HELP {self.name} {self.documentation}",
            f"# TYPE {self.name} counter",
        ]
        
        with self._lock:
            if self._labels:
                for label_values, value in self._labels.items():
                    label_str = ",".join(
                        f'{k}="{v}"' for k, v in zip(self.labelnames, label_values)
                    )
                    lines.append(f"{self.name}{{{label_str}}} {value}")
            else:
                lines.append(f"{self.name} {self._value}")
        
        return lines


class LabeledCounter:
    """Counter with labels."""
    
    def __init__(self, counter: Counter, labels: Dict[str, str]):
        self.counter = counter
        self.label_values = tuple(labels.get(name, "") for name in counter.labelnames)
    
    def inc(self, amount: float = 1.0) -> None:
        """Increment labeled counter."""
        if amount < 0:
            raise ValueError("Counter cannot decrease")
        with self.counter._lock:
            self.counter._labels[self.label_values] += amount


class Gauge(Metric):
    """Gauge metric (can go up or down).
    
    Example:
        temperature = Gauge('temperature_celsius', 'Current temperature')
        temperature.set(25.5)
        temperature.inc(2)
        temperature.dec(1.5)
    """
    
    def __init__(self, name: str, documentation: str, labelnames: Optional[List[str]] = None):
        super().__init__(name, documentation, labelnames)
        self._value = 0.0
        self._lock = threading.Lock()
        self._labels: Dict[Tuple, float] = defaultdict(float)
    
    def set(self, value: float) -> None:
        """Set gauge to value."""
        with self._lock:
            self._value = value
    
    def inc(self, amount: float = 1.0) -> None:
        """Increment gauge."""
        with self._lock:
            self._value += amount
    
    def dec(self, amount: float = 1.0) -> None:
        """Decrement gauge."""
        with self._lock:
            self._value -= amount
    
    def set_to_current_time(self) -> None:
        """Set gauge to current Unix timestamp."""
        self.set(time.time())
    
    def labels(self, **labels) -> 'LabeledGauge':
        """Return gauge with labels."""
        return LabeledGauge(self, labels)
    
    def collect(self) -> List[str]:
        """Collect gauge in Prometheus format."""
        lines = [
            f"# HELP {self.name} {self.documentation}",
            f"# TYPE {self.name} gauge",
        ]
        
        with self._lock:
            if self._labels:
                for label_values, value in self._labels.items():
                    label_str = ",".join(
                        f'{k}="{v}"' for k, v in zip(self.labelnames, label_values)
                    )
                    lines.append(f"{self.name}{{{label_str}}} {value}")
            else:
                lines.append(f"{self.name} {self._value}")
        
        return lines


class LabeledGauge:
    """Gauge with labels."""
    
    def __init__(self, gauge: Gauge, labels: Dict[str, str]):
        self.gauge = gauge
        self.label_values = tuple(labels.get(name, "") for name in gauge.labelnames)
    
    def set(self, value: float) -> None:
        """Set labeled gauge."""
        with self.gauge._lock:
            self.gauge._labels[self.label_values] = value
    
    def inc(self, amount: float = 1.0) -> None:
        """Increment labeled gauge."""
        with self.gauge._lock:
            self.gauge._labels[self.label_values] += amount
    
    def dec(self, amount: float = 1.0) -> None:
        """Decrement labeled gauge."""
        with self.gauge._lock:
            self.gauge._labels[self.label_values] -= amount


class Histogram(Metric):
    """Histogram metric (simplified - no quantiles).
    
    Tracks count, sum, and bucket distribution.
    
    Example:
        latency = Histogram('request_latency_seconds', 'Request latency',
                           buckets=[0.1, 0.5, 1.0, 5.0])
        latency.observe(0.25)
        latency.observe(2.5)
    """
    
    def __init__(
        self,
        name: str,
        documentation: str,
        buckets: Optional[List[float]] = None,
        labelnames: Optional[List[str]] = None
    ):
        super().__init__(name, documentation, labelnames)
        self.buckets = buckets or [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0]
        self._count = 0
        self._sum = 0.0
        self._buckets = defaultdict(int)
        self._lock = threading.Lock()
    
    def observe(self, amount: float) -> None:
        """Observe a value."""
        with self._lock:
            self._count += 1
            self._sum += amount
            for bucket in self.buckets:
                if amount <= bucket:
                    self._buckets[bucket] += 1
    
    def collect(self) -> List[str]:
        """Collect histogram in Prometheus format."""
        lines = [
            f"# HELP {self.name} {self.documentation}",
            f"# TYPE {self.name} histogram",
        ]
        
        with self._lock:
            cumulative = 0
            for bucket in sorted(self.buckets):
                cumulative += self._buckets.get(bucket, 0)
                lines.append(f'{self.name}_bucket{{le="{bucket}"}} {cumulative}')
            lines.append(f'{self.name}_bucket{{le="+Inf"}} {self._count}')
            lines.append(f"{self.name}_count {self._count}")
            lines.append(f"{self.name}_sum {self._sum}")
        
        return lines


class Summary(Metric):
    """Summary metric (simplified - tracks count and sum only).
    
    Example:
        response_size = Summary('response_size_bytes', 'Response size')
        response_size.observe(1234)
        response_size.observe(5678)
    """
    
    def __init__(self, name: str, documentation: str, labelnames: Optional[List[str]] = None):
        super().__init__(name, documentation, labelnames)
        self._count = 0
        self._sum = 0.0
        self._lock = threading.Lock()
    
    def observe(self, amount: float) -> None:
        """Observe a value."""
        with self._lock:
            self._count += 1
            self._sum += amount
    
    def collect(self) -> List[str]:
        """Collect summary in Prometheus format."""
        lines = [
            f"# HELP {self.name} {self.documentation}",
            f"# TYPE {self.name} summary",
        ]
        
        with self._lock:
            lines.append(f"{self.name}_count {self._count}")
            lines.append(f"{self.name}_sum {self._sum}")
        
        return lines


def generate_latest() -> str:
    """Generate latest metrics in Prometheus format.
    
    Returns:
        Metrics in Prometheus text exposition format
    
    Example:
        from http.server import HTTPServer, BaseHTTPRequestHandler
        
        class MetricsHandler(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(200)
                self.send_header('Content-Type', 'text/plain; version=0.0.4')
                self.end_headers()
                self.wfile.write(generate_latest().encode())
        
        server = HTTPServer(('', 8000), MetricsHandler)
        server.serve_forever()
    """
    return MetricsRegistry().collect()


# Compatibility with prometheus_client API
COLLECTORS = MetricsRegistry()
