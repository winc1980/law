import { numberLaw, type NumberedArticle, type NumberedChapter } from './structure';
import type { Law } from '../types/law';

export type { NumberedArticle, NumberedChapter };

export interface LawEntry {
  slug: string;
  law: Law;
  chapters: NumberedChapter[];
  articles: NumberedArticle[];
  chapterless: NumberedArticle[];
  /** 最も新しい附則の施行日。附則がない、または施行日が未定なら undefined。 */
  lastEffectiveDate: string | undefined;
}

const modules = import.meta.glob<Law>('../../data/*.json', { eager: true, import: 'default' });

export const laws: LawEntry[] = Object.entries(modules)
  .map(([path, law]) => {
    const slug = path.split('/').pop()!.replace(/\.json$/, '');
    const dates = (law.supplementaryProvisions ?? [])
      .map((provision) => provision.effectiveDate)
      .filter((date): date is string => Boolean(date));

    return {
      slug,
      law,
      ...numberLaw(law),
      lastEffectiveDate: dates.length > 0 ? dates.reduce((a, b) => (a > b ? a : b)) : undefined,
    };
  })
  .sort((a, b) => a.slug.localeCompare(b.slug));

export function getLaw(slug: string): LawEntry | undefined {
  return laws.find((entry) => entry.slug === slug);
}
