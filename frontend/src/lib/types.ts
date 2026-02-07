export type FileStatus =
  | 'idle'
  | 'queued'
  | 'uploading'
  | 'processing'
  | 'done'
  | 'failed'
  | 'canceled';

export interface SegmentTimings {
  gemini_ms: number;
  local_ms?: number;
  postprocess_ms: number;
  total_ms: number;
  processor?: 'gemini' | 'rmbg-local';
}

export interface SegmentResult {
  id: string;
  status: string;
  label: string;
  box_2d: number[];
  mask_base64: string;
  cutout_png_base64: string;
  cutout_full_base64?: string;  // Full-size for comparison slider
  timings?: SegmentTimings;
  candidates?: SegmentCandidate[];
  selected_candidate?: number;
  file_id?: string;
  download_url?: string;
  processor_used?: 'gemini' | 'rmbg-local';
}

export interface SegmentParams {
  threshold: number;
  feather: number;
  padding: number;
  auto_enhance: boolean;
}

export interface SegmentCandidate {
  label: string;
  box_2d: number[];
  confidence?: number;
  score?: number;
}

export interface FileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  previewUrl: string;
  status: FileStatus;
  progress: number;
  error?: string;
  result?: SegmentResult;
  fileId?: string;
  params: SegmentParams;
  updatedAt: number;
  useFileIdOnly?: boolean;
  ui: {
    removeFringing: boolean;
    focusMode?: 'auto' | 'center' | 'largest' | 'detailed';
    allowBorderTouch?: boolean;
    candidateIndex?: number | null;
  };
}
