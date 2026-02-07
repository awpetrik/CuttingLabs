from __future__ import annotations

import uuid
from django.db import models


class Upload(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    file = models.FileField(upload_to='uploads/%Y/%m/%d/')
    original_name = models.CharField(max_length=255)
    size = models.PositiveIntegerField()
    sha256 = models.CharField(max_length=64, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"{self.original_name} ({self.id})"


class SegmentResult(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    upload = models.ForeignKey(Upload, on_delete=models.CASCADE, related_name='results')
    cache_key = models.CharField(max_length=96, unique=True, db_index=True)
    params = models.JSONField()
    label = models.CharField(max_length=128, blank=True)
    box_2d = models.JSONField()
    candidates = models.JSONField(default=list)
    selected_candidate = models.IntegerField(null=True, blank=True)
    mask_file = models.FileField(upload_to='masks/%Y/%m/%d/', null=True, blank=True)
    cutout_file = models.FileField(upload_to='cutouts/%Y/%m/%d/', null=True, blank=True)
    timings = models.JSONField(default=dict)
    width = models.PositiveIntegerField(default=0)
    height = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"Result {self.id}"


class SegmentationJob(models.Model):
    STATUS_QUEUED = 'queued'
    STATUS_RUNNING = 'running'
    STATUS_DONE = 'done'
    STATUS_FAILED = 'failed'
    STATUS_CANCELED = 'canceled'

    STATUS_CHOICES = [
        (STATUS_QUEUED, 'Queued'),
        (STATUS_RUNNING, 'Running'),
        (STATUS_DONE, 'Done'),
        (STATUS_FAILED, 'Failed'),
        (STATUS_CANCELED, 'Canceled'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    upload = models.ForeignKey(Upload, on_delete=models.CASCADE, related_name='jobs')
    result = models.ForeignKey(SegmentResult, null=True, blank=True, on_delete=models.SET_NULL)
    params = models.JSONField()
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_QUEUED)
    error = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"Job {self.id} ({self.status})"
