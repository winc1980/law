import { kanji, type Article, type Document, type Paragraph } from "../domain/model";

// 同じ旧IDからは、過去版を読み出しても同じUUIDを得る。新規要素はrandomUUIDを使う。
function legacyUUID(seed: string): string {
  const hex = new Bun.CryptoHasher("sha256").update(`winc-law:v1:${seed}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
type Legacy = Record<string, any>;
export function migrate(raw: Legacy, id: string): Document {
  if (raw.schemaVersion === 1) return raw as Document;
  let number = 0;
  const convertArticle = (a: Legacy, scope = "body"): Article => {
    const key = `${id}/${scope}/article/${a.id ?? number + 1}`;
    const paragraphs = [{ content: a.content, items: a.items }, ...a.paragraphs ?? []].map((p: Legacy, i: number): Paragraph => ({
      uuid: legacyUUID(`${key}/p/${i}`), text: p.content,
      ...(p.items?.length ? { items: p.items.map((text: string, j: number) => ({ uuid: legacyUUID(`${key}/p/${i}/i/${j}`), text })) } : {}),
    }));
    return { uuid: legacyUUID(key), ...(a.id ? { anchor: a.id } : {}), name: `第${kanji(++number)}条`, ...(a.caption ? { caption: a.caption } : {}), paragraphs };
  };
  const body: Exclude<Document["body"], string> = {
    ...(raw.preamble ? { preamble: raw.preamble } : {}),
    ...(raw.chapters ? { chapters: raw.chapters.map((c: Legacy, i: number) => ({ uuid: legacyUUID(`${id}/chapter/${c.id ?? i}`), ...(c.id ? { anchor: c.id } : {}), name: `第${kanji(i + 1)}章`, title: c.title, articles: c.articles.map((a: Legacy) => convertArticle(a)) })) } : { articles: raw.articles.map((a: Legacy) => convertArticle(a)) }),
  };
  const supplements = (raw.supplementaryProvisions ?? []).filter((p: Legacy) => p.articles?.length).map((p: Legacy, i: number) => {
    number = 0;
    return { uuid: legacyUUID(`${id}/supplement/${i}`), title: "附則", articles: p.articles.map((a: Legacy) => convertArticle(a, `supplement/${i}`)) };
  });
  if (supplements.length) body.supplementaryProvisions = supplements;
  return { $schema: "../schema/document.schema.json", schemaVersion: 1, id, uuid: legacyUUID(id), title: raw.title, kind: raw.lawType, status: raw.effect === "廃止" ? "repealed" : "active", body };
}
