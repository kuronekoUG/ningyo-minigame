import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: '人魚のしるこサンドさんぽ',
  description:
    '岩をよけて、しるこサンドをぱくっ。人魚と泳ぐ縦スクロールの非公式ファンゲーム。キーボードとスマホに対応。',
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
