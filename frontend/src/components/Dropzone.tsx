'use client';

import { useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { Cloud, Cpu, FolderOpen, RefreshCw, UploadCloud } from 'lucide-react';

import { getFilesFromDataTransfer } from '@/lib/file-utils';

type ProcessingMode = 'gemini' | 'local' | 'auto';

interface DropzoneProps {
  onFiles: (files: File[]) => void;
  processingMode?: ProcessingMode;
  onProcessingModeChange?: (mode: ProcessingMode) => void;
}

export function Dropzone({ onFiles, processingMode = 'auto', onProcessingModeChange }: DropzoneProps) {
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const handleDrop = useCallback(
    (accepted: File[]) => {
      onFiles(accepted);
    },
    [onFiles]
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: handleDrop,
    multiple: true,
    noClick: true,
    getFilesFromEvent: async (event) => {
      const items = (event as DragEvent).dataTransfer?.items;
      if (items && items.length) {
        return await getFilesFromDataTransfer(items);
      }
      return [];
    },
  });

  const openFolder = () => folderInputRef.current?.click();

  const modes = [
    { key: 'auto' as const, label: 'Auto', icon: RefreshCw, desc: 'Smart' },
    { key: 'gemini' as const, label: 'Cloud', icon: Cloud, desc: 'Gemini' },
    { key: 'local' as const, label: 'Local', icon: Cpu, desc: 'RMBG' },
  ];

  return (
    <div
      {...getRootProps()}
      className={`relative overflow-hidden rounded-[32px] border border-dashed bg-surface2/80 p-10 text-center transition-all duration-200 ease-out ${isDragActive
          ? 'border-accent/60 shadow-lift ring-2 ring-accent/20'
          : 'border-border shadow-soft'
        }`}
    >
      <input {...getInputProps()} />
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-5">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-accent to-accent2 text-white shadow-soft">
          <UploadCloud className="h-10 w-10" />
        </div>
        <div>
          <p className="text-2xl font-semibold">Bring your product shots in</p>
          <p className="mt-1 text-sm text-subtle">Drag & drop or import from disk.</p>
        </div>

        {/* Processing Mode Selector */}
        {onProcessingModeChange && (
          <div className="flex items-center gap-2 rounded-full border border-border bg-surface p-1">
            {modes.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onProcessingModeChange(key);
                }}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 ${processingMode === key
                    ? 'bg-gradient-to-r from-accent to-accent2 text-white shadow-soft'
                    : 'text-subtle hover:text-text'
                  }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            className="h-11 rounded-full bg-gradient-to-r from-accent to-accent2 px-6 text-sm font-semibold text-white shadow-soft transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            onClick={open}
          >
            Import Files
          </button>
          <button
            type="button"
            onClick={openFolder}
            className="flex h-11 items-center gap-2 rounded-full border border-border bg-surface px-4 text-xs font-medium text-subtle transition-all duration-200 ease-out hover:-translate-y-0.5 hover:text-text hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <FolderOpen className="h-4 w-4" />
            Import Folder
          </button>
        </div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-subtle/80">
          Supports JPG / PNG / WEBP
        </p>
      </div>
      {isDragActive && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-surface/40 backdrop-blur-[1px]">
          <span className="rounded-full border border-accent/30 bg-surface px-4 py-2 text-sm font-medium text-text shadow-soft">
            Drop to import
          </span>
        </div>
      )}
      <input
        ref={folderInputRef}
        type="file"
        multiple
        // @ts-expect-error: webkitdirectory is supported in Chromium
        webkitdirectory="true"
        className="hidden"
        onChange={(event) => {
          if (event.target.files) {
            onFiles(Array.from(event.target.files));
          }
        }}
      />
    </div>
  );
}
