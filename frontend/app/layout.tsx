import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Dust',
  description: 'Sweep scattered tokens across chains into a single asset on Base.',
  openGraph: {
    title: 'Dust',
    description: 'Consolidate crypto dust across chains to Base.',
    type: 'website',
  },
  other: {
    'base:app_id': '698594c18dcaa0daf5755f4e',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#000000',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
