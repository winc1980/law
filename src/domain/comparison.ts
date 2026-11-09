import { compare } from "./diff";
import { articleAnchor, chapterAnchor, kanji, type Article, type Document } from "./model";

export type ComparisonLine = {
  id: string;
  parent?: string;
  kind: "title" | "metadata" | "chapter" | "caption" | "paragraph" | "item" | "text";
  label: string;
  text: string;
  prefix?: string;
  anchor?: string;
};
export type ComparisonRow = {
  id: string;
  label: string;
  before?: ComparisonLine;
  after?: ComparisonLine;
  changed: boolean;
  changes: string[];
};

function lines(doc: Document): ComparisonLine[] {
  const result: ComparisonLine[] = [
    { id: "title", kind: "title", label: "題名", text: doc.title },
    { id: "kind", kind: "metadata", label: "種別", text: doc.kind },
    { id: "status", kind: "metadata", label: "効力", text: doc.status === "active" ? "有効" : "廃止" },
  ];
  if (typeof doc.body === "string") return [...result, { id: "text", kind: "text", label: "本文", text: doc.body }];
  if (doc.body.preamble !== undefined) result.push({ id: "preamble", anchor: "preamble", kind: "text", label: "前文", text: doc.body.preamble });
  const addArticle = (a: Article, parent?: string) => {
    result.push({ id: a.uuid!, anchor: articleAnchor(a), parent, kind: "caption", label: a.name, text: a.caption ? `（${a.caption}）` : "" });
    a.paragraphs.forEach((p, i) => {
      result.push({ id: p.uuid!, parent: a.uuid, kind: "paragraph", label: `${a.name} 第${i + 1}項`, prefix: i === 0 ? a.name : String(i + 1), text: p.text });
      p.items?.forEach((item, j) => result.push({ id: item.uuid!, parent: p.uuid, kind: "item", label: `${a.name} 第${i + 1}項 第${j + 1}号`, prefix: kanji(j + 1), text: item.text }));
    });
  };
  doc.body.articles?.forEach(a => addArticle(a, "body"));
  doc.body.chapters?.forEach(c => {
    result.push({ id: c.uuid!, anchor: chapterAnchor(c), parent: "body", kind: "chapter", label: c.name, text: `${c.name}　${c.title}` });
    c.articles.forEach(a => addArticle(a, c.uuid));
  });
  doc.body.supplementaryProvisions?.forEach(p => {
    result.push({ id: p.uuid!, anchor: `supp-${p.uuid}`, kind: "chapter", label: p.title, text: p.title });
    p.articles.forEach(a => addArticle(a, p.uuid));
  });
  return result;
}

export function comparisonRows(before: Document | null, after: Document, onlyChanges = false, hidden: ReadonlySet<string> = new Set()): ComparisonRow[] {
  const previous = before ? lines(before) : [];
  const current = lines(after);
  const from = new Map(previous.map(line => [line.id, line]));
  const to = new Map(current.map(line => [line.id, line]));
  const changes = new Map(compare(before, after).map(change => [change.id, change.kinds]));
  const order = current.map(line => line.id);
  const inserted = new Set(order);
  for (let i = 0; i < previous.length; i++) {
    const line = previous[i];
    if (inserted.has(line.id)) continue;
    let position = 0;
    for (let j = i - 1; j >= 0; j--) {
      const anchor = order.indexOf(previous[j].id);
      if (anchor >= 0) { position = anchor + 1; break; }
    }
    order.splice(position, 0, line.id);
    inserted.add(line.id);
  }
  const rows = order.map(id => {
    const old = from.get(id), next = to.get(id);
    return {
      id, label: (next ?? old)!.label, before: old, after: next,
      changed: !old || !next || old.text !== next.text || old.prefix !== next.prefix || changes.has(id),
      changes: changes.get(id) ?? [],
    };
  }).filter(row => {
    if (hidden.has(row.id) || row.id === "text" && hidden.has("body")) return false;
    let parent = (row.after ?? row.before)?.parent;
    while (parent) {
      if (hidden.has(parent)) return false;
      parent = (to.get(parent) ?? from.get(parent))?.parent;
    }
    return (row.after ?? row.before)!.kind !== "metadata" || row.changed;
  });
  if (!onlyChanges) return rows;
  const keep = new Set(rows.filter(row => row.changed).map(row => row.id));
  for (const id of [...keep]) {
    let parent = (to.get(id) ?? from.get(id))?.parent;
    while (parent) { keep.add(parent); parent = (to.get(parent) ?? from.get(parent))?.parent; }
  }
  return rows.filter(row => row.id === "title" || keep.has(row.id));
}
