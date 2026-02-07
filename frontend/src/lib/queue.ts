'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { segmentImage } from './api';
import { FileItem, SegmentParams } from './types';
import { isImageFile } from './file-utils';
import { createThumbnail } from './thumbnail';

const CONCURRENCY = 3;

const DEFAULT_PARAMS: SegmentParams = {
  threshold: 128,
  feather: 4,
  padding: 8,
  auto_enhance: true,
};

function mapError(message: string) {
  const msg = message.toLowerCase();
  if (msg.includes('file too large')) return 'File too large';
  if (msg.includes('unsupported file type')) return 'Unsupported format (JPG/PNG/WEBP)';
  if (msg.includes('unsupported image format')) return 'Unsupported format (JPG/PNG/WEBP)';
  if (msg.includes('cannot identify image file')) return 'Unsupported format (JPG/PNG/WEBP)';
  if (msg.includes('webp not supported')) return 'WEBP not supported on server';
  if (msg.includes('gemini_api_key') || msg.includes('not configured'))
    return 'Provider key missing';
  if (msg.includes('timeout')) return 'Request timed out';
  if (msg.includes('invalid') && msg.includes('mask')) return 'Invalid mask response';
  return message || 'Request failed';
}

export function useProcessingQueue() {
  const [items, setItems] = useState<FileItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [processingMode, setProcessingMode] = useState<'gemini' | 'local' | 'auto'>('auto');
  const controllers = useRef(new Map<string, AbortController>());
  const processingModeRef = useRef(processingMode);

  // Keep ref in sync
  useEffect(() => {
    processingModeRef.current = processingMode;
  }, [processingMode]);

  const activeCount = useMemo(
    () =>
      items.filter((item) =>
        ['uploading', 'processing'].includes(item.status)
      ).length,
    [items]
  );

  const addFiles = useCallback(
    async (files: File[]) => {
      const newItems = await Promise.all(
        files.map(async (file) => {
          const previewUrl = await createThumbnail(file);
          const id =
            typeof crypto !== 'undefined' && 'randomUUID' in crypto
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
          const isValid = isImageFile(file);
          return {
            id,
            file,
            name: file.name,
            size: file.size,
            previewUrl,
            status: isValid ? ('queued' as const) : ('failed' as const),
            progress: 0,
            error: isValid ? undefined : 'Unsupported file type',
            params: { ...DEFAULT_PARAMS },
            ui: {
              removeFringing: false,
              focusMode: 'auto' as const,
              allowBorderTouch: false,
              candidateIndex: null,
            },
            updatedAt: Date.now(),
          } as FileItem;
        })
      );

      if (!newItems.length) return;

      setItems((prev) => [...newItems, ...prev]);
      if (!selectedId) {
        setSelectedId(newItems[0].id);
      }
    },
    [selectedId]
  );

  useEffect(() => {
    if (items.length === 0) {
      if (selectedId) setSelectedId(null);
      return;
    }
    const exists = items.some((item) => item.id === selectedId);
    if (!exists) {
      const preferred = items.find((item) => item.status === 'done') ?? items[0];
      setSelectedId(preferred.id);
    }
  }, [items, selectedId]);

  const cancelItem = useCallback((id: string) => {
    const controller = controllers.current.get(id);
    if (controller) {
      controller.abort();
      controllers.current.delete(id);
    }
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: 'canceled', progress: 0 } : item
      )
    );
  }, []);

  const retryItem = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, status: 'queued', error: undefined, progress: 0 }
          : item
      )
    );
  }, []);

  const updateParams = useCallback((id: string, params: SegmentParams) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
            ...item,
            params,
            updatedAt: Date.now(),
          }
          : item
      )
    );
  }, []);

  const updateUi = useCallback((id: string, ui: FileItem['ui']) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
            ...item,
            ui,
            updatedAt: Date.now(),
          }
          : item
      )
    );
  }, []);

  const reprocessItem = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
            ...item,
            status: 'queued',
            progress: 0,
            error: undefined,
            useFileIdOnly: !!item.fileId,
            updatedAt: Date.now(),
          }
          : item
      )
    );
  }, []);

  const processItem = useCallback(async (item: FileItem) => {
    const controller = new AbortController();
    controllers.current.set(item.id, controller);

    const progressTimers: number[] = [];
    let didTimeout = false;
    const timeoutId = window.setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, 120000);

    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id
          ? { ...i, status: 'uploading', progress: 20 }
          : i
      )
    );

    try {
      progressTimers.push(
        window.setTimeout(() => {
          setItems((prev) =>
            prev.map((i) =>
              i.id === item.id && i.status !== 'done'
                ? { ...i, status: 'processing', progress: 60 }
                : i
            )
          );
        }, 600)
      );
      progressTimers.push(
        window.setTimeout(() => {
          setItems((prev) =>
            prev.map((i) =>
              i.id === item.id && i.status !== 'done'
                ? { ...i, progress: 85 }
                : i
            )
          );
        }, 1400)
      );
      const result = await segmentImage({
        ...item.params,
        file: item.useFileIdOnly ? undefined : item.file,
        fileId: item.useFileIdOnly ? item.fileId : undefined,
        focusMode: item.ui.focusMode ?? 'auto',
        allowBorderTouch: item.ui.allowBorderTouch ?? false,
        candidateIndex: item.ui.candidateIndex ?? null,
        processingMode: processingModeRef.current,
        signal: controller.signal,
      });

      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? {
              ...i,
              status: 'done',
              progress: 100,
              result,
              fileId: result.file_id ?? i.fileId,
              useFileIdOnly: false,
              error: undefined,
              updatedAt: Date.now(),
            }
            : i
        )
      );
    } catch (error) {
      const mapped = mapError((error as Error).message);
      if (controller.signal.aborted) {
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? {
                ...i,
                status: didTimeout ? 'failed' : 'canceled',
                error: didTimeout ? 'Request timed out' : i.error,
                progress: 0,
              }
              : i
          )
        );
        return;
      }
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? {
              ...i,
              status: 'failed',
              error: mapped,
              progress: 0,
            }
            : i
        )
      );
    } finally {
      progressTimers.forEach((timer) => window.clearTimeout(timer));
      window.clearTimeout(timeoutId);
      controllers.current.delete(item.id);
    }
  }, []);

  useEffect(() => {
    if (activeCount >= CONCURRENCY) return;
    const available = CONCURRENCY - activeCount;
    const queued = items.filter((item) => item.status === 'queued').slice(0, available);
    queued.forEach((item) => processItem(item));
  }, [items, activeCount, processItem]);

  const startAll = useCallback(() => {
    setItems((prev) =>
      prev.map((item) =>
        ['idle', 'failed', 'canceled'].includes(item.status)
          ? { ...item, status: 'queued', progress: 0 }
          : item
      )
    );
  }, []);

  const clearCompleted = useCallback(() => {
    setItems((prev) =>
      prev.filter((item) => !['done', 'canceled'].includes(item.status))
    );
  }, []);

  const selected = items.find((item) => item.id === selectedId) ?? null;

  return {
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
  };
}
