import type { Metadata, Viewport } from 'next';
import { connection } from 'next/server';
import localFont from 'next/font/local';
import './globals.css';
import { SessionProvider } from '@/lib/session';
import AppShell from '@/components/AppShell';

const montserrat = localFont({
  src: [
    { path: './fonts/Montserrat-SemiBold.woff2', weight: '600', style: 'normal' },
    { path: './fonts/Montserrat-ExtraBold.woff2', weight: '800', style: 'normal' },
  ],
  variable: '--font-montserrat',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Virtual Country · First Geospatial',
  description: 'A First Nations-led ICIP platform and living archive. Your Country. Your Knowledge. Your Rules.',
  manifest: '/manifest.webmanifest',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: '#10151B', width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Every page is rendered per request so it can carry that request's script nonce (see proxy.ts).
  await connection();
  return (
    <html lang="en-AU" className={montserrat.variable}>
      <body>
        <SessionProvider>
          <AppShell>
            {children}
          </AppShell>
        </SessionProvider>
      </body>
    </html>
  );
}