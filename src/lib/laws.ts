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

export interface LawEntry {
  slug: string;
  law: Law;
  chapters: NumberedChapter[];
  /** 章の有無にかかわらず、通し番号を振った全条文。 */
  articles: NumberedArticle[];
  /** 最も新しい附則の施行日。附則がなければ undefined。 */
  lastEffectiveDate: string | undefined;
}

/**
 * 条番号は配列順から採番する。会則が「第6条の義務に違反する行為」のように条番号で
 * 参照しあうため、条の挿入・削除は参照のずれを生む。scripts/validate.mjs が
 * 存在しない条への参照を検出するが、参照先の意味までは見ていない。
 */
function number(law: Law): Pick<LawEntry, 'chapters' | 'articles'> {
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

  for (const article of law.articles ?? []) {
    articles.push({ article, number: articles.length + 1 });
  }

  return { chapters, articles };
}

const modules = import.meta.glob<Law>('../../data/*.json', { eager: true, import: 'default' });

export const laws: LawEntry[] = Object.entries(modules)
  .map(([path, law]) => {
    const slug = path.split('/').pop()!.replace(/\.json$/, '');
    const dates = (law.supplementaryProvisions ?? []).map((p) => p.effectiveDate);
    return {
      slug,
      law,
      ...number(law),
      lastEffectiveDate: dates.length > 0 ? dates.reduce((a, b) => (a > b ? a : b)) : undefined,
    };
  })
  .sort((a, b) => a.slug.localeCompare(b.slug));

export function getLaw(slug: string): LawEntry | undefined {
  return laws.find((entry) => entry.slug === slug);
}
