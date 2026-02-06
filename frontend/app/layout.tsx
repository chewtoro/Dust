import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';

const APP_URL = 'https://frontend-ten-silk-23.vercel.app';

export const metadata: Metadata = {
  title: 'Dust',
  description: 'Sweep scattered tokens across chains into a single asset on Base.',
  openGraph: {
    title: 'Dust',
    description: 'Consolidate crypto dust across chains to Base.',
    type: 'website',
    images: [`${APP_URL}/og.png`],
  },
  other: {
    // Farcaster Frame meta tags
    'fc:frame': 'vNext',
    'fc:frame:image': `${APP_URL}/og.png`,
    'fc:frame:image:aspect_ratio': '1.91:1',
    'fc:frame:button:1': 'Open Dust',
    'fc:frame:button:1:action': 'launch_frame',
    'fc:frame:button:1:target': APP_URL,
    // Farcaster Mini App embed meta tag
    'fc:miniapp': JSON.stringify({
      version: "next",
      imageUrl: `${APP_URL}/og.png`,
      button: {
        title: "Open Dust",
        action: {
          type: "launch_frame",
          url: APP_URL
        }
      }
    }),
    // Base mini app
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
