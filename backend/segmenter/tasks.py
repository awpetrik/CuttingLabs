from __future__ import annotations

from celery import shared_task

from segmenter.models import SegmentResult, SegmentationJob
from segmenter.services.pipeline import persist_result, run_segmentation
from segmenter.utils import cache_key


@shared_task
def run_segmentation_task(job_id: str) -> None:
    try:
        job = SegmentationJob.objects.get(id=job_id)
    except SegmentationJob.DoesNotExist:
        return

    if job.status == SegmentationJob.STATUS_CANCELED:
        return

    job.status = SegmentationJob.STATUS_RUNNING
    job.save(update_fields=['status', 'updated_at'])

    upload = job.upload
    params = job.params

    existing = SegmentResult.objects.filter(
        cache_key=cache_key(upload.sha256, params)
    ).first()

    if existing:
        job.result = existing
        job.status = SegmentationJob.STATUS_DONE
        job.save(update_fields=['result', 'status', 'updated_at'])
        return

    try:
        payload = run_segmentation(upload, params)
        result = persist_result(upload, params, cache_key(upload.sha256, params), payload)
        job.result = result
        job.status = SegmentationJob.STATUS_DONE
        job.save(update_fields=['result', 'status', 'updated_at'])
    except Exception as exc:
        job.status = SegmentationJob.STATUS_FAILED
        job.error = str(exc)
        job.save(update_fields=['status', 'error', 'updated_at'])
