from __future__ import annotations

from typing import Any, Dict, Tuple

import numpy as np
from PIL import Image, ImageFilter, ImageOps
from segmenter.services.utils import open_image_or_raise


def _cleanup_binary_mask(binary: np.ndarray) -> np.ndarray:
    import cv2  # type: ignore

    binary = binary.astype(np.uint8)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    cleaned = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=1)
    cleaned = cv2.morphologyEx(cleaned, cv2.MORPH_OPEN, kernel, iterations=1)

    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(cleaned, connectivity=8)
    if num_labels > 1:
        largest = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
        cleaned = (labels == largest).astype(np.uint8)

    inv = 1 - cleaned
    num_holes, hole_labels, hole_stats, _ = cv2.connectedComponentsWithStats(inv, connectivity=8)
    height, width = inv.shape
    import os
    try:
        hole_ratio = float(os.getenv('MASK_HOLE_RATIO', '0.01'))
    except ValueError:
        hole_ratio = 0.01
    hole_ratio = max(0.001, min(0.05, hole_ratio))
    hole_thresh = max(1, int(height * width * hole_ratio))

    for label in range(1, num_holes):
        x, y, w, h, area = hole_stats[label]
        touches_border = x == 0 or y == 0 or (x + w) >= width or (y + h) >= height
        if touches_border:
            continue
        if area <= hole_thresh:
            cleaned[hole_labels == label] = 1

    return cleaned


def _normalize_box(box_2d: Any, width: int, height: int) -> Tuple[int, int, int, int]:
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


def apply_mask(
    image_bytes: bytes,
    mask_bytes: bytes,
    box_2d: Any,
    threshold: int,
    feather: int,
    padding: int,
    auto_enhance: bool,
) -> Dict[str, Any]:
    try:
        image = open_image_or_raise(image_bytes).convert('RGBA')
    except ValueError as exc:
        raise ValueError('Unsupported image format') from exc
    width, height = image.size

    try:
        mask_img = open_image_or_raise(mask_bytes).convert('L')
    except ValueError as exc:
        raise ValueError('Invalid mask image') from exc

    x0, y0, x1, y1 = _normalize_box(box_2d, width, height)
    box_w = max(1, x1 - x0)
    box_h = max(1, y1 - y0)

    mask_resized = mask_img.resize((box_w, box_h), Image.BILINEAR)
    full_mask = Image.new('L', (width, height), 0)
    full_mask.paste(mask_resized, (x0, y0))

    if auto_enhance:
        full_mask = ImageOps.autocontrast(full_mask)

    smooth_mask = full_mask.filter(ImageFilter.GaussianBlur(radius=1.2))
    mask_np = np.array(smooth_mask).astype(np.uint8)

    threshold = int(max(0, min(255, threshold)))
    binary = (mask_np >= threshold).astype(np.uint8)
    cleaned = _cleanup_binary_mask(binary)
    alpha_np = np.where(cleaned > 0, np.maximum(mask_np, threshold), 0).astype(np.uint8)
    alpha = Image.fromarray(alpha_np, mode='L')

    if feather > 0:
        edge_strength = float(
            np.mean(np.hypot(*np.gradient(mask_np.astype(np.float32)))) / 255.0
        )
        adaptive = max(0.0, min(2.5, edge_strength * 6.0))
        alpha = alpha.filter(ImageFilter.GaussianBlur(radius=float(feather + adaptive)))

    rgba = image.copy()
    rgba.putalpha(alpha)

    # Full-size cutout for comparison (preserves original dimensions)
    cutout_full = rgba.copy()

    bbox = alpha.getbbox() or (0, 0, width, height)
    pad = max(0, int(padding))
    left = max(0, bbox[0] - pad)
    top = max(0, bbox[1] - pad)
    right = min(width, bbox[2] + pad)
    bottom = min(height, bbox[3] + pad)

    # Cropped cutout for export
    cutout = rgba.crop((left, top, right, bottom))
    cutout_alpha = alpha.crop((left, top, right, bottom))

    return {
        'mask': smooth_mask,
        'alpha': alpha,
        'cutout': cutout,
        'cutout_full': cutout_full,  # Full-size for comparison
        'cutout_alpha': cutout_alpha,
        'box_px': [left, top, right, bottom],
        'size': [width, height],
    }

