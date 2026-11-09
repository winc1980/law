import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, test } from "bun:test";

import { comparisonRows } from "../../src/domain/comparison";
import { compare } from "../../src/domain/diff";
import {
  type Document,
  newArticle,
  newDocument,
  newParagraph,
  nodes,
  serialize,
} from "../../src/domain/model";
import { referenceWarnings } from "../../src/domain/references";
import { validate } from "../../src/domain/validation";
import { migrate } from "../../src/server/migrate";
import { DocumentBody } from "../../src/web/components/DocumentBody";

export function fixture(): Document {
  const doc = newDocument("sample", "会則", "会則", false);
  if (typeof doc.body !== "string") {
    doc.body.articles![0].paragraphs[0].text = "本会の名称を定める。";
    const next = newArticle("第二条");
    next.paragraphs[0].text = "第一条に基づく。";
    doc.body.articles!.push(next);
  }
  return doc;
}
describe("原本と差分", () => {
  test("新旧対照表は文脈を保持し、挿入・削除を同じ行に揃える", () => {
    const before = fixture(),
      after = structuredClone(before);
    if (typeof before.body === "string" || typeof after.body === "string")
      throw 0;
    const removed = before.body.articles![1].paragraphs[0];
    after.body.articles!.pop();
    after.body.articles![0].paragraphs[0].text += "変更。";
    const rows = comparisonRows(before, after);
    expect(rows.find((row) => row.id === removed.uuid)?.after).toBeUndefined();
    expect(rows.find((row) => row.id === removed.uuid)?.before?.text).toBe(
      "第一条に基づく。",
    );
    const firstId = after.body.articles![0].paragraphs[0].uuid;
    const paragraph = rows.find((row) => row.id === firstId)!;
    expect(paragraph.after?.prefix).toBe("第一条");
    expect(paragraph.before?.text).toBe("本会の名称を定める。");
    const filtered = comparisonRows(before, before, true);
    expect(filtered.map((row) => row.id)).toEqual(["title"]);
  });
  test("途中挿入で既存条・項を変更や移動と誤認しない", () => {
    const before = fixture(),
      after = structuredClone(before);
    if (typeof after.body === "string") throw 0;
    const added = newArticle("第一条の二");
    added.paragraphs[0].text = "追加する。";
    after.body.articles!.splice(1, 0, added);
    expect(compare(before, after).every((c) => c.kinds.join() === "追加")).toBe(
      true,
    );
    const p = newParagraph();
    p.text = "途中に項を置く。";
    after.body.articles![0].paragraphs.splice(0, 0, p);
    expect(compare(before, after).every((c) => c.kinds.join() === "追加")).toBe(
      true,
    );
  });
  test("移動・名称変更・本文変更を区別する", () => {
    const before = fixture(),
      after = structuredClone(before);
    if (typeof after.body === "string") throw 0;
    after.body.articles!.reverse();
    after.body.articles![0].name = "第六条";
    after.body.articles![0].paragraphs[0].text = "変更。";
    const changes = compare(before, after);
    expect(changes.some((c) => c.kinds.includes("移動"))).toBe(true);
    expect(changes.some((c) => c.kinds.includes("名称変更"))).toBe(true);
    expect(changes.some((c) => c.kinds.includes("変更"))).toBe(true);
  });
  test("UUID欠如・重複・未知フィールドはコミット用検証で拒否する", () => {
    const doc = fixture();
    delete doc.uuid;
    expect(validate(doc).some((p) => p.message.includes("UUID未付与"))).toBe(
      true,
    );
    expect(validate(doc, false)).toEqual([]);
    doc.uuid = nodes(doc)[1].uuid;
    expect(validate(doc).some((p) => p.message.includes("重複"))).toBe(true);
    expect(
      validate({ ...fixture(), resolvedOn: "2026-11-09" }).length,
    ).toBeGreaterThan(0);
  });
  test("単一文字列は決定・公示で受け付け、規則では拒否する", () => {
    const doc = newDocument("notice", "公示", "執行部公示", true);
    doc.body = "公示本文\n次の段落。";
    expect(validate(doc)).toEqual([]);
    doc.kind = "会則";
    expect(validate(doc).length).toBeGreaterThan(0);
  });
  test("算用数字・漢数字の参照先変更を検出する", () => {
    const before = fixture(),
      after = structuredClone(before);
    if (typeof after.body === "string") throw 0;
    after.body.articles![0].name = "第三条";
    expect(referenceWarnings(before, after)[0]).toContain("見つかりません");
    after.body.articles![1].name = "第一条";
    expect(
      referenceWarnings(before, after).some((w) => w.includes("異なる条")),
    ).toBe(true);
  });
  test("第1項番号を表示せず、第2項を表示する", () => {
    const doc = fixture();
    if (typeof doc.body === "string") throw 0;
    doc.body.articles![0].paragraphs.push({
      uuid: crypto.randomUUID(),
      text: "第二項。",
    });
    const html = renderToStaticMarkup(
      createElement(DocumentBody, { document: doc }),
    );
    expect(html).not.toContain('data-paragraph-number="1"');
    expect(html).toContain('data-paragraph-number="2"');
  });
  test("旧版移行は本文・既存固定リンクを保ち、同じIDは同じUUIDになる", () => {
    const old = {
      title: "会則",
      lawType: "会則",
      effect: "施行中",
      articles: [
        {
          id: "name",
          caption: "名称",
          content: " 本文\n改行 ",
          paragraphs: [{ content: "第二項", items: ["号"] }],
        },
      ],
      supplementaryProvisions: [{ kind: "制定", effectiveDate: "2020-01-01" }],
    };
    const a = migrate(old, "sample"),
      b = migrate(old, "sample");
    expect(a).toEqual(b);
    expect(validate(a)).toEqual([]);
    if (typeof a.body === "string") throw 0;
    expect(a.body.articles![0].paragraphs[0].text).toBe(" 本文\n改行 ");
    expect(a.body.articles![0].anchor).toBe("name");
    expect(a.body.supplementaryProvisions).toBeUndefined();
    expect(serialize(a)).not.toContain("effectiveDate");
  });
});
