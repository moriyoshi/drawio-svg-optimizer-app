/**
 * Grouping the optimizer's warnings by what a user should actually do about them.
 *
 * The library's design is "nothing fails loudly, everything is reported", which
 * means a flat list of twenty codes buries the one that matters. Only two codes
 * mean something went wrong; the rest are either a fidelity trade the user chose
 * or a record of what was removed.
 */

export type Severity = 'error' | 'fidelity' | 'info';

export interface Warning {
  code: string;
  message: string;
  detail?: string;
}

/** Content was lost or silently corrupted. These need attention. */
const ERRORS = new Set(['label-lost', 'fallback-mismatch']);

/**
 * The output is correct but not pixel-identical, or is less portable than it
 * could be. Expected under `aggressive`; worth reading once.
 */
const FIDELITY = new Set([
  'font-substituted-metrics',
  'fonts-measured-locally',
  'fonts-not-supplied',
  'font-coverage-missing',
  'font-unavailable',
  'font-substituted',
  'font-config-unreadable',
  'font-system-unavailable',
  'raster-fallback-kept',
  'label-kept-as-html',
]);

export function severityOf(code: string): Severity {
  if (ERRORS.has(code)) return 'error';
  if (FIDELITY.has(code)) return 'fidelity';
  return 'info';
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  error: 'Needs attention',
  fidelity: 'Fidelity notes',
  info: 'What was changed',
};

/**
 * Plain-language gloss for the codes a user is most likely to hit, since the
 * library's own messages assume you know its internals.
 */
export const CODE_HINT: Record<string, string> = {
  'label-lost':
    'A label disappeared during optimization. Compare the preview carefully before using this file.',
  'fallback-mismatch':
    "draw.io's own text fallback did not match the HTML label, so the two were not merged.",
  'fonts-measured-locally':
    'Text was shaped using fonts installed on this machine. Turn on webfont loading for output that is identical everywhere.',
  'font-substituted-metrics':
    'A replacement typeface with different letter widths was used, so this text sits slightly differently than the original.',
  'raster-fallback-kept':
    'An image-based label fallback was kept because it could not be safely reproduced as text.',
  'label-kept-as-html':
    'A label could not be converted to SVG text and was left as HTML, which is larger but renders identically.',
  'diagram-source-removed':
    'The embedded diagram source was removed, so this file can no longer be reopened for editing in draw.io.',
};

export function groupWarnings(warnings: Warning[]): Record<Severity, Warning[]> {
  const groups: Record<Severity, Warning[]> = { error: [], fidelity: [], info: [] };
  for (const warning of warnings) groups[severityOf(warning.code)].push(warning);
  return groups;
}
