import type { TextSlot } from '../components/Article';
import type { Article, Law } from '../types/law';

/** 条の在りか。chapter が null なら、章に属さない条。 */
export interface Position {
  chapter: number | null;
  article: number;
}

/** 条・章の識別子。条番号とは無関係の不変の値で、恒久リンクに使う。 */
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return `a-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

function emptyArticle(): Article {
  return { id: newId(), caption: '', content: '' };
}

/** 指定した章（または章なし）の条の配列を差し替える。 */
function withArticles(law: Law, chapter: number | null, fn: (list: Article[]) => Article[]): Law {
  if (chapter === null) return { ...law, articles: fn(law.articles ?? []) };
  return {
    ...law,
    chapters: (law.chapters ?? []).map((c, i) =>
      i === chapter ? { ...c, articles: fn(c.articles) } : c,
    ),
  };
}

function getArticles(law: Law, chapter: number | null): Article[] {
  return (chapter === null ? law.articles : law.chapters?.[chapter]?.articles) ?? [];
}

function replaceArticle(law: Law, at: Position, fn: (article: Article) => Article): Law {
  return withArticles(law, at.chapter, (list) =>
    list.map((article, i) => (i === at.article ? fn(article) : article)),
  );
}

const drop = <T,>(list: T[], index: number) => list.filter((_, i) => i !== index);
const insert = <T,>(list: T[], index: number, value: T) => [
  ...list.slice(0, index),
  value,
  ...list.slice(index),
];

/** 空になった配列はキーごと落とす。保存形式に空配列を残さないため。 */
function prune<T>(list: T[]): T[] | undefined {
  return list.length > 0 ? list : undefined;
}

// --- 文字列の書き換え ---

export function setText(law: Law, at: Position, slot: TextSlot, value: string): Law {
  return replaceArticle(law, at, (article) => {
    switch (slot.kind) {
      case 'caption':
        return { ...article, caption: value };
      case 'content':
        return { ...article, content: value };
      case 'item':
        return {
          ...article,
          items: article.items?.map((item, i) => (i === slot.index ? value : item)),
        };
      case 'paragraph':
        return {
          ...article,
          paragraphs: article.paragraphs?.map((p, i) =>
            i === slot.index ? { ...p, content: value } : p,
          ),
        };
      case 'paragraphItem':
        return {
          ...article,
          paragraphs: article.paragraphs?.map((p, i) =>
            i === slot.paragraph
              ? { ...p, items: p.items?.map((item, j) => (j === slot.index ? value : item)) }
              : p,
          ),
        };
    }
  });
}

export function setChapterTitle(law: Law, chapter: number, title: string): Law {
  return {
    ...law,
    chapters: (law.chapters ?? []).map((c, i) => (i === chapter ? { ...c, title } : c)),
  };
}

export function setLawTitle(law: Law, title: string): Law {
  return { ...law, title };
}

// --- 条 ---

export function addArticle(law: Law, chapter: number | null, index: number): Law {
  return withArticles(law, chapter, (list) => insert(list, index, emptyArticle()));
}

export function removeArticle(law: Law, at: Position): Law {
  return withArticles(law, at.chapter, (list) => drop(list, at.article));
}

/**
 * 条を1つ上／下へ動かす。章の端では隣の章へ移る。
 * 「役員」の条だけを別章に切り出す、といった編集ができるようにするため。
 */
export function moveArticle(law: Law, at: Position, delta: -1 | 1): Law {
  const list = getArticles(law, at.chapter);
  const target = at.article + delta;

  if (target >= 0 && target < list.length) {
    return withArticles(law, at.chapter, (current) => {
      const next = [...current];
      [next[at.article], next[target]] = [next[target]!, next[at.article]!];
      return next;
    });
  }

  // 章の端。隣の章があればそちらへ移す。
  if (at.chapter === null || !law.chapters) return law;
  const neighbour = at.chapter + delta;
  if (neighbour < 0 || neighbour >= law.chapters.length) return law;

  const moving = list[at.article];
  if (!moving) return law;

  return {
    ...law,
    chapters: law.chapters.map((chapter, i) => {
      if (i === at.chapter) return { ...chapter, articles: drop(chapter.articles, at.article) };
      if (i === neighbour) {
        return {
          ...chapter,
          articles:
            delta === 1
              ? [moving, ...chapter.articles]
              : [...chapter.articles, moving],
        };
      }
      return chapter;
    }),
  };
}

// --- 章 ---

export function addChapter(law: Law, index: number): Law {
  return {
    ...law,
    chapters: insert(law.chapters ?? [], index, {
      id: newId(),
      title: '',
      articles: [emptyArticle()],
    }),
  };
}

export function removeChapter(law: Law, index: number): Law {
  return { ...law, chapters: drop(law.chapters ?? [], index) };
}

// --- 項と号 ---

export function addParagraph(law: Law, at: Position): Law {
  return replaceArticle(law, at, (article) => ({
    ...article,
    paragraphs: [...(article.paragraphs ?? []), { content: '' }],
  }));
}

export function removeParagraph(law: Law, at: Position, index: number): Law {
  return replaceArticle(law, at, (article) => ({
    ...article,
    paragraphs: prune(drop(article.paragraphs ?? [], index)),
  }));
}

export function addItem(law: Law, at: Position, paragraph: number | null): Law {
  return replaceArticle(law, at, (article) =>
    paragraph === null
      ? { ...article, items: [...(article.items ?? []), ''] }
      : {
          ...article,
          paragraphs: article.paragraphs?.map((p, i) =>
            i === paragraph ? { ...p, items: [...(p.items ?? []), ''] } : p,
          ),
        },
  );
}

export function removeItem(law: Law, at: Position, paragraph: number | null, index: number): Law {
  return replaceArticle(law, at, (article) =>
    paragraph === null
      ? { ...article, items: prune(drop(article.items ?? [], index)) }
      : {
          ...article,
          paragraphs: article.paragraphs?.map((p, i) =>
            i === paragraph ? { ...p, items: prune(drop(p.items ?? [], index)) } : p,
          ),
        },
  );
}
