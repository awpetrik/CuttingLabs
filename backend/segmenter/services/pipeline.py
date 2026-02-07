from __future__ import annotations

import base64
import io
import math
import os
import time
from typing import Any, Dict, List, Tuple

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter
from django.core.files.base import ContentFile

from segmenter.models import SegmentResult, Upload
from segmenter.services.gemini import generate_candidates, QuotaExceededError, ApiTimeoutError
from segmenter.services.postprocess import apply_mask
from segmenter.services.utils import decode_base64_bytes, open_image_or_raise

# Processing modes
PROCESSING_MODE_GEMINI = "gemini"
PROCESSING_MODE_LOCAL = "local"
PROCESSING_MODE_AUTO = "auto"



def _png_bytes(image) -> bytes:
    buf = io.BytesIO()
    image.save(buf, format='PNG')
    return buf.getvalue()


def _to_base64(data: bytes) -> str:
    return base64.b64encode(data).decode('utf-8')

def _decode_mask_payload(mask_payload: Any) -> bytes:
    if isinstance(mask_payload, dict):
        for key in ('data', 'base64', 'mask', 'image'):
            if key in mask_payload:
                return _decode_mask_payload(mask_payload[key])
        if 'mime_type' in mask_payload and 'data' in mask_payload:
            return _decode_mask_payload(mask_payload['data'])
        raise ValueError('Invalid mask object')
    if isinstance(mask_payload, list):
        arr = np.array(mask_payload, dtype=float)
        if arr.ndim != 2:
            raise ValueError('Invalid mask array shape')
        max_val = float(np.max(arr)) if arr.size else 0.0
        if max_val <= 1.0:
            arr = arr * 255.0
        arr = np.clip(arr, 0, 255).astype(np.uint8)
        img = Image.fromarray(arr, mode='L')
        buf = io.BytesIO()
        img.save(buf, format='PNG')
        return buf.getvalue()
    if isinstance(mask_payload, str):
        return decode_base64_bytes(mask_payload)
    raise ValueError('Invalid mask payload type')

def _prepare_image_for_model(image_bytes: bytes, max_edge_override: int | None = None) -> bytes:
    image = open_image_or_raise(image_bytes)

    image = image.convert('RGB')
    if max_edge_override is not None:
        max_edge = max_edge_override
    else:
        max_edge = int(os.getenv('GEMINI_MAX_EDGE', '2048'))
    if max_edge > 0:
        width, height = image.size
        scale = max_edge / float(max(width, height))
        if scale < 1:
            new_size = (max(1, int(width * scale)), max(1, int(height * scale)))
            image = image.resize(new_size, Image.LANCZOS)

    buf = io.BytesIO()
    image.save(buf, format='PNG', optimize=True)
    return buf.getvalue()


def _box_to_px(box_2d: Any, width: int, height: int) -> Tuple[int, int, int, int]:
    if not isinstance(box_2d, (list, tuple)) or len(box_2d) != 4:
        raise ValueError('box_2d must be a list of four numbers [y0,x0,y1,x1]')
    y0, x0, y1, x1 = [float(v) for v in box_2d]
    x0_px = int(round(x0 / 1000.0 * width))
    x1_px = int(round(x1 / 1000.0 * width))
    y0_px = int(round(y0 / 1000.0 * height))
    y1_px = int(round(y1 / 1000.0 * height))

    x0_px = max(0, min(width - 1, x0_px))
    x1_px = max(1, min(width, x1_px))
    y0_px = max(0, min(height - 1, y0_px))
    y1_px = max(1, min(height, y1_px))

    if x1_px <= x0_px:
        x1_px = min(width, x0_px + 1)
    if y1_px <= y0_px:
        y1_px = min(height, y0_px + 1)

    return x0_px, y0_px, x1_px, y1_px


def _center_score(x0: int, y0: int, x1: int, y1: int, width: int, height: int) -> float:
    cx = (x0 + x1) / 2.0
    cy = (y0 + y1) / 2.0
    dx = cx - (width / 2.0)
    dy = cy - (height / 2.0)
    dist = math.hypot(dx, dy)
    max_dist = math.hypot(width / 2.0, height / 2.0)
    if max_dist <= 0:
        return 0.0
    return max(0.0, min(1.0, 1.0 - (dist / max_dist)))


def _area_score(area_ratio: float, min_ratio: float, max_ratio: float) -> float:
    if area_ratio <= 0:
        return 0.0
    if area_ratio < min_ratio:
        return max(0.0, min(1.0, area_ratio / min_ratio))
    if area_ratio > max_ratio:
        return max(0.0, min(1.0, 1.0 - (area_ratio - max_ratio) / max(1e-6, (1 - max_ratio))))
    return 1.0


def _edge_density(image: Image.Image, box_px: Tuple[int, int, int, int]) -> float:
    x0, y0, x1, y1 = box_px
    crop = image.crop((x0, y0, x1, y1)).convert('L')
    arr = np.asarray(crop, dtype=np.float32)
    if arr.size == 0:
        return 0.0
    gy, gx = np.gradient(arr)
    mag = np.sqrt(gx * gx + gy * gy)
    return float(np.clip(np.mean(mag) / 255.0, 0.0, 1.0))


def _rectangularity(mask_payload: Any) -> float:
    if not mask_payload:
        return 0.5
    try:
        mask_bytes = _decode_mask_payload(mask_payload)
        mask_img = Image.open(io.BytesIO(mask_bytes)).convert('L')
        mask_img = mask_img.resize((128, 128), Image.BILINEAR)
        arr = np.asarray(mask_img, dtype=np.uint8)
        fill = float(np.mean(arr >= 128))
        return float(np.clip((fill - 0.35) / 0.65, 0.0, 1.0))
    except Exception:
        return 0.5


def _border_touch_penalty(
    x0: int, y0: int, x1: int, y1: int, width: int, height: int, allow_touch: bool
) -> float:
    if allow_touch:
        return 0.0
    margin = max(2, int(min(width, height) * 0.01))
    touches = 0
    if x0 <= margin:
        touches += 1
    if y0 <= margin:
        touches += 1
    if x1 >= width - margin:
        touches += 1
    if y1 >= height - margin:
        touches += 1
    if touches >= 2:
        return 0.35
    if touches == 1:
        return 0.15
    return 0.0


def _score_candidate(
    candidate: Dict[str, Any],
    image: Image.Image,
    focus_mode: str,
    allow_border_touch: bool,
    area_min: float,
    area_max: float,
) -> Tuple[float, Dict[str, float]]:
    width, height = image.size
    x0, y0, x1, y1 = _box_to_px(candidate.get('box_2d'), width, height)
    box_w = max(1, x1 - x0)
    box_h = max(1, y1 - y0)
    area_ratio = (box_w * box_h) / max(1.0, width * height)
    conf = candidate.get('confidence')
    if conf is None:
        conf = candidate.get('score', candidate.get('probability', 0.5))
    try:
        conf = float(conf)
    except (TypeError, ValueError):
        conf = 0.5
    conf = float(np.clip(conf, 0.0, 1.0))

    center = _center_score(x0, y0, x1, y1, width, height)
    area = _area_score(area_ratio, area_min, area_max)
    rect = _rectangularity(candidate.get('mask'))
    edge = _edge_density(image, (x0, y0, x1, y1))
    penalty = _border_touch_penalty(x0, y0, x1, y1, width, height, allow_border_touch)

    if focus_mode == 'center':
        score = 0.6 * center + 0.2 * area + 0.1 * conf + 0.1 * edge
    elif focus_mode == 'largest':
        score = 0.6 * area + 0.2 * center + 0.1 * conf + 0.1 * rect
    elif focus_mode == 'detailed':
        score = 0.6 * edge + 0.2 * center + 0.1 * area + 0.1 * conf
    else:
        score = 0.3 * conf + 0.25 * center + 0.2 * area + 0.15 * rect + 0.1 * edge

    score = max(0.0, min(1.0, score - penalty))

    return score, {
        'confidence': conf,
        'center': center,
        'area': area,
        'rectangularity': rect,
        'edge': edge,
        'penalty': penalty,
    }


def _select_candidate(
    candidates: List[Dict[str, Any]],
    image: Image.Image,
    focus_mode: str,
    allow_border_touch: bool,
    candidate_index: int | None = None,
) -> Tuple[Dict[str, Any], List[Dict[str, Any]], int]:
    area_min = float(os.getenv('CANDIDATE_AREA_MIN', '0.08'))
    area_max = float(os.getenv('CANDIDATE_AREA_MAX', '0.70'))

    scored: List[Dict[str, Any]] = []
    for item in candidates:
        try:
            score, metrics = _score_candidate(
                item, image, focus_mode, allow_border_touch, area_min, area_max
            )
        except Exception:
            score, metrics = 0.0, {'confidence': 0.0, 'center': 0.0, 'area': 0.0, 'rectangularity': 0.0, 'edge': 0.0, 'penalty': 0.0}
        enriched = dict(item)
        enriched['score'] = score
        enriched['metrics'] = metrics
        scored.append(enriched)

    if candidate_index is not None and 0 <= candidate_index < len(scored):
        return scored[candidate_index], scored, candidate_index

    best_index = max(range(len(scored)), key=lambda i: scored[i].get('score', 0.0))
    return scored[best_index], scored, best_index


def _crop_roi(
    image: Image.Image, box_px: Tuple[int, int, int, int], margin_ratio: float
) -> Tuple[Image.Image, Tuple[int, int, int, int]]:
    width, height = image.size
    x0, y0, x1, y1 = box_px
    box_w = max(1, x1 - x0)
    box_h = max(1, y1 - y0)
    pad = int(max(box_w, box_h) * margin_ratio)
    left = max(0, x0 - pad)
    top = max(0, y0 - pad)
    right = min(width, x1 + pad)
    bottom = min(height, y1 + pad)
    return image.crop((left, top, right, bottom)), (left, top, right, bottom)


def _suppress_background(
    image: Image.Image, focus_box: Tuple[int, int, int, int]
) -> Image.Image:
    if image.size[0] < 4 or image.size[1] < 4:
        return image
    blur_radius = float(os.getenv('BG_BLUR_RADIUS', '3.0'))
    blur = image.filter(ImageFilter.GaussianBlur(radius=blur_radius))
    desat = ImageEnhance.Color(blur).enhance(0.65)
    mask = Image.new('L', image.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rectangle(focus_box, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(radius=max(6, int(min(image.size) * 0.04))))
    return Image.composite(image, desat, mask)


def _map_box_to_full(
    roi_box_2d: Any,
    roi_bounds: Tuple[int, int, int, int],
    full_size: Tuple[int, int],
) -> List[float]:
    left, top, right, bottom = roi_bounds
    roi_w = max(1, right - left)
    roi_h = max(1, bottom - top)
    full_w, full_h = full_size
    y0, x0, y1, x1 = [float(v) for v in roi_box_2d]
    fx0 = left + (x0 / 1000.0 * roi_w)
    fx1 = left + (x1 / 1000.0 * roi_w)
    fy0 = top + (y0 / 1000.0 * roi_h)
    fy1 = top + (y1 / 1000.0 * roi_h)
    fx0 = max(0.0, min(float(full_w), fx0))
    fx1 = max(0.0, min(float(full_w), fx1))
    fy0 = max(0.0, min(float(full_h), fy0))
    fy1 = max(0.0, min(float(full_h), fy1))
    return [
        (fy0 / full_h) * 1000.0,
        (fx0 / full_w) * 1000.0,
        (fy1 / full_h) * 1000.0,
        (fx1 / full_w) * 1000.0,
    ]


def _generate_candidates_with_retry(image_bytes: bytes, max_edge: int) -> List[Dict[str, Any]]:
    model_image_bytes = _prepare_image_for_model(image_bytes, max_edge_override=max_edge)
    try:
        return generate_candidates(model_image_bytes)
    except ValueError as exc:
        if 'Invalid JSON format' in str(exc) and max_edge > 1024:
            smaller_bytes = _prepare_image_for_model(image_bytes, max_edge_override=1024)
            return generate_candidates(smaller_bytes)
        raise


def _run_local_segmentation(image_bytes: bytes) -> Dict[str, Any]:
    """
    Run segmentation using local RMBG model.
    Returns cutout and mask bytes with metadata.
    """
    from segmenter.services.rmbg import generate_mask, InferenceError, ModelLoadError
    
    try:
        cutout_bytes, mask_bytes, metadata = generate_mask(image_bytes)
        
        # Create synthetic candidate data for compatibility
        image = Image.open(io.BytesIO(image_bytes))
        width, height = image.size
        
        # Full image bounding box (RMBG doesn't provide specific box)
        box_2d = [0, 0, 1000, 1000]
        
        return {
            "cutout_bytes": cutout_bytes,
            "mask_bytes": mask_bytes,
            "label": metadata.get("label", "product"),
            "box_2d": box_2d,
            "confidence": metadata.get("confidence", 0.95),
            "processor": "rmbg-local",
            "device": metadata.get("device", "cpu"),
            "inference_ms": metadata.get("inference_ms", 0),
        }
    except (InferenceError, ModelLoadError) as e:
        raise ValueError(f"Local processing failed: {e}")


def _generate_with_fallback(
    image_bytes: bytes,
    max_edge: int,
    processing_mode: str,
) -> Tuple[List[Dict[str, Any]], str]:
    """
    Generate candidates with fallback between Gemini and local RMBG.
    
    Returns:
        Tuple of (candidates, processor_used)
    """
    if processing_mode == PROCESSING_MODE_LOCAL:
        # Force local only
        try:
            local_result = _run_local_segmentation(image_bytes)
            # Wrap as candidate format
            return [{
                "label": local_result["label"],
                "box_2d": local_result["box_2d"],
                "mask": base64.b64encode(local_result["mask_bytes"]).decode(),
                "confidence": local_result["confidence"],
                "_local_cutout": local_result["cutout_bytes"],
                "_processor": "rmbg-local",
                "_device": local_result["device"],
                "_inference_ms": local_result["inference_ms"],
            }], "rmbg-local"
        except Exception as e:
            raise ValueError(f"Local processing failed: {e}")
    
    if processing_mode == PROCESSING_MODE_GEMINI:
        # Force Gemini only
        return _generate_candidates_with_retry(image_bytes, max_edge), "gemini"
    
    # Auto mode: try Gemini first, fallback to local
    try:
        return _generate_candidates_with_retry(image_bytes, max_edge), "gemini"
    except (QuotaExceededError, ApiTimeoutError) as e:
        error_type = "timeout" if isinstance(e, ApiTimeoutError) else "quota exceeded"
        print(f"[Pipeline] Gemini {error_type}, falling back to local RMBG...")
        try:
            local_result = _run_local_segmentation(image_bytes)
            return [{
                "label": local_result["label"],
                "box_2d": local_result["box_2d"],
                "mask": base64.b64encode(local_result["mask_bytes"]).decode(),
                "confidence": local_result["confidence"],
                "_local_cutout": local_result["cutout_bytes"],
                "_processor": "rmbg-local",
                "_device": local_result["device"],
                "_inference_ms": local_result["inference_ms"],
            }], "rmbg-local"
        except Exception as local_e:
            raise ValueError(f"Both Gemini and local processing failed. Gemini: {error_type}, Local: {local_e}")



def run_segmentation(
    upload: Upload,
    params: Dict[str, Any],
) -> Dict[str, Any]:
    threshold = int(params.get('threshold', 128))
    feather = int(params.get('feather', 4))
    padding = int(params.get('padding', 8))
    auto_enhance = bool(params.get('auto_enhance', True))
    focus_mode = str(params.get('focus_mode', 'auto') or 'auto').lower()
    allow_border_touch = bool(params.get('allow_border_touch', False))
    processing_mode = str(params.get('processing_mode', os.getenv('PROCESSING_MODE', 'auto'))).lower()
    candidate_index = params.get('candidate_index')
    try:
        candidate_index = int(candidate_index) if candidate_index is not None else None
    except (TypeError, ValueError):
        candidate_index = None

    image_bytes = upload.file.read()
    upload.file.seek(0)
    original_image = open_image_or_raise(image_bytes).convert('RGB')
    full_width, full_height = original_image.size

    t0 = time.perf_counter()
    
    # Use fallback-aware candidate generation
    candidates, processor_used = _generate_with_fallback(
        image_bytes, 
        max_edge=int(os.getenv('GEMINI_MAX_EDGE', '2048')),
        processing_mode=processing_mode,
    )
    
    selected, scored_candidates, selected_index = _select_candidate(
        candidates,
        original_image,
        focus_mode,
        allow_border_touch,
        candidate_index=candidate_index,
    )
    t1 = time.perf_counter()

    candidate_payloads = []
    for item in scored_candidates:
        metrics = item.get('metrics') or {}
        candidate_payloads.append(
            {
                'label': item.get('label', ''),
                'box_2d': item.get('box_2d'),
                'confidence': metrics.get('confidence'),
                'score': item.get('score'),
            }
        )

    selected_box_px = _box_to_px(selected.get('box_2d'), full_width, full_height)
    roi_margin = float(os.getenv('ROI_MARGIN', '0.15'))
    roi_image, roi_bounds = _crop_roi(original_image, selected_box_px, roi_margin)

    left, top, right, bottom = roi_bounds
    roi_focus_box = (
        max(0, selected_box_px[0] - left),
        max(0, selected_box_px[1] - top),
        max(1, selected_box_px[2] - left),
        max(1, selected_box_px[3] - top),
    )
    roi_image = _suppress_background(roi_image, roi_focus_box)

    roi_mask_payload = selected.get('mask')
    roi_label = selected.get('label', '')
    roi_box_2d = selected.get('box_2d')

    try:
        roi_bytes = _png_bytes(roi_image)
        roi_candidates = _generate_candidates_with_retry(
            roi_bytes, max_edge=int(os.getenv('GEMINI_ROI_MAX_EDGE', '1536'))
        )
        roi_selected, _, _ = _select_candidate(
            roi_candidates,
            roi_image,
            focus_mode,
            allow_border_touch=True,
            candidate_index=None,
        )
        roi_mask_payload = roi_selected.get('mask')
        roi_label = roi_selected.get('label', roi_label)
        roi_box_2d = _map_box_to_full(roi_selected.get('box_2d'), roi_bounds, (full_width, full_height))
    except Exception:
        roi_box_2d = selected.get('box_2d')

    t2 = time.perf_counter()
    try:
        mask_bytes = _decode_mask_payload(roi_mask_payload)
    except Exception as exc:
        raise ValueError('Invalid mask payload from provider') from exc
    post = apply_mask(
        image_bytes=image_bytes,
        mask_bytes=mask_bytes,
        box_2d=roi_box_2d,
        threshold=threshold,
        feather=feather,
        padding=padding,
        auto_enhance=auto_enhance,
    )
    t3 = time.perf_counter()

    mask_png = _png_bytes(post['mask'])
    cutout_png = _png_bytes(post['cutout'])
    cutout_full_png = _png_bytes(post['cutout_full'])  # Full-size for comparison

    timings = {
        'gemini_ms': int((t2 - t0) * 1000) if processor_used == 'gemini' else 0,
        'local_ms': int((t2 - t0) * 1000) if processor_used == 'rmbg-local' else 0,
        'postprocess_ms': int((t3 - t2) * 1000),
        'total_ms': int((t3 - t0) * 1000),
        'processor': processor_used,
    }

    result_payload = {
        'label': roi_label or selected.get('label', ''),
        'box_2d': roi_box_2d,
        'mask_base64': _to_base64(mask_png),
        'cutout_png_base64': _to_base64(cutout_png),
        'cutout_full_base64': _to_base64(cutout_full_png),  # For comparison
        'timings': timings,
        'size': post['size'],
        'box_px': post['box_px'],
        'candidates': candidate_payloads,
        'selected_candidate': selected_index,
        'processor_used': processor_used,
    }

    return {
        'mask_png': mask_png,
        'cutout_png': cutout_png,
        'cutout_full_png': cutout_full_png,
        'result_payload': result_payload,
        'timings': timings,
    }


def persist_result(
    upload: Upload,
    params: Dict[str, Any],
    cache_key: str,
    payload: Dict[str, Any],
) -> SegmentResult:
    result = SegmentResult.objects.create(
        upload=upload,
        cache_key=cache_key,
        params=params,
        label=payload['result_payload'].get('label', ''),
        box_2d=payload['result_payload'].get('box_2d', []),
        candidates=payload['result_payload'].get('candidates', []),
        selected_candidate=payload['result_payload'].get('selected_candidate'),
        timings=payload['timings'],
        width=payload['result_payload'].get('size', [0, 0])[0],
        height=payload['result_payload'].get('size', [0, 0])[1],
    )

    result.mask_file.save(
        f"{result.id}_mask.png",
        ContentFile(payload['mask_png']),
        save=True,
    )
    result.cutout_file.save(
        f"{result.id}_cutout.png",
        ContentFile(payload['cutout_png']),
        save=True,
    )

    return result
