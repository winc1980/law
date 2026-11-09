import { diffChars } from "diff";
import { kanji, type Document, type Article } from "./model";

type Entry = { id: string; parent: string; label: string; text: string; name?: string };
export type Change = { id: string; label: string; kinds: string[]; before: string; after: string };

function entries(doc: Document): Entry[] {
  const out: Entry[] = [
    { id: "title", parent: "meta", label: "題名", text: doc.title },
    { id: "kind", parent: "meta", label: "種別", text: doc.kind },
    { id: "status", parent: "meta", label: "効力", text: doc.status === "active" ? "有効" : "廃止" },
  ];
  if (typeof doc.body === "string") return [...out, { id: "text", parent: "body", label: "本文", text: doc.body }];
  if (doc.body.preamble !== undefined) out.push({ id: "preamble", parent: "body", label: "前文", text: doc.body.preamble });
  const addArticle = (a: Article, parent: string) => {
    const id = a.uuid!;
    out.push({ id, parent, label: `${a.name}${a.caption ? `（${a.caption}）` : ""}`, text: a.caption ?? "", name: a.name });
    a.paragraphs.forEach((p, i) => {
      out.push({ id: p.uuid!, parent: id, label: `${a.name} 第${i + 1}項`, text: p.text });
      p.items?.forEach((item, j) => out.push({ id: item.uuid!, parent: p.uuid!, label: `${a.name} 第${i + 1}項 第${kanji(j + 1)}号`, text: item.text }));
    });
  };
  doc.body.articles?.forEach(a => addArticle(a, "body"));
  doc.body.chapters?.forEach(c => {
    out.push({ id: c.uuid!, parent: "body", label: `${c.name} ${c.title}`, name: c.name, text: c.title });
    c.articles.forEach(a => addArticle(a, c.uuid!));
  });
  doc.body.supplementaryProvisions?.forEach(p => {
    out.push({ id: p.uuid!, parent: "supplements", label: p.title, text: p.title });
    p.articles.forEach(a => addArticle(a, p.uuid!));
  });
  return out;
}

function stableOrder(a: string[], b: string[]): Set<string> {
  const dp = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const result = new Set<string>();
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { result.add(a[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
  }
  return result;
}
export function compare(before: Document | null, after: Document): Change[] {
  const from = before ? entries(before) : [], to = entries(after);
  const old = new Map(from.map(e => [e.id, e])), now = new Map(to.map(e => [e.id, e]));
  const moved = new Set<string>();
  for (const parent of new Set(to.map(e => e.parent))) {
    const a = from.filter(e => e.parent === parent && now.get(e.id)?.parent === parent).map(e => e.id);
    const b = to.filter(e => e.parent === parent && old.get(e.id)?.parent === parent).map(e => e.id);
    const stable = stableOrder(a, b);
    for (const id of b) if (!stable.has(id)) moved.add(id);
  }
  const changes: Change[] = [];
  for (const entry of to) {
    const prev = old.get(entry.id);
    const kinds: string[] = [];
    if (!prev) kinds.push("追加");
    else {
      if (prev.name !== entry.name) kinds.push("名称変更");
      if (prev.text !== entry.text) kinds.push("変更");
      if (prev.parent !== entry.parent || moved.has(entry.id)) kinds.push("移動");
    }
    if (kinds.length) changes.push({ id: entry.id, label: entry.label, kinds, before: prev ? [prev.name, prev.text].filter(Boolean).join("　") : "", after: [entry.name, entry.text].filter(Boolean).join("　") });
  }
  for (const entry of from) if (!now.has(entry.id)) changes.push({ id: entry.id, label: entry.label, kinds: ["削除"], before: [entry.name, entry.text].filter(Boolean).join("　"), after: "" });
  return changes;
}
export function textChanges(before: string, after: string) {
  // 大幅な全文変更でもUIを長時間停止させない。
  return diffChars(before, after, { timeout: 100, maxEditLength: 2000 }) ?? [{ value: before, removed: true }, { value: after, added: true }];
}
