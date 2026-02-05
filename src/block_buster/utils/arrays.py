"""Minimal array operations - numpy replacement for simple cases.

Provides basic array operations using Python stdlib only.
No third-party dependencies - uses only built-in types and math module.

For advanced numerical computing, use numpy. This module provides
basic operations for simple feature calculations and statistics.
"""

import math
import array
from typing import List, Union, Optional, Tuple


Number = Union[int, float]
ArrayLike = Union[List[Number], 'Array', array.array]


class Array:
    """Simple array wrapper with basic operations.
    
    Example:
        arr = Array([1.0, 2.0, 3.0, 4.0, 5.0])
        print(arr.mean())  # 3.0
        print(arr.std())   # 1.414...
        arr2 = arr * 2     # [2.0, 4.0, 6.0, 8.0, 10.0]
    """
    
    def __init__(self,  ArrayLike, dtype: str = 'f'):
        """Initialize array.
        
        Args:
             Initial data (list, Array, or array.array)
            dtype: Array type code ('f' for float32, 'd' for float64, 'i' for int32)
        """
        if isinstance(data, Array):
            self._data = array.array(dtype, data._data)
        elif isinstance(data, array.array):
            self._data = array.array(dtype, data)
        else:
            self._data = array.array(dtype, data)
    
    def __len__(self) -> int:
        return len(self._data)
    
    def __getitem__(self, idx: Union[int, slice]) -> Union[Number, 'Array']:
        if isinstance(idx, slice):
            return Array(self._data[idx], self._data.typecode)
        return self._data[idx]
    
    def __setitem__(self, idx: Union[int, slice], value: Union[Number, ArrayLike]) -> None:
        self._data[idx] = value
    
    def __repr__(self) -> str:
        return f"Array({list(self._data)})"
    
    def __add__(self, other: Union[Number, 'Array']) -> 'Array':
        """Element-wise addition."""
        if isinstance(other, (int, float)):
            return Array([x + other for x in self._data], self._data.typecode)
        return Array([a + b for a, b in zip(self._data, other._data)], self._data.typecode)
    
    def __sub__(self, other: Union[Number, 'Array']) -> 'Array':
        """Element-wise subtraction."""
        if isinstance(other, (int, float)):
            return Array([x - other for x in self._data], self._data.typecode)
        return Array([a - b for a, b in zip(self._data, other._data)], self._data.typecode)
    
    def __mul__(self, other: Union[Number, 'Array']) -> 'Array':
        """Element-wise multiplication."""
        if isinstance(other, (int, float)):
            return Array([x * other for x in self._data], self._data.typecode)
        return Array([a * b for a, b in zip(self._data, other._data)], self._data.typecode)
    
    def __truediv__(self, other: Union[Number, 'Array']) -> 'Array':
        """Element-wise division."""
        if isinstance(other, (int, float)):
            return Array([x / other for x in self._data], self._data.typecode)
        return Array([a / b for a, b in zip(self._data, other._data)], self._data.typecode)
    
    def __pow__(self, power: Number) -> 'Array':
        """Element-wise power."""
        return Array([x ** power for x in self._data], self._data.typecode)
    
    def sum(self) -> float:
        """Sum of all elements."""
        return sum(self._data)
    
    def mean(self) -> float:
        """Mean (average) of elements."""
        if len(self._data) == 0:
            return 0.0
        return sum(self._data) / len(self._data)
    
    def var(self, ddof: int = 0) -> float:
        """Variance of elements.
        
        Args:
            ddof: Delta degrees of freedom (0 for population, 1 for sample)
        """
        if len(self._data) <= ddof:
            return 0.0
        mean_val = self.mean()
        return sum((x - mean_val) ** 2 for x in self._data) / (len(self._data) - ddof)
    
    def std(self, ddof: int = 0) -> float:
        """Standard deviation of elements.
        
        Args:
            ddof: Delta degrees of freedom (0 for population, 1 for sample)
        """
        return math.sqrt(self.var(ddof))
    
    def min(self) -> float:
        """Minimum value."""
        return min(self._data) if self._data else 0.0
    
    def max(self) -> float:
        """Maximum value."""
        return max(self._data) if self._data else 0.0
    
    def argmin(self) -> int:
        """Index of minimum value."""
        if not self._
            return -1
        return min(range(len(self._data)), key=lambda i: self._data[i])
    
    def argmax(self) -> int:
        """Index of maximum value."""
        if not self._
            return -1
        return max(range(len(self._data)), key=lambda i: self._data[i])
    
    def clip(self, min_val: Optional[Number] = None, max_val: Optional[Number] = None) -> 'Array':
        """Clip values to range."""
        result = list(self._data)
        if min_val is not None:
            result = [max(x, min_val) for x in result]
        if max_val is not None:
            result = [min(x, max_val) for x in result]
        return Array(result, self._data.typecode)
    
    def abs(self) -> 'Array':
        """Absolute values."""
        return Array([abs(x) for x in self._data], self._data.typecode)
    
    def sqrt(self) -> 'Array':
        """Square root of elements."""
        return Array([math.sqrt(x) for x in self._data], self._data.typecode)
    
    def log(self) -> 'Array':
        """Natural logarithm of elements."""
        return Array([math.log(x) if x > 0 else float('-inf') for x in self._data], self._data.typecode)
    
    def exp(self) -> 'Array':
        """Exponential of elements."""
        return Array([math.exp(x) for x in self._data], self._data.typecode)
    
    def cumsum(self) -> 'Array':
        """Cumulative sum."""
        result = []
        total = 0.0
        for x in self._
            total += x
            result.append(total)
        return Array(result, self._data.typecode)
    
    def diff(self) -> 'Array':
        """First difference (arr[i+1] - arr[i])."""
        if len(self._data) < 2:
            return Array([], self._data.typecode)
        return Array([self._data[i+1] - self._data[i] for i in range(len(self._data) - 1)], self._data.typecode)
    
    def tolist(self) -> List[Number]:
        """Convert to Python list."""
        return list(self._data)
    
    def copy(self) -> 'Array':
        """Create a copy."""
        return Array(self._data, self._data.typecode)
    
    def fill(self, value: Number) -> None:
        """Fill array with value."""
        for i in range(len(self._data)):
            self._data[i] = value
    
    def reshape(self, shape: Tuple[int, ...]) -> 'Array':
        """Reshape array (simple 1D to 2D only)."""
        # For simplicity, just return self for now
        # Full reshape would require a multi-dimensional array class
        return self
    
    @property
    def shape(self) -> Tuple[int]:
        """Array shape."""
        return (len(self._data),)
    
    @property
    def dtype(self) -> str:
        """Array data type."""
        return self._data.typecode


def zeros(size: int, dtype: str = 'f') -> Array:
    """Create array of zeros.
    
    Args:
        size: Array size
        dtype: Data type code
    
    Example:
        arr = zeros(5)  # [0.0, 0.0, 0.0, 0.0, 0.0]
    """
    return Array([0.0] * size, dtype)


def ones(size: int, dtype: str = 'f') -> Array:
    """Create array of ones.
    
    Args:
        size: Array size
        dtype: Data type code
    
    Example:
        arr = ones(5)  # [1.0, 1.0, 1.0, 1.0, 1.0]
    """
    return Array([1.0] * size, dtype)


def full(size: int, fill_value: Number, dtype: str = 'f') -> Array:
    """Create array filled with value.
    
    Args:
        size: Array size
        fill_value: Value to fill
        dtype: Data type code
    """
    return Array([fill_value] * size, dtype)


def arange(start: Number, stop: Optional[Number] = None, step: Number = 1, dtype: str = 'f') -> Array:
    """Create array with evenly spaced values.
    
    Args:
        start: Start value (or stop if stop is None)
        stop: End value (exclusive)
        step: Step size
        dtype: Data type code
    
    Example:
        arr = arange(0, 10, 2)  # [0, 2, 4, 6, 8]
    """
    if stop is None:
        start, stop = 0, start
    
    result = []
    current = start
    while (step > 0 and current < stop) or (step < 0 and current > stop):
        result.append(current)
        current += step
    
    return Array(result, dtype)


def linspace(start: Number, stop: Number, num: int = 50, dtype: str = 'f') -> Array:
    """Create array with linearly spaced values.
    
    Args:
        start: Start value
        stop: End value
        num: Number of samples
        dtype: Data type code
    """
    if num <= 0:
        return Array([], dtype)
    if num == 1:
        return Array([start], dtype)
    
    step = (stop - start) / (num - 1)
    return Array([start + i * step for i in range(num)], dtype)


def array( ArrayLike, dtype: str = 'f') -> Array:
    """Create array from data.
    
    Args:
         Input data
        dtype: Data type code
    
    Example:
        arr = array([1.0, 2.0, 3.0])
    """
    return Array(data, dtype)


def concatenate(arrays: List[Array]) -> Array:
    """Concatenate arrays.
    
    Args:
        arrays: List of arrays to concatenate
    
    Example:
        arr1 = array([1.0, 2.0])
        arr2 = array([3.0, 4.0])
        result = concatenate([arr1, arr2])  # [1.0, 2.0, 3.0, 4.0]
    """
    if not arrays:
        return Array([], 'f')
    
    dtype = arrays[0].dtype
    result = []
    for arr in arrays:
        result.extend(arr.tolist())
    return Array(result, dtype)


def isnan(arr: Union[Array, Number]) -> Union[Array, bool]:
    """Check for NaN values.
    
    Args:
        arr: Array or scalar
    
    Returns:
        Boolean array or bool
    """
    if isinstance(arr, Array):
        return Array([math.isnan(x) if isinstance(x, float) else False for x in arr._data], 'i')
    return math.isnan(arr) if isinstance(arr, float) else False


def nan_to_num(arr: Array, nan: Number = 0.0, copy: bool = True) -> Array:
    """Replace NaN with number.
    
    Args:
        arr: Input array
        nan: Value to replace NaN with
        copy: If False, modify in-place
    
    Returns:
        Array with NaN replaced
    """
    result = arr.copy() if copy else arr
    for i in range(len(result)):
        if isinstance(result[i], float) and math.isnan(result[i]):
            result[i] = nan
    return result


def sqrt(arr: Union[Array, Number]) -> Union[Array, float]:
    """Square root."""
    if isinstance(arr, Array):
        return arr.sqrt()
    return math.sqrt(arr)


def log(arr: Union[Array, Number]) -> Union[Array, float]:
    """Natural logarithm."""
    if isinstance(arr, Array):
        return arr.log()
    return math.log(arr)


def exp(arr: Union[Array, Number]) -> Union[Array, float]:
    """Exponential."""
    if isinstance(arr, Array):
        return arr.exp()
    return math.exp(arr)


def abs(arr: Union[Array, Number]) -> Union[Array, float]:
    """Absolute value."""
    if isinstance(arr, Array):
        return arr.abs()
    return __builtins__['abs'](arr)


# Type aliases for compatibility
float32 = 'f'
float64 = 'd'
int32 = 'i'
