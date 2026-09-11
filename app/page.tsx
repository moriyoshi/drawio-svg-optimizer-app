import type { Metadata } from 'next';
import { REPO_URL, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/site';
import { OptimizerLoader } from './OptimizerLoader';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: SITE_NAME,
  url: SITE_URL,
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Any',
  description: SITE_DESCRIPTION,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  isAccessibleForFree: true,
};

const PASSES = [
  {
    title: 'Drop rasterised label fallbacks',
    body: `When draw.io cannot guarantee a fallback font will render — notably for CJK text — it
      rasterises the label and embeds it as a base64 PNG. On a typical export those images are 91%
      of the file, and around 99% of the achievable gzip win, because already-compressed data is
      something gzip cannot touch. This single pass is most of the value. An <image> anywhere else
      is real diagram content and is never touched.`,
  },
  {
    title: 'Collapse <switch> onto draw.io’s own text',
    body: `Where the export already carries a faithful <text> fallback, the HTML branch is dropped
      and the text hoisted at its exact position. The text-equivalence check is a hard precondition
      rather than a formality: draw.io truncates the fallback with an ellipsis when a label
      overflows its shape, and collapsing onto that would silently corrupt the label.`,
  },
  {
    title: 'Convert HTML labels to SVG text',
    body: `The only way to remove a <foreignObject> from an export that has no text fallback — and
      the only way to make those labels render outside a browser at all. In this app the shaping is
      done by your browser’s own layout engine rather than a reimplementation, and the result is
      checked against draw.io’s own coordinates.`,
  },
  {
    title: 'Collapse the group scaffolding',
    body: `draw.io wraps every shape in several groups that carry nothing. Removing them is asserted
      to be geometrically lossless, not merely to look right: every path’s absolute bounding box is
      resolved through its transforms and required to match exactly.`,
  },
  {
    title: 'Strip editor bookkeeping and unused ids',
    body: `data-cell-id attributes, empty style elements, the redundant transparent-background
      declaration. Referenced ids are collected from url(), href, ARIA attributes, animation timing
      and CSS before anything is removed — a reference that lives only in an @supports rule is
      still a reference.`,
  },
  {
    title: 'Sanitize',
    body: `These files usually come from someone else, so scripts, event handlers, external
      references, SMIL animation and CSS url() are removed by default. Two different risks are being
      prevented: that the document makes this tool fetch something, and that the output turns a
      static picture into a beacon that leaks a viewer’s IP and referrer.`,
  },
];

export default function Page() {
  return (
    <main className="py-8 sm:py-10">
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD from a module-level constant, no user input
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />

      <div className="mb-8 max-w-2xl">
        <h1>Optimize draw.io SVG exports</h1>
        <p className="mt-3 text-muted leading-relaxed">
          An SVG exported from diagrams.net carries a lot that a picture does not need — rasterised
          label fallbacks, editor bookkeeping, and layers of empty groups. Removing them typically
          takes a 500 KB export to around 22 KB, and 354 KB gzipped to under 3 KB.
        </p>
        <p className="mt-3 text-muted leading-relaxed">
          Everything runs in this browser. Your diagram is never uploaded, and there is no server
          holding a copy of it.
        </p>
      </div>

      <OptimizerLoader />

      <section className="mt-16 max-w-2xl">
        <h2>What it does</h2>
        <dl className="mt-4 space-y-5">
          {PASSES.map((pass) => (
            <div key={pass.title}>
              <dt className="font-semibold text-sm">{pass.title}</dt>
              <dd className="mt-1 text-muted text-sm leading-relaxed">{pass.body}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 text-muted text-sm leading-relaxed">
          The passes and the reasoning behind each are documented in full in the{' '}
          <a href={REPO_URL} rel="noopener">
            drawio-svg-optimizer
          </a>{' '}
          repository, which is also available as a command-line tool.
        </p>
      </section>
    </main>
  );
}
