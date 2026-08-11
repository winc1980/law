# GitHub 認証の中継

編集ページから GitHub にプルリクエストを出すために、OAuth の Device Flow を取り次ぐ小さな
サーバーです。**立てなくても編集ページは動きます**（その場合は個人アクセストークンを貼る経路に
なります）。立てると「GitHub でログイン」だけで提出できるようになります。

## なぜ要るのか

`api.github.com` は CORS を許しているので、フォークもコミットもプルリクエストの作成も
ブラウザから直接叩けます。取り次ぎが要るのは**トークンを取るところだけ**です。

- GitHub Pages は静的なので、OAuth の token 交換を行う場所がない
- Device Flow なら `client_secret` は不要（公開クライアント向けの方式）
- ただし `github.com/login/device/code` と `github.com/login/oauth/access_token` は
  CORS ヘッダを返さないため、ブラウザからは叩けない

そこでこの2つだけを取り次ぎます。秘密は持たず、何も記録しません。

## 立てかた

### 1. OAuth App を登録する

<https://github.com/organizations/winc1980/settings/applications> → **New OAuth App**

| 項目 | 値 |
| --- | --- |
| Application name | WINC 会則 |
| Homepage URL | `https://winc1980.github.io/law/` |
| Authorization callback URL | `https://winc1980.github.io/law/` （Device Flow では使われないが必須） |

登録したら **Enable Device Flow** にチェックを入れて保存します。Client ID を控えます。

> GitHub App ではなく OAuth App を使います。GitHub App のユーザートークンは8時間で切れ、
> 更新の仕組みを別に要するためです。

### 2. Worker を置く

```sh
cd auth
npx wrangler deploy
npx wrangler secret put GITHUB_CLIENT_ID   # 1 で控えた Client ID
```

`https://winc-law-auth.<アカウント>.workers.dev` が出ます。これが中継のエンドポイントです。

`ALLOWED_ORIGINS` は `wrangler.toml` にあります。ここに載っていない出どころからの
要求は 403 で返します。

### 3. 公開ビルドに渡す

リポジトリの **Settings → Secrets and variables → Actions → Variables** に足します。

| 名前 | 値 |
| --- | --- |
| `GH_OAUTH_CLIENT_ID` | 1 で控えた Client ID |
| `GH_AUTH_ENDPOINT` | 2 で出た `https://winc-law-auth.<アカウント>.workers.dev` |

`.github/workflows/deploy.yml` がこれを `PUBLIC_GH_CLIENT_ID` と
`PUBLIC_GH_AUTH_ENDPOINT` としてビルドに渡します。どちらも公開される値です
（Client ID は秘密ではありません）。次の main への push から有効になります。

両方そろっていないビルドでは、編集ページは個人アクセストークンを貼る経路になります。

## 手元で試す

```sh
cd auth
npx wrangler dev            # http://localhost:8787
```

`wrangler.toml` の `ALLOWED_ORIGINS` に `http://localhost:4321` を足したうえで、
リポジトリの root に `.env` を置きます。

```sh
PUBLIC_GH_CLIENT_ID=Ov23li...
PUBLIC_GH_AUTH_ENDPOINT=http://localhost:8787
```

## 口

いずれも `POST`、`Content-Type: application/json`。`client_id` は Worker が持っている
ものに固定され、要求に書かれた値は見ません。

| パス | 送るもの | 返るもの |
| --- | --- | --- |
| `/device/code` | `{}` | `{ device_code, user_code, verification_uri, interval, expires_in }` |
| `/device/token` | `{ device_code }` | `{ access_token }` または `{ error }` |

`error` が `authorization_pending` のあいだは、まだ利用者が承認していないだけです。
`slow_down` が返ったら間隔を延ばします。この扱いは `src/lib/auth.ts` にあります。

## Cloudflare 以外に置く場合

`worker.js` は fetch ハンドラひとつなので、Deno Deploy でもそのまま動きます。
Vercel や Netlify の関数に移す場合も、上の2つの口と CORS の扱いを写せば足ります。
移したら `GH_AUTH_ENDPOINT` を差し替えてください。
