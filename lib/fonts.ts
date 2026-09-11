/**
 * Making the browser measure against the *right* faces.
 *
 * The optimizer's browser build shapes labels with the browser's own layout
 * engine, which means it measures against whatever fonts the visitor happens to
 * have installed. That is more faithful than a reimplementation, but it makes
 * output machine-dependent: the same diagram optimized on a Mac and on a Linux
 * box would place its text differently.
 *
 * This module removes that dependence. It works out which families the document
 * asks for, resolves each through the library's own repair/substitution tables,
 * and loads the resulting faces from Google Fonts *under the name the document
 * uses* — an `@font-face` may name its family whatever it likes, so a rule named
 * `Helvetica` whose source is Arimo makes the page's Helvetica resolve to a face
 * everyone can get. Arimo, Tinos and Cousine are metric-compatible with
 * Helvetica/Arial, Times and Courier, so the text lands where draw.io put it.
 *
 * Characters no Latin face can draw are routed to the matching Noto family in
 * the same rule set, distinguished by `unicode-range`, which is how a browser
 * does per-character fallback natively.
 *
 * Everything here is best-effort: a family that will not load is reported and
 * the optimizer falls back to local measurement, which still produces a working
 * file.
 */
import {
  fallbackFamilyFor,
  familiesDeclaredIn,
  repairFamily,
  substituteFamily,
} from 'drawio-svg-optimizer/fonts';

/** Above this, `text=` subsetting is dropped and the whole family is fetched. */
const MAX_SUBSET_CHARS = 500;

export interface FontNeed {
  /** The family name as the document writes it — what the rule must be named. */
  requested: string;
  /** Google Fonts families that will actually supply the glyphs. */
  targets: { family: string; chars: string }[];
  /** False when the substitute has different advance widths, so text reflows. */
  metricCompatible: boolean;
}

export interface LoadedFont {
  /** The family the document asked for. */
  requested: string;
  /** The Google Fonts families actually supplying its glyphs. */
  via: string[];
}

export interface FontReport {
  loaded: LoadedFont[];
  failed: string[];
  /** Requested families whose substitute moves glyphs; surfaced in the UI. */
  reflowed: string[];
}

/**
 * Reject things that are not family names.
 *
 * A CSS family is a quoted string or a run of identifiers — never punctuation
 * like `=` or `{`. The filter matters because a bad name is not inert: Google
 * Fonts answers an unknown family with a 400 that carries no CORS headers, so
 * each one costs a failed request and a console error the page cannot suppress.
 *
 * It has a live source, too. `familiesDeclaredIn` matches `font-family` up to
 * the next `;` or `>`, which is right for a declaration but over-captures a
 * presentation attribute: `font-family="Helvetica" font-size="12px"
 * text-anchor="middle"` arrives as the single family `Helvetica font-size=12px
 * text-anchor=middle`. The clean name is in the set as well — we read the
 * attribute directly — so dropping the malformed twin loses nothing.
 */
function isPlausibleFamily(family: string): boolean {
  if (family.length === 0 || family.length > 64) return false;
  return !/[=<>{};:()[\]"'\\/]/.test(family);
}

/** `"Helvetica, Arial, sans-serif"` -> `["Helvetica", "Arial", "sans-serif"]`. */
function splitFamilies(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim().replace(/^["']|["']$/g, ''))
    .filter((part) => part.length > 0);
}

/**
 * Which face should draw this character.
 *
 * `fallbackFamilyFor` answers "Noto Sans" for any non-ASCII it cannot place in a
 * specific script, but Arimo and friends cover Latin-ext, Greek and Cyrillic
 * perfectly well — and keeping them on the metric-compatible face is the whole
 * point. So only a genuine script match diverts a character.
 */
function targetFor(char: string, latin: string): string {
  const fallback = fallbackFamilyFor(char);
  if (fallback === undefined || fallback === 'Noto Sans') return latin;
  return fallback;
}

/** Every family the document names, and every character it renders. */
export function fontNeedsOf(svg: string): FontNeed[] {
  const { families, characters } = inspect(svg);
  if (characters.size === 0) return [];

  const needs: FontNeed[] = [];
  for (const requested of families) {
    const repaired = repairFamily(requested);
    const substitution = substituteFamily(repaired);
    const latin = substitution?.family ?? repaired;

    const byTarget = new Map<string, string[]>();
    for (const char of characters) {
      const target = targetFor(char, latin);
      const chars = byTarget.get(target);
      if (chars === undefined) byTarget.set(target, [char]);
      else chars.push(char);
    }

    needs.push({
      requested,
      targets: [...byTarget].map(([family, chars]) => ({ family, chars: chars.join('') })),
      // No substitution means the document named a family Google serves directly,
      // so the metrics are the real ones rather than a stand-in's.
      metricCompatible: substitution?.metricCompatible ?? true,
    });
  }
  return needs;
}

/**
 * Families and characters, read out of the parsed document.
 *
 * Parsing rather than pattern-matching because a `font-family` can be written as
 * a presentation attribute, in a `style` attribute, or in a stylesheet rule, and
 * the characters that matter are spread across `<text>` runs and HTML labels.
 */
function inspect(svg: string): { families: Set<string>; characters: Set<string> } {
  const families = new Set<string>();
  const characters = new Set<string>();

  for (const family of familiesDeclaredIn(svg)) families.add(family);

  let document: Document;
  try {
    document = new DOMParser().parseFromString(svg, 'image/svg+xml');
    if (document.querySelector('parsererror') !== null) throw new Error('not well-formed');
  } catch {
    // Malformed input is the optimizer's problem to report, not ours; fall back
    // to what the stylesheet scan already found.
    return { families, characters };
  }

  for (const element of document.querySelectorAll('*')) {
    const attribute = element.getAttribute('font-family');
    if (attribute !== null) for (const family of splitFamilies(attribute)) families.add(family);

    const style = element.getAttribute('style');
    const declared = style === null ? null : /font-family:\s*([^;]+)/.exec(style);
    if (declared !== null) for (const family of splitFamilies(declared[1])) families.add(family);
  }

  // Only text that gets *drawn*. `textContent` on the root would also return the
  // body of every <style>, so a stylesheet's punctuation and hex colours would
  // end up in the `text=` subset — harmless to render, but it bloats the request
  // and can push a real diagram past the subsetting cap for no reason. <title>
  // and <desc> are accessibility metadata and are never painted either.
  const ignored = document.querySelectorAll('style, script, title, desc, metadata');
  for (const element of ignored) element.remove();

  for (const char of document.documentElement.textContent ?? '') {
    // Whitespace needs no glyph and would waste a slot in the subset.
    if (!/\s/.test(char)) characters.add(char);
  }

  // Generic keywords are resolved by the library's tables, not by us, but a bare
  // generic is not a family anyone can load under its own name.
  families.delete('inherit');
  families.delete('initial');
  for (const family of families) {
    if (!isPlausibleFamily(family)) families.delete(family);
  }
  return { families, characters };
}

function subsetUrl(family: string, chars: string): string {
  const name = encodeURIComponent(family).replace(/%20/g, '+');
  const weights = `${name}:wght@400;700`;
  const base = `https://fonts.googleapis.com/css2?family=${weights}`;
  if (chars.length === 0 || chars.length > MAX_SUBSET_CHARS) return base;
  return `${base}&text=${encodeURIComponent(chars)}`;
}

/** `U+41, U+3042, …` — the exact set this face is allowed to draw. */
function unicodeRange(chars: string): string {
  const points = new Set<string>();
  for (const char of chars) points.add(`U+${char.codePointAt(0)?.toString(16)}`);
  return [...points].join(', ');
}

const cssCache = new Map<string, Promise<string | undefined>>();

async function fetchFaceCss(family: string, chars: string): Promise<string | undefined> {
  const url = subsetUrl(family, chars);
  const cached = cssCache.get(url);
  if (cached !== undefined) return cached;

  const pending = (async () => {
    // Google answers a request for weights a family lacks with 400, so a bare
    // family is tried before giving up.
    for (const candidate of [url, url.replace(':wght@400;700', '')]) {
      try {
        const response = await fetch(candidate);
        if (response.ok) return await response.text();
      } catch {
        // Offline, blocked, or refused — reported by the caller.
      }
    }
    return undefined;
  })();

  cssCache.set(url, pending);
  return pending;
}

/**
 * Re-title Google's rules under the name the document uses, and pin each to the
 * characters it is responsible for.
 */
function retarget(css: string, requested: string, chars: string): string {
  const range = unicodeRange(chars);
  return css
    .split('@font-face')
    .map((block, index) => {
      if (index === 0) return block;
      const renamed = block
        .replace(/font-family:\s*(['"])[^'"]*\1/, `font-family: '${requested.replace(/'/g, '')}'`)
        .replace(/unicode-range:[^;}]*;?/g, '');
      // Insert our own range inside the rule body rather than appending after it.
      const close = renamed.lastIndexOf('}');
      if (close < 0) return `@font-face${renamed}`;
      const body = `${renamed.slice(0, close).trimEnd().replace(/;?$/, ';')}unicode-range:${range};`;
      return `@font-face${body}${renamed.slice(close)}`;
    })
    .join('');
}

const injected = new Set<string>();

/**
 * Load every needed face and wait until it is actually available.
 *
 * `document.fonts.ready` alone is not enough: a face declared by a stylesheet is
 * not fetched until something on the page uses it, so the promise can resolve
 * before any bytes have moved. `document.fonts.load()` forces the fetch for a
 * specific family and size, which is the only way to know the face is there
 * before the optimizer starts measuring.
 */
export async function ensureFonts(needs: FontNeed[]): Promise<FontReport> {
  const report: FontReport = { loaded: [], failed: [], reflowed: [] };
  if (needs.length === 0) return report;

  const styles: string[] = [];
  const supplying = new Map<string, string[]>();
  for (const need of needs) {
    if (!need.metricCompatible) report.reflowed.push(need.requested);
    for (const target of need.targets) {
      const key = `${need.requested}|${target.family}|${target.chars}`;
      // Already injected by an earlier file in this batch; the rule is still in
      // the document, so the face is available and counts as supplying.
      if (injected.has(key)) {
        supplying.set(need.requested, [...(supplying.get(need.requested) ?? []), target.family]);
        continue;
      }
      const css = await fetchFaceCss(target.family, target.chars);
      if (css === undefined) {
        report.failed.push(`${need.requested} (${target.family})`);
        continue;
      }
      injected.add(key);
      supplying.set(need.requested, [...(supplying.get(need.requested) ?? []), target.family]);
      styles.push(retarget(css, need.requested, target.chars));
    }
  }

  if (styles.length > 0) {
    const element = document.createElement('style');
    element.dataset.drawioFonts = 'true';
    element.textContent = styles.join('\n');
    document.head.append(element);
  }

  await Promise.all(
    needs.map(async (need) => {
      const via = supplying.get(need.requested);
      if (via === undefined) return;
      const family = `"${need.requested.replace(/"/g, '')}"`;
      try {
        await Promise.all([
          document.fonts.load(`400 16px ${family}`),
          document.fonts.load(`700 16px ${family}`),
        ]);
        report.loaded.push({ requested: need.requested, via: [...new Set(via)] });
      } catch {
        report.failed.push(need.requested);
      }
    }),
  );

  await document.fonts.ready;
  return report;
}
