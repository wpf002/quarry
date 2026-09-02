import type { ReactNode } from 'react';

export const metadata = {
  title: 'Quarry — human gate',
  description: 'Clear ambiguity, build the allowlist, approve scans.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          background: '#0b0e14',
          color: '#e6e6e6',
        }}
      >
        {children}
      </body>
    </html>
  );
}
