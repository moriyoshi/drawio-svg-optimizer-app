import { strToU8, zipSync } from 'fflate';
import { optimizedName } from './format';

function trigger(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  // Revoking synchronously can cancel the download in some browsers; one turn of
  // the event loop is enough for the navigation to have taken the URL.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadSvg(name: string, svg: string): void {
  trigger(new Blob([svg], { type: 'image/svg+xml' }), optimizedName(name));
}

export function downloadZip(files: { name: string; data: string }[]): void {
  const entries: Record<string, Uint8Array> = {};
  for (const file of files) entries[optimizedName(file.name)] = strToU8(file.data);
  // Level 6: these are text files that gzip well, and the difference from 9 is
  // not worth blocking the main thread for.
  const zipped = zipSync(entries, { level: 6 });
  trigger(new Blob([zipped as BlobPart], { type: 'application/zip' }), 'optimized-svgs.zip');
}
