/** Byte and percentage formatting for the stats panel. */

export function bytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Change as a signed percentage.
 *
 * Negative means smaller, which is the good direction — so the sign is kept
 * rather than flipped to a "saved 95%" phrasing that hides the rare case where
 * a pass makes a file bigger.
 */
export function delta(before: number, after: number): string {
  if (before === 0) return '—';
  const pct = ((after - before) / before) * 100;
  const rounded = Math.abs(pct) >= 10 ? pct.toFixed(0) : pct.toFixed(1);
  return `${pct > 0 ? '+' : ''}${rounded}%`;
}

/** `diagram.svg` -> `diagram.min.svg`, matching the CLI's own convention. */
export function optimizedName(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return `${name}.min.svg`;
  return `${name.slice(0, dot)}.min${name.slice(dot)}`;
}
