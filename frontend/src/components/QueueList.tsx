'use client';

import { AlertTriangle, CheckCircle2, Loader2, RotateCcw, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { FileItem } from '@/lib/types';

function ClientSpinner() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return <Loader2 className="h-3 w-3 animate-spin" />;
}

interface QueueListProps {
  items: FileItem[];
  selectedId: string | null;
  selectedExportIds: string[];
  onSelect: (id: string) => void;
  onToggleExport: (id: string) => void;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  onClear: () => void;
  onRetryFailed: () => void;
  onExportSelected: () => void;
  onOpenSettings: () => void;
}

const statusMeta: Record<
  FileItem['status'],
  { label: string; className: string; icon?: JSX.Element }
> = {
  idle: { label: 'Idle', className: 'bg-surface2 text-subtle' },
  queued: { label: 'Queued', className: 'bg-surface2 text-subtle' },
  uploading: {
    label: 'Uploading',
    className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  },
  processing: {
    label: 'Processing',
    className: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300',
  },
  done: {
    label: 'Done',
    className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  failed: {
    label: 'Error',
    className: 'bg-rose-500/15 text-rose-500',
    icon: <XCircle className="h-3 w-3" />,
  },
  canceled: {
    label: 'Canceled',
    className: 'bg-amber-500/15 text-amber-500',
    icon: <AlertTriangle className="h-3 w-3" />,
  },
};

function ProgressRing({ progress }: { progress: number }) {
  const clamped = Math.min(100, Math.max(0, progress));
  return (
    <div
      className="relative h-6 w-6"
      aria-label={`Progress ${clamped}%`}
      role="img"
    >
      <div className="absolute inset-0 rounded-full bg-border" />
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `conic-gradient(rgb(var(--accent)) ${clamped * 3.6}deg, rgba(148,163,184,0.2) 0deg)`,
        }}
      />
      <div className="absolute inset-[3px] rounded-full bg-surface" />
    </div>
  );
}

function isSettingsError(error?: string) {
  if (!error) return false;
  const msg = error.toLowerCase();
  return msg.includes('gemini_api_key') || msg.includes('not configured');
}

export function QueueList({
  items,
  selectedId,
  selectedExportIds,
  onSelect,
  onToggleExport,
  onRetry,
  onCancel,
  onClear,
  onRetryFailed,
  onExportSelected,
  onOpenSettings,
}: QueueListProps) {
  const hasFailed = items.some((item) => item.status === 'failed');
  const canClear = items.some((item) => ['done', 'canceled'].includes(item.status));
  const canExportSelected = selectedExportIds.length > 0;

  return (
    <div className="rounded-3xl border border-border bg-surface/90 p-4 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-subtle">Batch Queue</p>
          <p className="text-sm font-semibold">{items.length} items</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onClear}
            disabled={!canClear}
            className="h-11 rounded-full border border-border bg-surface2 px-3 text-xs font-medium text-subtle transition-all duration-200 ease-out hover:-translate-y-0.5 hover:text-text hover:shadow-soft disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={onRetryFailed}
            disabled={!hasFailed}
            className="flex h-11 items-center gap-1 rounded-full border border-border bg-surface2 px-3 text-xs font-medium text-subtle transition-all duration-200 ease-out hover:-translate-y-0.5 hover:text-text hover:shadow-soft disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw className="h-3 w-3" /> Retry failed
          </button>
          <button
            type="button"
            onClick={onExportSelected}
            disabled={!canExportSelected}
            className="h-11 rounded-full bg-gradient-to-r from-accent to-accent2 px-4 text-xs font-semibold text-white shadow-soft transition-all duration-200 ease-out hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            title={canExportSelected ? '' : 'Select completed items first'}
          >
            Export selected
          </button>
        </div>
      </div>

      <div className="mt-4 divide-y divide-border">
        {items.map((item) => {
          const meta = statusMeta[item.status];
          const isSelected = selectedId === item.id;
          return (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(item.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(item.id);
                }
              }}
              className={`flex w-full items-center gap-3 overflow-hidden px-2 py-3 text-left transition-all duration-200 ease-out hover:bg-surface2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-pointer ${isSelected ? 'bg-surface2/80' : ''
                }`}
            >
              <input
                type="checkbox"
                checked={selectedExportIds.includes(item.id)}
                disabled={item.status !== 'done'}
                onChange={() => onToggleExport(item.id)}
                onClick={(event) => event.stopPropagation()}
                className="h-4 w-4 rounded border-border text-accent focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={`Select ${item.name}`}
              />
              <img
                src={item.previewUrl}
                alt={item.name}
                className="h-12 w-12 rounded-xl object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <span
                    className={`shrink-0 flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${meta.className}`}
                  >
                    {['uploading', 'processing'].includes(item.status) ? (
                      <ClientSpinner />
                    ) : (
                      meta.icon
                    )}
                    {meta.label}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <ProgressRing progress={item.progress} />
                  <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-accent to-accent2 transition-all"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                </div>
                {item.error && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <p className="text-xs text-rose-500">{item.error}</p>
                    {isSettingsError(item.error) && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenSettings();
                        }}
                        className="text-xs font-semibold text-accent underline-offset-4 hover:underline"
                      >
                        Open Settings
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="shrink-0 flex flex-col gap-2">
                {item.status === 'failed' && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRetry(item.id);
                    }}
                    className="flex items-center gap-1 rounded-full border border-border bg-surface2 px-2 py-1 text-[11px] text-subtle hover:text-text"
                  >
                    <RotateCcw className="h-3 w-3" /> Retry
                  </button>
                )}
                {!['done', 'failed', 'canceled'].includes(item.status) && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onCancel(item.id);
                    }}
                    className="rounded-full border border-border bg-surface2 px-2 py-1 text-[11px] text-subtle hover:text-text"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
