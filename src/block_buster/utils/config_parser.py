"""Stdlib-only configuration parser - pyyaml replacement.

Supports JSON (native) and a simple subset of YAML for common config patterns.
No third-party dependencies - uses only Python stdlib.

Preferred: Use JSON for configs. This module provides YAML compatibility
for legacy configs with basic key-value pairs, lists, and nested dicts.
"""

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Union


class ConfigParseError(Exception):
    """Configuration parsing error."""
    pass


def load_json(path: Union[str, Path]) -> Dict[str, Any]:
    """Load JSON configuration file.
    
    Args:
        path: Path to JSON file
    
    Returns:
        Parsed configuration dict
    """
    with open(path, 'r') as f:
        return json.load(f)


def dump_json(data: Dict[str, Any], path: Union[str, Path], indent: int = 2) -> None:
    """Write configuration to JSON file.
    
    Args:
        data: Configuration dict to write
        path: Output path
        indent: Indentation level (default: 2)
    """
    with open(path, 'w') as f:
        json.dump(data, f, indent=indent)


def loads_json(text: str) -> Dict[str, Any]:
    """Parse JSON string.
    
    Args:
        text: JSON string
    
    Returns:
        Parsed configuration dict
    """
    return json.loads(text)


def dumps_json(data: Dict[str, Any], indent: int = 2) -> str:
    """Serialize configuration to JSON string.
    
    Args:
        data: Configuration dict
        indent: Indentation level (default: 2)
    
    Returns:
        JSON string
    """
    return json.dumps(data, indent=indent)


def _parse_yaml_value(value: str) -> Any:
    """Parse YAML value into Python type.
    
    Handles:
    - null/None
    - true/false booleans
    - integers
    - floats
    - strings (quoted and unquoted)
    - lists (inline: [a, b, c])
    """
    value = value.strip()
    
    # null/None
    if value in ('null', 'Null', 'NULL', '~', ''):
        return None
    
    # Booleans
    if value in ('true', 'True', 'TRUE'):
        return True
    if value in ('false', 'False', 'FALSE'):
        return False
    
    # Inline list [a, b, c]
    if value.startswith('[') and value.endswith(']'):
        items = value[1:-1].split(',')
        return [_parse_yaml_value(item) for item in items]
    
    # Inline dict {a: 1, b: 2}
    if value.startswith('{') and value.endswith('}'):
        # Use JSON parser for inline dicts
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            pass
    
    # Quoted strings
    if (value.startswith('"') and value.endswith('"')) or \
       (value.startswith("'") and value.endswith("'")):
        return value[1:-1]
    
    # Try numeric types
    try:
        if value.lower().startswith("0x"):
            return int(value, 16)
        if '.' in value or 'e' in value.lower():
            return float(value)
        return int(value)
    except ValueError:
        pass
    
    # Default to string
    return value


def _parse_yaml_simple(text: str) -> Dict[str, Any]:
    """Parse simple YAML subset.
    
    Supports:
    - Key-value pairs (key: value)
    - Nested dicts (with indentation)
    - Lists (- item)
    - Comments (# comment)
    - Basic types (str, int, float, bool, null)
    
    Does NOT support:
    - Anchors/aliases (&anchor, *alias)
    - Multi-line strings (|, >)
    - Complex mappings
    - Flow collections across lines
    
    For complex YAML, use JSON instead or add pyyaml dependency.
    """
    result: Dict[str, Any] = {}
    stack: List[tuple[int, Any]] = [(0, result)]
    current_list: Optional[List] = None
    current_list_indent: int = 0
    
    for line_num, line in enumerate(text.splitlines(), 1):
        # Remove comments
        if '#' in line:
            line = line[:line.index('#')]
        
        # Skip empty lines
        if not line.strip():
            continue
        
        # Calculate indentation
        indent = len(line) - len(line.lstrip())
        content = line.strip()
        
        # List item
        if content.startswith('- '):
            item_value = content[2:].strip()
            
            # Close previous list if indent decreased
            if current_list is not None and indent < current_list_indent:
                current_list = None
            
            # Create new list if needed
            if current_list is None:
                # Pop stack to correct level
                while len(stack) > 1 and stack[-1][0] >= indent:
                    stack.pop()
                
                current_list = []
                current_list_indent = indent
            
            # Parse and add item
            if ':' in item_value:
                # Dict item in list
                key, val = item_value.split(':', 1)
                current_list.append({key.strip(): _parse_yaml_value(val)})
            else:
                current_list.append(_parse_yaml_value(item_value))
            
            continue
        
        # Key-value pair
        if ':' in content:
            current_list = None  # Reset list context
            
            key, value = content.split(':', 1)
            key = key.strip()
            value = value.strip()
            
            # Pop stack to correct indentation level
            while len(stack) > 1 and stack[-1][0] >= indent:
                stack.pop()
            
            parent = stack[-1][1]
            
            # Check if value is empty (nested dict follows)
            if not value:
                new_dict: Dict[str, Any] = {}
                parent[key] = new_dict
                stack.append((indent, new_dict))
            else:
                parent[key] = _parse_yaml_value(value)
        
        # Handle orphan list
        if current_list is not None and content and not content.startswith('-'):
            # Attach list to last key
            while len(stack) > 1 and stack[-1][0] >= current_list_indent:
                stack.pop()
            parent = stack[-1][1]
            if isinstance(parent, dict) and parent:
                last_key = list(parent.keys())[-1]
                parent[last_key] = current_list
            current_list = None
    
    # Attach final list if any
    if current_list is not None:
        while len(stack) > 1:
            stack.pop()
        parent = stack[-1][1]
        if isinstance(parent, dict) and parent:
            last_key = list(parent.keys())[-1]
            parent[last_key] = current_list
    
    return result


def load_yaml(path: Union[str, Path]) -> Dict[str, Any]:
    """Load YAML configuration file (simple subset).
    
    Args:
        path: Path to YAML file
    
    Returns:
        Parsed configuration dict
    
    Note:
        For complex YAML, prefer JSON or add pyyaml dependency.
    """
    with open(path, 'r') as f:
        text = f.read()
    return loads_yaml(text)


def loads_yaml(text: str) -> Dict[str, Any]:
    """Parse YAML string (simple subset).
    
    Args:
        text: YAML string
    
    Returns:
        Parsed configuration dict
    """
    # Try JSON first (YAML is a superset of JSON)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    
    # Fall back to simple YAML parser
    return _parse_yaml_simple(text)


def load(path: Union[str, Path]) -> Dict[str, Any]:
    """Load configuration file (auto-detect format from extension).
    
    Args:
        path: Path to config file (.json, .yaml, .yml)
    
    Returns:
        Parsed configuration dict
    """
    path = Path(path)
    
    if path.suffix == '.json':
        return load_json(path)
    elif path.suffix in ('.yaml', '.yml'):
        return load_yaml(path)
    else:
        # Try both
        try:
            return load_json(path)
        except json.JSONDecodeError:
            return load_yaml(path)


def loads(text: str) -> Dict[str, Any]:
    """Parse configuration string (auto-detect format).
    
    Args:
        text: Configuration string
    
    Returns:
        Parsed configuration dict
    """
    # Try JSON first
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    
    # Fall back to YAML
    return loads_yaml(text)
