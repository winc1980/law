// 改正案の提出先。フォークやブランチ名を変えるときはここだけ直す。

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
