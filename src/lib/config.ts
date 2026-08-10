// 改正案の提出先。フォークやブランチ名を変えるときはここだけ直す。

import { url } from './url';

export const REPO = {
  owner: 'winc1980',
  name: 'law',
  branch: 'main',
} as const;

export const repoUrl = `https://github.com/${REPO.owner}/${REPO.name}`;

/** 法令 JSON のリポジトリ内パス。 */
export function dataPath(slug: string): string {
  return `data/${slug}.json`;
}

/** GitHub の Web エディタで当該ファイルを開く URL。書き込み権限がなければ自動でフォークされる。 */
export function editUrl(slug: string): string {
  return `${repoUrl}/edit/${REPO.branch}/${dataPath(slug)}`;
}

/** 改正案の編集ページ。プルリクエスト本文から辿れるように絶対 URL で持つ。 */
export function editorUrl(slug: string): string {
  const site = import.meta.env.SITE ?? 'https://winc1980.github.io';
  return new URL(url(`edit/${slug}/`), site).href;
}

/**
 * GitHub 認証の中継。Device Flow の token 交換だけは CORS のためブラウザから
 * 直接叩けないので、小さな中継を1つ挟む（立てかたは auth/README.md）。
 *
 * 未設定のままビルドしても編集ページは動く。その場合は個人アクセストークンを
 * 貼ってもらう経路になる。
 */
export const AUTH = {
  clientId: import.meta.env.PUBLIC_GH_CLIENT_ID ?? '',
  endpoint: (import.meta.env.PUBLIC_GH_AUTH_ENDPOINT ?? '').replace(/\/+$/, ''),
} as const;

export const canSignIn = Boolean(AUTH.clientId && AUTH.endpoint);

/**
 * 個人アクセストークンを作る画面。公開リポジトリへのフォークとプルリクエストには
 * classic の public_repo で足りる。
 */
export const newTokenUrl = `https://github.com/settings/tokens/new?scopes=public_repo&description=${encodeURIComponent(
  'WINC 会則の改正案を提出する',
)}`;
