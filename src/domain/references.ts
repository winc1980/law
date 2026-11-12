import { type Article, type Document, articles, kanji } from "./model";

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
  if (/^[〇零一二三四五六七八九]+$/.test(normalized))
    return String(Number([...normalized].map((c) => digits[c]).join("")));
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
const numerals = "[〇零一二三四五六七八九十百千\\d０-９]+";
const normalizedName = (text: string) =>
  text.replace(new RegExp(numerals, "g"), number);
const pattern = () =>
  new RegExp(
    `(本則|附則)?(第${numerals}条(?:の${numerals})*|前々条|前条|次条|本条|同条)`,
    "g",
  );

export type ArticleReference = {
  start: number;
  end: number;
  text: string;
  target?: Article;
  external: boolean;
};
function scopes(doc: Document): Article[][] {
  return typeof doc.body === "string"
    ? []
    : [
        articles(doc),
        ...(doc.body.supplementaryProvisions ?? []).map((p) => p.articles),
      ];
}
function scopeFor(doc: Document, source?: Article): Article[] {
  const lists = scopes(doc);
  return (
    lists.find((list) => source && list.includes(source)) ?? lists[0] ?? []
  );
}

/** Resolve within the source's provisions; explicit 本則/附則 overrides that scope. */
export function articleReferences(
  doc: Document,
  text: string,
  source?: Article,
): ArticleReference[] {
  let previous: Article | undefined;
  return [...text.matchAll(pattern())].map((match) => {
    const [label, qualifier, name] = match;
    const prefix = text.slice(0, match.index);
    // A named external law must never be silently linked or rewritten as this document.
    const external =
      /(?:法|令|条例|規則|会則|規程|細則|要綱|公示|決定)(?:の)?$/.test(
        prefix,
      ) &&
      !prefix.endsWith(doc.title) &&
      !prefix.endsWith(`${doc.title}の`) &&
      !/(?:この|本)(?:規則|会則|規程|細則)(?:の)?$/.test(prefix);
    const lists = scopes(doc);
    const list =
      qualifier === "本則"
        ? (lists[0] ?? [])
        : qualifier === "附則"
          ? lists.length === 2
            ? lists[1]
            : []
          : scopeFor(doc, source);
    const index = source ? list.indexOf(source) : -1;
    let target: Article | undefined;
    if (!external) {
      if (name.startsWith("第")) {
        const candidates = list.filter(
          (a) => normalizedName(a.name) === normalizedName(name),
        );
        if (candidates.length === 1) target = candidates[0];
      } else if (name === "同条")
        target =
          previous && (!qualifier || list.includes(previous))
            ? previous
            : undefined;
      else if (index >= 0)
        target =
          list[index + ({ 前々条: -2, 前条: -1, 次条: 1, 本条: 0 }[name] ?? 0)];
    }
    previous = target;
    return {
      start: match.index,
      end: match.index + label.length,
      text: label,
      target,
      external,
    };
  });
}

type TextField = {
  key: string;
  source?: Article;
  value: string;
  set: (text: string) => void;
};
function fields(doc: Document): TextField[] {
  if (typeof doc.body === "string") return [];
  const result: TextField[] = [];
  const body = doc.body;
  if (body.preamble !== undefined)
    result.push({
      key: "preamble",
      value: body.preamble,
      set: (text) => {
        body.preamble = text;
      },
    });
  for (const a of scopes(doc).flat()) {
    for (const p of a.paragraphs) {
      for (const node of [p, ...(p.items ?? [])]) {
        if (node.uuid)
          result.push({
            key: node.uuid,
            source: a,
            value: node.text,
            set: (text) => {
              node.text = text;
            },
          });
      }
    }
  }
  return result;
}
function styledName(original: string, target: string): string {
  const styles = [...original.matchAll(new RegExp(numerals, "g"))].map(
    (m) => m[0],
  );
  let i = 0;
  return target.replace(new RegExp(numerals, "g"), (part) => {
    const style = styles[i++] ?? styles[0] ?? "一";
    if (/^\d+$/.test(style)) return number(part);
    if (/^[０-９]+$/.test(style))
      return number(part).replace(/\d/g, (c) =>
        String.fromCharCode(c.charCodeAt(0) + 0xfee0),
      );
    return kanji(Number(number(part)));
  });
}

/** Mutate after, preserving unchanged text fields' reference targets by UUID. */
export function updateArticleReferences(
  before: Document,
  after: Document,
): void {
  const structure = (doc: Document) =>
    scopes(doc).map((list) => list.map((a) => [a.uuid, a.name]));
  if (JSON.stringify(structure(before)) === JSON.stringify(structure(after)))
    return;
  const oldFields = new Map(fields(before).map((field) => [field.key, field]));
  const targets = new Map(
    scopes(after)
      .flat()
      .filter((a) => a.uuid)
      .map((a) => [a.uuid, a]),
  );
  for (const field of fields(after)) {
    const old = oldFields.get(field.key);
    if (!old || old.value !== field.value) continue;
    let text = "",
      cursor = 0;
    for (const ref of articleReferences(before, old.value, old.source)) {
      text += old.value.slice(cursor, ref.start);
      let label = ref.text;
      const target = ref.target?.uuid
        ? targets.get(ref.target.uuid)
        : undefined;
      if (target) {
        const resolved = articleReferences(
          after,
          text + label,
          field.source,
        ).at(-1)?.target;
        if (resolved !== target) {
          const qualifier = /^(本則|附則)/.exec(label)?.[0] ?? "";
          const list = scopeFor(after, field.source);
          const prefix = list.includes(target)
            ? qualifier
            : articles(after).includes(target)
              ? "本則"
              : "附則";
          label = prefix + styledName(ref.text, target.name);
        }
      }
      text += label;
      cursor = ref.end;
    }
    field.set(text + old.value.slice(cursor));
  }
}

export function referenceWarnings(
  before: Document | null,
  after: Document,
): string[] {
  const warnings = new Set<string>();
  const oldFields = new Map(
    (before ? fields(before) : []).map((field) => [field.key, field]),
  );
  for (const field of fields(after)) {
    const old = oldFields.get(field.key);
    const oldRefs =
      old && before ? articleReferences(before, old.value, old.source) : [];
    for (const ref of articleReferences(after, field.value, field.source)) {
      if (ref.external) continue;
      const location = field.source?.name ?? "前文";
      if (!ref.target)
        warnings.add(
          `${location}の「${ref.text}」の参照先が見つかりません。他文書への参照か、条名・位置を確認してください。`,
        );
      else if (old && old.value === field.value) {
        const previous = oldRefs.find((r) => r.start === ref.start)?.target;
        if (previous?.uuid && previous.uuid !== ref.target.uuid)
          warnings.add(
            `${location}の「${ref.text}」は比較元と異なる条を指しています。`,
          );
      }
    }
  }
  return [...warnings];
}
