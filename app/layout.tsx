import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'しるこさんぽ',
  description:
    '岩をよけて、しるこサンドをぱくっ。洞窟を進む縦スクロールの非公式ファンゲーム。キーボードとスマホに対応。',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
