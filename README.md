# しるこさんぽ

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

## ランキング（任意）

ランキングは既定でオフです。`NEXT_PUBLIC_SCORES_API` が空のあいだ、ゲームは
スコアをどこへも送らず、ランキングのボタンも出ません。

有効にするには Cloudflare Workers と D1 を用意します。独自ドメインは不要で、
`*.workers.dev` のサブドメインと無料枠で動きます。

```bash
npx wrangler d1 create shiruko-walk
```

出力された `database_id` を `worker/wrangler.toml` に書き、テーブルを作ります。

```bash
npx wrangler d1 execute shiruko-walk --remote --file worker/schema.sql
```

worker を配ります。

```bash
npx wrangler deploy --config worker/wrangler.toml
```

最後に、表示されたURLに `/scores` を付けたものを、GitHub の
**Settings → Secrets and variables → Actions → Variables** に `SCORES_API`
という名前で登録します。次のデプロイからランキングが有効になります。

### 不正対策

スコアはそのままでは信用しません。クライアントは乱数のシードと操作の記録を
一緒に送り、worker が同じエンジンでその回をもう一度再生して、申告どおりの
スコアになる場合だけ登録します（`worker/verify.ts`）。同じ記録の再送は
`run_hash` の一意制約で弾かれます。

これは偽のスコアを送る行為を防ぎますが、うまく自動操作するプログラムまでは
防げません。
