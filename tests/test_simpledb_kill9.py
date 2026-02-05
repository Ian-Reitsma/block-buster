import os
import signal
import tempfile
import multiprocessing
import unittest

from block_buster.core.database import SimpleDb


def _write_and_kill(path: str) -> None:
    """Child process: write a WAL entry then exit via SIGKILL."""
    db = SimpleDb.open(path)
    db.ensure_cf("t")
    db.put("t", b"k", b"v")
    db.flush_wal()
    os.kill(os.getpid(), signal.SIGKILL)


class TestSimpleDbKill9(unittest.TestCase):
    def test_kill9_restart_recovers_wal(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            db_path = os.path.join(d, "db")
            proc = multiprocessing.Process(target=_write_and_kill, args=(db_path,))
            proc.start()
            proc.join(timeout=5)

            # Child should exit due to SIGKILL
            self.assertEqual(proc.exitcode, -signal.SIGKILL)

            db = SimpleDb.open(db_path)
            db.ensure_cf("t")
            self.assertEqual(db.get("t", b"k"), b"v")
            db.close()


if __name__ == "__main__":
    unittest.main()
