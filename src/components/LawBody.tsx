import type { ReactNode } from 'react';
import ArticleView, { type RenderText, type TextSlot } from './Article';
import { toJapaneseEra } from '../lib/era';
import { toKanjiNumeral } from '../lib/numbering';
import { numberLaw } from '../lib/structure';
import type { Law } from '../types/law';

/** 法令のどこにある文字列かを、条を跨いで指し示すための位置。 */
export type DocumentSlot =
  | { at: 'chapterTitle'; chapter: number }
  | { at: 'article'; chapter: number | null; article: number; slot: TextSlot };

export type RenderDocumentText = (slot: DocumentSlot, value: string) => ReactNode;

interface Props {
  law: Law;
  /** 文字列の描き方。省略すると読むだけの表示になる。 */
  renderText?: RenderDocumentText;
  /** 条の見出し横に置く操作列。編集画面から渡す。 */
  articleToolbar?: (position: { chapter: number | null; article: number }) => ReactNode;
  /** 条の末尾に置く操作列。 */
  articleFooter?: (position: { chapter: number | null; article: number }) => ReactNode;
  /** 章見出しの直後に差し込む要素。 */
  chapterHeader?: (chapter: number) => ReactNode;
  /** 章の末尾に差し込む要素。 */
  chapterFooter?: (chapter: number) => ReactNode;
  /** 恒久リンクの # を出すか。公開ページだけ true。 */
  anchors?: boolean;
}

/**
 * 「本会則は、令和4年4月1日（一部改正）から施行する。」を組み立てる。
 * 施行日がないのは、まだ議決されていない改正案。
 */
function provisionSentence(subject: string, kind: string, effectiveDate?: string): string {
  const suffix = kind === '制定' ? '' : `（${kind}）`;
  if (!effectiveDate) return `${subject}の${kind}。施行日は未定（審議中）。`;
  return `${subject}は、${toJapaneseEra(effectiveDate)}${suffix}から施行する。`;
}

export default function LawBody({
  law,
  renderText,
  articleToolbar,
  articleFooter,
  chapterHeader,
  chapterFooter,
  anchors = false,
}: Props) {
  const { chapters, chapterless } = numberLaw(law);
  const subject = law.lawType === '会則' ? '本会則' : '本規則';

  const textFor = (chapter: number | null, article: number): RenderText | undefined =>
    renderText && ((slot, value) => renderText({ at: 'article', chapter, article, slot }, value));

  return (
    <div className="lawdoc">
      {chapters.map((chapter, chapterIndex) => (
        <section
          key={chapter.id}
          className="chapter"
          id={`ch-${chapter.id}`}
          aria-labelledby={`ch-${chapter.id}-heading`}
        >
          <h2 id={`ch-${chapter.id}-heading`}>
            <span className="ch-number">第{toKanjiNumeral(chapter.number)}章</span>
            {renderText
              ? renderText({ at: 'chapterTitle', chapter: chapterIndex }, chapter.title)
              : chapter.title}
          </h2>
          {chapterHeader?.(chapterIndex)}
          <div className="articles">
            {chapter.articles.map(({ article, number }, articleIndex) => (
              <ArticleView
                key={article.id}
                article={article}
                label={`第${number}条`}
                anchor={anchors}
                renderText={textFor(chapterIndex, articleIndex)}
                toolbar={articleToolbar?.({ chapter: chapterIndex, article: articleIndex })}
                footer={articleFooter?.({ chapter: chapterIndex, article: articleIndex })}
              />
            ))}
          </div>
          {chapterFooter?.(chapterIndex)}
        </section>
      ))}

      {chapterless.length > 0 && (
        <div className="articles articles-flat">
          {chapterless.map(({ article, number }, articleIndex) => (
            <ArticleView
              key={article.id}
              article={article}
              label={`第${number}条`}
              anchor={anchors}
              renderText={textFor(null, articleIndex)}
              toolbar={articleToolbar?.({ chapter: null, article: articleIndex })}
              footer={articleFooter?.({ chapter: null, article: articleIndex })}
            />
          ))}
        </div>
      )}

      {law.supplementaryProvisions && law.supplementaryProvisions.length > 0 && (
        <section
          className="supplementary"
          id="supplementary-provisions"
          aria-labelledby="supplementary-heading"
        >
          <h2 id="supplementary-heading">附則</h2>
          <ol className="list">
            {law.supplementaryProvisions.map((provision, index) => (
              <li key={index}>
                <p className="sentence">
                  {provisionSentence(subject, provision.kind, provision.effectiveDate)}
                </p>
                {(provision.resolvedOn || provision.resolvedBy || provision.reason) && (
                  <p className="meta">
                    {provision.resolvedOn && `${toJapaneseEra(provision.resolvedOn)} `}
                    {provision.resolvedBy && `${provision.resolvedBy}議決`}
                    {provision.reason && ` / ${provision.reason}`}
                  </p>
                )}
                {provision.articles?.map((article, articleIndex) => (
                  <ArticleView
                    key={article.id}
                    article={article}
                    label={`第${articleIndex + 1}条`}
                  />
                ))}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
