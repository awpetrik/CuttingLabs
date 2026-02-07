from __future__ import annotations

import base64
import io
import json
import re
from typing import Any

from PIL import Image, UnidentifiedImageError, features

JSON_RE = re.compile(r"(\{.*\}|\[.*\])", re.DOTALL)


def extract_json(text: str) -> Any:
    if not text:
        raise ValueError('Empty response from model')

    # Cari blok kode atau pola JSON mentah
    cleaned = text.strip()
    
    # Hapus pembungkus markdown jika ada
    if '```' in cleaned:
        match = re.search(r"```(?:json)?\s*([\s\S]*?)```", cleaned)
        if match:
            cleaned = match.group(1).strip()
    
    # Jika masih ada teks di luar JSON, cari kurawal/siku pertama dan terakhir
    json_match = re.search(r"(\{[\s\S]*\}|\[[\s\S]*\])", cleaned)
    if json_match:
        cleaned = json_match.group(1).strip()

    def _load(payload: str) -> Any:
        try:
            return json.loads(payload)
        except json.JSONDecodeError:
            return None

    parsed = _load(cleaned)
    if parsed is not None:
        return parsed

    # Fallback: remove trailing commas before } or ]
    repaired = re.sub(r',\s*([}\]])', r'\1', cleaned)
    parsed = _load(repaired)
    if parsed is not None:
        return parsed

    raise ValueError('Invalid JSON format from model')


def decode_base64_bytes(data: str) -> bytes:
    if not isinstance(data, str):
        raise ValueError('Expected base64 string')
    cleaned = data.strip()
    if cleaned.startswith('data:'):
        cleaned = cleaned.split(',', 1)[-1]
    cleaned = re.sub(r'\s+', '', cleaned)
    if not cleaned:
        raise ValueError('Empty base64 payload')
    padding = len(cleaned) % 4
    if padding:
        cleaned += '=' * (4 - padding)
    return base64.b64decode(cleaned, validate=False)


def open_image_or_raise(image_bytes: bytes) -> Image.Image:
    try:
        return Image.open(io.BytesIO(image_bytes))
    except UnidentifiedImageError as exc:
        if not features.check('webp'):
            raise ValueError('WEBP not supported on server') from exc
        raise ValueError('Unsupported image format') from exc
