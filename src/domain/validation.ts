import Ajv2020 from "ajv/dist/2020.js";
import schema from "../../schema/document.schema.json";
import { articles, nodes, type Document } from "./model";

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateSchema = ajv.compile<Document>(schema);
export type Problem = { level: "error" | "warning"; path: string; message: string };
export function validate(input: unknown, requireUUIDs = true): Problem[] {
  if (!validateSchema(input)) return (validateSchema.errors ?? []).map(e => ({ level: "error", path: e.instancePath || "/", message: `${e.message}${e.keyword === "additionalProperties" ? `: ${e.params.additionalProperty}` : ""}` }));
  const doc = input as Document;
  const problems: Problem[] = [];
  const ids = new Set<string>();
  for (const [i, node] of nodes(doc).entries()) {
    if (!node.uuid && requireUUIDs) problems.push({ level: "error", path: `node/${i}`, message: "UUID未付与。bun run prepare:commit を実行してください。" });
    if (node.uuid && ids.has(node.uuid)) problems.push({ level: "error", path: `node/${i}`, message: `UUIDが重複しています: ${node.uuid}` });
    if (node.uuid) ids.add(node.uuid);
  }
  const checkNames = (list: { name: string; anchor?: string }[], path: string) => {
    const names = new Set<string>(), anchors = new Set<string>();
    for (const a of list) {
      if (!a.name.trim() || names.has(a.name)) problems.push({ level: "error", path, message: `名称が空、または重複しています: ${a.name}` });
      names.add(a.name);
      if (a.anchor && anchors.has(a.anchor)) problems.push({ level: "error", path, message: `固定リンクが重複しています: ${a.anchor}` });
      if (a.anchor) anchors.add(a.anchor);
    }
  };
  if (!doc.title.trim()) problems.push({ level: "error", path: "/title", message: "題名を入力してください。" });
  if (typeof doc.body !== "string") {
    checkNames(articles(doc), "/body");
    checkNames(doc.body.chapters ?? [], "/body/chapters");
    const all = [...articles(doc), ...(doc.body.supplementaryProvisions ?? []).flatMap(p => p.articles)];
    const anchors = new Set<string>();
    for (const a of all) if (a.anchor) {
      if (anchors.has(a.anchor)) problems.push({ level: "error", path: "/body", message: `条の固定リンクが重複しています: ${a.anchor}` });
      anchors.add(a.anchor);
    }
    for (const p of doc.body.supplementaryProvisions ?? []) checkNames(p.articles, "/body/supplementaryProvisions");
  }
  return problems;
}
