from __future__ import annotations

import os
import re
import time
from typing import Any, Dict, List

from .utils import extract_json

PROMPT = (
    "Give the segmentation masks for the main product in the image. "
    "Output JSON list entries with label, confidence (0..1), box_2d (0..1000 [y0,x0,y1,x1]), "
    "mask (base64 PNG probability map). "
    "Keep the mask compact (max 256px on the longest side). "
    "Return JSON only."
)

MODEL_NAME = os.getenv('GEMINI_MODEL', 'gemini-2.5-flash')
MAX_RETRIES = 2  # Reduced for faster fallback
BASE_DELAY = 3   # Reduced for faster fallback
API_TIMEOUT = 15  # Timeout in seconds for fast fallback


class ApiTimeoutError(Exception):
    """Raised when API call times out."""
    pass


class QuotaExceededError(Exception):
    """Raised when Gemini API quota is exceeded."""
    def __init__(self, retry_after: float = 60.0, message: str = None):
        self.retry_after = retry_after
        self.message = message or f"API quota exceeded. Please try again in {int(retry_after)} seconds."
        super().__init__(self.message)


def _extract_retry_delay(error_msg: str) -> float:
    """Extract retry delay from error message."""
    match = re.search(r'retry[_ ]?(?:in|after|delay)[:\s]*([0-9.]+)', error_msg, re.IGNORECASE)
    if match:
        return float(match.group(1))
    return 60.0


def _is_quota_error(error: Exception) -> bool:
    """Check if exception is a quota/rate limit error."""
    error_str = str(error).lower()
    return any(keyword in error_str for keyword in [
        '429', 'quota', 'rate_limit', 'resource_exhausted', 'too many requests'
    ])


def _client_new_sdk(api_key: str):
    from google import genai
    return genai.Client(api_key=api_key)


def _generate_with_new_sdk(image_bytes: bytes) -> str:
    api_key = os.getenv('GEMINI_API_KEY')
    if not api_key:
        raise RuntimeError('GEMINI_API_KEY not configured')
    client = _client_new_sdk(api_key)
    from google.genai import types

    schema = {
        "type": "array",
        "items": {
            "type": "object",
            "properties": {
                "label": {"type": "string"},
                "box_2d": {
                    "type": "array",
                    "items": {"type": "number"},
                    "minItems": 4,
                    "maxItems": 4,
                },
                "mask": {"type": "string"},
                "confidence": {"type": "number"},
            },
            "required": ["label", "box_2d", "mask"],
        },
    }
    response = client.models.generate_content(
        model=MODEL_NAME,
        contents=[
            {
                'role': 'user',
                'parts': [
                    {'text': PROMPT},
                    {
                        'inline_data': {
                            'mime_type': 'image/png',
                            'data': image_bytes,
                        }
                    },
                ],
            }
        ],
        config=types.GenerateContentConfig(
            responseMimeType='application/json',
            responseSchema=schema,
            temperature=0.0,
            maxOutputTokens=8192,
        ),
    )
    return getattr(response, 'text', '') or ''


def _generate_with_legacy_sdk(image_bytes: bytes) -> str:
    import google.generativeai as genai

    api_key = os.getenv('GEMINI_API_KEY')
    if not api_key:
        raise RuntimeError('GEMINI_API_KEY not configured')
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(MODEL_NAME)
    image_part = {
        'mime_type': 'image/png',
        'data': image_bytes
    }
    response = model.generate_content(
        [PROMPT, image_part],
        generation_config={
            'temperature': 0.0,
            'max_output_tokens': 8192,
            'response_mime_type': 'application/json',
        },
    )
    return getattr(response, 'text', '') or ''


def _generate_with_retry(image_bytes: bytes) -> str:
    """Generate with automatic retry for transient errors."""
    last_error = None
    
    for attempt in range(MAX_RETRIES):
        try:
            return _generate_with_new_sdk(image_bytes)
        except Exception as e:
            last_error = e
            if _is_quota_error(e):
                retry_delay = _extract_retry_delay(str(e))
                if attempt < MAX_RETRIES - 1:
                    wait_time = min(retry_delay, BASE_DELAY * (2 ** attempt))
                    print(f"Quota exceeded, retrying in {wait_time:.1f}s (attempt {attempt + 1}/{MAX_RETRIES})")
                    time.sleep(wait_time)
                    continue
                raise QuotaExceededError(retry_after=retry_delay)
            
            # Try legacy SDK for non-quota errors
            print(f"New SDK failed: {e}, trying legacy SDK...")
            try:
                return _generate_with_legacy_sdk(image_bytes)
            except Exception as legacy_error:
                if _is_quota_error(legacy_error):
                    retry_delay = _extract_retry_delay(str(legacy_error))
                    raise QuotaExceededError(retry_after=retry_delay)
                raise legacy_error
    
    if last_error and _is_quota_error(last_error):
        raise QuotaExceededError(retry_after=_extract_retry_delay(str(last_error)))
    raise last_error or RuntimeError("Unknown error during generation")


def generate_candidates(image_bytes: bytes) -> List[Dict[str, Any]]:
    """Return segmentation candidates from the model output."""
    text = _generate_with_retry(image_bytes)
    data = extract_json(text)

    if isinstance(data, dict):
        data = [data]
    if not isinstance(data, list) or not data:
        raise ValueError('Unexpected JSON format from model')

    candidates: List[Dict[str, Any]] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        if all(key in item for key in ('label', 'box_2d', 'mask')):
            candidates.append(item)

    if not candidates:
        raise ValueError('Model returned empty list')

    return candidates

