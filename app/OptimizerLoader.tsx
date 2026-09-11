'use client';

import dynamic from 'next/dynamic';

/**
 * Keep the optimizer out of the server graph entirely.
 *
 * `ssr: false` is doing real work here, not just deferring a payload. The
 * library's `browser` export condition resolves to a build whose imports are
 * then rewritten by a `browser` field *object map* — and a bundler only applies
 * that map when it is targeting a browser. In the server pass Next resolves the
 * browser entry point but keeps the Node shaping stage it re-exports, which
 * drags in the filesystem font tiers and fails to build. There is nothing for a
 * server to render here anyway: the tool has no state until a file is dropped.
 *
 * `ssr: false` is only permitted from a Client Component, which is why this
 * one-line wrapper exists between the server page and the tool.
 */
const Optimizer = dynamic(() => import('./Optimizer').then((module) => module.Optimizer), {
  ssr: false,
  loading: () => (
    <div className="rounded-lg border-2 border-border-strong border-dashed px-6 py-12 text-center text-muted">
      Loading…
    </div>
  ),
});

export function OptimizerLoader() {
  return <Optimizer />;
}
