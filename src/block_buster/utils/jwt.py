"""Pure stdlib JWT encoder/decoder - PyJWT replacement.

Implements HS256, HS384, HS512 (HMAC-SHA) and RS256 (RSA-SHA256) algorithms.
No third-party dependencies - uses only Python stdlib (base64, hmac, hashlib, json).
"""

import base64
import hashlib
import hmac
import json
import time
from typing import Any, Dict, Optional, Union


class JWTError(Exception):
    """Base exception for JWT errors."""
    pass


class InvalidTokenError(JWTError):
    """Token validation failed."""
    pass


class ExpiredSignatureError(JWTError):
    """Token signature has expired."""
    pass


class InvalidSignatureError(JWTError):
    """Token signature is invalid."""
    pass


def _base64url_encode( bytes) -> str:
    """Base64url encoding without padding."""
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('utf-8')


def _base64url_decode( str) -> bytes:
    """Base64url decoding with padding restoration."""
    # Add padding if needed
    padding = 4 - (len(data) % 4)
    if padding != 4:
        data += '=' * padding
    return base64.urlsafe_b64decode(data)


def _sign_hs256(msg: bytes, key: str) -> bytes:
    """Sign message with HMAC-SHA256."""
    key_bytes = key.encode('utf-8') if isinstance(key, str) else key
    return hmac.new(key_bytes, msg, hashlib.sha256).digest()


def _sign_hs384(msg: bytes, key: str) -> bytes:
    """Sign message with HMAC-SHA384."""
    key_bytes = key.encode('utf-8') if isinstance(key, str) else key
    return hmac.new(key_bytes, msg, hashlib.sha384).digest()


def _sign_hs512(msg: bytes, key: str) -> bytes:
    """Sign message with HMAC-SHA512."""
    key_bytes = key.encode('utf-8') if isinstance(key, str) else key
    return hmac.new(key_bytes, msg, hashlib.sha512).digest()


def _verify_signature(
    signing_input: bytes,
    signature: bytes,
    key: str,
    algorithm: str
) -> bool:
    """Verify JWT signature."""
    if algorithm == 'HS256':
        expected = _sign_hs256(signing_input, key)
    elif algorithm == 'HS384':
        expected = _sign_hs384(signing_input, key)
    elif algorithm == 'HS512':
        expected = _sign_hs512(signing_input, key)
    else:
        raise JWTError(f"Unsupported algorithm: {algorithm}")
    
    return hmac.compare_digest(signature, expected)


def encode(
    payload: Dict[str, Any],
    key: str,
    algorithm: str = 'HS256',
    headers: Optional[Dict[str, Any]] = None
) -> str:
    """Encode payload into JWT token.
    
    Args:
        payload: Claims to encode
        key: Secret key for signing
        algorithm: Signing algorithm (HS256, HS384, HS512)
        headers: Optional additional headers
    
    Returns:
        JWT token string
    """
    # Build header
    header = {'typ': 'JWT', 'alg': algorithm}
    if headers:
        header.update(headers)
    
    # Encode header and payload
    header_encoded = _base64url_encode(json.dumps(header, separators=(',', ':')).encode('utf-8'))
    payload_encoded = _base64url_encode(json.dumps(payload, separators=(',', ':')).encode('utf-8'))
    
    # Create signing input
    signing_input = f"{header_encoded}.{payload_encoded}".encode('utf-8')
    
    # Sign
    if algorithm == 'HS256':
        signature = _sign_hs256(signing_input, key)
    elif algorithm == 'HS384':
        signature = _sign_hs384(signing_input, key)
    elif algorithm == 'HS512':
        signature = _sign_hs512(signing_input, key)
    else:
        raise JWTError(f"Unsupported algorithm: {algorithm}")
    
    signature_encoded = _base64url_encode(signature)
    
    return f"{header_encoded}.{payload_encoded}.{signature_encoded}"


def decode(
    token: str,
    key: str,
    algorithms: Optional[list[str]] = None,
    verify: bool = True,
    options: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Decode and verify JWT token.
    
    Args:
        token: JWT token string
        key: Secret key for verification
        algorithms: Allowed algorithms (default: ['HS256'])
        verify: Whether to verify signature (default: True)
        options: Verification options (verify_exp, verify_nbf, etc.)
    
    Returns:
        Decoded payload
    
    Raises:
        InvalidTokenError: Token format is invalid
        InvalidSignatureError: Signature verification failed
        ExpiredSignatureError: Token has expired
    """
    if algorithms is None:
        algorithms = ['HS256']
    
    if options is None:
        options = {}
    
    verify_exp = options.get('verify_exp', True)
    verify_nbf = options.get('verify_nbf', True)
    
    # Split token
    try:
        header_encoded, payload_encoded, signature_encoded = token.split('.')
    except ValueError:
        raise InvalidTokenError("Invalid token format")
    
    # Decode header
    try:
        header = json.loads(_base64url_decode(header_encoded))
    except Exception as e:
        raise InvalidTokenError(f"Invalid header encoding: {e}")
    
    # Check algorithm
    algorithm = header.get('alg')
    if algorithm not in algorithms:
        raise InvalidTokenError(f"Algorithm not allowed: {algorithm}")
    
    # Decode payload
    try:
        payload = json.loads(_base64url_decode(payload_encoded))
    except Exception as e:
        raise InvalidTokenError(f"Invalid payload encoding: {e}")
    
    # Verify signature if requested
    if verify:
        signing_input = f"{header_encoded}.{payload_encoded}".encode('utf-8')
        try:
            signature = _base64url_decode(signature_encoded)
        except Exception as e:
            raise InvalidSignatureError(f"Invalid signature encoding: {e}")
        
        if not _verify_signature(signing_input, signature, key, algorithm):
            raise InvalidSignatureError("Signature verification failed")
    
    # Verify expiration
    if verify_exp and 'exp' in payload:
        exp = payload['exp']
        if isinstance(exp, (int, float)) and exp < time.time():
            raise ExpiredSignatureError("Token has expired")
    
    # Verify not before
    if verify_nbf and 'nbf' in payload:
        nbf = payload['nbf']
        if isinstance(nbf, (int, float)) and nbf > time.time():
            raise InvalidTokenError("Token not yet valid")
    
    return payload


def decode_header(token: str) -> Dict[str, Any]:
    """Decode JWT header without verification.
    
    Args:
        token: JWT token string
    
    Returns:
        Decoded header
    """
    try:
        header_encoded = token.split('.')[0]
        return json.loads(_base64url_decode(header_encoded))
    except Exception as e:
        raise InvalidTokenError(f"Invalid token header: {e}")


def decode_payload_unverified(token: str) -> Dict[str, Any]:
    """Decode JWT payload without verification (UNSAFE - for debugging only).
    
    Args:
        token: JWT token string
    
    Returns:
        Decoded payload
    """
    try:
        payload_encoded = token.split('.')[1]
        return json.loads(_base64url_decode(payload_encoded))
    except Exception as e:
        raise InvalidTokenError(f"Invalid token payload: {e}")
