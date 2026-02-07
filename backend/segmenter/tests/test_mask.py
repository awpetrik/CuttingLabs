from __future__ import annotations

import base64
import io

from django.test import TestCase
from PIL import Image

from segmenter.services.postprocess import apply_mask
from segmenter.services.utils import decode_base64_bytes


class MaskPipelineTests(TestCase):
    def _png_bytes(self, image: Image.Image) -> bytes:
        buf = io.BytesIO()
        image.save(buf, format='PNG')
        return buf.getvalue()

    def test_decode_base64_data_url(self):
        img = Image.new('L', (2, 2), color=255)
        data = self._png_bytes(img)
        encoded = base64.b64encode(data).decode('utf-8')
        data_url = f"data:image/png;base64,{encoded}"
        decoded = decode_base64_bytes(data_url)
        self.assertEqual(decoded, data)

    def test_apply_mask_creates_alpha(self):
        image = Image.new('RGB', (10, 10), color=(100, 100, 100))
        mask = Image.new('L', (4, 4), color=255)

        image_bytes = self._png_bytes(image)
        mask_bytes = self._png_bytes(mask)

        result = apply_mask(
            image_bytes=image_bytes,
            mask_bytes=mask_bytes,
            box_2d=[200, 200, 600, 600],
            threshold=10,
            feather=0,
            padding=0,
            auto_enhance=False,
        )

        cutout = result['cutout']
        alpha = result['cutout_alpha']
        self.assertEqual(cutout.mode, 'RGBA')
        self.assertIsNotNone(alpha.getbbox())
