/* schema/document.schema.json から自動生成。bun run generate */

/**
 * 会の規則・決定の原本。uuidは初回コミット前に補完し、以後変更しない。
 */
export type Document = {
  [k: string]: unknown;
} & {
  $schema?: string;
  schemaVersion: 1;
  id: string;
  uuid?: UUID;
  title: string;
  kind: "会則" | "運営規則" | "執行部公示" | "執行部決定" | "その他";
  status: "active" | "repealed";
  body: string | StructuredBody;
};
export type UUID = string;
export type StructuredBody = {
  preamble?: string;
  /**
   * @minItems 1
   */
  articles?: Article[];
  /**
   * @minItems 1
   */
  chapters?: Chapter[];
  supplementaryProvisions?: Provision[];
} & StructuredBody1;
export type Anchor = string;
export type StructuredBody1 = {
  [k: string]: unknown;
};

export interface Article {
  uuid?: UUID;
  anchor?: Anchor;
  name: string;
  caption?: string;
  /**
   * @minItems 1
   */
  paragraphs: Paragraph[];
}
export interface Paragraph {
  uuid?: UUID;
  text: string;
  items?: Item[];
}
export interface Item {
  uuid?: UUID;
  text: string;
}
export interface Chapter {
  uuid?: UUID;
  anchor?: Anchor;
  name: string;
  title: string;
  /**
   * @minItems 1
   */
  articles: Article[];
}
export interface Provision {
  uuid?: UUID;
  title: string;
  /**
   * @minItems 1
   */
  articles: Article[];
}
