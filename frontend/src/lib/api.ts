import { SegmentParams, SegmentResult } from './types';

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export async function segmentImage(
  params: SegmentParams & {
    file?: File;
    fileId?: string;
    signal?: AbortSignal;
    focusMode?: 'auto' | 'center' | 'largest' | 'detailed';
    allowBorderTouch?: boolean;
    candidateIndex?: number | null;
    processingMode?: 'gemini' | 'local' | 'auto';
  }
): Promise<SegmentResult> {
  const form = new FormData();
  form.append('threshold', String(params.threshold));
  form.append('feather', String(params.feather));
  form.append('padding', String(params.padding));
  form.append('auto_enhance', String(params.auto_enhance));
  if (params.focusMode) {
    form.append('focus_mode', params.focusMode);
  }
  if (typeof params.allowBorderTouch === 'boolean') {
    form.append('allow_border_touch', String(params.allowBorderTouch));
  }
  if (params.candidateIndex !== null && params.candidateIndex !== undefined) {
    form.append('candidate_index', String(params.candidateIndex));
  }
  if (params.processingMode) {
    form.append('processing_mode', params.processingMode);
  }

  if (params.fileId) {
    form.append('file_id', params.fileId);
  }
  if (params.file) {
    form.append('file', params.file);
  }

  const res = await fetch(`${API_BASE}/api/segment`, {
    method: 'POST',
    body: form,
    signal: params.signal,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error ?? 'Request failed');
  }

  return (await res.json()) as SegmentResult;
}

export async function fetchJob(jobId: string): Promise<SegmentResult> {
  const res = await fetch(`${API_BASE}/api/job/${jobId}`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error ?? 'Request failed');
  }
  return (await res.json()) as SegmentResult;
}

export async function downloadZip(ids: string[]): Promise<Blob> {
  const params = new URLSearchParams({ ids: ids.join(',') });
  const res = await fetch(`${API_BASE}/api/download_zip?${params.toString()}`);
  if (!res.ok) {
    throw new Error('Failed to download zip');
  }
  return await res.blob();
}
