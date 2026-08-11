/// <reference types="astro/client" />

// 編集ページから GitHub にプルリクエストを出すための設定。ビルド時に埋め込まれる。
// 未設定でもページは動き、その場合は個人アクセストークンを貼ってもらう経路になる。
interface ImportMetaEnv {
  /** GitHub OAuth App の Client ID。 */
  readonly PUBLIC_GH_CLIENT_ID?: string;
  /** Device Flow を中継するエンドポイント。auth/README.md を参照。 */
  readonly PUBLIC_GH_AUTH_ENDPOINT?: string;
}
