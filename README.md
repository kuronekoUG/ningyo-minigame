# 人魚のしるこサンドさんぽ

洞窟の岩をよけながら、しるこサンドを集めるブラウザゲームです。

## ローカル起動

```bash
npm ci
npm run dev
```

## GitHub Pagesへの公開

`main` ブランチへpushすると、`.github/workflows/deploy-pages.yml` が静的サイトをビルドしてGitHub Pagesへ公開します。

1. GitHubにリポジトリを作成して、このプロジェクトをpushします。
2. リポジトリの **Settings → Pages → Build and deployment** で **GitHub Actions** を選びます。
3. 独自ドメインを使う場合は、同じPages設定画面の **Custom domain** にホスト名を入力し、ドメイン管理側へ案内されたDNSレコードを追加します。

GitHub Pagesの標準URLと独自ドメインのどちらでも画像が読み込めるよう、ビルド時にPagesのベースパスを自動設定します。
