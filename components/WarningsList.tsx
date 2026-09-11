'use client';

import {
  CODE_HINT,
  groupWarnings,
  SEVERITY_LABEL,
  type Severity,
  type Warning,
} from '@/lib/warnings';

const STYLE: Record<Severity, string> = {
  error: 'border-danger/40 bg-danger-soft',
  fidelity: 'border-warn/40 bg-warn-soft',
  info: 'border-border bg-transparent',
};

const DOT: Record<Severity, string> = {
  error: 'bg-danger',
  fidelity: 'bg-warn',
  info: 'bg-faint',
};

function Group({
  severity,
  warnings,
  hints,
}: {
  severity: Severity;
  warnings: Warning[];
  hints: Record<string, string>;
}) {
  if (warnings.length === 0) return null;
  // The informational group is the long one and is almost always uninteresting,
  // so it stays folded away rather than burying the two that matter.
  const folded = severity === 'info';

  const body = (
    <ul className="space-y-2">
      {warnings.map((warning, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: one optimize run yields a fixed list that is never reordered, and the same code can legitimately repeat
        <li key={`${warning.code}-${index}`} className="flex gap-2">
          <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${DOT[severity]}`} />
          <span>
            <span className="block text-sm">
              {hints[warning.code] ?? CODE_HINT[warning.code] ?? warning.message}
            </span>
            <span className="block font-mono text-faint text-xs">
              {warning.code}
              {warning.detail !== undefined && ` · ${warning.detail}`}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className={`rounded-md border p-3 ${STYLE[severity]}`}>
      {folded ? (
        <details>
          <summary className="cursor-pointer font-medium text-sm">
            {SEVERITY_LABEL[severity]} ({warnings.length})
          </summary>
          <div className="mt-2">{body}</div>
        </details>
      ) : (
        <>
          <p className="mb-2 font-medium text-sm">
            {SEVERITY_LABEL[severity]} ({warnings.length})
          </p>
          {body}
        </>
      )}
    </div>
  );
}

export function WarningsList({
  warnings,
  hints = {},
}: {
  warnings: Warning[];
  /** Per-code replacements for `CODE_HINT`, when this run knows better. */
  hints?: Record<string, string>;
}) {
  if (warnings.length === 0) {
    return <p className="text-muted text-sm">No warnings — nothing was lost or approximated.</p>;
  }
  const groups = groupWarnings(warnings);
  return (
    <div className="space-y-2">
      <Group severity="error" warnings={groups.error} hints={hints} />
      <Group severity="fidelity" warnings={groups.fidelity} hints={hints} />
      <Group severity="info" warnings={groups.info} hints={hints} />
    </div>
  );
}
