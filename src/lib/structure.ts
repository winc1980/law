import type { Article, Law } from '../types/law';

export interface NumberedArticle {
  article: Article;
  /** 章をまたいだ通し番号。附則の条文は含めない。 */
  number: number;
}

export interface NumberedChapter {
  id: string;
  title: string;
  number: number;
  articles: NumberedArticle[];
}

export interface NumberedLaw {
  chapters: NumberedChapter[];
  /** 章の有無にかかわらず、通し番号を振った全条文。 */
  articles: NumberedArticle[];
  /** どの章にも属さない条文。 */
  chapterless: NumberedArticle[];
}

/**
 * 条番号は配列順から採番する。会則が「第6条の義務に違反する行為」のように条番号で
 * 参照しあうため、条の挿入・削除は参照のずれを生む。編集画面では、この採番を
 * 打つたびに引き直すことで、繰り下がりがその場で見えるようにしている。
 */
export function numberLaw(law: Law): NumberedLaw {
  const articles: NumberedArticle[] = [];

  const chapters = (law.chapters ?? []).map((chapter, index) => ({
    id: chapter.id,
    title: chapter.title,
    number: index + 1,
    articles: chapter.articles.map((article) => {
      const numbered = { article, number: articles.length + 1 };
      articles.push(numbered);
      return numbered;
    }),
  }));

  const chapterless: NumberedArticle[] = [];
  for (const article of law.articles ?? []) {
    const numbered = { article, number: articles.length + 1 };
    articles.push(numbered);
    chapterless.push(numbered);
  }

  return { chapters, articles, chapterless };
}
