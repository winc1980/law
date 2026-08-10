import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import DiffPane from './DiffPane';
import EditableText from './EditableText';
import LawBody, { type RenderDocumentText } from './LawBody';
import SubmitDialog from './SubmitDialog';
import { articleDiffs, referenceProblems, summarize } from '../lib/diff';
import {
  addArticle,
  addChapter,
  addItem,
  addParagraph,
  moveArticle,
  removeArticle,
  removeChapter,
  removeItem,
  removeParagraph,
  setChapterTitle,
  setLawTitle,
  setText,
  type Position,
} from '../lib/edit';
import { serializeLaw } from '../lib/serialize';
import { describeErrors, validateLaw } from '../lib/validate';
import type { Law } from '../types/law';

interface Props {
  slug: string;
  original: Law;
  dataPath: string;
  backHref: string;
}

const UNDO_LIMIT = 50;

export default function LawEditor({ slug, original, dataPath, backHref }: Props) {
  const [law, setLaw] = useState<Law>(original);
  const [past, setPast] = useState<Law[]>([]);
  /** 取り消しで値を巻き戻したときに、入力欄を作り直すための世代番号。 */
  const [generation, setGeneration] = useState(0);
  const [tab, setTab] = useState<'edit' | 'diff'>('edit');
  const [submitting, setSubmitting] = useState(false);

  /** 差分と検証は入力に少し遅れて追いつけばよい。打鍵のたびに全条を比べない。 */
  const settled = useDeferredValue(law);

  const json = useMemo(() => serializeLaw(law, dataPath), [law, dataPath]);
  const baseline = useMemo(() => serializeLaw(original, dataPath), [original, dataPath]);
  const untouched = json === baseline;

  const meta = useMemo(
    () => summarize(original, settled).filter((change) => change.kind === '設定'),
    [original, settled],
  );
  const articles = useMemo(() => articleDiffs(original, settled), [original, settled]);
  const problems = useMemo(() => referenceProblems(original, settled), [original, settled]);
  const errors = useMemo(() => describeErrors(settled, validateLaw(settled)), [settled]);

  /** 文字を書き換えるだけの変更。取り消しの履歴には積まない。 */
  const edit = useCallback((fn: (law: Law) => Law) => setLaw((current) => fn(current)), []);

  /** 条や章を足す・消す・動かす。取り消せるようにする。 */
  const restructure = useCallback((fn: (law: Law) => Law) => {
    setLaw((current) => {
      setPast((history) => [...history, current].slice(-UNDO_LIMIT));
      return fn(current);
    });
  }, []);

  const undo = useCallback(() => {
    setPast((history) => {
      const previous = history.at(-1);
      if (previous) {
        setLaw(previous);
        setGeneration((n) => n + 1);
      }
      return history.slice(0, -1);
    });
  }, []);

  function focusArticle(id: string) {
    setTab('edit');
    requestAnimationFrame(() => {
      const node = document.getElementById(`art-${id}`);
      node?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      node?.querySelector<HTMLElement>('textarea, input')?.focus();
    });
  }

  const renderText: RenderDocumentText = (slot, value) => {
    if (slot.at === 'chapterTitle') {
      return (
        <EditableText
          value={value}
          multiline={false}
          ariaLabel="章のタイトル"
          placeholder="章のタイトル"
          invalid={!value}
          onChange={(next) => edit((l) => setChapterTitle(l, slot.chapter, next))}
        />
      );
    }

    const at: Position = { chapter: slot.chapter, article: slot.article };
    const isCaption = slot.slot.kind === 'caption';

    return (
      <EditableText
        value={value}
        multiline={!isCaption}
        ariaLabel={isCaption ? '条の見出し' : '条文'}
        placeholder={isCaption ? '見出し' : '本文'}
        invalid={!value}
        onChange={(next) => edit((l) => setText(l, at, slot.slot, next))}
      />
    );
  };

  const changeCount = meta.length + articles.length;

  return (
    <div className="editor" data-tab={tab}>
      <header className="topbar">
        <a className="back" href={backHref} aria-label="会則の閲覧ページに戻る">
          ←
        </a>

        <span className="lawname">
          <EditableText
            value={law.title}
            multiline={false}
            ariaLabel="法令名"
            invalid={!law.title}
            onChange={(next) => edit((l) => setLawTitle(l, next))}
          />
        </span>

        {/* 種別と効力は議決で決まるもので、文書を書き換えて決めるものではない */}
        <span className="chip" title="種別は編集できません">
          {law.lawType}
        </span>
        <span className="chip" data-effect={law.effect} title="効力は議決で決まります">
          {law.effect}
        </span>

        <span className="spacer" />

        <span className="counts">
          <span className="chip" data-count={changeCount > 0 ? 'on' : undefined}>
            変更 {changeCount}件
          </span>
          {problems.length > 0 && (
            <span className="chip warn">警告 {problems.length}件</span>
          )}
          {errors.length > 0 && <span className="chip error">未入力 {errors.length}件</span>}
        </span>

        <button type="button" onClick={undo} disabled={past.length === 0}>
          元に戻す
        </button>
        <button
          type="button"
          className="primary"
          onClick={() => setSubmitting(true)}
          disabled={untouched}
        >
          提出する
        </button>
      </header>

      <div className="tabs" role="tablist" aria-label="編集と差分の切り替え">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'edit'}
          onClick={() => setTab('edit')}
        >
          編集
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'diff'}
          onClick={() => setTab('diff')}
        >
          差分{changeCount > 0 && ` (${changeCount})`}
        </button>
      </div>

      <div className="panes">
        <section className="pane pane-edit" aria-label="本文の編集">
          <div className="pane-inner" key={generation}>
            <LawBody
              law={law}
              renderText={renderText}
              articleToolbar={(at) => (
                <span className="tools">
                  <button type="button" onClick={() => restructure((l) => moveArticle(l, at, -1))}>
                    上へ
                  </button>
                  <button type="button" onClick={() => restructure((l) => moveArticle(l, at, 1))}>
                    下へ
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      if (confirm('この条を削除します。よろしいですか。')) {
                        restructure((l) => removeArticle(l, at));
                      }
                    }}
                  >
                    削除
                  </button>
                </span>
              )}
              articleFooter={(at) => (
                <ArticleFooter law={law} at={at} restructure={restructure} />
              )}
              chapterHeader={(chapter) => (
                <div className="chapter-tools">
                  <button type="button" onClick={() => restructure((l) => addArticle(l, chapter, 0))}>
                    ＋ 章の先頭に条を追加
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      if (confirm('この章を、含まれる条ごと削除します。よろしいですか。')) {
                        restructure((l) => removeChapter(l, chapter));
                      }
                    }}
                  >
                    章を削除
                  </button>
                </div>
              )}
              chapterFooter={(chapter) => (
                <div className="chapter-tools">
                  <button
                    type="button"
                    onClick={() => restructure((l) => addChapter(l, chapter + 1))}
                  >
                    ＋ 下に章を追加
                  </button>
                </div>
              )}
            />
          </div>
        </section>

        <section className="pane pane-diff" aria-label="差分">
          <div className="pane-inner">
            <DiffPane
              meta={meta}
              articles={articles}
              problems={problems}
              onFocusArticle={focusArticle}
            />
          </div>
        </section>
      </div>

      {submitting && (
        <SubmitDialog
          slug={slug}
          law={law}
          dataPath={dataPath}
          errors={errors}
          problems={problems}
          changeCount={changeCount}
          onClose={() => setSubmitting(false)}
          onFocusArticle={(id) => {
            setSubmitting(false);
            focusArticle(id);
          }}
        />
      )}
    </div>
  );
}

function ArticleFooter({
  law,
  at,
  restructure,
}: {
  law: Law;
  at: Position;
  restructure: (fn: (law: Law) => Law) => void;
}) {
  const article =
    at.chapter === null ? law.articles?.[at.article] : law.chapters?.[at.chapter]?.articles[at.article];
  const paragraphCount = article?.paragraphs?.length ?? 0;
  const itemCount = article?.items?.length ?? 0;

  return (
    <div className="article-footer">
      <button type="button" onClick={() => restructure((l) => addItem(l, at, null))}>
        ＋ 号
      </button>
      {itemCount > 0 && (
        <button type="button" onClick={() => restructure((l) => removeItem(l, at, null, itemCount - 1))}>
          − 号
        </button>
      )}
      <button type="button" onClick={() => restructure((l) => addParagraph(l, at))}>
        ＋ 項
      </button>
      {paragraphCount > 0 && (
        <>
          <button
            type="button"
            onClick={() => restructure((l) => addItem(l, at, paragraphCount - 1))}
          >
            ＋ 末尾の項に号
          </button>
          <button
            type="button"
            onClick={() => restructure((l) => removeParagraph(l, at, paragraphCount - 1))}
          >
            − 項
          </button>
        </>
      )}
      <span className="grow" />
      <button
        type="button"
        className="insert"
        onClick={() => restructure((l) => addArticle(l, at.chapter, at.article + 1))}
      >
        ＋ ここに条を追加
      </button>
    </div>
  );
}
