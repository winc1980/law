import type { Article, Law } from '../types/law';

export interface Change {
  kind: '追加' | '削除' | '変更' | '移動' | '設定';
  label: string;
  detail?: string;
}

interface Placed {
  article: Article;
  number: number;
  chapterTitle?: string;
}

function place(law: Law): Placed[] {
  const out: Placed[] = [];
  for (const chapter of law.chapters ?? []) {
    for (const article of chapter.articles) {
      out.push({ article, number: out.length + 1, chapterTitle: chapter.title });
    }
  }
  for (const article of law.articles ?? []) {
    out.push({ article, number: out.length + 1 });
  }
  return out;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** 条文のどの部分が変わったかを列挙する。 */
function articleParts(before: Article, after: Article): string[] {
  const parts: string[] = [];
  if (before.caption !== after.caption) parts.push(`見出しを「${after.caption}」に変更`);
  if (before.content !== after.content) parts.push('内容を変更');
  if (!same(before.items, after.items)) parts.push('号を変更');
  if (!same(before.paragraphs, after.paragraphs)) parts.push('項を変更');
  if (before.id !== after.id) parts.push(`ID を ${before.id} から ${after.id} に変更`);
  return parts;
}

/**
 * 改正前後を条単位で突き合わせる。条の対応づけは id で行うため、
 * 条番号がずれても「移動」として扱われ、別条の追加・削除にはならない。
 */
export function summarize(before: Law, after: Law): Change[] {
  const changes: Change[] = [];

  // --- 法令そのものの設定 ---
  const fields: [keyof Law, string][] = [
    ['title', 'タイトル'],
    ['lawType', '種別'],
    ['effect', '効力'],
    ['preamble', '前文'],
  ];
  for (const [key, label] of fields) {
    if (!same(before[key], after[key])) {
      const from = before[key] ? `「${before[key]}」` : '（なし）';
      const to = after[key] ? `「${after[key]}」` : '（なし）';
      changes.push({ kind: '設定', label, detail: `${from} → ${to}` });
    }
  }

  // --- 章 ---
  const beforeChapters = new Map((before.chapters ?? []).map((c) => [c.id, c]));
  const afterChapters = new Map((after.chapters ?? []).map((c) => [c.id, c]));
  for (const [id, chapter] of afterChapters) {
    const old = beforeChapters.get(id);
    if (!old) {
      changes.push({ kind: '追加', label: `章「${chapter.title}」` });
    } else if (old.title !== chapter.title) {
      changes.push({ kind: '変更', label: `章「${old.title}」`, detail: `見出しを「${chapter.title}」に変更` });
    }
  }
  for (const [id, chapter] of beforeChapters) {
    if (!afterChapters.has(id)) changes.push({ kind: '削除', label: `章「${chapter.title}」` });
  }

  // --- 条 ---
  const beforeArticles = new Map(place(before).map((p) => [p.article.id, p]));
  const afterArticles = new Map(place(after).map((p) => [p.article.id, p]));

  for (const [id, now] of afterArticles) {
    const old = beforeArticles.get(id);
    if (!old) {
      changes.push({ kind: '追加', label: `第${now.number}条（${now.article.caption}）` });
      continue;
    }

    const parts = articleParts(old.article, now.article);
    if (parts.length > 0) {
      changes.push({
        kind: '変更',
        label: `第${now.number}条（${old.article.caption}）`,
        detail: parts.join('、'),
      });
    }
    if (old.number !== now.number) {
      changes.push({
        kind: '移動',
        label: `第${old.number}条（${now.article.caption}）`,
        detail: `第${now.number}条になります`,
      });
    } else if (old.chapterTitle !== now.chapterTitle) {
      changes.push({
        kind: '移動',
        label: `第${now.number}条（${now.article.caption}）`,
        detail: `「${now.chapterTitle}」章へ移動`,
      });
    }
  }

  for (const [id, old] of beforeArticles) {
    if (!afterArticles.has(id)) {
      changes.push({ kind: '削除', label: `第${old.number}条（${old.article.caption}）` });
    }
  }

  // --- 附則 ---
  if (!same(before.supplementaryProvisions, after.supplementaryProvisions)) {
    const b = before.supplementaryProvisions?.length ?? 0;
    const a = after.supplementaryProvisions?.length ?? 0;
    changes.push({
      kind: a > b ? '追加' : '変更',
      label: '附則',
      detail: a > b ? `${a - b}件追加（全${a}件）` : `全${a}件に変更`,
    });
  }

  return changes;
}

/** 条番号での参照が、改正後も実在する条を指しているかを見る。 */
export function danglingReferences(law: Law): string[] {
  const placed = place(law);
  const out: string[] = [];

  for (const { article, number } of placed) {
    const texts = [
      article.content,
      ...(article.items ?? []),
      ...(article.paragraphs ?? []).flatMap((p) => [p.content, ...(p.items ?? [])]),
    ];
    for (const text of texts) {
      for (const [, n] of text.matchAll(/第(\d+)条/g)) {
        const target = Number(n);
        if (target < 1 || target > placed.length) {
          out.push(`第${number}条（${article.caption}）が、存在しない第${target}条を参照しています`);
        }
      }
    }
  }
  return out;
}
