import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Invest Broker Agent',
  description: 'Broker chat interface for policy, party, and knowledge-base questions.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
