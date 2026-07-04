"""AES-256-GCM field-level encryption helpers.

Used for sensitive payloads at rest (invoice JSON blobs, generated
GSTN JSON exports). TLS handles data in transit; download URLs are
signed + short-lived (see routes/export.py).
"""
import os
import base64
import hmac
import hashlib
import time
from typing import Optional

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_KEY_HEX = os.environ["ENCRYPTION_KEY"]
_KEY = bytes.fromhex(_KEY_HEX)
if len(_KEY) != 32:
    raise RuntimeError("ENCRYPTION_KEY must be 32 bytes (64 hex chars)")

_aes = AESGCM(_KEY)


def encrypt_str(plaintext: str, aad: Optional[str] = None) -> str:
    """AES-256-GCM encrypt a string. Returns base64(nonce || ciphertext)."""
    if plaintext is None:
        return None
    nonce = os.urandom(12)
    aad_b = aad.encode() if aad else None
    ct = _aes.encrypt(nonce, plaintext.encode("utf-8"), aad_b)
    return base64.b64encode(nonce + ct).decode("ascii")


def decrypt_str(token: str, aad: Optional[str] = None) -> str:
    if token is None:
        return None
    raw = base64.b64decode(token.encode("ascii"))
    nonce, ct = raw[:12], raw[12:]
    aad_b = aad.encode() if aad else None
    return _aes.decrypt(nonce, ct, aad_b).decode("utf-8")


def sign_download_token(resource_id: str, ttl_seconds: int = 300) -> str:
    """Signed, expiring token for download URLs."""
    exp = int(time.time()) + ttl_seconds
    msg = f"{resource_id}.{exp}"
    sig = hmac.new(_KEY, msg.encode(), hashlib.sha256).hexdigest()
    return f"{exp}.{sig}"


def verify_download_token(resource_id: str, token: str) -> bool:
    try:
        exp_s, sig = token.split(".", 1)
        exp = int(exp_s)
    except (ValueError, AttributeError):
        return False
    if time.time() > exp:
        return False
    expected = hmac.new(_KEY, f"{resource_id}.{exp}".encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, sig)
