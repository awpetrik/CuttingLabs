from __future__ import annotations

import base64
import io
from typing import Any, Dict, Optional

from django.conf import settings
from django.core.files.base import ContentFile
from django.http import FileResponse, HttpResponse
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from segmenter.models import SegmentResult, SegmentationJob, Upload
from segmenter.services.pipeline import persist_result, run_segmentation
from segmenter.tasks import run_segmentation_task
from segmenter.utils import allowed_extension, cache_key, sanitize_filename, sha256_bytes


def _parse_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {'1', 'true', 'yes', 'on'}


def _parse_int(value: Any, default: int, min_value: int, max_value: int) -> int:
    try:
        num = int(value)
    except (TypeError, ValueError):
        num = default
    return max(min_value, min(max_value, num))


def _build_result_payload(job: SegmentationJob, result: SegmentResult) -> Dict[str, Any]:
    mask_bytes = result.mask_file.read() if result.mask_file else b''
    cutout_bytes = result.cutout_file.read() if result.cutout_file else b''
    if result.mask_file:
        result.mask_file.seek(0)
    if result.cutout_file:
        result.cutout_file.seek(0)

    return {
        'id': str(job.id),
        'status': job.status,
        'label': result.label,
        'box_2d': result.box_2d,
        'mask_base64': base64.b64encode(mask_bytes).decode('utf-8') if mask_bytes else '',
        'cutout_png_base64': base64.b64encode(cutout_bytes).decode('utf-8') if cutout_bytes else '',
        'timings': result.timings,
        'processor_used': result.timings.get('processor') if result.timings else None,
        'candidates': result.candidates or [],
        'selected_candidate': result.selected_candidate,
        'file_id': str(job.upload.id),
        'download_url': f"/api/download/{job.id}",
    }



def _create_upload(file_obj) -> Upload:
    if not file_obj:
        raise ValueError('No file provided')

    original_name = sanitize_filename(file_obj.name)
    if not allowed_extension(original_name):
        raise ValueError('Unsupported file type')

    data = file_obj.read()
    size = len(data)
    if size > settings.MAX_UPLOAD_SIZE:
        raise ValueError('File too large')

    file_hash = sha256_bytes(data)
    upload = Upload.objects.create(
        original_name=original_name,
        size=size,
        sha256=file_hash,
    )

    upload.file.save(original_name, ContentFile(data), save=True)
    return upload


class UploadView(APIView):
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        file_obj = request.FILES.get('file')
        try:
            upload = _create_upload(file_obj)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                'file_id': str(upload.id),
                'filename': upload.original_name,
                'size': upload.size,
            }
        )


class SegmentView(APIView):
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request):
        threshold = _parse_int(request.data.get('threshold'), 128, 0, 255)
        feather = _parse_int(request.data.get('feather'), 4, 0, 10)
        padding = _parse_int(request.data.get('padding'), 8, 0, 50)
        auto_enhance = _parse_bool(request.data.get('auto_enhance'), True)
        use_async = _parse_bool(request.data.get('async'), False)
        focus_mode = (request.data.get('focus_mode') or 'auto').lower()
        allow_border_touch = _parse_bool(request.data.get('allow_border_touch'), False)
        processing_mode = (request.data.get('processing_mode') or 'auto').lower()
        if processing_mode not in ('gemini', 'local', 'auto'):
            processing_mode = 'auto'
        candidate_index = request.data.get('candidate_index')
        try:
            candidate_index = int(candidate_index) if candidate_index is not None else None
        except (TypeError, ValueError):
            candidate_index = None

        file_id = request.data.get('file_id')
        upload: Optional[Upload] = None

        if file_id:
            try:
                upload = Upload.objects.get(id=file_id)
            except Upload.DoesNotExist:
                return Response({'error': 'Invalid file_id'}, status=status.HTTP_404_NOT_FOUND)
        else:
            file_obj = request.FILES.get('file')
            try:
                upload = _create_upload(file_obj)
            except ValueError as exc:
                return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        params = {
            'threshold': threshold,
            'feather': feather,
            'padding': padding,
            'auto_enhance': auto_enhance,
            'focus_mode': focus_mode,
            'allow_border_touch': allow_border_touch,
            'processing_mode': processing_mode,
        }
        if candidate_index is not None:
            params['candidate_index'] = candidate_index

        key = cache_key(upload.sha256, params)
        cached = SegmentResult.objects.filter(cache_key=key).first()

        if cached:
            job = SegmentationJob.objects.create(
                upload=upload,
                result=cached,
                params=params,
                status=SegmentationJob.STATUS_DONE,
            )
            return Response(_build_result_payload(job, cached))

        job = SegmentationJob.objects.create(
            upload=upload,
            params=params,
            status=SegmentationJob.STATUS_QUEUED if use_async else SegmentationJob.STATUS_RUNNING,
        )

        if use_async:
            run_segmentation_task.delay(str(job.id))
            return Response({'id': str(job.id), 'status': job.status, 'file_id': str(upload.id)})

        try:
            payload = run_segmentation(upload, params)
            result = persist_result(upload, params, key, payload)
            job.result = result
            job.status = SegmentationJob.STATUS_DONE
            job.save(update_fields=['result', 'status', 'updated_at'])
            return Response(_build_result_payload(job, result))
        except ValueError as exc:
            job.status = SegmentationJob.STATUS_FAILED
            job.error = str(exc)
            job.save(update_fields=['status', 'error', 'updated_at'])
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            from segmenter.services.gemini import QuotaExceededError
            job.status = SegmentationJob.STATUS_FAILED
            if isinstance(exc, QuotaExceededError):
                job.error = exc.message
                job.save(update_fields=['status', 'error', 'updated_at'])
                return Response(
                    {'error': exc.message, 'retry_after': exc.retry_after},
                    status=status.HTTP_429_TOO_MANY_REQUESTS
                )
            job.error = str(exc)
            job.save(update_fields=['status', 'error', 'updated_at'])
            return Response({'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class JobView(APIView):
    def get(self, request, job_id):
        try:
            job = SegmentationJob.objects.get(id=job_id)
        except SegmentationJob.DoesNotExist:
            return Response({'error': 'Job not found'}, status=status.HTTP_404_NOT_FOUND)

        if job.status != SegmentationJob.STATUS_DONE or not job.result:
            return Response({'id': str(job.id), 'status': job.status, 'error': job.error})

        return Response(_build_result_payload(job, job.result))


class DownloadView(APIView):
    def get(self, request, job_id):
        try:
            job = SegmentationJob.objects.get(id=job_id)
        except SegmentationJob.DoesNotExist:
            return Response({'error': 'Job not found'}, status=status.HTTP_404_NOT_FOUND)

        if not job.result or not job.result.cutout_file:
            return Response({'error': 'Result not available'}, status=status.HTTP_404_NOT_FOUND)

        response = FileResponse(job.result.cutout_file.open('rb'), content_type='image/png')
        filename = f"{job.upload.original_name.rsplit('.', 1)[0]}_cutout.png"
        response['Content-Disposition'] = f"attachment; filename=\"{filename}\""
        return response


class DownloadZipView(APIView):
    def get(self, request):
        ids = request.query_params.get('ids', '')
        job_ids = [i.strip() for i in ids.split(',') if i.strip()]
        if not job_ids:
            return Response({'error': 'No ids provided'}, status=status.HTTP_400_BAD_REQUEST)

        import zipfile

        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            for job_id in job_ids:
                try:
                    job = SegmentationJob.objects.get(id=job_id)
                except SegmentationJob.DoesNotExist:
                    continue
                if not job.result or not job.result.cutout_file:
                    continue
                base = job.upload.original_name.rsplit('.', 1)[0]
                name = f"{base}_cutout.png"
                zf.writestr(name, job.result.cutout_file.read())
                job.result.cutout_file.seek(0)

        buffer.seek(0)
        response = HttpResponse(buffer.getvalue(), content_type='application/zip')
        response['Content-Disposition'] = 'attachment; filename="cutouts.zip"'
        return response
