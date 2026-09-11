import type { Metadata } from 'next';
import { REPO_URL, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/site';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — optimize diagrams.net SVG exports in your browser`,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    url: SITE_URL,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  twitter: { card: 'summary_large_image' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto min-h-screen max-w-content px-4 sm:px-6">
          <header className="flex items-center justify-between gap-4 border-border border-b py-4">
            <a href="/" className="font-semibold text-text no-underline hover:no-underline">
              {SITE_NAME}
            </a>
            <a href={REPO_URL} rel="noopener" className="text-muted text-sm hover:text-accent">
              GitHub
            </a>
          </header>
          {children}
          <footer className="mt-16 border-border border-t py-6 text-faint text-xs">
            Powered by{' '}
            <a href={REPO_URL} rel="noopener">
              drawio-svg-optimizer
            </a>
            . MIT licensed. Your files are processed in this browser and never uploaded.
          </footer>
        </div>
      </body>
    </html>
  );
}
