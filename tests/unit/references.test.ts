import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, test } from "bun:test";

import {
  type Document,
  articles,
  kanji,
  newArticle,
  newDocument,
  withUUIDs,
} from "../../src/domain/model";
import {
  articleReferences,
  referenceWarnings,
  updateArticleReferences,
} from "../../src/domain/references";
import { DocumentBody } from "../../src/web/components/DocumentBody";

function fixture(): Document {
  const doc = newDocument("references", "参照規則", "運営規則", false);
  doc.body = {
    articles: ["第一条", "第十条", "第十条の二", "第十一条"].map((name) => {
      const a = newArticle(name);
      a.paragraphs[0].text = "対象の本文。";
      return a;
    }),
  };
  return doc;
}
const targets = (doc: Document, text: string, index = 3) =>
  articleReferences(doc, text, articles(doc)[index]).map((r) => r.target?.uuid);
const renumber = (doc: Document) =>
  articles(doc).forEach((a, i) => {
    a.name = `第${kanji(i + 1)}条`;
  });

describe("条文参照", () => {
  test("漢数字・半角・全角・枝番号と相対参照を同じ条へ解決する", () => {
    const doc = fixture(),
      list = articles(doc);
    expect(
      targets(
        doc,
        "第十条、第10条、第１０条、第十条の二、前条、前々条、次条、本条、同条",
      ),
    ).toEqual([
      list[1].uuid,
      list[1].uuid,
      list[1].uuid,
      list[2].uuid,
      list[2].uuid,
      list[1].uuid,
      undefined,
      list[3].uuid,
      list[3].uuid,
    ]);
    expect(targets(doc, "同条、第一条、同条")).toEqual([
      undefined,
      list[0].uuid,
      list[0].uuid,
    ]);
    expect(targets(doc, "第一〇条")).toEqual([list[1].uuid]);
  });

  test("章をまたいで前条を解決し、附則の同名条を混同しない", () => {
    const doc = fixture(),
      list = articles(doc);
    doc.body = {
      chapters: [
        { name: "第一章", title: "総則", articles: list.slice(0, 2) },
        { name: "第二章", title: "各則", articles: list.slice(2) },
      ],
      supplementaryProvisions: [
        {
          title: "附則",
          articles: [newArticle("第一条"), newArticle("第二条")],
        },
      ],
    };
    const supplement = doc.body.supplementaryProvisions![0].articles;
    expect(articleReferences(doc, "前条", list[2])[0].target).toBe(list[1]);
    expect(
      articleReferences(
        doc,
        "第一条、前条、本則第一条、同条",
        supplement[1],
      ).map((r) => r.target),
    ).toEqual([supplement[0], supplement[0], list[0], list[0]]);
    expect(articleReferences(doc, "附則第一条", list[0])[0].target).toBe(
      supplement[0],
    );
    doc.body.supplementaryProvisions!.push({
      title: "別の附則",
      articles: [newArticle("第一条")],
    });
    expect(
      articleReferences(doc, "附則第一条", list[0])[0].target,
    ).toBeUndefined();
  });

  test("外部法令・存在しない条・重複した条名は内部リンクにしない", () => {
    const doc = fixture(),
      source = articles(doc)[3];
    expect(
      articleReferences(
        doc,
        "民法第十条、他の規則第十条、第九十九条",
        source,
      ).every((r) => !r.target),
    ).toBe(true);
    expect(
      articleReferences(
        doc,
        "参照規則第十条、この規則第十条、本規則第十条",
        source,
      ).every((r) => r.target),
    ).toBe(true);
    if (typeof doc.body === "string") throw 0;
    doc.body.articles!.push(newArticle("第１０条"));
    expect(articleReferences(doc, "第十条", source)[0].target).toBeUndefined();
  });

  test("再採番は数字の表記を保ち、枝番号と同条を一括更新する", () => {
    const before = fixture();
    articles(before)[3].paragraphs[0].text =
      "第十条、第10条、第１０条、第十条の二、同条、前条、本条。";
    const after = structuredClone(before);
    renumber(after);
    updateArticleReferences(before, after);
    const text = articles(after)[3].paragraphs[0].text;
    expect(text).toBe("第二条、第2条、第２条、第三条、同条、前条、本条。");
    expect(targets(after, text)).toEqual(
      targets(before, articles(before)[3].paragraphs[0].text),
    );
  });

  test("条番号を入れ替えても置換が連鎖せず同じUUIDを指す", () => {
    const before = fixture();
    articles(before)[3].paragraphs[0].text = "第一条と第十条及び同条。";
    const after = structuredClone(before);
    [articles(after)[0].name, articles(after)[1].name] = [
      articles(after)[1].name,
      articles(after)[0].name,
    ];
    updateArticleReferences(before, after);
    expect(articles(after)[3].paragraphs[0].text).toBe(
      "第十条と第一条及び同条。",
    );
    expect(targets(after, articles(after)[3].paragraphs[0].text)).toEqual(
      targets(before, articles(before)[3].paragraphs[0].text),
    );
  });

  test("前条の間への挿入後と再採番後も元の参照先を維持する", () => {
    const before = fixture();
    articles(before)[3].paragraphs[0].text = "前条を適用する。";
    const inserted = structuredClone(before);
    if (typeof inserted.body === "string") throw 0;
    inserted.body.articles!.splice(3, 0, newArticle());
    updateArticleReferences(before, inserted);
    expect(articles(inserted)[4].paragraphs[0].text).toBe(
      "第十条の二を適用する。",
    );
    const after = structuredClone(inserted);
    renumber(after);
    updateArticleReferences(inserted, after);
    expect(articles(after)[4].paragraphs[0].text).toBe("第三条を適用する。");
    expect(targets(after, articles(after)[4].paragraphs[0].text, 4)).toEqual([
      articles(before)[2].uuid,
    ]);
  });

  test("条を移動して次条の位置が変わった場合は具体的な条名にする", () => {
    const before = fixture();
    articles(before)[0].paragraphs[0].text = "次条を適用する。";
    const after = structuredClone(before);
    if (typeof after.body === "string") throw 0;
    after.body.articles!.reverse();
    updateArticleReferences(before, after);
    expect(articles(after)[3].paragraphs[0].text).toBe("第十条を適用する。");
  });

  test("前文・号・附則内の本則参照も更新し、附則の番号は保つ", () => {
    const before = fixture();
    if (typeof before.body === "string") throw 0;
    before.body.preamble = "第十条による。";
    articles(before)[0].paragraphs[0].items = [
      { uuid: crypto.randomUUID(), text: "第10条の二を適用する。" },
    ];
    const supplement = newArticle("第一条");
    supplement.paragraphs[0].text = "本則第十一条及び同条並びに第一条による。";
    before.body.supplementaryProvisions = [
      { title: "附則", articles: [supplement] },
    ];
    const after = structuredClone(before);
    renumber(after);
    updateArticleReferences(before, after);
    if (typeof after.body === "string") throw 0;
    expect(after.body.preamble).toBe("第二条による。");
    expect(articles(after)[0].paragraphs[0].items![0].text).toBe(
      "第3条を適用する。",
    );
    expect(
      after.body.supplementaryProvisions![0].articles[0].paragraphs[0].text,
    ).toBe("本則第四条及び同条並びに第一条による。");
    expect(after.body.supplementaryProvisions![0].articles[0].name).toBe(
      "第一条",
    );
  });

  test("外部参照・不明な参照・同時に手入力した本文は書き換えない", () => {
    const before = fixture();
    articles(before)[3].paragraphs[0].text =
      "民法第十条、他の規則第十条、第九十九条。";
    const after = structuredClone(before);
    renumber(after);
    articles(after)[0].paragraphs[0].text = "第十条を手入力。";
    updateArticleReferences(before, after);
    expect(articles(after)[3].paragraphs[0].text).toBe(
      articles(before)[3].paragraphs[0].text,
    );
    expect(articles(after)[0].paragraphs[0].text).toBe("第十条を手入力。");
  });

  test("削除や名前の競合で参照先が失われた場合は警告する", () => {
    const before = fixture();
    articles(before)[3].paragraphs[0].text = "第十条を適用する。";
    const after = structuredClone(before);
    if (typeof after.body === "string") throw 0;
    after.body.articles!.splice(1, 1);
    updateArticleReferences(before, after);
    expect(
      referenceWarnings(before, after).some(
        (warning) =>
          warning.includes("第十条") && warning.includes("見つかりません"),
      ),
    ).toBe(true);
    articles(after)[0].name = "第十条";
    expect(
      referenceWarnings(before, after).some((warning) =>
        warning.includes("異なる条"),
      ),
    ).toBe(true);
  });

  test("静的HTMLの参照リンクは元のanchorを維持し、検索と共存する", () => {
    const doc = fixture();
    articles(doc)[1].anchor = "target";
    articles(doc)[3].paragraphs[0].text =
      "前々条を参照。民法第十条。第九十九条。";
    const html = renderToStaticMarkup(
      createElement(DocumentBody, {
        document: doc,
        display: { search: "前々条を" },
      }),
    );
    expect(html).toContain('href="#art-target"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html.match(/class="article-reference"/g)).toHaveLength(1);
    expect(html).toContain('<mark class="search-hit">前々条</mark>');
    expect(html).toContain('<mark class="search-hit">を</mark>');
  });

  test("編集画面にも同条を含めた参照リンクを表示する", () => {
    const doc = withUUIDs(fixture());
    articles(doc)[3].paragraphs[0].text = "第十条及び同条による。";
    const html = renderToStaticMarkup(
      createElement(DocumentBody, { document: doc, mutate: () => {} }),
    );
    expect(html.match(/class="article-reference"/g)).toHaveLength(2);
    expect(html).toContain(">同条</a>");
  });
});
