'use client';

import { useCallback, useRef, useState } from 'react';

export interface LoadedFile {
  /** Stable across re-runs, so React keeps each result card's own open state. */
  id: string;
  name: string;
  svg: string;
}

/** Guard against someone dropping a 200 MB video; SVG exports are never this big. */
const MAX_BYTES = 40 * 1024 * 1024;

async function read(file: File): Promise<LoadedFile | { name: string; reason: string }> {
  if (file.size > MAX_BYTES) {
    return { name: file.name, reason: 'larger than 40 MB' };
  }
  const text = await file.text();
  // Cheap shape check. The optimizer accepts anything well-formed, but telling
  // someone their PNG is not an SVG is friendlier than a parser error.
  if (!/<svg[\s>]/i.test(text)) {
    return { name: file.name, reason: 'does not contain an <svg> element' };
  }
  return { id: crypto.randomUUID(), name: file.name, svg: text };
}

export function Dropzone({
  onFiles,
  busy,
}: {
  onFiles: (files: LoadedFile[]) => void;
  busy: boolean;
}) {
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);

  const accept = useCallback(
    async (list: FileList | null) => {
      if (list === null || list.length === 0) return;
      const results = await Promise.all([...list].map(read));
      const good = results.filter((r): r is LoadedFile => 'svg' in r);
      setRejected(
        results
          .filter((r) => 'reason' in r)
          .map((r) => `${r.name} — ${(r as { reason: string }).reason}`),
      );
      if (good.length > 0) onFiles(good);
    },
    [onFiles],
  );

  return (
    <div>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: the button inside is the control; this is the drop target */}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          void accept(event.dataTransfer.files);
        }}
        className={`flex flex-col items-center gap-3 rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors ${
          over ? 'border-accent bg-accent-soft' : 'border-border-strong bg-surface'
        }`}
      >
        <p className="font-medium">Drop draw.io SVG exports here</p>
        <p className="text-muted text-sm">
          Several at once is fine. Nothing is uploaded — optimization runs in this browser.
        </p>
        <button
          type="button"
          className="btn btn-primary mt-1"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          Choose files
        </button>
        <input
          ref={input}
          type="file"
          multiple
          accept="image/svg+xml,.svg"
          className="hidden"
          onChange={(event) => {
            void accept(event.target.files);
            // Allow re-selecting the same file after tweaking options.
            event.target.value = '';
          }}
        />
      </div>
      {rejected.length > 0 && (
        <ul className="mt-3 space-y-1 text-danger text-sm">
          {rejected.map((line) => (
            <li key={line}>Skipped {line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
