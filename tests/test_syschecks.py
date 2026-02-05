import os
import sys
import time
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from block_buster.utils import syschecks


class TestSyschecks(unittest.TestCase):
    def test_disk_iops(self):
        # Use a temp path in /tmp to avoid repo pollution
        iops = syschecks.disk_iops_test("/tmp/syscheck_iops_test.bin")
        self.assertGreater(iops, 0)

    def test_disk_iops_env_override(self):
        os.environ["SYS_DISK_IOPS_PATH"] = "/tmp/syscheck_env_override.bin"
        try:
            iops = syschecks.disk_iops_test("/tmp/ignored.bin")
            self.assertGreater(iops, 0)
        finally:
            os.environ.pop("SYS_DISK_IOPS_PATH", None)

    def test_ntp_cache(self):
        syschecks._ntp_cache["value"] = 1.23
        syschecks._ntp_cache["ts"] = time.time()
        self.assertAlmostEqual(syschecks.ntp_drift(), 1.23)


if __name__ == "__main__":
    unittest.main()
