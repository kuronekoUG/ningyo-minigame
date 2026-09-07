import type { Metadata } from 'next';
import './globals.css';

const SITE_ORIGIN = 'https://kuronekoug.github.io';
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
// Pages serves the game under a base path, so card URLs are built by hand.
const SITE_URL = `${SITE_ORIGIN}${BASE_PATH}/`;
const OG_IMAGE = `${SITE_ORIGIN}${BASE_PATH}/og.png`;
const TITLE = 'しるこさんぽ';
const DESCRIPTION =
  '岩をよけて、しるこサンドをぱくっ。洞窟を進む縦スクロールの非公式ファンゲーム。キーボードとスマホに対応。';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    type: 'website',
    siteName: TITLE,
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    locale: 'ja_JP',
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: `${TITLE}のタイトル画面`,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
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
