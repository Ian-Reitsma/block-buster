"""Tiny in-house numpy subset (pure stdlib).

This module provides just enough functionality for the feature/risk/posterior
code paths without pulling the real ``numpy`` dependency.  Operations are
implemented on top of plain Python lists and math functions; performance is
secondary to portability and auditability.
"""

from __future__ import annotations

import json
import math
import random as _stdlib_random
from pathlib import Path
from types import SimpleNamespace
from typing import Iterable, List, Sequence, Tuple, Union, overload

Number = Union[int, float]
float32 = float
float64 = float
int64 = int


class NDArray:
    """Minimal 1D/2D array wrapper with element-wise ops and mask indexing."""

    def __init__(self, data: Union[Sequence[Number], Sequence[Sequence[Number]]], dtype=None):
        if isinstance(data, NDArray):
            self.data = _clone(data.data)
        else:
            self.data = _clone(data)
        self.dtype = dtype

    # ---- helpers -----------------------------------------------------
    @property
    def shape(self) -> Tuple[int, ...]:
        if len(self.data) == 0:
            return (0,)
        if isinstance(self.data[0], list):
            return (len(self.data), len(self.data[0]))
        return (len(self.data),)

    def copy(self) -> "NDArray":
        return NDArray(self.data, self.dtype)

    def tolist(self):
        return _clone(self.data)

    # ---- iteration / indexing ----------------------------------------
    def __len__(self):
        return len(self.data)

    def __iter__(self):
        return iter(self.data)

    def __getitem__(self, key):
        if isinstance(key, slice):
            return NDArray(self.data[key], self.dtype)
        if isinstance(key, NDArray):
            key = key.data
        if isinstance(key, list) and key and all(isinstance(b, bool) for b in key):
            return NDArray([v for v, m in zip(self.data, key) if m], self.dtype)
        return self.data[key]

    def __setitem__(self, key, value):
        if isinstance(key, slice):
            if isinstance(value, NDArray):
                self.data[key] = value.data
            elif isinstance(value, list):
                self.data[key] = value
            else:
                size = len(range(*key.indices(len(self.data))))
                self.data[key] = [value for _ in range(size)]
            return
        if isinstance(key, NDArray):
            key = key.data
        if isinstance(key, list) and key and all(isinstance(b, bool) for b in key):
            # boolean mask assignment
            vals = value
            if not isinstance(vals, list):
                vals = [value] * key.count(True)
            it = iter(vals)
            for idx, m in enumerate(key):
                if m:
                    self.data[idx] = next(it)
            return
        self.data[key] = value

    # ---- elementwise ops ---------------------------------------------
    def _binary(self, other, op):
        if isinstance(other, NDArray):
            other = other.data
        if isinstance(other, list):
            return NDArray([op(a, b) for a, b in zip(self.data, other)], self.dtype)
        return NDArray([op(a, other) for a in self.data], self.dtype)

    def __add__(self, other):
        return self._binary(other, lambda a, b: a + b)

    def __sub__(self, other):
        return self._binary(other, lambda a, b: a - b)

    def __mul__(self, other):
        return self._binary(other, lambda a, b: a * b)

    def __truediv__(self, other):
        return self._binary(other, lambda a, b: a / b)

    def __pow__(self, power):
        return NDArray([a ** power for a in self.data], self.dtype)

    def __matmul__(self, other):
        # 1D @ 1D -> scalar
        if not self.data:
            return 0.0
        if isinstance(other, NDArray):
            other = other.data
        if isinstance(self.data[0], list):
            # 2D @ 1D
            return NDArray([sum(a * b for a, b in zip(row, other)) for row in self.data])
        if isinstance(other[0], list):
            # 1D @ 2D
            cols = len(other[0])
            return NDArray(
                [sum(self.data[r] * other[r][c] for r in range(len(self.data))) for c in range(cols)]
            )
        return sum(a * b for a, b in zip(self.data, other))

    # ---- reductions ---------------------------------------------------
    def sum(self):
        return sum(self.data)

    def max(self):
        return max(self.data) if self.data else 0.0

    def min(self):
        return min(self.data) if self.data else 0.0

    def argmax(self) -> int:
        if not self.data:
            return -1
        flat = _flatten(self.data)
        m = max(flat)
        return flat.index(m)

    def argmin(self) -> int:
        if not self.data:
            return -1
        flat = _flatten(self.data)
        m = min(flat)
        return flat.index(m)

    def fill(self, value: Number) -> None:
        if self.data and isinstance(self.data[0], list):
            for r in range(len(self.data)):
                for c in range(len(self.data[r])):
                    self.data[r][c] = value
        else:
            for i in range(len(self.data)):
                self.data[i] = value

    def mean(self):
        return sum(self.data) / len(self.data) if self.data else 0.0

    def var(self):
        m = self.mean()
        return sum((x - m) ** 2 for x in self.data) / len(self.data) if self.data else 0.0

    def std(self):
        return math.sqrt(self.var())

    # ---- representation ----------------------------------------------
    def __repr__(self):
        return f"NDArray({self.data})"


# ----------------------------------------------------------------------
# creation helpers
# ----------------------------------------------------------------------
def array(data, dtype=None, copy=False) -> NDArray:
    if isinstance(data, NDArray) and not copy:
        return data
    return NDArray(data, dtype=dtype)


asarray = array


def zeros(shape, dtype=float) -> NDArray:
    if isinstance(shape, tuple):
        rows, cols = shape
        return NDArray([[dtype(0) for _ in range(cols)] for _ in range(rows)], dtype=dtype)
    return NDArray([dtype(0) for _ in range(shape)], dtype=dtype)


def full(shape, fill_value: Number, dtype=float) -> NDArray:
    if isinstance(shape, tuple):
        rows, cols = shape
        return NDArray([[dtype(fill_value) for _ in range(cols)] for _ in range(rows)], dtype=dtype)
    return NDArray([dtype(fill_value) for _ in range(shape)], dtype=dtype)


def diff(arr: NDArray) -> NDArray:
    data = arr.data
    return NDArray([data[i + 1] - data[i] for i in range(len(data) - 1)])


def stack(items: Sequence[NDArray]) -> NDArray:
    return NDArray([it.data for it in items])


def reshape(arr: NDArray, shape: tuple[int, int]) -> NDArray:
    """Simple 2D reshape helper."""
    rows, cols = shape
    flat = _flatten(arr.data if isinstance(arr, NDArray) else arr)
    if len(flat) != rows * cols:
        raise ValueError("cannot reshape array of size %d into shape %s" % (len(flat), shape))
    out = []
    for r in range(rows):
        start = r * cols
        out.append(flat[start:start + cols])
    return NDArray(out, dtype=getattr(arr, "dtype", None))


def power(base: Number, exp: Union[Number, NDArray], dtype=None):
    if isinstance(exp, NDArray):
        return NDArray([base ** e for e in exp.data], dtype=dtype)
    return base ** exp


def log(arr: Union[NDArray, Number]):
    if isinstance(arr, NDArray):
        return NDArray([math.log(x) if x > 0 else float("-inf") for x in arr.data])
    return math.log(arr) if arr > 0 else float("-inf")


def exp(arr: Union[NDArray, Number]):
    if isinstance(arr, NDArray):
        return NDArray([math.exp(x) for x in arr.data])
    return math.exp(arr)


def sqrt(arr: Union[NDArray, Number]):
    if isinstance(arr, NDArray):
        return NDArray([math.sqrt(x) for x in arr.data])
    return math.sqrt(arr)


def isnan(arr: NDArray) -> NDArray:
    return NDArray([math.isnan(x) for x in arr.data])


def any(arr: Union[NDArray, Iterable[bool]]) -> bool:  # noqa: A001 - match numpy name
    if isinstance(arr, NDArray):
        return builtins_any(arr.data)
    return builtins_any(arr)


def nan_to_num(arr: NDArray, copy: bool = True):
    target = arr.copy() if copy else arr
    target.data = [0.0 if math.isnan(x) else x for x in target.data]
    return target


def isclose(a: float, b: float, atol: float = 1e-8) -> bool:
    return abs(a - b) <= atol


def allclose(a: NDArray, b: NDArray, atol: float = 1e-8) -> bool:
    return all(abs(x - y) <= atol for x, y in zip(a.data, b.data))


def array_equal(a: NDArray, b: NDArray) -> bool:
    return a.data == b.data


def argmax(arr: NDArray) -> int:
    return arr.argmax()


def argmin(arr: NDArray) -> int:
    return arr.argmin()


def shares_memory(a: NDArray, b: NDArray) -> bool:
    # Pure-Python representation has no view semantics; return False for simplicity.
    return False


def quantile(arr: NDArray, q: float):
    data = sorted(arr.data)
    if not data:
        return 0.0
    k = (len(data) - 1) * q
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return data[int(k)]
    d0 = data[int(f)] * (c - k)
    d1 = data[int(c)] * (k - f)
    return d0 + d1


def cov(mat: NDArray):
    # mat: rows = observations, cols = variables
    data = mat.data
    if not data:
        return NDArray([])
    n = len(data)
    cols = len(data[0])
    means = [sum(row[c] for row in data) / n for c in range(cols)]
    covs: List[List[float]] = [[0.0] * cols for _ in range(cols)]
    for i in range(cols):
        for j in range(cols):
            covs[i][j] = sum(
                (row[i] - means[i]) * (row[j] - means[j]) for row in data
            ) / max(n - 1, 1)
    return NDArray(covs)


# ----------------------------------------------------------------------
# random
# ----------------------------------------------------------------------
class _RNG:
    def __init__(self, seed=None):
        self._rng = _stdlib_random.Random(seed)

    def standard_normal(self, size: int):
        return NDArray([self._rng.gauss(0.0, 1.0) for _ in range(size)])


class _RandomModule:
    @staticmethod
    def default_rng(seed=None):
        return _RNG(seed)


random = _RandomModule()  # type: ignore


# ----------------------------------------------------------------------
# persistence (np.savez / np.load analogue)
# ----------------------------------------------------------------------
def savez(path: Union[str, Path], **arrays: NDArray):
    serializable = {k: v.tolist() if isinstance(v, NDArray) else v for k, v in arrays.items()}
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(serializable, f)


def load(path: Union[str, Path]):
    with open(path, "r") as f:
        data = json.load(f)
    ns = SimpleNamespace()
    for k, v in data.items():
        setattr(ns, k, NDArray(v))
    # allow dict-style access
    ns.__getitem__ = lambda self, key: getattr(self, key)
    return ns


# builtins alias to avoid shadowing
builtins_any = any  # noqa: A001


def _flatten(obj):
    if isinstance(obj, list) and obj and isinstance(obj[0], list):
        return [item for sub in obj for item in sub]
    return list(obj)


def _clone(obj):
    if isinstance(obj, list):
        return [ _clone(x) for x in obj ]
    return obj


# Numpy-compat type alias for annotations.
ndarray = NDArray
