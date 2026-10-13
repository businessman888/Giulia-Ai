import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'Wan Studio', description: 'Estúdio privado de geração de vídeos com referências multimídia' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
