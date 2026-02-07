let worker: Worker | null = null;
const callbacks = new Map<string, (url: string) => void>();

function ensureWorker() {
  if (worker) return worker;
  if (typeof Worker === 'undefined') return null;
  worker = new Worker(new URL('../workers/thumbnail.worker.ts', import.meta.url));
  worker.onmessage = (event: MessageEvent) => {
    const { id, buffer, type, error } = event.data as {
      id: string;
      buffer?: ArrayBuffer;
      type?: string;
      error?: string;
    };
    const cb = callbacks.get(id);
    if (!cb) return;
    if (error || !buffer) {
      callbacks.delete(id);
      cb('');
      return;
    }
    const blob = new Blob([buffer], { type: type ?? 'image/jpeg' });
    const url = URL.createObjectURL(blob);
    callbacks.delete(id);
    cb(url);
  };
  return worker;
}

export async function createThumbnail(file: File, size = 256): Promise<string> {
  const fallback = URL.createObjectURL(file);
  if (typeof OffscreenCanvas === 'undefined') return fallback;
  const instance = ensureWorker();
  if (!instance) return fallback;

  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return new Promise((resolve) => {
    callbacks.set(id, (url) => resolve(url || fallback));
    instance.postMessage({ id, file, size });
  });
}
