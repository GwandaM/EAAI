import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Enterprise AI Agent',
  description: 'Executive chat interface for the Enterprise AI Agent.',
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
