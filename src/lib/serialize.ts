import type { Article, Law } from '../types/law';

/**
 * 新しく追加された条・章に ID を振る。ID は条番号とは無関係の不変の識別子で、
 * ページ内の恒久リンクに使う。フォームには出していないのでここで補う。
 */
export function fillMissingIds(law: Law, newId: () => string = randomId): Law {
  let changed = false;

  const fixArticles = (articles: Article[] | undefined) =>
    articles?.map((article) => {
      if (article?.id) return article;
      changed = true;
      return { ...article, id: newId() };
    });

  const next: Law = {
    ...law,
    ...(law.articles ? { articles: fixArticles(law.articles) } : {}),
    ...(law.chapters
      ? {
          chapters: law.chapters.map((chapter) => {
            let id = chapter.id;
            if (!id) {
              changed = true;
              id = newId();
            }
            return { ...chapter, id, articles: fixArticles(chapter.articles) ?? [] };
          }),
        }
      : {}),
    ...(law.supplementaryProvisions
      ? {
          supplementaryProvisions: law.supplementaryProvisions.map((provision) =>
            provision.articles
              ? { ...provision, articles: fixArticles(provision.articles) }
              : provision,
          ),
        }
      : {}),
  };

  return changed ? next : law;
}

function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return `a-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

type Json = Record<string, unknown>;

/** undefined・空文字・空配列を落としつつ、指定した順にキーを並べ直す。 */
function pick<T extends object>(source: T, keys: (keyof T)[]): Json {
  const out: Json = {};
  for (const key of keys) {
    const value = source[key];
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key as string] = value;
  }
  return out;
}

function serializeArticle(article: Article): Json {
  const out = pick(article, ['id', 'caption', 'content', 'paragraphs', 'items']);
  if (Array.isArray(out.paragraphs)) {
    out.paragraphs = (out.paragraphs as NonNullable<Article['paragraphs']>).map((paragraph) =>
      pick(paragraph, ['content', 'items']),
    );
  }
  return out;
}

/**
 * data/*.json と同じ書き方に揃える。キーの順序・省略の仕方・インデントを固定して
 * おかないと、内容を変えていないのに差分が出てプルリクエストが読めなくなる。
 */
export function serializeLaw(law: Law, dataPath: string): string {
  const depth = dataPath.split('/').length - 1;

  const out: Json = {
    $schema: `${'../'.repeat(depth)}schema/law.schema.json`,
    ...pick(law, ['title', 'lawType', 'effect', 'preamble']),
  };

  if (law.chapters) {
    out.chapters = law.chapters.map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      articles: chapter.articles.map(serializeArticle),
    }));
  }
  if (law.articles) {
    out.articles = law.articles.map(serializeArticle);
  }

  if (law.supplementaryProvisions?.length) {
    out.supplementaryProvisions = law.supplementaryProvisions.map((provision) => {
      const serialized = pick(provision, [
        'kind',
        'effectiveDate',
        'resolvedOn',
        'resolvedBy',
        'reason',
        'articles',
      ]);
      if (Array.isArray(serialized.articles)) {
        serialized.articles = (serialized.articles as Article[]).map(serializeArticle);
      }
      return serialized;
    });
  }

  return `${JSON.stringify(out, null, 2)}\n`;
}

/** すべての条の id。重複は恒久リンクを壊すため、提出前に弾く。 */
export function collectArticleIds(law: Law): string[] {
  return [
    ...(law.chapters ?? []).flatMap((chapter) => chapter.articles.map((a) => a?.id)),
    ...(law.articles ?? []).map((a) => a?.id),
  ].filter((id): id is string => Boolean(id));
}
