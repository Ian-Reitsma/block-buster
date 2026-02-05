import time
import unittest

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from block_buster.utils import np


class TestNp(unittest.TestCase):
    def test_basic_ops(self):
        a = np.array([1.0, 2.0, 3.0])
        b = np.array([4.0, 5.0, 6.0])
        self.assertEqual((a + b).tolist(), [5.0, 7.0, 9.0])
        self.assertEqual((b - a).tolist(), [3.0, 3.0, 3.0])
        self.assertEqual((a * 2).tolist(), [2.0, 4.0, 6.0])
        self.assertAlmostEqual((a / 2).mean(), 1.0)

    def test_matmul(self):
        v = np.array([1.0, 2.0, 3.0])
        w = np.array([0.5, 0.0, -1.0])
        self.assertAlmostEqual(v @ w, -2.5)

    def test_random(self):
        rng = np.random.default_rng(0)
        samples = rng.standard_normal(3)
        self.assertEqual(len(samples), 3)

    def test_arg_extrema_and_reshape(self):
        arr = np.array([1.0, 5.0, -2.0, 4.0])
        self.assertEqual(np.argmax(arr), 1)
        self.assertEqual(np.argmin(arr), 2)
        reshaped = np.reshape(np.array([1, 2, 3, 4]), (2, 2))
        self.assertEqual(reshaped.shape, (2, 2))
        self.assertEqual(reshaped[1][1], 4)

    def test_micro_benchmark(self):
        arr = np.array(list(range(128)))
        start = time.perf_counter()
        for _ in range(500):
            np.argmax(arr)
            np.argmin(arr)
        duration = time.perf_counter() - start
        self.assertLess(duration, 0.25)


if __name__ == "__main__":
    unittest.main()
