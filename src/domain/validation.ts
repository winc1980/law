import Ajv2020, { type ErrorObject } from "ajv/dist/2020.js";

import schema from "../../schema/document.schema.json";

import { type Document, articles, nodes } from "./model";

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateSchema = ajv.compile<Document>(schema);
export type Problem = {
  level: "error" | "warning";
  path: string;
  message: string;
  code?: "empty";
};

function fieldLabel(input: unknown, path: string): string {
  const parts = path.split("/").slice(1);
  const labels: string[] = [];
  let value = input;
  for (let i = 0; i < parts.length; i++) {
    const key = parts[i];
    value =
      value && typeof value === "object" ? Reflect.get(value, key) : undefined;
    if (
      [
        "chapters",
        "articles",
        "paragraphs",
        "items",
        "supplementaryProvisions",
      ].includes(key)
    ) {
      const index = Number(parts[++i]);
      value = Array.isArray(value) ? value[index] : undefined;
      const rawName =
        value && typeof value === "object"
          ? Reflect.get(value, "name")
          : undefined;
      const name = typeof rawName === "string" ? rawName.trim() : "";
      labels.push(
        key === "chapters"
          ? name || `${index + 1}番目の章`
          : key === "articles"
            ? name || `${index + 1}番目の条`
            : key === "paragraphs"
              ? `第${index + 1}項`
              : key === "items"
                ? `第${index + 1}号`
                : `附則${index + 1}`,
      );
    }
  }
  const field = parts.at(-1);
  const label = labels.join(" ");
  if (!label) return field === "title" ? "題名" : "本文";
  return `${label}の${field === "name" ? "名称" : field === "title" ? "題名" : "本文"}`;
}

function schemaProblems(input: unknown, errors: ErrorObject[]): Problem[] {
  const summary = (error: ErrorObject) =>
    ["if", "oneOf", "anyOf"].includes(error.keyword);
  const details = errors.filter((error) => !summary(error));
  const doc = input as Partial<Document> | null;
  const relevant = details.filter((error) => {
    // 単一文字列の本文では、条文形式の検証結果を表示しない。
    if (
      error.instancePath === "/body" &&
      ["type", "not"].includes(error.keyword) &&
      typeof doc?.body === "string" &&
      doc.kind !== "会則" &&
      doc.kind !== "運営規則"
    )
      return false;
    if (error.keyword !== "type") return true;
    // 本文の別形式に対する型エラーは、実際の入力箇所のエラーと分ける。
    return !details.some((other) =>
      other.instancePath.startsWith(`${error.instancePath}/`),
    );
  });
  const seen = new Set<string>();
  return [
    ...relevant,
    ...errors.filter(
      (error) =>
        summary(error) &&
        !relevant.some(
          (other) =>
            other.instancePath === error.instancePath ||
            other.instancePath.startsWith(`${error.instancePath}/`),
        ),
    ),
  ].flatMap((error): Problem[] => {
    const key = JSON.stringify([
      error.instancePath,
      error.keyword,
      error.params,
    ]);
    if (seen.has(key)) return [];
    seen.add(key);
    const path = error.instancePath || "/";
    if (error.keyword === "minLength" && error.params.limit === 1)
      return [
        {
          level: "error",
          path,
          code: "empty",
          message: `${fieldLabel(input, path)}を入力してください。`,
        },
      ];
    return [
      {
        level: "error",
        path,
        message: `${error.message}${error.keyword === "additionalProperties" ? `: ${error.params.additionalProperty}` : ""}`,
      },
    ];
  });
}

export function validate(input: unknown, requireUUIDs = true): Problem[] {
  if (!validateSchema(input))
    return schemaProblems(input, validateSchema.errors ?? []);
  const doc = input as Document;
  const problems: Problem[] = [];
  const ids = new Set<string>();
  for (const [i, node] of nodes(doc).entries()) {
    if (!node.uuid && requireUUIDs)
      problems.push({
        level: "error",
        path: `node/${i}`,
        message: "UUID未付与。bun run prepare:commit を実行してください。",
      });
    if (node.uuid && ids.has(node.uuid))
      problems.push({
        level: "error",
        path: `node/${i}`,
        message: `UUIDが重複しています: ${node.uuid}`,
      });
    if (node.uuid) ids.add(node.uuid);
  }
  const checkNames = (
    list: { name: string; anchor?: string }[],
    path: string,
  ) => {
    const names = new Set<string>(),
      anchors = new Set<string>();
    for (const a of list) {
      if (!a.name.trim() || names.has(a.name))
        problems.push({
          level: "error",
          path,
          message: `名称が空、または重複しています: ${a.name}`,
        });
      names.add(a.name);
      if (a.anchor && anchors.has(a.anchor))
        problems.push({
          level: "error",
          path,
          message: `固定リンクが重複しています: ${a.anchor}`,
        });
      if (a.anchor) anchors.add(a.anchor);
    }
  };
  if (!doc.title.trim())
    problems.push({
      level: "error",
      path: "/title",
      code: "empty",
      message: "題名を入力してください。",
    });
  if (typeof doc.body !== "string") {
    checkNames(articles(doc), "/body");
    checkNames(doc.body.chapters ?? [], "/body/chapters");
    const all = [
      ...articles(doc),
      ...(doc.body.supplementaryProvisions ?? []).flatMap((p) => p.articles),
    ];
    const anchors = new Set<string>();
    for (const a of all)
      if (a.anchor) {
        if (anchors.has(a.anchor))
          problems.push({
            level: "error",
            path: "/body",
            message: `条の固定リンクが重複しています: ${a.anchor}`,
          });
        anchors.add(a.anchor);
      }
    for (const p of doc.body.supplementaryProvisions ?? [])
      checkNames(p.articles, "/body/supplementaryProvisions");
  }
  return problems;
}
