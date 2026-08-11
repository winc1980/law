// GitHub REST API。改正案の提出に要る操作だけを持つ。
//
// api.github.com は CORS を許すので、ここはブラウザから直接叩ける。
// サーバーを挟む必要があるのはトークンを取るところだけ（auth.ts を参照）。

const API = 'https://api.github.com';

export class GitHubError extends Error {
  status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
  }
}

interface Payload {
  message?: string;
  errors?: { message?: string }[];
}

function describe(status: number, payload: Payload | null): string {
  const detail = payload?.errors?.map((e) => e.message).filter(Boolean).join(' / ') || payload?.message;

  switch (status) {
    case 401:
      return 'GitHub に認証されませんでした。もう一度ログインしてください。';
    case 403:
      return detail?.includes('rate limit')
        ? 'GitHub の利用制限にかかりました。しばらく待ってからお試しください。'
        : `GitHub に拒否されました。権限が足りない可能性があります。（${detail ?? status}）`;
    case 404:
      return 'GitHub 上に見つかりませんでした。トークンの権限が足りない可能性があります。';
    case 409:
      return 'GitHub 側の状態と食い違いました。ページを開き直してやり直してください。';
    case 422:
      return `GitHub が内容を受け付けませんでした。（${detail ?? '詳細不明'}）`;
    default:
      return `GitHub との通信に失敗しました。（${status}${detail ? ` ${detail}` : ''}）`;
  }
}

async function api<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new GitHubError('GitHub に接続できませんでした。通信の状態を確かめてください。');
  }

  if (response.status === 204) return undefined as T;

  const payload = (await response.json().catch(() => null)) as Payload | null;
  if (!response.ok) throw new GitHubError(describe(response.status, payload), response.status);
  return payload as T;
}

/** UTF-8 のまま base64 にする。btoa は Latin-1 しか受け取らないので一度バイト列にする。 */
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface Repo {
  owner: string;
  name: string;
}

export interface Viewer {
  login: string;
  name?: string;
  avatarUrl?: string;
}

export async function getViewer(token: string): Promise<Viewer> {
  const user = await api<{ login: string; name: string | null; avatar_url: string }>(token, '/user');
  return { login: user.login, name: user.name ?? undefined, avatarUrl: user.avatar_url };
}

/** ファイルの blob sha。上書きに要る。無ければ null。 */
async function fileSha(token: string, repo: Repo, path: string, ref: string): Promise<string | null> {
  const query = `?ref=${encodeURIComponent(ref)}`;
  try {
    const file = await api<{ sha: string }>(
      token,
      `/repos/${repo.owner}/${repo.name}/contents/${encodeURI(path)}${query}`,
    );
    return file.sha;
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) return null;
    throw error;
  }
}

/**
 * フォークを用意する。すでにあれば GitHub はそれを返す。
 * 作りたてのフォークはしばらく空なので、目当てのファイルが読めるまで待つ。
 */
async function ensureFork(token: string, upstream: Repo, path: string, branch: string): Promise<Repo> {
  const fork = await api<{ owner: { login: string }; name: string }>(
    token,
    `/repos/${upstream.owner}/${upstream.name}/forks`,
    { method: 'POST' },
  );
  // 同名のリポジトリを持っている人のフォークは law-1 のような名前になる
  const repo: Repo = { owner: fork.owner.login, name: fork.name };

  for (let attempt = 0; attempt < 20; attempt++) {
    if (await fileSha(token, repo, path, branch)) return repo;
    await wait(1500);
  }
  throw new GitHubError('フォークの準備が終わりませんでした。少し待ってからもう一度お試しください。');
}

/** フォークを本家に追いつかせる。追いつけなくても提出はできるので、失敗は握る。 */
async function syncFork(token: string, repo: Repo, branch: string): Promise<void> {
  try {
    await api(token, `/repos/${repo.owner}/${repo.name}/merge-upstream`, {
      method: 'POST',
      body: JSON.stringify({ branch }),
    });
  } catch {
    // 本家と枝分かれしている場合など。古い土台の上に載るだけで、提出自体は通る。
  }
}

export interface ProposalInput {
  token: string;
  /** 提出先。config.ts の REPO。 */
  upstream: Repo;
  /** 取り込み先のブランチ。 */
  base: string;
  /** 書き換えるファイル。 */
  path: string;
  content: string;
  /** 作るブランチの名前。 */
  branch: string;
  message: string;
  title: string;
  body: string;
  /** 進み具合の報せ。時間がかかるのはフォークの用意なので、黙って待たせない。 */
  onStep?: (step: string) => void;
}

export interface Proposal {
  url: string;
  number: number;
  /** フォークを経由したか。書き込み権限があれば false。 */
  forked: boolean;
}

/**
 * 改正案をプルリクエストとして出す。
 *
 * 書き込み権限があれば本家に直接ブランチを切り、なければフォークを用意して
 * そちらに切る。どちらの場合も、取り込み先は本家の main。
 */
export async function submitProposal(input: ProposalInput): Promise<Proposal> {
  const { token, upstream, base, path, branch, onStep = () => {} } = input;

  onStep('GitHub に接続しています');
  // トークンが通らなければここで 401 になる
  const info = await api<{ permissions?: { push?: boolean } }>(
    token,
    `/repos/${upstream.owner}/${upstream.name}`,
  );

  const canPush = info.permissions?.push === true;
  let head: Repo = upstream;

  if (!canPush) {
    onStep('フォークを用意しています');
    head = await ensureFork(token, upstream, path, base);
    await syncFork(token, head, base);
  }

  onStep('ブランチを作成しています');
  const ref = await api<{ object: { sha: string } }>(
    token,
    `/repos/${head.owner}/${head.name}/git/ref/${encodeURI(`heads/${base}`)}`,
  );
  await api(token, `/repos/${head.owner}/${head.name}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: ref.object.sha }),
  });

  onStep('会則を書き換えています');
  const sha = await fileSha(token, head, path, branch);
  await api(token, `/repos/${head.owner}/${head.name}/contents/${encodeURI(path)}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: input.message,
      content: toBase64(input.content),
      branch,
      ...(sha ? { sha } : {}),
    }),
  });

  onStep('プルリクエストを作成しています');
  const pull = await api<{ html_url: string; number: number }>(
    token,
    `/repos/${upstream.owner}/${upstream.name}/pulls`,
    {
      method: 'POST',
      body: JSON.stringify({
        title: input.title,
        body: input.body,
        head: canPush ? branch : `${head.owner}:${branch}`,
        base,
        maintainer_can_modify: true,
      }),
    },
  );

  return { url: pull.html_url, number: pull.number, forked: !canPush };
}
