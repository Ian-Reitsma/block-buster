import os
import time
import logging
from typing import Optional
from block_buster.utils import ntp_client


def ntp_drift() -> float:
    now = time.time()
    if _ntp_cache["value"] is not None and now - _ntp_cache["ts"] < 60:
        return _ntp_cache["value"]  # type: ignore[return-value]
    c = ntp_client.NTPClient(version=3)
    resp = c.request('pool.ntp.org')
    _ntp_cache["value"] = resp.offset
    _ntp_cache["ts"] = now
    return resp.offset


logger = logging.getLogger(__name__)
_ntp_cache: dict = {"ts": 0.0, "value": None}


def check_ntp(max_drift: float = 1.0) -> None:
    try:
        drift = abs(ntp_drift())
    except Exception as e:
        logger.warning("NTP check failed: %s", e)
        return
    if drift > max_drift:
        raise RuntimeError(f'NTP drift {drift:.2f}s exceeds limit')


def disk_iops_test(path: str) -> float:
    """Measure disk write IOPS by repeatedly writing a file.

    The parent directory is created if it does not already exist so that callers
    may freely supply paths under non-existent directories.
    """
    env_path = os.getenv("SYS_DISK_IOPS_PATH")
    if env_path:
        path = env_path

    dir_path = os.path.dirname(path)
    if dir_path:
        os.makedirs(dir_path, exist_ok=True)

    start = time.perf_counter()
    for _ in range(100):
        with open(path, 'wb') as fh:
            fh.write(b'0')
        os.remove(path)
    return 100 / (time.perf_counter() - start)
