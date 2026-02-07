from __future__ import annotations

import hashlib
import json
import os
from typing import Any, Dict

from django.utils.text import get_valid_filename


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def cache_key(image_hash: str, params: Dict[str, Any]) -> str:
    normalized = json.dumps(params, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(f"{image_hash}:{normalized}".encode('utf-8')).hexdigest()


def sanitize_filename(name: str) -> str:
    name = get_valid_filename(name)
    if not name:
        name = 'upload'
    return name


def allowed_extension(name: str) -> bool:
    _, ext = os.path.splitext(name.lower())
    return ext in {'.jpg', '.jpeg', '.png', '.webp'}
