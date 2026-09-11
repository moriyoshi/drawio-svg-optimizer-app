'use client';

import { bytes, delta } from '@/lib/format';
import type { OptimizeOutcome } from '@/lib/optimize';

const STAGE_LABEL: Record<string, string> = {
  original: 'Original',
  sanitized: 'After sanitizing',
  satori: 'After label conversion',
  optimized: 'Final',
};

export function StatsTable({ outcome, showGzip }: { outcome: OptimizeOutcome; showGzip: boolean }) {
  const rows = outcome.stages.length > 0 ? outcome.stages : [];

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[26rem] text-sm">
        <thead>
          <tr className="border-border border-b text-left text-muted text-xs">
            <th className="py-1.5 pr-3 font-medium">Stage</th>
            <th className="py-1.5 pr-3 text-right font-medium">Raw</th>
            {showGzip && (
              <th className="py-1.5 pr-3 text-right font-medium">
                Gzip<span className="text-faint">*</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((stage) => (
            <tr key={stage.name} className="border-border/60 border-b last:border-0">
              <td className="py-1.5 pr-3 text-muted">{STAGE_LABEL[stage.name] ?? stage.name}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{bytes(stage.raw)}</td>
              {showGzip && (
                <td className="py-1.5 pr-3 text-right tabular-nums">{bytes(stage.gzip)}</td>
              )}
            </tr>
          ))}
          <tr className="border-border border-t-2 font-medium">
            <td className="py-2 pr-3">Change</td>
            <td className="py-2 pr-3 text-right tabular-nums text-ok">
              {delta(outcome.before.raw, outcome.after.raw)}
            </td>
            {showGzip && (
              <td className="py-2 pr-3 text-right tabular-nums text-ok">
                {delta(outcome.before.gzip, outcome.after.gzip)}
              </td>
            )}
          </tr>
        </tbody>
      </table>
      {showGzip && (
        <p className="mt-2 text-faint text-xs">
          * Gzip sizes are measured with <code>CompressionStream</code>, which compresses at level 6
          where a server typically uses level 9 — so the real transfer size is around 3% smaller
          than shown.
        </p>
      )}
    </div>
  );
}
