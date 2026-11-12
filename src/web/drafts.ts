import Ajv2020 from "ajv/dist/2020.js";

import schema from "../../schema/document.schema.json";
import type { Document } from "../domain/model";

import type { Bootstrap } from "./types";

export type BrowserDraft = {
  version: 1;
  document: Document;
  saved: Document | null;
  etag: string;
  downloaded: boolean;
};

// 下書きには空欄や空の配列、本文形式と種別の不一致もそのまま残す。
function draftSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(draftSchema);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !["minLength", "minItems", "allOf"].includes(key))
        .map(([key, child]) => [key, draftSchema(child)]),
    );
  return value;
}
const validDocument = new Ajv2020({ strict: false }).compile<Document>(
  draftSchema(schema) as object,
);

export function draftKey(data: Pick<Bootstrap, "mode" | "base">, id?: string) {
  return `law:draft:v1:${data.mode}:${data.base}:${id ? `edit:${id}` : "new"}`;
}

export function readDraft(key: string): BrowserDraft | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  const value = JSON.parse(raw);
  if (
    value?.version !== 1 ||
    !validDocument(value.document) ||
    !(value.saved === null || validDocument(value.saved)) ||
    typeof value.etag !== "string" ||
    typeof value.downloaded !== "boolean"
  )
    throw new Error("保存された下書きの形式が不正です。");
  return value;
}

export function writeDraft(key: string, draft: BrowserDraft | null) {
  if (draft) localStorage.setItem(key, JSON.stringify(draft));
  else localStorage.removeItem(key);
}
