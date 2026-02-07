'use client';

import { Download, Package } from 'lucide-react';
import { FileItem } from '@/lib/types';

interface ExportBarProps {
  selected: FileItem | null;
  items: FileItem[];
  onDownloadSelected: () => void;
  onExportAll: () => void;
}

export function ExportBar({
  selected,
  items,
  onDownloadSelected,
  onExportAll,
}: ExportBarProps) {
  const doneCount = items.filter((item) => item.status === 'done').length;
  const canExportAll = doneCount > 0;
  const canDownloadSelected = !!selected?.result;

  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-border bg-surface/80 px-5 py-4 shadow-soft sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold">{doneCount} ready</p>
        <p className="text-xs text-subtle">PNG Transparent</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onDownloadSelected}
          disabled={!canDownloadSelected}
          title={canDownloadSelected ? '' : 'Select a completed item first'}
          className="flex h-11 items-center gap-2 rounded-full border border-border bg-surface2 px-4 text-xs font-medium text-subtle transition-all duration-200 ease-out hover:-translate-y-0.5 hover:text-text hover:shadow-soft disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          Download Selected
        </button>
        <button
          type="button"
          onClick={onExportAll}
          disabled={!canExportAll}
          title={canExportAll ? '' : 'No cutouts ready yet'}
          className="flex h-11 items-center gap-2 rounded-full bg-gradient-to-r from-accent to-accent2 px-4 text-xs font-semibold text-white shadow-soft transition-all duration-200 ease-out hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Package className="h-4 w-4" />
          Export All
        </button>
      </div>
    </div>
  );
}
