/**
 * Blob URLs for previewing an SVG.
 *
 * Both sides of a before/after comparison must render as **standalone
 * documents**, never as inline SVG in the page. A draw.io export whose labels
 * are `<foreignObject>` renders differently when inlined into HTML: the label
 * boxes are `width="100%" height="100%"` and paint over the shapes, so a large
 * diagram loses more than half its ink. Previewing the "before" that way would
 * show a broken original next to a clean optimized file — flattering the tool
 * and hiding any real regression it introduced.
 *
 * An `<img>` pointed at a blob URL gets the standalone document rendering path,
 * which is also how these files are actually consumed.
 */

export function svgObjectUrl(svg: string): string {
  return URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
}

export function revoke(url: string | undefined): void {
  if (url !== undefined) URL.revokeObjectURL(url);
}

/** Intrinsic size from the root element, for sizing the comparison viewport. */
export function svgDimensions(svg: string): { width: number; height: number } | undefined {
  const width = /<svg[^>]*\bwidth="([\d.]+)/.exec(svg)?.[1];
  const height = /<svg[^>]*\bheight="([\d.]+)/.exec(svg)?.[1];
  if (width !== undefined && height !== undefined) {
    return { width: Number(width), height: Number(height) };
  }
  const viewBox = /<svg[^>]*\bviewBox="[\d.-]+ [\d.-]+ ([\d.]+) ([\d.]+)"/.exec(svg);
  if (viewBox !== null) return { width: Number(viewBox[1]), height: Number(viewBox[2]) };
  return undefined;
}
