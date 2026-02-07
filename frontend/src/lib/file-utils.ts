export async function getFilesFromDataTransfer(items: DataTransferItemList) {
  const files: File[] = [];

  const traverseEntry = async (entry: any) => {
    if (entry.isFile) {
      await new Promise<void>((resolve) => {
        entry.file((file: File) => {
          files.push(file);
          resolve();
        });
      });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const readEntries = async (): Promise<any[]> =>
        new Promise((resolve) => reader.readEntries(resolve));

      let entries = await readEntries();
      while (entries.length) {
        for (const child of entries) {
          await traverseEntry(child);
        }
        entries = await readEntries();
      }
    }
  };

  const itemArray = Array.from(items);
  for (const item of itemArray) {
    const entry = (item as any).webkitGetAsEntry?.();
    if (entry) {
      await traverseEntry(entry);
    } else {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }

  return files;
}

export function isImageFile(file: File) {
  const name = file.name.toLowerCase();
  return [
    name.endsWith('.jpg'),
    name.endsWith('.jpeg'),
    name.endsWith('.png'),
    name.endsWith('.webp'),
  ].some(Boolean);
}
