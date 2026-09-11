'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Dropzone, type LoadedFile } from '@/components/Dropzone';
import { OptionsPanel } from '@/components/OptionsPanel';
import { ResultCard } from '@/components/ResultCard';
import { downloadZip } from '@/lib/download';
import { bytes, delta } from '@/lib/format';
import {
  type AppOptions,
  DEFAULT_OPTIONS,
  gzipAvailable,
  type OptimizeOutcome,
  optimizeAll,
} from '@/lib/optimize';

export function Optimizer() {
  const [files, setFiles] = useState<LoadedFile[]>([]);
  const [options, setOptions] = useState<AppOptions>(DEFAULT_OPTIONS);
  const [results, setResults] = useState<OptimizeOutcome[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [stale, setStale] = useState(false);
  // Determined after mount: the server has no CompressionStream either way, and
  // rendering a gzip column that then disappears would shift the layout.
  const [showGzip, setShowGzip] = useState(false);
  const runId = useRef(0);

  useEffect(() => setShowGzip(gzipAvailable()), []);

  const run = useCallback(async (batch: LoadedFile[], settings: AppOptions) => {
    const id = ++runId.current;
    setBusy(true);
    setStale(false);
    setResults([]);
    setProgress({ done: 0, total: batch.length });
    await optimizeAll(batch, settings, (outcome) => {
      if (runId.current !== id) return;
      setResults((previous) => [...previous, outcome]);
      setProgress((previous) => ({ ...previous, done: previous.done + 1 }));
    });
    if (runId.current === id) setBusy(false);
  }, []);

  const onFiles = useCallback(
    (loaded: LoadedFile[]) => {
      setFiles(loaded);
      void run(loaded, options);
    },
    [options, run],
  );

  const onOptions = useCallback(
    (next: AppOptions) => {
      setOptions(next);
      // Re-running is explicit: a big diagram takes seconds and blocks the main
      // thread, so flipping a checkbox should not silently start that.
      if (results.length > 0) setStale(true);
    },
    [results.length],
  );

  const succeeded = results.filter((result) => result.error === undefined);
  const totalBefore = succeeded.reduce((sum, result) => sum + result.before.raw, 0);
  const totalAfter = succeeded.reduce((sum, result) => sum + result.after.raw, 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
      <div className="space-y-4 lg:order-1">
        <Dropzone onFiles={onFiles} busy={busy} />

        {busy && (
          <p className="text-muted text-sm" role="status">
            Optimizing {progress.done + 1} of {progress.total}… the page may freeze briefly while
            text is measured.
          </p>
        )}

        {stale && !busy && (
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-accent/40 bg-accent-soft p-3">
            <p className="flex-1 text-sm">Options changed since these results were produced.</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void run(files, options)}
            >
              Re-run
            </button>
          </div>
        )}

        {succeeded.length > 1 && !busy && (
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface p-3">
            <p className="flex-1 text-sm tabular-nums">
              {succeeded.length} files · {bytes(totalBefore)} → {bytes(totalAfter)}{' '}
              <span className="font-medium text-ok">{delta(totalBefore, totalAfter)}</span>
            </p>
            <button
              type="button"
              className="btn"
              onClick={() =>
                downloadZip(succeeded.map((result) => ({ name: result.name, data: result.data })))
              }
            >
              Download all as .zip
            </button>
          </div>
        )}

        <div className="space-y-3">
          {results.map((result) => (
            <ResultCard key={result.id} outcome={result} showGzip={showGzip} />
          ))}
        </div>
      </div>

      <div className="lg:order-2">
        <OptionsPanel options={options} onChange={onOptions} disabled={busy} />
      </div>
    </div>
  );
}
