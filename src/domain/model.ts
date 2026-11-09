import type { Document } from "../generated/document";

export type { Document };
export type Body = Exclude<Document["body"], string>;
export type Chapter = NonNullable<Body["chapters"]>[number];
export type Article = NonNullable<Body["articles"]>[number];
export type Paragraph = Article["paragraphs"][number];
export type Item = NonNullable<Paragraph["items"]>[number];
export type Provision = NonNullable<Body["supplementaryProvisions"]>[number];
export type Identified = { uuid?: string };
export const kinds = [
  "会則",
  "運営規則",
  "執行部公示",
  "執行部決定",
  "その他",
] as const;

export function articles(doc: Document): Article[] {
  return typeof doc.body === "string"
    ? []
    : [
        ...(doc.body.articles ?? []),
        ...(doc.body.chapters ?? []).flatMap((c) => c.articles),
      ];
}

export function nodes(doc: Document): Identified[] {
  const result: Identified[] = [doc];
  if (typeof doc.body === "string") return result;
  result.push(
    ...(doc.body.chapters ?? []),
    ...(doc.body.supplementaryProvisions ?? []),
  );
  for (const a of [
    ...articles(doc),
    ...(doc.body.supplementaryProvisions ?? []).flatMap((p) => p.articles),
  ]) {
    result.push(a);
    for (const p of a.paragraphs) result.push(p, ...(p.items ?? []));
  }
  return result;
}

export function withUUIDs(doc: Document): Document {
  const next = structuredClone(doc);
  for (const node of nodes(next)) node.uuid ??= crypto.randomUUID();
  return next;
}

export function kanji(n: number): string {
  if (n === 0) return "零";
  if (n >= 10000) return String(n);
  let text = "";
  for (const [unit, mark] of [
    [1000, "千"],
    [100, "百"],
    [10, "十"],
    [1, ""],
  ] as const) {
    const digit = Math.floor(n / unit);
    n %= unit;
    if (digit)
      text +=
        (digit === 1 && unit > 1 ? "" : "一二三四五六七八九"[digit - 1]) + mark;
  }
  return text;
}
export const articleAnchor = (a: Article) => `art-${a.anchor ?? a.uuid}`;
export const chapterAnchor = (c: Chapter) => `ch-${c.anchor ?? c.uuid}`;
const keyOrder = [
  "$schema",
  "schemaVersion",
  "id",
  "uuid",
  "anchor",
  "name",
  "title",
  "kind",
  "status",
  "body",
  "preamble",
  "caption",
  "chapters",
  "articles",
  "paragraphs",
  "text",
  "items",
  "supplementaryProvisions",
];
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => {
          const rank = (key: string) =>
            keyOrder.includes(key) ? keyOrder.indexOf(key) : 1000;
          return rank(a) - rank(b) || a.localeCompare(b);
        })
        .map(([key, val]) => [key, canonical(val)]),
    );
  return value;
}
export const serialize = (doc: Document) =>
  JSON.stringify(canonical(doc), null, 2) + "\n";
export const newParagraph = (): Paragraph => ({
  uuid: crypto.randomUUID(),
  text: "",
});
export const newArticle = (name = "新しい条"): Article => ({
  uuid: crypto.randomUUID(),
  name,
  caption: "",
  paragraphs: [newParagraph()],
});
export function newDocument(
  id: string,
  title: string,
  kind: Document["kind"],
  plain: boolean,
): Document {
  return withUUIDs({
    $schema: "../schema/document.schema.json",
    schemaVersion: 1,
    id,
    title,
    kind,
    status: "active",
    body: plain ? "" : { articles: [newArticle("第一条")] },
  });
}
