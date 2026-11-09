import { type Document, articles } from "./model";

const digits: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  〇: 0,
  零: 0,
};
function number(text: string): string {
  const normalized = text.replace(/[０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0),
  );
  if (/^\d+$/.test(normalized)) return String(Number(normalized));
  let n = 0,
    current = 0;
  for (const c of normalized) {
    if (c in digits) current = digits[c];
    else {
      n += (current || 1) * ({ 十: 10, 百: 100, 千: 1000 }[c] ?? 0);
      current = 0;
    }
  }
  return String(n + current);
}
const normalizedName = (text: string) =>
  text.replace(/[〇零一二三四五六七八九十百千\d０-９]+/g, number);
export function referenceWarnings(
  before: Document | null,
  after: Document,
): string[] {
  const old = new Map(
    (before ? articles(before) : []).map((a) => [
      normalizedName(a.name),
      a.uuid,
    ]),
  );
  const current = new Map(
    articles(after).map((a) => [normalizedName(a.name), a.uuid]),
  );
  const warnings = new Set<string>();
  for (const a of articles(after))
    for (const p of a.paragraphs)
      for (const text of [p.text, ...(p.items?.map((i) => i.text) ?? [])]) {
        for (const match of text.matchAll(
          /第[〇零一二三四五六七八九十百千\d０-９]+条(?:の[〇零一二三四五六七八九十百千\d０-９]+)*/g,
        )) {
          const key = normalizedName(match[0]);
          if (!current.has(key))
            warnings.add(
              `${a.name}の「${match[0]}」は本則内に見つかりません。他文書への参照か確認してください。`,
            );
          else if (old.has(key) && old.get(key) !== current.get(key))
            warnings.add(
              `${a.name}の「${match[0]}」は比較元と異なる条を指しています。`,
            );
        }
      }
  return [...warnings];
}
