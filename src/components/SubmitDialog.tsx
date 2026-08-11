import { useEffect, useMemo, useRef, useState } from 'react';
import {
  clearToken,
  readToken,
  requestDeviceCode,
  saveToken,
  waitForToken,
  type DeviceCode,
} from '../lib/auth';
import { canSignIn, editUrl, editorUrl, newTokenUrl, REPO } from '../lib/config';
import type { ReferenceProblem } from '../lib/diff';
import { getViewer, GitHubError, submitProposal, type Proposal, type Viewer } from '../lib/github';
import { commitMessage, proposalBody, proposalBranch, proposalTitle } from '../lib/pr';
import { serializeLaw } from '../lib/serialize';
import type { Problem } from '../lib/validate';
import type { Law } from '../types/law';

interface Props {
  slug: string;
  /** 改正前。プルリクエスト本文の新旧対照表に要る。 */
  original: Law;
  law: Law;
  dataPath: string;
  errors: Problem[];
  problems: ReferenceProblem[];
  changeCount: number;
  onClose: () => void;
  onFocusArticle: (id: string) => void;
}

/**
 * 改正の記録も git に残すため、提出時に附則を1件足す。
 * 議決日と施行日はこの時点では決まらないので空のままにする。
 * 空の施行日が「まだ施行されていない改正案」を意味する。
 */
function withProposal(law: Law, reason: string): Law {
  return {
    ...law,
    supplementaryProvisions: [
      ...(law.supplementaryProvisions ?? []),
      { kind: '一部改正' as const, reason: reason.trim() },
    ],
  };
}

/** ブランチ名の末尾。同じ人が続けて出しても衝突しないようにするだけのもの。 */
function seed(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function SubmitDialog({
  slug,
  original,
  law,
  dataPath,
  errors,
  problems,
  changeCount,
  onClose,
  onFocusArticle,
}: Props) {
  const [reason, setReason] = useState('');
  const [copied, setCopied] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);

  const [token, setToken] = useState(readToken);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [device, setDevice] = useState<DeviceCode | null>(null);
  const [pat, setPat] = useState('');
  const [step, setStep] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Proposal | null>(null);
  const [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);

  const proposed = useMemo(() => withProposal(law, reason), [law, reason]);
  const json = useMemo(() => serializeLaw(proposed, dataPath), [proposed, dataPath]);

  const blocked = errors.length > 0;
  const ready = !blocked && reason.trim().length > 0;

  useEffect(() => {
    dialog.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 開いたままタブを閉じられたときに、承認待ちのポーリングを止める
  useEffect(() => () => abort.current?.abort(), []);

  /** 誰として提出するのかを出す。ついでにトークンが生きているかを確かめる。 */
  useEffect(() => {
    if (!token) {
      setViewer(null);
      return;
    }
    let alive = true;
    getViewer(token).then(
      (who) => alive && setViewer(who),
      (failure) => {
        if (!alive) return;
        clearToken();
        setToken('');
        setError(messageOf(failure));
      },
    );
    return () => {
      alive = false;
    };
  }, [token]);

  async function signIn() {
    setError('');
    const controller = new AbortController();
    abort.current = controller;
    try {
      const code = await requestDeviceCode();
      setDevice(code);
      const next = await waitForToken(code, controller.signal);
      saveToken(next);
      setToken(next);
    } catch (failure) {
      if (!controller.signal.aborted) setError(messageOf(failure));
    } finally {
      setDevice(null);
      abort.current = null;
    }
  }

  function cancelSignIn() {
    abort.current?.abort();
    setDevice(null);
  }

  function signOut() {
    clearToken();
    setToken('');
    setViewer(null);
    setPat('');
  }

  function usePat() {
    const value = pat.trim();
    if (!value) return;
    setError('');
    saveToken(value);
    setToken(value);
  }

  async function submit() {
    setSending(true);
    setError('');
    try {
      const proposal = await submitProposal({
        token,
        upstream: { owner: REPO.owner, name: REPO.name },
        base: REPO.branch,
        path: dataPath,
        content: json,
        branch: proposalBranch(slug, seed()),
        message: commitMessage(law, reason),
        title: proposalTitle(law, reason),
        body: proposalBody({
          before: original,
          after: proposed,
          reason,
          editorUrl: editorUrl(slug),
        }),
        onStep: setStep,
      });
      setResult(proposal);
    } catch (failure) {
      setError(messageOf(failure));
      if (failure instanceof GitHubError && failure.status === 401) {
        clearToken();
        setToken('');
      }
    } finally {
      setSending(false);
      setStep('');
    }
  }

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
    } catch {
      setCopied(false);
      alert('コピーできませんでした。下の「JSON を表示」から手動でコピーしてください。');
    }
  }

  function downloadJson() {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slug}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="submit-heading"
        tabIndex={-1}
        ref={dialog}
      >
        <header>
          <h2 id="submit-heading">{result ? '提出しました' : '改正案を提出する'}</h2>
          <button type="button" onClick={onClose} aria-label="閉じる">
            ✕
          </button>
        </header>

        <div className="dialog-body">
          {result ? (
            <Done result={result} onClose={onClose} />
          ) : blocked ? (
            <div className="blocked" role="alert">
              <h3>提出できません</h3>
              <p>次の項目が未入力です。直してから提出してください。</p>
              <ul>
                {errors.slice(0, 12).map((error, i) => (
                  <li key={i}>
                    {error.articleId ? (
                      <button type="button" className="link" onClick={() => onFocusArticle(error.articleId!)}>
                        {error.where}
                      </button>
                    ) : (
                      <span>{error.where}</span>
                    )}
                    <span>{error.message}</span>
                  </li>
                ))}
              </ul>
              {errors.length > 12 && <p>ほか {errors.length - 12} 件</p>}
            </div>
          ) : (
            <>
              <p className="summary">
                {changeCount}件の変更を提出します。
                {problems.length > 0 && `参照についての警告が${problems.length}件あります。`}
              </p>

              <label className="reason">
                <span className="label">改正の理由（必須）</span>
                <span className="hint">
                  何を、なぜ変えるのかを書いてください。附則として会則に記録され、議決の資料になります。
                  プルリクエストのタイトルにもなります。
                </span>
                <textarea
                  rows={3}
                  value={reason}
                  onChange={(event) => {
                    setReason(event.target.value);
                    setCopied(false);
                  }}
                  placeholder="会費の改定にあわせ、第25条の金額を改める。"
                  disabled={sending}
                />
              </label>

              <p className="note">
                議決日と施行日は、理事会の決議のあとに記入します。いまは空のままで構いません。
              </p>

              {error && (
                <p className="failure" role="alert">
                  {error}
                </p>
              )}

              {device ? (
                <DevicePrompt code={device} onCancel={cancelSignIn} />
              ) : token ? (
                <SignedIn
                  viewer={viewer}
                  ready={ready}
                  sending={sending}
                  step={step}
                  onSubmit={submit}
                  onSignOut={signOut}
                />
              ) : (
                <SignIn pat={pat} onPat={setPat} onSignIn={signIn} onUsePat={usePat} />
              )}

              <details>
                <summary>手で提出する（JSON をコピーして貼り付ける）</summary>
                <div className="manual">
                  <ol className="steps">
                    <li>
                      JSON をコピーして、GitHub の編集画面を開きます。
                      <div className="actions">
                        <button type="button" onClick={copyJson} disabled={!ready}>
                          {copied ? 'コピーしました' : 'JSON をコピー'}
                        </button>
                        <a
                          className="button"
                          href={editUrl(slug)}
                          target="_blank"
                          rel="noreferrer"
                          aria-disabled={!ready}
                        >
                          GitHub の編集画面を開く
                        </a>
                        <button type="button" onClick={downloadJson} disabled={!ready}>
                          ファイルとして保存
                        </button>
                      </div>
                      {!ready && <span className="hint">改正の理由を書くと押せるようになります。</span>}
                    </li>
                    <li>編集画面のテキストをすべて選択して削除し、コピーした JSON を貼り付けます。</li>
                    <li>
                      <strong>Commit changes</strong> を押し、
                      <strong>Create a new branch for this commit and start a pull request</strong>
                      を選びます。書き込み権限がなければ自動でフォークされます。
                    </li>
                  </ol>
                  <details>
                    <summary>JSON を表示</summary>
                    <pre>{json}</pre>
                  </details>
                </div>
              </details>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** 未サインイン。中継が設定されていればログイン、なければトークンを貼ってもらう。 */
function SignIn({
  pat,
  onPat,
  onSignIn,
  onUsePat,
}: {
  pat: string;
  onPat: (value: string) => void;
  onSignIn: () => void;
  onUsePat: () => void;
}) {
  if (canSignIn) {
    return (
      <div className="signin">
        <p>
          GitHub にログインすると、プルリクエストの作成まで自動で行います。
          書き込み権限がなければ、あなたのフォークを経由します。
        </p>
        <div className="actions">
          <button type="button" className="primary" onClick={onSignIn}>
            GitHub でログイン
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="signin">
      <p>
        GitHub の個人アクセストークンを貼ると、プルリクエストの作成まで自動で行います。
        トークンはこのタブを閉じるまでのあいだだけ保持し、どこにも送りません。
      </p>
      <label className="reason">
        <span className="label">個人アクセストークン</span>
        <span className="hint">
          <a href={newTokenUrl} target="_blank" rel="noreferrer">
            GitHub でトークンを作る
          </a>
          （<code>public_repo</code> にチェックが入った状態で開きます）
        </span>
        <input
          type="password"
          value={pat}
          onChange={(event) => onPat(event.target.value)}
          placeholder="ghp_..."
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <div className="actions">
        <button type="button" className="primary" onClick={onUsePat} disabled={!pat.trim()}>
          このトークンを使う
        </button>
      </div>
    </div>
  );
}

/** Device Flow の承認待ち。 */
function DevicePrompt({ code, onCancel }: { code: DeviceCode; onCancel: () => void }) {
  return (
    <div className="signin device" aria-live="polite">
      <p>
        GitHub の画面で次のコードを入力してください。承認されると自動で先に進みます。
      </p>
      <p className="usercode">{code.userCode}</p>
      <div className="actions">
        <a className="button primary" href={code.verificationUri} target="_blank" rel="noreferrer">
          GitHub を開く
        </a>
        <button type="button" onClick={onCancel}>
          やめる
        </button>
      </div>
      <p className="hint">承認を待っています…</p>
    </div>
  );
}

/** サインイン済み。ここから一手で提出できる。 */
function SignedIn({
  viewer,
  ready,
  sending,
  step,
  onSubmit,
  onSignOut,
}: {
  viewer: Viewer | null;
  ready: boolean;
  sending: boolean;
  step: string;
  onSubmit: () => void;
  onSignOut: () => void;
}) {
  return (
    <div className="signin">
      <p className="who">
        {viewer ? (
          <>
            <strong>{viewer.login}</strong> として提出します。
          </>
        ) : (
          'GitHub に接続しています…'
        )}
        <button type="button" className="link" onClick={onSignOut} disabled={sending}>
          切り替える
        </button>
      </p>
      <div className="actions">
        <button type="button" className="primary" onClick={onSubmit} disabled={!ready || sending || !viewer}>
          {sending ? '提出しています…' : 'プルリクエストを作成'}
        </button>
      </div>
      {!ready && !sending && <span className="hint">改正の理由を書くと押せるようになります。</span>}
      {sending && step && (
        <p className="hint" aria-live="polite">
          {step}…
        </p>
      )}
    </div>
  );
}

function Done({ result, onClose }: { result: Proposal; onClose: () => void }) {
  return (
    <>
      <p className="summary">プルリクエスト #{result.number} を作成しました。</p>
      {result.forked && (
        <p className="note">
          リポジトリへの書き込み権限がなかったため、あなたのフォークを経由しました。
        </p>
      )}
      <p>
        会則の変更には理事会の決議が必要です（第26条）。決議のあとに議決日と施行日を書き入れ、
        main へ取り込みます。
      </p>
      <div className="actions">
        <a className="button primary" href={result.url} target="_blank" rel="noreferrer">
          プルリクエストを開く
        </a>
        <button type="button" onClick={onClose}>
          閉じる
        </button>
      </div>
    </>
  );
}
