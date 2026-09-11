'use client';

import { useEffect, useState } from 'react';
import { revoke, svgObjectUrl } from '@/lib/preview';

/**
 * A blob URL tied to the lifetime of one mount.
 *
 * Creating the URL in `useMemo` and revoking it from an effect cleanup looks
 * equivalent and is not: React runs effects twice on mount in development, so
 * the cleanup revokes the URL while the memo — whose dependencies have not
 * changed — hands back the same, now-dead, string. Both images then fail to
 * load. Creating and revoking in the same effect keeps the pair symmetric.
 */
function useObjectUrl(svg: string): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const created = svgObjectUrl(svg);
    setUrl(created);
    return () => revoke(created);
  }, [svg]);
  return url;
}

type Mode = 'swipe' | 'side-by-side' | 'after';

const MODES: Mode[] = ['swipe', 'side-by-side', 'after'];

const MODE_LABEL: Record<Mode, string> = {
  swipe: 'Swipe',
  'side-by-side': 'Side by side',
  after: 'Optimized',
};

/**
 * A blob URL in an `<img>`, never `next/image` and never inline SVG.
 *
 * Inline is the trap: a draw.io export whose labels are `<foreignObject>` renders
 * differently when pasted into an HTML page, because the label boxes are
 * 100%x100% and paint over the shapes - a large diagram loses more than half its
 * ink that way. Rendering the original inline would make it look broken next to
 * a clean optimized file, flattering the tool and hiding any regression it
 * actually introduced. An `<img>` gets the standalone document path, which is
 * also how these files are really consumed.
 */
function Frame({ url, label }: { url: string | undefined; label: string }) {
  if (url === undefined) return null;
  return (
    // biome-ignore lint/performance/noImgElement: a blob: URL for a standalone SVG document; next/image cannot optimize it and would break the rendering path this comparison depends on
    <img src={url} alt={label} className="max-h-full max-w-full" />
  );
}

export function ComparePreview({ before, after }: { before: string; after: string }) {
  const [mode, setMode] = useState<Mode>('swipe');
  const [split, setSplit] = useState(50);

  const beforeUrl = useObjectUrl(before);
  const afterUrl = useObjectUrl(after);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {MODES.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className={`rounded-md border px-2 py-1 text-xs ${
              mode === value
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-border text-muted hover:bg-accent-soft'
            }`}
          >
            {MODE_LABEL[value]}
          </button>
        ))}
        {mode === 'swipe' && (
          <input
            type="range"
            min={0}
            max={100}
            value={split}
            aria-label="Comparison position"
            onChange={(event) => setSplit(Number(event.target.value))}
            className="ml-auto w-40 accent-accent"
          />
        )}
      </div>

      {mode === 'side-by-side' ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            { label: 'Original', url: beforeUrl },
            { label: 'Optimized', url: afterUrl },
          ].map((side) => (
            <figure key={side.label}>
              <div className="checkerboard flex h-64 items-center justify-center overflow-hidden rounded-md border border-border">
                <Frame url={side.url} label={side.label} />
              </div>
              <figcaption className="mt-1 text-center text-muted text-xs">{side.label}</figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <div className="checkerboard relative h-80 overflow-hidden rounded-md border border-border">
          <div className="absolute inset-0 flex items-center justify-center">
            <Frame url={beforeUrl} label="Original" />
          </div>
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={mode === 'swipe' ? { clipPath: `inset(0 0 0 ${split}%)` } : undefined}
          >
            <Frame url={afterUrl} label="Optimized" />
          </div>
          {mode === 'swipe' && (
            <div
              className="pointer-events-none absolute inset-y-0 w-px bg-accent"
              style={{ left: `${split}%` }}
            />
          )}
        </div>
      )}

      {mode === 'swipe' && (
        <p className="mt-2 text-faint text-xs">
          Drag the slider: left of the line is the original, right is optimized. Watch the label
          positions - that is where a conversion problem would show.
        </p>
      )}
    </div>
  );
}
