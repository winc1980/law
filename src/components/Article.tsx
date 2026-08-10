import { Fragment, type ReactNode } from 'react';
import { toFullWidthNumeral, toKanjiNumeral } from '../lib/numbering';
import type { Article } from '../types/law';

/** 条文のなかで、書き換えられる文字列の在りか。 */
export type TextSlot =
  | { kind: 'caption' }
  | { kind: 'content' }
  | { kind: 'item'; index: number }
  | { kind: 'paragraph'; index: number }
  | { kind: 'paragraphItem'; paragraph: number; index: number };

/**
 * 文字列の描き方。公開ページはそのまま文字を置き、編集画面は入力欄に差し替える。
 * 描き分けをここ一点に閉じ込めることで、両者のマークアップが食い違わないようにしている。
 */
export type RenderText = (slot: TextSlot, value: string) => ReactNode;

const asPlainText: RenderText = (_slot, value) => value;

interface Props {
  article: Article;
  /** 条の番号。「第1条」など。 */
  label: string;
  renderText?: RenderText;
  /** 恒久リンクの # を出すか。 */
  anchor?: boolean;
  /** 編集画面で見出しの横に置く操作列。 */
  toolbar?: ReactNode;
  /** 号を1つ足すなど、本文の下に置く操作列。 */
  footer?: ReactNode;
}

export default function ArticleView({
  article,
  label,
  renderText = asPlainText,
  anchor = false,
  toolbar,
  footer,
}: Props) {
  const id = `art-${article.id}`;

  return (
    <article className="article" id={id}>
      <h3 className="caption">
        （{renderText({ kind: 'caption' }, article.caption)}）
        {anchor && (
          <a className="anchor" href={`#${id}`} aria-label={`${article.caption}への固定リンク`}>
            #
          </a>
        )}
        {toolbar}
      </h3>

      <div className="para">
        <span className="marker">{label}</span>
        <span className="text">{renderText({ kind: 'content' }, article.content)}</span>
      </div>

      {article.items && article.items.length > 0 && (
        <ol className="items">
          {article.items.map((item, index) => (
            <li key={index}>
              <span className="marker">{toKanjiNumeral(index + 1)}</span>
              <span className="text">{renderText({ kind: 'item', index }, item)}</span>
            </li>
          ))}
        </ol>
      )}

      {/* 項とその号は、条の flex 列に直接並べる。間に要素を挟むと行間が変わる。 */}
      {article.paragraphs?.map((paragraph, index) => (
        <Fragment key={index}>
          <div className="para">
            {/* 第1項は article.content が担うため、項番号は2から始まる */}
            <span className="marker">{toFullWidthNumeral(index + 2)}</span>
            <span className="text">
              {renderText({ kind: 'paragraph', index }, paragraph.content)}
            </span>
          </div>

          {paragraph.items && paragraph.items.length > 0 && (
            <ol className="items">
              {paragraph.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  <span className="marker">{toKanjiNumeral(itemIndex + 1)}</span>
                  <span className="text">
                    {renderText({ kind: 'paragraphItem', paragraph: index, index: itemIndex }, item)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Fragment>
      ))}

      {footer}
    </article>
  );
}
