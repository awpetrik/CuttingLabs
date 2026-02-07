'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CommandPalette } from '@/components/CommandPalette';
import { ControlsPanel } from '@/components/ControlsPanel';
import { Dropzone } from '@/components/Dropzone';
import { ExportBar } from '@/components/ExportBar';
import { PreviewPanel } from '@/components/PreviewPanel';
import { QueueList } from '@/components/QueueList';
import { TopBar } from '@/components/TopBar';
import { downloadZip } from '@/lib/api';
import { useProcessingQueue } from '@/lib/queue';
import { SlidersHorizontal, X } from 'lucide-react';

function downloadBase64(filename: string, base64: string) {
  const link = document.createElement('a');
  link.href = `data:image/png;base64,${base64}`;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

const SAMPLE_SVG = `
<svg width="800" height="800" viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f8fafc" />
      <stop offset="100%" stop-color="#e2e8f0" />
    </linearGradient>
    <linearGradient id="bottle" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#3b82f6" />
      <stop offset="100%" stop-color="#6366f1" />
    </linearGradient>
  </defs>
  <rect width="800" height="800" rx="48" fill="url(#bg)" />
  <rect x="310" y="140" width="180" height="480" rx="80" fill="url(#bottle)" />
  <rect x="345" y="90" width="110" height="70" rx="24" fill="#1f2937" />
  <rect x="330" y="300" width="140" height="140" rx="24" fill="#f8fafc" opacity="0.85" />
  <rect x="364" y="334" width="72" height="72" rx="36" fill="#1f2937" />
</svg>
`;

export default function Home() {
  const {
    items,
    selected,
    selectedId,
    setSelectedId,
    addFiles,
    cancelItem,
    retryItem,
    updateParams,
    updateUi,
    reprocessItem,
    startAll,
    clearCompleted,
    processingMode,
    setProcessingMode,
  } = useProcessingQueue();

  const [background, setBackground] = useState<'neutral' | 'checker' | 'white' | 'black'>(
    'neutral'
  );
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [selectedExportIds, setSelectedExportIds] = useState<string[]>([]);
  const [autoApply, setAutoApply] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [mobileStep, setMobileStep] = useState<'import' | 'preview' | 'refine' | 'export'>('import');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const samplePreviewUrl = useMemo(
    () => `data:image/svg+xml;utf8,${encodeURIComponent(SAMPLE_SVG)}`,
    []
  );

  useEffect(() => {
    if (items.length > 0 && mobileStep === 'import') {
      setMobileStep('preview');
    }
  }, [items.length, mobileStep]);

  useEffect(() => {
    setSelectedExportIds((prev) =>
      prev.filter((id) => items.some((item) => item.id === id && item.status === 'done'))
    );
  }, [items]);

  const handleTrySample = () => {
    const svgBlob = new Blob([SAMPLE_SVG], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 800;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        return;
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const file = new File([blob], 'sample.png', { type: 'image/png' });
        addFiles([file]);
      }, 'image/png');
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const handleDownloadSelected = () => {
    if (!selected?.result?.cutout_png_base64) return;
    const base = selected.name.replace(/\.[^/.]+$/, '');
    downloadBase64(`${base}_cutout.png`, selected.result.cutout_png_base64);
  };

  const handleExportAll = useCallback(
    async (jobIds?: string[]) => {
      const ids = jobIds?.length
        ? jobIds
        : items
          .filter((item) => item.status === 'done' && item.result?.id)
          .map((item) => item.result!.id);
      if (!ids.length) return;
      try {
        const blob = await downloadZip(ids);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'cutouts.zip';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error(error);
      }
    },
    [items]
  );

  const handleExportSelected = () => {
    const ids = items
      .filter((item) => selectedExportIds.includes(item.id) && item.result?.id)
      .map((item) => item.result!.id);
    handleExportAll(ids);
  };

  const toggleExportId = (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item || item.status !== 'done') return;
    setSelectedExportIds((prev) =>
      prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]
    );
  };

  const handleRetryFailed = () => {
    items.filter((item) => item.status === 'failed').forEach((item) => retryItem(item.id));
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(true);
      }

      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        handleExportAll();
      }

      if (event.code === 'Space') {
        event.preventDefault();
        startAll();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleExportAll, startAll]);

  const paletteActions = useMemo(
    () => [
      {
        id: 'process-all',
        label: 'Process all queued items',
        shortcut: 'Space',
        onTrigger: startAll,
      },
      {
        id: 'export-all',
        label: 'Export all cutouts',
        shortcut: 'Cmd/Ctrl + Enter',
        onTrigger: handleExportAll,
      },
    ],
    [handleExportAll, startAll]
  );

  const autoApplyRef = useRef('');
  useEffect(() => {
    if (!autoApply || !selected) return;
    const key = JSON.stringify({
      params: selected.params,
      focusMode: selected.ui.focusMode,
      allowBorderTouch: selected.ui.allowBorderTouch,
      candidateIndex: selected.ui.candidateIndex,
    });
    if (key === autoApplyRef.current) return;
    autoApplyRef.current = key;
    const timer = window.setTimeout(() => {
      reprocessItem(selected.id);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [autoApply, selected, reprocessItem]);

  const removeFringing = selected?.ui.removeFringing ?? false;
  const focusMode = selected?.ui.focusMode ?? 'auto';
  const allowBorderTouch = selected?.ui.allowBorderTouch ?? false;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(88,80,236,0.12),_transparent_55%)] px-6 py-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <TopBar />

        <div className="hidden md:block">
          <Dropzone onFiles={addFiles} processingMode={processingMode} onProcessingModeChange={setProcessingMode} />
        </div>

        <div className="md:hidden">
          <div className="flex items-center justify-between rounded-2xl border border-border bg-surface/80 p-2 shadow-soft">
            {['import', 'preview', 'refine', 'export'].map((step) => (
              <button
                key={step}
                type="button"
                onClick={() => setMobileStep(step as typeof mobileStep)}
                className={`flex-1 rounded-xl px-2 py-2 text-xs font-semibold transition-all duration-200 ease-out ${mobileStep === step
                  ? 'bg-gradient-to-r from-accent to-accent2 text-white'
                  : 'text-subtle'
                  }`}
              >
                {step.charAt(0).toUpperCase() + step.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="md:hidden">
          {mobileStep === 'import' && <Dropzone onFiles={addFiles} processingMode={processingMode} onProcessingModeChange={setProcessingMode} />}
          {mobileStep === 'preview' && (
            <PreviewPanel
              item={selected}
              background={background}
              onBackgroundChange={setBackground}
              samplePreviewUrl={samplePreviewUrl}
              onTrySample={handleTrySample}
              onSelectCandidate={(index) => {
                if (!selected) return;
                updateUi(selected.id, { ...selected.ui, candidateIndex: index });
                reprocessItem(selected.id);
              }}
            />
          )}
          {mobileStep === 'refine' && (
            <ControlsPanel
              params={selected?.params ?? null}
              removeFringing={removeFringing}
              focusMode={focusMode}
              allowBorderTouch={allowBorderTouch}
              autoApply={autoApply}
              processingMode={processingMode}
              onChange={(params) => selected && updateParams(selected.id, params)}
              onFocusModeChange={(mode) => {
                if (!selected) return;
                updateUi(selected.id, {
                  ...selected.ui,
                  focusMode: mode,
                  candidateIndex: null,
                });
              }}
              onToggleBorderTouch={() => {
                if (!selected) return;
                updateUi(selected.id, {
                  ...selected.ui,
                  allowBorderTouch: !allowBorderTouch,
                });
              }}
              onToggleRemoveFringing={() =>
                selected &&
                updateUi(selected.id, { ...selected.ui, removeFringing: !removeFringing })
              }
              onToggleAutoApply={() => setAutoApply((prev) => !prev)}
              onProcessingModeChange={setProcessingMode}
              onApply={() => selected && reprocessItem(selected.id)}
            />
          )}
          {mobileStep === 'export' && (
            <ExportBar
              selected={selected}
              items={items}
              onDownloadSelected={handleDownloadSelected}
              onExportAll={() => handleExportAll()}
            />
          )}
          <div className="mt-4 flex items-center justify-between rounded-2xl border border-border bg-surface/80 px-4 py-3">
            <p className="text-xs text-subtle">Queue</p>
            <button
              type="button"
              onClick={() => setQueueOpen(true)}
              className="text-xs font-semibold text-accent"
            >
              Open ({items.length})
            </button>
          </div>
        </div>

        <div className="hidden lg:grid lg:grid-cols-[360px_1fr] lg:gap-6">
          <div className="flex flex-col gap-6">
            <QueueList
              items={items}
              selectedId={selectedId}
              selectedExportIds={selectedExportIds}
              onSelect={setSelectedId}
              onToggleExport={toggleExportId}
              onRetry={retryItem}
              onCancel={cancelItem}
              onClear={clearCompleted}
              onRetryFailed={handleRetryFailed}
              onExportSelected={handleExportSelected}
              onOpenSettings={() => setSettingsOpen(true)}
            />
            <ControlsPanel
              params={selected?.params ?? null}
              removeFringing={removeFringing}
              focusMode={focusMode}
              allowBorderTouch={allowBorderTouch}
              autoApply={autoApply}
              processingMode={processingMode}
              onChange={(params) => selected && updateParams(selected.id, params)}
              onFocusModeChange={(mode) => {
                if (!selected) return;
                updateUi(selected.id, {
                  ...selected.ui,
                  focusMode: mode,
                  candidateIndex: null,
                });
              }}
              onToggleBorderTouch={() => {
                if (!selected) return;
                updateUi(selected.id, {
                  ...selected.ui,
                  allowBorderTouch: !allowBorderTouch,
                });
              }}
              onToggleRemoveFringing={() =>
                selected &&
                updateUi(selected.id, { ...selected.ui, removeFringing: !removeFringing })
              }
              onToggleAutoApply={() => setAutoApply((prev) => !prev)}
              onProcessingModeChange={setProcessingMode}
              onApply={() => selected && reprocessItem(selected.id)}
            />
          </div>
          <div className="flex flex-col gap-6">
            <PreviewPanel
              item={selected}
              background={background}
              onBackgroundChange={setBackground}
              samplePreviewUrl={samplePreviewUrl}
              onTrySample={handleTrySample}
              onSelectCandidate={(index) => {
                if (!selected) return;
                updateUi(selected.id, { ...selected.ui, candidateIndex: index });
                reprocessItem(selected.id);
              }}
            />
            <ExportBar
              selected={selected}
              items={items}
              onDownloadSelected={handleDownloadSelected}
              onExportAll={() => handleExportAll()}
            />
          </div>
        </div>

        <div className="hidden md:block lg:hidden">
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => setInspectorOpen(true)}
              className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-xs font-semibold text-subtle shadow-soft transition-all duration-200 ease-out hover:-translate-y-0.5 hover:text-text"
            >
              <SlidersHorizontal className="h-4 w-4" /> Inspector
            </button>
          </div>
          <div className="mt-4 flex flex-col gap-6">
            <QueueList
              items={items}
              selectedId={selectedId}
              selectedExportIds={selectedExportIds}
              onSelect={setSelectedId}
              onToggleExport={toggleExportId}
              onRetry={retryItem}
              onCancel={cancelItem}
              onClear={clearCompleted}
              onRetryFailed={handleRetryFailed}
              onExportSelected={handleExportSelected}
              onOpenSettings={() => setSettingsOpen(true)}
            />
            <PreviewPanel
              item={selected}
              background={background}
              onBackgroundChange={setBackground}
              samplePreviewUrl={samplePreviewUrl}
              onTrySample={handleTrySample}
              onSelectCandidate={(index) => {
                if (!selected) return;
                updateUi(selected.id, { ...selected.ui, candidateIndex: index });
                reprocessItem(selected.id);
              }}
            />
            <ExportBar
              selected={selected}
              items={items}
              onDownloadSelected={handleDownloadSelected}
              onExportAll={() => handleExportAll()}
            />
          </div>
        </div>
      </div>

      {inspectorOpen && (
        <div className="fixed inset-0 z-40 hidden md:block lg:hidden">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur"
            onClick={() => setInspectorOpen(false)}
          />
          <div className="absolute right-0 top-0 h-full w-[360px] bg-surface p-6 shadow-lift">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Inspector</p>
              <button
                type="button"
                onClick={() => setInspectorOpen(false)}
                className="rounded-full border border-border p-2"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-6">
              <ControlsPanel
                params={selected?.params ?? null}
                removeFringing={removeFringing}
                focusMode={focusMode}
                allowBorderTouch={allowBorderTouch}
                autoApply={autoApply}
                processingMode={processingMode}
                onChange={(params) => selected && updateParams(selected.id, params)}
                onFocusModeChange={(mode) => {
                  if (!selected) return;
                  updateUi(selected.id, {
                    ...selected.ui,
                    focusMode: mode,
                    candidateIndex: null,
                  });
                }}
                onToggleBorderTouch={() => {
                  if (!selected) return;
                  updateUi(selected.id, {
                    ...selected.ui,
                    allowBorderTouch: !allowBorderTouch,
                  });
                }}
                onToggleRemoveFringing={() =>
                  selected &&
                  updateUi(selected.id, { ...selected.ui, removeFringing: !removeFringing })
                }
                onToggleAutoApply={() => setAutoApply((prev) => !prev)}
                onProcessingModeChange={setProcessingMode}
                onApply={() => selected && reprocessItem(selected.id)}
              />
            </div>
          </div>
        </div>
      )}

      {queueOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur"
            onClick={() => setQueueOpen(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 max-h-[80vh] rounded-t-3xl bg-surface p-4 shadow-lift">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Queue</p>
              <button
                type="button"
                onClick={() => setQueueOpen(false)}
                className="rounded-full border border-border p-2"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 max-h-[65vh] overflow-auto">
              <QueueList
                items={items}
                selectedId={selectedId}
                selectedExportIds={selectedExportIds}
                onSelect={(id) => {
                  setSelectedId(id);
                  setQueueOpen(false);
                }}
                onToggleExport={toggleExportId}
                onRetry={retryItem}
                onCancel={cancelItem}
                onClear={clearCompleted}
                onRetryFailed={handleRetryFailed}
                onExportSelected={handleExportSelected}
                onOpenSettings={() => setSettingsOpen(true)}
              />
            </div>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6 backdrop-blur">
          <div className="w-full max-w-md rounded-3xl border border-border bg-surface p-6 shadow-lift">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Settings</p>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="rounded-full border border-border p-2"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm text-subtle">
              <p>Missing provider key. Add <span className="font-semibold text-text">GEMINI_API_KEY</span> in:</p>
              <code className="block rounded-2xl border border-border bg-surface2 px-3 py-2 text-xs">
                /Users/rivaldi/PYTHON IMAGE SEGMENTATION/backend/.env
              </code>
              <p>Then restart Docker:</p>
              <code className="block rounded-2xl border border-border bg-surface2 px-3 py-2 text-xs">
                docker compose up -d
              </code>
            </div>
          </div>
        </div>
      )}

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        actions={paletteActions}
      />
    </div>
  );
}
