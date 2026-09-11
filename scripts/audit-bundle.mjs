/**
 * Prove that nothing Node-only — and in particular nothing native — reached the
 * code a browser downloads.
 *
 * The optimizer library is dual-target, and its browser-ness happens entirely at
 * *resolution* time through two mechanisms a bundler can honour independently:
 * the `browser` export condition, which selects `dist/browser/`, and a `browser`
 * field object map, which swaps `svgo` for `svgo/browser`, the gzip module for
 * its `CompressionStream` variant, the Satori shaping stage for the DOM one, and
 * stubs `koffi` / `font-finder` / `get-system-fonts` to `false`.
 *
 * Honour the first but not the second and the build still succeeds. It then
 * fails in the browser: `node:zlib` has no implementation, and harfbuzzjs —
 * reached through Satori — fetches a 382 KB `hb.wasm` relative to the document
 * *at module-evaluation time*, so merely importing the entry point throws a
 * WebAssembly CompileError even when label conversion is switched off. Neither
 * `tsc` nor any unit test sees this; only the emitted bytes do.
 *
 * ## Why grepping the output is the right instrument, not a proxy for one
 *
 * The emitted files *are* what ships, so they are the ground truth for this
 * question rather than a stand-in. The usual objection to grep — that a minifier
 * renames things — does not apply to what is being looked for here. A native
 * addon is reached by handing a literal specifier to a runtime `require`
 * (`createRequire(import.meta.url)('koffi')`), and a bundler cannot rename the
 * contents of that string without breaking it. The same holds for `node:*`
 * specifiers and for any `.node` / `.wasm` path. If the name is absent from the
 * bytes, the code cannot be loaded from them.
 *
 * Binary assets are checked separately, by extension, because a `.wasm` or
 * `.node` file could be emitted alongside the JS rather than named inside it.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

/**
 * Both trees are checked. `.next/static` is what the build produces;
 * `out/_next/static` is what the static export actually publishes, and it is the
 * one a visitor downloads. They should agree, and checking only the first would
 * miss anything the export step adds.
 */
const TREES = ['.next/static', 'out/_next/static'];

const FORBIDDEN = [
  {
    // Generic rather than a list of specific modules: a hand-picked set silently
    // stops covering the library the moment it reaches for a builtin it did not
    // use before.
    //
    // Quoted, because a module specifier is always a string literal in emitted
    // code. Without that anchor this matches minified object properties named
    // `node` — real output contains `{route:P,node:y,...}` and `{node:r,offset:t}`
    // — and a check that cries wolf gets switched off.
    pattern: /["'`]node:[a-z_]+(?:\/[a-z_]+)?["'`]/,
    why: 'a Node built-in was imported — the `browser` field map did not apply',
    fires: 'r=__turbopack_external_require__("node:zlib");e("node:fs/promises")',
    quiet: 'return{status:+!_,route:P,node:y,dynamicRequestTree:N(P,R)}',
  },
  {
    pattern: /\bkoffi\b|@koromix\b/,
    why: 'the koffi native FFI addon was bundled (font registry backend)',
    fires: "return createRequire(import.meta.url)('koffi')",
    quiet: 'const koffee=brewCoffee();',
  },
  {
    // `process.binding` is deliberately absent: Next ships a browser `process`
    // shim whose own `binding` throws `"process.binding is not supported"`, so
    // matching it flags the polyfill that exists to *prevent* native access.
    // `dlopen` is the call that actually loads an addon.
    pattern: /\bcreateRequire\b|process\.dlopen/,
    why: 'a CommonJS/native require escape hatch reached the client',
    fires: 'import{createRequire}from"node:module"',
    quiet: 'o.binding=function(e){throw Error("process.binding is not supported")}',
  },
  {
    pattern: /\.node["'`]/,
    why: 'a compiled .node addon path is referenced',
    fires: 'require("./darwin_arm64/koffi.node")',
    quiet: 'const t=e.parentNode;if(r.node)return r.node',
  },
  {
    pattern: /\bfont-finder\b|\bget-system-fonts\b/,
    why: 'a Node-only font enumeration package was bundled',
    fires: 'import f from"font-finder"',
    quiet: 'const fontFinderUi=null;',
  },
  {
    pattern: /harfbuzz|hb\.wasm/i,
    why: 'the Satori shaping stage was bundled instead of the DOM one',
    fires: 'fetch(new URL("hb.wasm",import.meta.url))',
    quiet: 'const shaper="browser";',
  },
  {
    pattern: /\bfc-match\b|\bfontconfig\b/i,
    why: 'the fontconfig system-font tier was bundled',
    fires: 'execFile("fc-match",["--format=%{file}"])',
    quiet: 'const fcm=0;',
  },
  {
    // Distinctive strings from the library's own Node-only font modules, so a
    // leak is caught even if it arrives under some name not listed above.
    pattern: /CTFontCollectionCreate|DWriteCreateFactory|FcConfigGetCurrent/,
    why: 'a native platform font-registry binding was bundled',
    fires: 'lib.func("CTFontCollectionCreateFromAvailableFonts")',
    quiet: 'const collection=createFontCollection();',
  },
];

/**
 * Every rule must prove it still works before the scan is trusted.
 *
 * This exists because of how the rules were arrived at. The first draft matched
 * bare `node:` and flagged minified object properties (`{route:P,node:y}`), and
 * matched `process.binding`, which only ever appears in Next's browser shim
 * *refusing* it. The obvious response to a noisy rule is to weaken it until the
 * output goes green — at which point the check still passes and no longer
 * detects anything. Pinning each rule to a sample it must catch and a sample it
 * must ignore makes that failure mode loud instead of silent.
 */
function selfTest(rules) {
  const broken = [];
  for (const rule of rules) {
    if (rule.fires === undefined || rule.quiet === undefined) {
      broken.push(`${rule.why}: rule has no canary`);
      continue;
    }
    if (!rule.pattern.test(rule.fires)) broken.push(`${rule.why}: no longer detects a real leak`);
    if (rule.pattern.test(rule.quiet)) broken.push(`${rule.why}: fires on benign minified output`);
  }
  return broken;
}

/** Anything that can carry executable native code, regardless of what names it. */
const FORBIDDEN_ASSETS = new Set(['.node', '.wasm', '.dylib', '.so', '.dll']);

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

const broken = selfTest(FORBIDDEN);
if (broken.length > 0) {
  console.error('The audit rules are no longer trustworthy:\n');
  for (const line of broken) console.error(`  ${line}`);
  process.exit(1);
}

const findings = [];
let scannedText = 0;
let scannedAssets = 0;
const treesSeen = [];

for (const tree of TREES) {
  const absolute = join(ROOT, tree);
  try {
    await stat(absolute);
  } catch {
    continue;
  }
  treesSeen.push(tree);

  for await (const path of walk(absolute)) {
    const shown = relative(ROOT, path);
    const extension = extname(path);

    if (FORBIDDEN_ASSETS.has(extension)) {
      findings.push({ shown, why: `a ${extension} binary was emitted into the client output` });
      scannedAssets += 1;
      continue;
    }
    // Only executable/text formats can name a module; images and fonts cannot.
    // `.map` is deliberately excluded: a source map does not execute, so it
    // cannot load anything, and it embeds original comments — a doc comment that
    // merely mentions `node:zlib` would read as a leak.
    if (!['.js', '.mjs', '.cjs', '.json', '.css'].includes(extension)) continue;

    scannedText += 1;
    const source = await readFile(path, 'utf8');
    for (const { pattern, why } of FORBIDDEN) {
      const hit = pattern.exec(source);
      if (hit !== null) findings.push({ shown, why, match: hit[0] });
    }
  }
}

/**
 * A scan of nothing is not a pass.
 *
 * Found the hard way: a build that failed partway left `.next/static` present
 * but empty, and this reported "clean: 0 files" and exited 0. In CI the failed
 * build stops the job first, so it would not have shipped anything — but an
 * audit that cannot tell "nothing is wrong" from "nothing was examined" is
 * exactly the kind of check people learn to trust and should not.
 */
if (treesSeen.length === 0) {
  console.error('No build output found — run `npm run build` first.');
  process.exit(1);
}

try {
  await stat(join(ROOT, 'out/index.html'));
} catch {
  console.error('out/index.html is missing — the build did not complete, so nothing was audited.');
  process.exit(1);
}

// The real app is several hundred KB across a dozen-odd chunks; single digits
// means a partial or interrupted build rather than a genuinely tiny bundle.
const MINIMUM_FILES = 8;
if (scannedText < MINIMUM_FILES) {
  console.error(
    `Only ${scannedText} files were scanned (expected at least ${MINIMUM_FILES}). ` +
      'The build output looks incomplete, so this run proves nothing.',
  );
  process.exit(1);
}

if (findings.length > 0) {
  console.error('Node-only or native code reached the client bundle:\n');
  for (const finding of findings) {
    console.error(`  ${finding.shown}`);
    console.error(`    ${finding.why}${finding.match ? ` (matched ${finding.match})` : ''}`);
  }
  process.exit(1);
}

console.log(
  `${FORBIDDEN.length} rules self-tested. ` +
    `Client bundle clean: ${scannedText} files across ${treesSeen.join(', ')}, ` +
    `no Node built-ins, no native addons, no wasm.`,
);
if (scannedAssets > 0) process.exit(1);
