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

### みんなの枚数

`GET /scores/total` が、みんなで集めた枚数の合計を返します。ゲームはそれを
スタート画面とリザルトに「○枚 みんなでたべた」と出します。

名前をつけてボードにのせる回はごく一部なので、合計はランキングとは別に数えます。
1回終わるごとに、ゲームは同じ記録を名前なしで `POST /scores/total` へ送り、
worker はランキングと同じように再生して確かめてから `runs` テーブルに入れます。
`run_hash` が主キーなので、同じ回は二度数えません。つまり合計に入るのは、
worker が確かめた回だけです。ランキングが無効なあいだは、送信も表示もしません。

`runs` は後から足したテーブルなので、すでに動かしているデータベースには
`worker/schema.sql` をもう一度流してください（既存のテーブルはそのままです）。

### 不正対策

スコアはそのままでは信用しません。クライアントは乱数のシードと操作の記録を
一緒に送り、worker が同じエンジンでその回をもう一度再生して、申告どおりの
スコアになる場合だけ登録します（`worker/verify.ts`）。同じ記録の再送は
`run_hash` の一意制約で弾かれます。

これは偽のスコアを送る行為を防ぎますが、うまく自動操作するプログラムまでは
防げません。

### ひとり1つ

ボードに並ぶのは、ひとりにつき1行までです。ブラウザが `localStorage` に持つ
乱数の印を記録と一緒に送り、worker はその印にすでに行があれば、上回ったときだけ
差し替えます。下回った回は登録せず、`kept` を返してゲームが「まえの記録のほうが
上でした。」と伝えます。

この印は誰かを示すものではなく、名前とも結びついていません。サイトデータを消す、
別の端末で遊ぶ、シークレットウィンドウを使う、といった場合は新しい印になるので、
同じ人が2行を持つことはあります。名前で数えないのは、このゲームでは別々の人が
同じ名前を打つほうがずっと多いからです。

`player` 列は後から足したので、すでに動かしているデータベースには一度だけ
入れてください。

```bash
npx wrangler d1 execute shiruko-walk --remote --command "ALTER TABLE scores ADD COLUMN player TEXT"
```

印を持たない古いページからの登録は、これまでどおり1行ずつ増えます。

### 名前

名前は10文字までで、使える文字をひらがな・カタカナ・漢字・英数字と少数の
記号に限っています。許可した文字だけを通すので、幅ゼロ文字や書字方向の
上書き、結合文字の重ねがけといった表示を壊す入力は届きません。あわせて、
ごく基本的な語のリストも弾きます。ただしリストで防げる範囲は限られます。

### 登録の削除

すり抜けたものを消せるように、管理用のトークンを設定します。

```bash
npx wrangler secret put ADMIN_TOKEN --config worker/wrangler.toml
```

削除は id を指定します。id はランキングの取得結果に入っています。

```bash
curl -X DELETE -H "Authorization: Bearer <TOKEN>" https://<worker>/scores/<id>
```

トークンを設定していないあいだ、削除は誰にもできません。
