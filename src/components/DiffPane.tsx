import type { ArticleDiff, Change, ReferenceProblem } from '../lib/diff';
import { diffText, sideOf, type Piece } from '../lib/textdiff';

interface Props {
  meta: Change[];
  articles: ArticleDiff[];
  problems: ReferenceProblem[];
  onFocusArticle: (id: string) => void;
}

function Pieces({ pieces, side }: { pieces: Piece[]; side: 'before' | 'after' }) {
  const shown = sideOf(pieces, side);
  if (shown.length === 0) return <span className="empty">（なし）</span>;

  return (
    <>
      {shown.map((piece, i) =>
        piece.kind === 'same' ? (
          <span key={i}>{piece.text}</span>
        ) : (
          <mark key={i} className={piece.kind === 'removed' ? 'removed' : 'added'}>
            {piece.text}
          </mark>
        ),
      )}
    </>
  );
}

function articleLabel(diff: ArticleDiff): string {
  const caption = diff.caption || '見出しなし';
  if (diff.kind === '追加') return `第${diff.numberAfter}条（${caption}）`;
  if (diff.kind === '削除') return `第${diff.numberBefore}条（${caption}）`;
  if (diff.numberBefore !== diff.numberAfter) {
    return `第${diff.numberBefore}条 → 第${diff.numberAfter}条（${caption}）`;
  }
  return `第${diff.numberAfter}条（${caption}）`;
}

export default function DiffPane({ meta, articles, problems, onFocusArticle }: Props) {
  const empty = meta.length === 0 && articles.length === 0;

  return (
    <div className="diff">
      {problems.length > 0 && (
        <div className="diff-problems" role="alert">
          <h3>確認してください</h3>
          <ul>
            {problems.map((problem, i) => (
              <li key={i}>
                <span className="tag">{problem.kind === 'ずれ' ? '参照ずれ' : '参照不明'}</span>
                <button type="button" onClick={() => onFocusArticle(problem.articleId)}>
                  {problem.message}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {empty && (
        <p className="diff-empty">
          まだ変更はありません。左側の本文を書き換えると、変わった箇所がここに並びます。
        </p>
      )}

      {meta.length > 0 && (
        <div className="diff-card">
          <header>
            <span>この規則について</span>
          </header>
          {meta.map((change, i) => (
            <div key={i} className="diff-row">
              <span className="tag">{change.label}</span>
              <span>{change.detail}</span>
            </div>
          ))}
        </div>
      )}

      {articles.map((diff) => (
        <div key={diff.id} className="diff-card">
          <header>
            <button type="button" className="link" onClick={() => onFocusArticle(diff.id)}>
              {articleLabel(diff)}
            </button>
            <span className="kind" data-kind={diff.kind}>
              {diff.kind}
            </span>
          </header>

          {diff.lines.map((line, i) => {
            const pieces = diffText(line.before ?? '', line.after ?? '');
            return (
              <div key={i} className="diff-line">
                <span className="where">{line.label}</span>
                {line.before !== undefined && (
                  <div className="diff-row">
                    <span className="tag">現行</span>
                    <span>
                      <Pieces pieces={pieces} side="before" />
                    </span>
                  </div>
                )}
                {line.after !== undefined && (
                  <div className="diff-row">
                    <span className="tag">改正案</span>
                    <span>
                      <Pieces pieces={pieces} side="after" />
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
