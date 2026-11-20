import type { Metadata } from 'next';
import { AccessGate } from '@/components/AccessGate';
import { AppProvider } from '@/lib/app/AppProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Slide Narrator',
  description: 'Turn a PowerPoint deck into a narrated video with a live AI presenter on Agora',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AccessGate>
          <AppProvider>{children}</AppProvider>
        </AccessGate>
      </body>
    </html>
  );
}
