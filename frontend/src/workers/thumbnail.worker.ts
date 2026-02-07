export {};

self.onmessage = async (event: MessageEvent) => {
  const { id, file, size } = event.data as { id: string; file: File; size: number };
  try {
    const bitmap = await createImageBitmap(file);
    const scale = size / Math.max(bitmap.width, bitmap.height);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not available');
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
    const buffer = await blob.arrayBuffer();
    // @ts-ignore
    self.postMessage({ id, buffer, type: blob.type }, [buffer]);
  } catch (error) {
    // @ts-ignore
    self.postMessage({ id, error: (error as Error).message });
  }
};
