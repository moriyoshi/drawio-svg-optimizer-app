/**
 * The single boundary between this app and the optimizer.
 *
 * Nothing else imports the library. Two things make that worth enforcing:
 *
 * - The browser build is ~1.2 MB and touches `document` at call time, so it must
 *   be reached through a dynamic `import()` inside an event handler — never in
 *   the initial bundle, never during a server render.
 * - `@moriyoshi/drawio-svg-optimizer/browser` is imported explicitly rather than by the bare
 *   specifier. Both resolve to the same file, but the bare one relies on the
 *   bundler honouring the `browser` export condition, and being explicit means a
 *   misconfigured bundler fails loudly here instead of quietly shipping the Node
 *   build with its Satori dependency and `node:zlib` import.
 */
import { ensureFonts, type FontReport, fontNeedsOf } from './fonts';
import type { Warning } from './warnings';

export type Preset = 'safe' | 'default' | 'aggressive';

export interface AppOptions {
  preset: Preset;
  /** Convert HTML labels to native SVG text. The headline pass. */
  satori: boolean;
  /** Fold repeated styling into CSS classes. Smaller raw, no gzip win. */
  consolidateStyles: boolean;
  pretty: boolean;
  /** Keep the embedded `<mxfile>`, so the file reopens in draw.io. */
  keepDiagramSource: boolean;
  /** Load webfonts so measurement does not depend on this machine's fonts. */
  useWebfonts: boolean;
}

export const DEFAULT_OPTIONS: AppOptions = {
  preset: 'aggressive',
  satori: true,
  consolidateStyles: false,
  pretty: false,
  keepDiagramSource: false,
  useWebfonts: true,
};

export interface StageStat {
  name: string;
  raw: number;
  gzip: number;
}

export interface OptimizeOutcome {
  id: string;
  name: string;
  original: string;
  data: string;
  before: { raw: number; gzip: number };
  after: { raw: number; gzip: number };
  stages: StageStat[];
  warnings: Warning[];
  fonts?: FontReport;
  /** Set when the file could not be processed at all. `data` is then empty. */
  error?: string;
}

/**
 * Browser gzip comes from `CompressionStream`, which not every engine has.
 * Without it the sizes are meaningless rather than merely approximate, so the UI
 * hides the column instead of printing zeroes.
 */
export function gzipAvailable(): boolean {
  return typeof globalThis.CompressionStream === 'function';
}

function libraryOptions(options: AppOptions): Record<string, unknown> {
  const mapped: Record<string, unknown> = {
    preset: options.preset,
    satori: options.satori,
    consolidateStyles: options.consolidateStyles,
    pretty: options.pretty,
    stats: true,
    // Measure-only: the page loads the faces so the browser shapes text
    // correctly, but no font bytes are embedded in the output.
    fontDelivery: 'none',
  };
  // Left to the preset unless the user explicitly asked to keep it, so that
  // `safe` keeps its promise that the file stays re-editable.
  if (options.keepDiagramSource) mapped.stripDiagramSource = false;
  return mapped;
}

export async function optimizeOne(
  file: { id: string; name: string; svg: string },
  options: AppOptions,
): Promise<OptimizeOutcome> {
  const { id, name, svg } = file;
  const empty = { raw: 0, gzip: 0 };
  let fonts: FontReport | undefined;

  // Fonts first: the shaping stage awaits `document.fonts.ready`, so faces that
  // are still in flight when it starts would be measured as a fallback face and
  // place every run wrong, undetectably.
  if (options.useWebfonts && options.satori) {
    try {
      fonts = await ensureFonts(fontNeedsOf(svg));
    } catch {
      // A font that will not load is a fidelity note, not a failure.
    }
  }

  try {
    const { optimizeDrawioSvg } = await import('@moriyoshi/drawio-svg-optimizer/browser');
    const result = await optimizeDrawioSvg(svg, libraryOptions(options));
    return {
      id,
      name,
      original: svg,
      data: result.data,
      before: result.stats.raw
        ? { raw: result.stats.raw.before, gzip: result.stats.gzip.before }
        : empty,
      after: { raw: result.stats.raw.after, gzip: result.stats.gzip.after },
      stages: result.stats.stages,
      warnings: result.warnings,
      ...(fonts === undefined ? {} : { fonts }),
    };
  } catch (error) {
    // The only hard failure the library has is a parse error on input that is
    // not well-formed XML; everything else degrades to a warning.
    const message = error instanceof Error ? error.message : String(error);
    return {
      id,
      name,
      original: svg,
      data: '',
      before: empty,
      after: empty,
      stages: [],
      warnings: [],
      error: /parser|unexpected|whitespace before/i.test(message)
        ? 'This file is not well-formed XML, so it could not be parsed as an SVG.'
        : message,
    };
  }
}

/**
 * Optimize a batch, yielding to the event loop between files.
 *
 * The shaping stage runs on the main thread — it needs `document.body`,
 * `getComputedStyle` and `Range.getClientRects`, none of which exist in a worker
 * — so a batch would otherwise freeze the page with no progress shown. The yield
 * lets each result paint before the next file blocks again.
 */
export async function optimizeAll(
  files: { id: string; name: string; svg: string }[],
  options: AppOptions,
  onResult: (outcome: OptimizeOutcome, index: number) => void,
): Promise<void> {
  for (const [index, file] of files.entries()) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    onResult(await optimizeOne(file, options), index);
  }
}
