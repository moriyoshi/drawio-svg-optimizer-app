'use client';

import { useState } from 'react';
import { ComparePreview } from '@/components/ComparePreview';
import { StatsTable } from '@/components/StatsTable';
import { WarningsList } from '@/components/WarningsList';
import { downloadSvg } from '@/lib/download';
import { bytes, delta, optimizedName } from '@/lib/format';
import type { OptimizeOutcome } from '@/lib/optimize';
import { severityOf } from '@/lib/warnings';

export function ResultCard({ outcome, showGzip }: { outcome: OptimizeOutcome; showGzip: boolean }) {
  const [open, setOpen] = useState(false);

  if (outcome.error !== undefined) {
    return (
      <div className="card border-danger/40 p-4">
        <p className="font-medium text-sm">{outcome.name}</p>
        <p className="mt-1 text-danger text-sm">{outcome.error}</p>
      </div>
    );
  }

  const hasError = outcome.warnings.some((warning) => severityOf(warning.code) === 'error');

  // The library raises `fonts-measured-locally` whenever it converted text with
  // no font bytes to embed, and its wording assumes that means "this machine's
  // fonts". When the page loaded webfonts first that is no longer true — the
  // shaping was deterministic — and only the embedding half of the claim still
  // holds. Saying otherwise would contradict the line directly above it.
  const hints: Record<string, string> =
    outcome.fonts !== undefined && outcome.fonts.loaded.length > 0
      ? {
          'fonts-measured-locally':
            'Text was shaped against the webfonts loaded above, so the layout is the same on any machine. The fonts themselves are not embedded, so a viewer without them sees slightly different letter widths — each line still starts in the right place.',
        }
      : {};

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-sm" title={outcome.name}>
            {optimizedName(outcome.name)}
          </p>
          <p className="text-muted text-xs tabular-nums">
            {bytes(outcome.before.raw)} → {bytes(outcome.after.raw)}{' '}
            <span className="font-medium text-ok">
              {delta(outcome.before.raw, outcome.after.raw)}
            </span>
            {showGzip && (
              <>
                {' · gzip '}
                {bytes(outcome.before.gzip)} → {bytes(outcome.after.gzip)}{' '}
                <span className="font-medium text-ok">
                  {delta(outcome.before.gzip, outcome.after.gzip)}
                </span>
              </>
            )}
          </p>
        </div>
        {hasError && (
          <span className="rounded-full bg-danger-soft px-2 py-0.5 font-medium text-danger text-xs">
            Check output
          </span>
        )}
        <div className="flex gap-2">
          <button type="button" className="btn" onClick={() => setOpen(!open)}>
            {open ? 'Hide details' : 'Details'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => downloadSvg(outcome.name, outcome.data)}
          >
            Download
          </button>
        </div>
      </div>

      {open && (
        <div className="space-y-5 border-border border-t p-4">
          <ComparePreview before={outcome.original} after={outcome.data} />
          <StatsTable outcome={outcome} showGzip={showGzip} />
          {outcome.fonts !== undefined && (
            <div className="space-y-1 text-muted text-xs">
              {outcome.fonts.loaded.length > 0 && (
                <p>
                  Measured against webfonts:{' '}
                  {outcome.fonts.loaded
                    .map((font) =>
                      font.via.includes(font.requested)
                        ? font.requested
                        : `${font.requested} → ${font.via.join(' + ')}`,
                    )
                    .join(', ')}
                  .
                </p>
              )}
              {outcome.fonts.reflowed.length > 0 && (
                <p className="text-warn">
                  No metric-compatible substitute exists for {outcome.fonts.reflowed.join(', ')}, so
                  that text is spaced differently than in the original.
                </p>
              )}
              {outcome.fonts.failed.length > 0 && (
                <p className="text-warn">
                  Could not load {outcome.fonts.failed.join(', ')} — that text was measured with
                  this machine&rsquo;s fonts instead.
                </p>
              )}
            </div>
          )}
          <WarningsList warnings={outcome.warnings} hints={hints} />
        </div>
      )}
    </div>
  );
}
