import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Anonamoose - PII Redaction Dashboard',
  description: 'Monitor and manage PII redaction for your LLM applications',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
