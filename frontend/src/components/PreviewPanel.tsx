'use client';

import { useEffect, useRef, useState } from 'react';
import { CompareSlider, type CompareHandle } from '@/components/CompareSlider';
import { API_BASE } from '@/lib/api';
import { FileItem } from '@/lib/types';

interface PreviewPanelProps {
  item: FileItem | null;
  background: 'neutral' | 'checker' | 'white' | 'black';
  onBackgroundChange: (value: 'neutral' | 'checker' | 'white' | 'black') => void;
  samplePreviewUrl?: string;
  onTrySample?: () => void;
  onSelectCandidate?: (index: number) => void;
}

export function PreviewPanel({
  item,
  background,
  onBackgroundChange,
  samplePreviewUrl,
  onTrySample,
  onSelectCandidate,
}: PreviewPanelProps) {
  const [viewMode, setViewMode] = useState<'compare' | 'cutout' | 'original' | 'mask'>(
    'compare'
  );
  const sliderRef = useRef<CompareHandle>(null);

  useEffect(() => {
    setViewMode('compare');
  }, [item?.id]);
  if (!item) {
    return (
      <div className="rounded-3xl border border-border bg-surface/80 p-8 shadow-soft">
        <div className="grid gap-6 md:grid-cols-[1.1fr_0.9fr] md:items-center">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-subtle">Preview</p>
            <h2 className="mt-2 text-xl font-semibold">Your cutout will appear here.</h2>
            <p className="mt-2 text-sm text-subtle">
              Import a product photo to generate a clean transparent PNG.
            </p>
            {onTrySample && (
              <button
                type="button"
                onClick={onTrySample}
                className="mt-4 h-11 rounded-full bg-gradient-to-r from-accent to-accent2 px-5 text-xs font-semibold text-white shadow-soft transition-all duration-200 ease-out hover:-translate-y-0.5"
              >
                Try sample image
              </button>
            )}
          </div>
          <div className="rounded-3xl border border-border bg-surface2/80 p-4">
            <div className="h-48 w-full overflow-hidden rounded-2xl bg-surface">
              {samplePreviewUrl ? (
                <img
                  src={samplePreviewUrl}
                  alt="Sample"
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="h-full w-full animate-pulse bg-border" />
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isProcessing = ['uploading', 'processing'].includes(item.status);
  const isError = item.status === 'failed';
  // Full-size cutout for comparison (same dimensions as original)
  const compareUrl = item.result?.cutout_full_base64
    ? `data:image/png;base64,${item.result.cutout_full_base64}`
    : undefined;
  // Cropped cutout for download/cutout view
  const afterUrl = item.result?.cutout_png_base64
    ? `data:image/png;base64,${item.result.cutout_png_base64}`
    : item.result?.download_url
      ? `${API_BASE}${item.result.download_url}`
      : undefined;
  const maskUrl = item.result?.mask_base64
    ? `data:image/png;base64,${item.result.mask_base64}`
    : undefined;
  const candidates = item.result?.candidates ?? [];
  const selectedCandidate =
    item.result?.selected_candidate ?? item.ui.candidateIndex ?? null;

  return (
    <div className="rounded-3xl border border-border bg-surface/80 p-6 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-subtle">Preview</p>
          <h2 className="text-lg font-semibold">{item.name}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center rounded-full border border-border bg-surface2 p-1 text-[11px] font-semibold text-subtle">
            {(['compare', 'cutout', 'original', 'mask'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`rounded-full px-3 py-1 transition-all duration-200 ease-out ${viewMode === mode
                  ? 'bg-gradient-to-r from-accent to-accent2 text-white shadow-soft'
                  : 'text-subtle'
                  }`}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
          {item.result?.timings && (
            <div className="text-right text-xs text-subtle">
              <p className="flex items-center gap-1.5 justify-end">
                <span className={`inline-block h-2 w-2 rounded-full ${item.result.processor_used === 'rmbg-local'
                  ? 'bg-emerald-500'
                  : 'bg-indigo-500'
                  }`} />
                {item.result.processor_used === 'rmbg-local' ? 'Local' : 'Cloud'} • {item.result.timings.total_ms}ms
              </p>
              <p className="opacity-60">
                {item.result.processor_used === 'rmbg-local'
                  ? `RMBG ${item.result.timings.local_ms || 0}ms`
                  : `Gemini ${item.result.timings.gemini_ms}ms`}
              </p>
            </div>
          )}
        </div>
      </div>
      <div className="relative mt-6">
        <CompareSlider
          ref={sliderRef}
          beforeUrl={item.previewUrl}
          afterUrl={viewMode === 'compare' ? (compareUrl || afterUrl) : afterUrl}
          maskUrl={maskUrl}
          view={viewMode}
          background={background}
          onBackgroundChange={onBackgroundChange}
          objectBox={item.result?.box_2d}
          candidates={candidates}
          selectedCandidate={selectedCandidate}
          onSelectCandidate={onSelectCandidate}
        />
        {isProcessing && (
          <div className="absolute inset-0 flex items-center justify-center rounded-3xl bg-surface/70 backdrop-blur-[2px]">
            <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-xs text-subtle shadow-soft">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />
              Processing...
            </div>
          </div>
        )}
        {!isProcessing && item.status === 'done' && !afterUrl && (
          <div className="absolute inset-0 flex items-center justify-center rounded-3xl bg-surface/60 backdrop-blur-[1px]">
            <div className="rounded-full border border-border bg-surface px-4 py-2 text-xs text-subtle shadow-soft">
              Preview unavailable. Use Export to download.
            </div>
          </div>
        )}
        {isError && item.error && (
          <div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs text-rose-500">
            {item.error}
          </div>
        )}
      </div>
      {item.result && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-subtle">
          <div>
            Detected:{' '}
            <span className="font-semibold text-text">
              {item.result.label || 'main product'}
            </span>{' '}
            (ok)
          </div>
          {candidates.length > 1 && (
            <div className="text-xs text-subtle">
              Multiple candidates detected. Click a box to choose.
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => sliderRef.current?.recenter()}
              className="rounded-full border border-border bg-surface2 px-3 py-1 text-xs font-semibold text-subtle transition-all duration-200 ease-out hover:-translate-y-0.5 hover:text-text"
            >
              Recenter
            </button>
            <button
              type="button"
              onClick={() => sliderRef.current?.autoFit()}
              className="rounded-full border border-border bg-surface2 px-3 py-1 text-xs font-semibold text-subtle transition-all duration-200 ease-out hover:-translate-y-0.5 hover:text-text"
            >
              Auto-fit object
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
