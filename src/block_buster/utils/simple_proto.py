"""Simple protobuf-like binary serialization - protobuf replacement.

Provides a lightweight binary serialization format for simple messages.
No third-party dependencies - uses only Python stdlib.

For full protobuf compatibility, use the 'protobuf' package.
This module provides a similar wire format for simple use cases.

Supports:
- Primitive types (int, float, str, bytes, bool)
- Nested messages (dicts)
- Repeated fields (lists)
- Variable-length encoding (varint)

Does NOT support:
- Code generation from .proto files
- Full protobuf wire format compatibility
- Complex features (oneof, maps, etc.)

For simple RPC/messaging, consider using JSON or MessagePack instead.
"""

import struct
from io import BytesIO
from typing import Any, Dict, List, Union


class ProtoError(Exception):
    """Protobuf encoding/decoding error."""
    pass


# Wire types (protobuf compatible)
WIRE_VARINT = 0
WIRE_64BIT = 1
WIRE_LENGTH_DELIMITED = 2
WIRE_32BIT = 5


def _encode_varint(value: int) -> bytes:
    """Encode unsigned integer as varint.
    
    Variable-length encoding:
    - 7 bits per byte for value
    - MSB indicates continuation
    """
    if value < 0:
        raise ProtoError("Varint cannot encode negative values")
    
    result = bytearray()
    while value > 0x7F:
        result.append((value & 0x7F) | 0x80)
        value >>= 7
    result.append(value & 0x7F)
    return bytes(result)


def _decode_varint(buf: BytesIO) -> int:
    """Decode varint from buffer."""
    result = 0
    shift = 0
    
    while True:
        byte_data = buf.read(1)
        if not byte_data:
            raise ProtoError("Unexpected end of varint")
        
        byte = byte_data[0]
        result |= (byte & 0x7F) << shift
        
        if not (byte & 0x80):
            break
        
        shift += 7
        if shift >= 64:
            raise ProtoError("Varint too long")
    
    return result


def _encode_zigzag(value: int) -> int:
    """Encode signed integer as zigzag (for varint).
    
    Maps:
    0 -> 0, -1 -> 1, 1 -> 2, -2 -> 3, 2 -> 4, etc.
    """
    return (value << 1) ^ (value >> 31)


def _decode_zigzag(value: int) -> int:
    """Decode zigzag to signed integer."""
    return (value >> 1) ^ -(value & 1)


def _encode_key(field_number: int, wire_type: int) -> bytes:
    """Encode field key (field_number << 3 | wire_type)."""
    return _encode_varint((field_number << 3) | wire_type)


def _decode_key(value: int) -> tuple[int, int]:
    """Decode field key into (field_number, wire_type)."""
    return (value >> 3, value & 0x07)


class Message:
    """Base class for simple protobuf-like messages.
    
    Usage:
        class Person(Message):
            FIELDS = {
                1: ('name', str),
                2: ('age', int),
                3: ('email', str),
            }
        
        person = Person(name="Alice", age=30, email="alice@example.com")
        data = person.encode()
        person2 = Person.decode(data)
    """
    
    FIELDS: Dict[int, tuple[str, type]] = {}
    
    def __init__(self, **kwargs):
        self._data = {}
        for field_num, (field_name, field_type) in self.FIELDS.items():
            value = kwargs.get(field_name)
            if value is not None:
                self._data[field_name] = value
    
    def __getattr__(self, name: str) -> Any:
        if name.startswith('_'):
            return super().__getattribute__(name)
        return self._data.get(name)
    
    def __setattr__(self, name: str, value: Any) -> None:
        if name.startswith('_'):
            super().__setattr__(name, value)
        else:
            self._data[name] = value
    
    def encode(self) -> bytes:
        """Encode message to bytes."""
        buf = BytesIO()
        
        for field_num, (field_name, field_type) in self.FIELDS.items():
            value = self._data.get(field_name)
            if value is None:
                continue
            
            # Handle lists (repeated fields)
            if isinstance(value, list):
                for item in value:
                    self._encode_field(buf, field_num, item, field_type)
            else:
                self._encode_field(buf, field_num, value, field_type)
        
        return buf.getvalue()
    
    def _encode_field(self, buf: BytesIO, field_num: int, value: Any, field_type: type) -> None:
        """Encode single field."""
        # Integers (varint)
        if field_type == int:
            buf.write(_encode_key(field_num, WIRE_VARINT))
            if value < 0:
                value = _encode_zigzag(value)
            buf.write(_encode_varint(value))
        
        # Booleans (varint 0 or 1)
        elif field_type == bool:
            buf.write(_encode_key(field_num, WIRE_VARINT))
            buf.write(_encode_varint(1 if value else 0))
        
        # Floats (32-bit)
        elif field_type == float:
            buf.write(_encode_key(field_num, WIRE_32BIT))
            buf.write(struct.pack('<f', value))
        
        # Strings (length-delimited)
        elif field_type == str:
            data = value.encode('utf-8')
            buf.write(_encode_key(field_num, WIRE_LENGTH_DELIMITED))
            buf.write(_encode_varint(len(data)))
            buf.write(data)
        
        # Bytes (length-delimited)
        elif field_type == bytes:
            buf.write(_encode_key(field_num, WIRE_LENGTH_DELIMITED))
            buf.write(_encode_varint(len(value)))
            buf.write(value)
        
        # Nested messages
        elif isinstance(value, Message):
            data = value.encode()
            buf.write(_encode_key(field_num, WIRE_LENGTH_DELIMITED))
            buf.write(_encode_varint(len(data)))
            buf.write(data)
        
        else:
            raise ProtoError(f"Unsupported field type: {field_type}")
    
    @classmethod
    def decode(cls,  bytes) -> 'Message':
        """Decode message from bytes."""
        buf = BytesIO(data)
        result = cls()
        
        # Build reverse lookup: field_num -> (name, type)
        field_map = {num: (name, ftype) for num, (name, ftype) in cls.FIELDS.items()}
        
        while buf.tell() < len(data):
            # Read key
            key = _decode_varint(buf)
            field_num, wire_type = _decode_key(key)
            
            if field_num not in field_map:
                # Skip unknown field
                cls._skip_field(buf, wire_type)
                continue
            
            field_name, field_type = field_map[field_num]
            
            # Decode value
            value = cls._decode_field(buf, wire_type, field_type)
            
            # Handle repeated fields (lists)
            existing = result._data.get(field_name)
            if existing is not None and isinstance(existing, list):
                existing.append(value)
            elif existing is not None:
                result._data[field_name] = [existing, value]
            else:
                result._data[field_name] = value
        
        return result
    
    @staticmethod
    def _decode_field(buf: BytesIO, wire_type: int, field_type: type) -> Any:
        """Decode single field value."""
        if wire_type == WIRE_VARINT:
            value = _decode_varint(buf)
            if field_type == bool:
                return bool(value)
            elif field_type == int:
                return _decode_zigzag(value)
            return value
        
        elif wire_type == WIRE_32BIT:
            data = buf.read(4)
            if len(data) != 4:
                raise ProtoError("Unexpected end of 32-bit field")
            return struct.unpack('<f', data)[0]
        
        elif wire_type == WIRE_64BIT:
            data = buf.read(8)
            if len(data) != 8:
                raise ProtoError("Unexpected end of 64-bit field")
            return struct.unpack('<d', data)[0]
        
        elif wire_type == WIRE_LENGTH_DELIMITED:
            length = _decode_varint(buf)
            data = buf.read(length)
            if len(data) != length:
                raise ProtoError("Unexpected end of length-delimited field")
            
            if field_type == str:
                return data.decode('utf-8')
            elif field_type == bytes:
                return data
            elif isinstance(field_type, type) and issubclass(field_type, Message):
                return field_type.decode(data)
            return data
        
        else:
            raise ProtoError(f"Unknown wire type: {wire_type}")
    
    @staticmethod
    def _skip_field(buf: BytesIO, wire_type: int) -> None:
        """Skip unknown field."""
        if wire_type == WIRE_VARINT:
            _decode_varint(buf)
        elif wire_type == WIRE_32BIT:
            buf.read(4)
        elif wire_type == WIRE_64BIT:
            buf.read(8)
        elif wire_type == WIRE_LENGTH_DELIMITED:
            length = _decode_varint(buf)
            buf.read(length)
        else:
            raise ProtoError(f"Cannot skip unknown wire type: {wire_type}")


# Utility functions for direct encoding/decoding

def encode_message(data: Dict[str, Any], schema: Dict[int, tuple[str, type]]) -> bytes:
    """Encode dict to protobuf-like bytes.
    
    Args:
        data: Data dict
        schema: Field schema {field_num: (name, type)}
    
    Returns:
        Encoded bytes
    """
    class _DynamicMessage(Message):
        FIELDS = schema
    
    msg = _DynamicMessage(**data)
    return msg.encode()


def decode_message(data: bytes, schema: Dict[int, tuple[str, type]]) -> Dict[str, Any]:
    """Decode protobuf-like bytes to dict.
    
    Args:
        data: Encoded bytes
        schema: Field schema {field_num: (name, type)}
    
    Returns:
        Decoded dict
    """
    class _DynamicMessage(Message):
        FIELDS = schema
    
    msg = _DynamicMessage.decode(data)
    return msg._data
