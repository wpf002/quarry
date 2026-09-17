import './globals.css';
import type { ReactNode } from 'react';
import { Sidebar } from '../components/Sidebar';

export const metadata = {
  title: 'Quarry',
  description: 'Autonomous bug-bounty engine with a human gate.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <Sidebar />
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
