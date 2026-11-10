import { describe, expect, test } from "bun:test";

import { newDocument } from "../../src/domain/model";
import { validate } from "../../src/domain/validation";

describe("空欄の検証メッセージ", () => {
  test("新規の規則の空欄は、内部エラーを重複させず1件で案内する", () => {
    const doc = newDocument("rules", "運営規則", "運営規則", false);
    expect(validate(doc)).toEqual([
      {
        level: "error",
        path: "/body/articles/0/paragraphs/0/text",
        code: "empty",
        message: "第一条 第1項の本文を入力してください。",
      },
    ]);
    if (typeof doc.body === "string") throw 0;
    doc.body.articles![0].paragraphs[0].text = "本文を入力。";
    expect(validate(doc)).toEqual([]);
  });

  test("単一文字列の公示の空欄も1件で案内する", () => {
    const doc = newDocument("notice", "公示", "執行部公示", true);
    expect(validate(doc)).toEqual([
      {
        level: "error",
        path: "/body",
        code: "empty",
        message: "本文を入力してください。",
      },
    ]);
  });

  test("題名と条名が空でも、各入力箇所を識別できる", () => {
    const doc = newDocument("rules", "", "会則", false);
    if (typeof doc.body === "string") throw 0;
    doc.body.articles![0].name = "";
    const messages = validate(doc).map((problem) => problem.message);
    expect(messages).toHaveLength(3);
    expect(messages).toEqual(
      expect.arrayContaining([
        "題名を入力してください。",
        "1番目の条の名称を入力してください。",
        "1番目の条 第1項の本文を入力してください。",
      ]),
    );
  });

  test("章・号・附則の空欄は親の名称と位置を含めて案内する", () => {
    const doc = newDocument("rules", "会則", "会則", false);
    if (typeof doc.body === "string") throw 0;
    const article = doc.body.articles![0];
    article.paragraphs[0].text = "本文。";
    article.paragraphs[0].items = [{ text: "" }];
    doc.body = {
      chapters: [{ name: "第二章", title: "", articles: [article] }],
      supplementaryProvisions: [
        { title: "", articles: [structuredClone(article)] },
      ],
    };
    expect(validate(doc, false).map((problem) => problem.message)).toEqual([
      "第二章の題名を入力してください。",
      "第二章 第一条 第1項 第1号の本文を入力してください。",
      "附則1の題名を入力してください。",
      "附則1 第一条 第1項 第1号の本文を入力してください。",
    ]);
  });

  test("空欄と一緒に発生した別の不正な入力も検出する", () => {
    const doc = newDocument("rules", "", "会則", false);
    const problems = validate({ ...doc, unexpected: true, status: "invalid" });
    expect(
      problems.some((problem) => problem.message.includes("unexpected")),
    ).toBe(true);
    expect(problems.some((problem) => problem.path === "/status")).toBe(true);
    expect(problems.filter((problem) => problem.code === "empty")).toHaveLength(
      2,
    );
    doc.body = "";
    expect(
      validate(doc).some(
        (problem) => problem.path === "/body" && problem.code !== "empty",
      ),
    ).toBe(true);
    expect(validate(null).length).toBeGreaterThan(0);
    expect(
      validate({ ...doc, body: 42 }).some(
        (problem) => problem.path === "/body",
      ),
    ).toBe(true);
  });

  test("任意の見出しと前文の空欄は許容する", () => {
    const doc = newDocument("rules", "会則", "会則", false);
    if (typeof doc.body === "string") throw 0;
    doc.body.preamble = "";
    doc.body.articles![0].paragraphs[0].text = "本文。";
    expect(validate(doc)).toEqual([]);
    doc.title = "　 ";
    expect(validate(doc)[0]).toMatchObject({
      code: "empty",
      message: "題名を入力してください。",
    });
  });
});
