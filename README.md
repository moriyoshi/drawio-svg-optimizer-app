# drawio-svg-optimizer-app

A web front end for [drawio-svg-optimizer](https://github.com/moriyoshi/drawio-svg-optimizer).
Drop an SVG exported from diagrams.net, get a much smaller one back.

**Everything runs in the browser.** No file is ever uploaded and there is no
server-side component — `next build` emits a static site. On the reference
export that is 504 KB → 17 KB raw, and 346 KB → 2.6 KB gzipped.

```bash
npm install
npm run dev         # http://localhost:3250
```

## The library dependency

`drawio-svg-optimizer` is not on npm yet, so `package.json` depends on the
GitHub repository directly:

```json
"drawio-svg-optimizer": "github:moriyoshi/drawio-svg-optimizer"
```

npm clones it, runs the package's own `prepare` (`npm run build`) to produce
`dist/`, and installs the result as a real directory under `node_modules` — so
the package's `exports` subpaths resolve normally. A local directory spec
(`file:../drawio-svg-optimizer`) is **not** usable in its place: npm turns it
into a symlink, the resolved path lands outside `node_modules`, and Turbopack
then cannot resolve the subpaths at all —

```
Module not found: Can't resolve 'drawio-svg-optimizer/browser'
```

The spec tracks `main`; the exact commit is pinned by `package-lock.json`, so
`npm ci` is reproducible and picking up library changes is a deliberate
`npm update drawio-svg-optimizer`. The lock records the resolved URL as
`git+ssh://`, which is just how npm normalises a GitHub spec — npm falls back to
HTTPS for public repositories, so CI installs without an SSH key (verified with
`npm ci` against a cold cache and `GIT_SSH_COMMAND=false`).

Switch the spec to a version range once the package is published.

## Why `npm run audit:bundle` exists

The optimizer library is dual-target, and its browser-ness happens entirely at
*resolution* time via two mechanisms a bundler can honour independently:

1. the `browser` **export condition**, selecting `dist/browser/`
2. the `browser` **field object map**, swapping `svgo` → `svgo/browser`, the gzip
   module for its `CompressionStream` variant, the Satori shaping stage for the
   DOM one, and stubbing `koffi` / `font-finder` / `get-system-fonts` to `false`

Honour the first but not the second and the build still succeeds, then fails in
the browser. Neither `tsc` nor any unit test sees this; only the emitted bytes do.

The audit scans both `.next/static` and `out/_next/static` — the latter is what a
visitor actually downloads — for Node built-in specifiers, `koffi` and other
native-require escape hatches, `.node` addon paths, the Node-only font packages,
the harfbuzz/wasm shaping stack, and any emitted `.wasm` / `.node` / `.dylib` /
`.so` binary. It runs on every build and **gates the deploy**.

Grepping the output is the ground truth here rather than a proxy for it: a native
addon is reached by handing a literal specifier to a runtime `require`
(`createRequire(import.meta.url)('koffi')`), and a bundler cannot rename the
contents of that string without breaking it. If the name is absent from the bytes,
the code cannot be loaded from them.

Two things keep the check honest, both learned by getting them wrong first:

- **Every rule self-tests.** Each carries a sample it must catch and a sample it
  must ignore. The first draft matched bare `node:` and flagged minified object
  properties (`{route:P,node:y}`), and matched `process.binding`, which only
  appears in Next's browser shim *refusing* it. The natural response to a noisy
  rule is to weaken it until the output goes green — after which it passes and
  detects nothing. The canaries make that loud.
- **A scan of nothing is not a pass.** A build that failed partway left
  `.next/static` present but empty, and the audit reported "clean: 0 files" and
  exited 0. It now requires `out/index.html` and a plausible file count.

There is deliberately **no `fs` alias** in the Next config. With the map applied,
satori, harfbuzz and yoga contribute zero modules, so the dead `require("fs")`
that used to need stubbing is unreachable — and stubbing it would mask exactly the
failure the audit exists to catch.

`app/OptimizerLoader.tsx` exists for the same family of reasons: a bundler only
applies the `browser` field map when targeting a browser, so in the server pass
Next resolved the browser entry point but kept the Node shaping stage it
re-exports, which drags in the filesystem font tiers and fails to build.
`ssr: false` keeps the whole subtree out of the server graph.

## Fonts

With label conversion on, the browser shapes text with whatever fonts the
*visitor* has — so the same diagram would optimize differently on different
machines. `lib/fonts.ts` removes that dependence: it works out which families the
document asks for, resolves each through the library's own repair/substitution
tables (`drawio-svg-optimizer/fonts`), and loads the result from Google Fonts
*under the name the document uses*. An `@font-face` may name its family whatever
it likes, so a rule named `Helvetica` whose source is Arimo makes the page's
Helvetica resolve to a face everyone can get — and Arimo, Tinos and Cousine are
metric-compatible with Helvetica/Arial, Times and Courier, so text lands where
draw.io put it.

Characters no Latin face can draw are routed to the matching Noto family within
the same rule set, separated by `unicode-range`, which is how a browser does
per-character fallback natively.

Nothing is embedded in the output — this is measurement only. The user can turn
it off, in which case measurement falls back to local fonts and the
`fonts-measured-locally` warning is surfaced as-is.

## Scripts

| | |
| --- | --- |
| `npm run dev` | dev server on :3250 |
| `npm run build` | static export to `out/` |
| `npm run start` | serve `out/` — no Next runtime needed |
| `npm run audit:bundle` | fail if Node-only code reached the client |
| `npm run check` / `check:fix` | Biome |
| `npm run typecheck` | tsc |

## Deploying

`npm run build` produces `out/`, a plain static site. It is served by a Cloudflare
Worker with static assets — **not** Cloudflare Pages. Cloudflare folded Pages into
Workers: `wrangler pages ...` now prints *"Delegating to the latest version of
Cloudflare Pages, now part of Cloudflare Workers"*, and reaching the old product
needs an explicit `--force` whose own message calls it "the previous version". So
this targets what that delegation lands on rather than a path being sunset.

There is no Worker script — `wrangler.jsonc` declares only `assets` and the custom
domain. Because everything is client-side, none of the optimizer's
Node concerns (`koffi`, the on-disk font cache, subprocess font lookup) are in play.

| | |
| --- | --- |
| Production | `drawio-svg-optimizer.app`, deployed from `main` |
| Locally | `npm run deploy` — builds, audits the bundle, then `wrangler deploy` |

`.github/workflows/deploy.yml` runs Biome and `tsc` first, then builds, then runs
`audit:bundle` — which **gates the deploy**, because a client bundle that quietly
picked up the Node build would still compile and only fail in a visitor's browser.
A push to `main` runs `wrangler deploy`; a pull request runs `wrangler versions
upload`, which returns a preview URL without promoting it, so nothing a PR does can
change what production serves. The preview URL is posted as a rolling PR comment.

### One-time setup

The workflow needs a repository secret `CLOUDFLARE_API_TOKEN`, created at
<https://dash.cloudflare.com/profile/api-tokens> with:

- **Account → Workers Scripts → Edit**
- **Zone → Workers Routes → Edit**, scoped to `drawio-svg-optimizer.app`, so the
  custom domain declared in `wrangler.jsonc` can be attached

The local `wrangler login` OAuth credential is a different thing and cannot be used
from CI.

`wrangler.jsonc` intentionally carries no `account_id`: wrangler infers the account
when the token can reach exactly one. If the token can reach several, the deploy
fails and lists them — add the right one as a repository variable
`CLOUDFLARE_ACCOUNT_ID` and pass it to the wrangler-action steps as `accountId`. It
is not a secret.
