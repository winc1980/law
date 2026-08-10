import { useEffect, useMemo, useRef, useState } from 'react';
import { editUrl } from '../lib/config';
import type { ReferenceProblem } from '../lib/diff';
import { serializeLaw } from '../lib/serialize';
import type { Problem } from '../lib/validate';
import type { Law } from '../types/law';

interface Props {
  slug: string;
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

export default function SubmitDialog({
  slug,
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

  const json = useMemo(
    () => serializeLaw(withProposal(law, reason), dataPath),
    [law, reason, dataPath],
  );

  const blocked = errors.length > 0;
  const ready = !blocked && reason.trim().length > 0;

  useEffect(() => {
    dialog.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
          <h2 id="submit-heading">改正案を提出する</h2>
          <button type="button" onClick={onClose} aria-label="閉じる">
            ✕
          </button>
        </header>

        <div className="dialog-body">
          {blocked ? (
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
                </span>
                <textarea
                  rows={3}
                  value={reason}
                  onChange={(event) => {
                    setReason(event.target.value);
                    setCopied(false);
                  }}
                  placeholder="会費の改定にあわせ、第25条の金額を改める。"
                />
              </label>

              <p className="note">
                議決日と施行日は、理事会の決議のあとに記入します。いまは空のままで構いません。
              </p>

              <ol className="steps">
                <li>
                  JSON をコピーして、GitHub の編集画面を開きます。
                  <div className="actions">
                    <button type="button" className="primary" onClick={copyJson} disabled={!ready}>
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
                <li>会則の変更には理事会の決議が必要です。決議を経てから取り込まれます。</li>
              </ol>

              <details>
                <summary>JSON を表示</summary>
                <pre>{json}</pre>
              </details>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
