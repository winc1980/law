import articleSchema from '../../schema/article.schema.json';
import lawSchema from '../../schema/law.schema.json';
import type { Law } from '../types/law';

type JsonObject = Record<string, unknown>;

const ARTICLE_REF = './article.schema.json';
const LOCAL_REF = '#/definitions/article';

/** 外部ファイルへの $ref を、埋め込んだ定義への参照に置き換える。 */
function rewriteRefs(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(rewriteRefs);
  if (node === null || typeof node !== 'object') return node;

  const out: JsonObject = {};
  for (const [key, value] of Object.entries(node as JsonObject)) {
    out[key] = key === '$ref' && value === ARTICLE_REF ? LOCAL_REF : rewriteRefs(value);
  }
  return out;
}

const SCHEMA_MAPS = new Set(['properties', '$defs', 'definitions']);
const SUB_SCHEMAS = new Set(['items', 'not', 'additionalProperties']);
const SCHEMA_LISTS = new Set(['oneOf', 'anyOf', 'allOf']);

/**
 * title と同じ description を落とす。RJSF はラベルの下に description を出すので、
 * 「章 / 章」のように同じ言葉が二度並んでしまう。
 */
function dropEchoedDescriptions(schema: JsonObject): JsonObject {
  const out: JsonObject = {};

  for (const [key, value] of Object.entries(schema)) {
    if (key === 'description' && value === schema.title) continue;

    if (SCHEMA_MAPS.has(key)) {
      out[key] = Object.fromEntries(
        Object.entries(value as JsonObject).map(([name, sub]) => [
          name,
          dropEchoedDescriptions(sub as JsonObject),
        ]),
      );
    } else if (SUB_SCHEMAS.has(key) && value !== null && typeof value === 'object') {
      out[key] = dropEchoedDescriptions(value as JsonObject);
    } else if (SCHEMA_LISTS.has(key) && Array.isArray(value)) {
      out[key] = value.map((sub) => dropEchoedDescriptions(sub as JsonObject));
    } else {
      out[key] = value;
    }
  }

  return out;
}

/**
 * 編集フォーム用のスキーマを schema/ から導出する。データ形式の定義は
 * schema/ 側にしかなく、ここでやるのはフォームに載せるための整形だけ。
 *
 *  - article.schema.json を definitions に取り込む（RJSF は外部ファイルを読めない）
 *  - ルートの oneOf を外す。articles と chapters の排他は、編集対象の法令が
 *    すでにどちらかに決まっているため、使わないほうを落として表現する
 *  - $schema は編集対象ではないので隠し、書き出し時に付け直す
 */
export function buildEditSchema(law: Law): JsonObject {
  const article = rewriteRefs(structuredClone(articleSchema)) as JsonObject;
  delete article.$schema;
  delete article.$id;
  // "Article" / "Law" は型名として置いているもので、フォームに出ると英語のまま
  // 見出しになってしまう。配列の項目名は親の title（「条文」など）から作らせる。
  delete article.title;

  const schema = rewriteRefs(structuredClone(lawSchema)) as JsonObject;
  delete schema.$schema;
  delete schema.$id;
  delete schema.title;
  delete schema.oneOf;

  const properties = schema.properties as JsonObject;
  delete properties.$schema;
  delete properties[law.chapters ? 'articles' : 'chapters'];

  schema.definitions = { article };
  return dropEchoedDescriptions(schema);
}

/**
 * フォームに渡す値。$schema はエディタ補完のための注記であって編集対象ではないため
 * 落としておく。付けたままだと additionalProperties: false に引っかかる。
 * 書き出すときに serializeLaw が付け直す。
 */
export function toFormData(law: Law): Law {
  const { $schema, ...rest } = law;
  return rest as Law;
}

// id はページ内の恒久リンクに使う識別子で、条番号とは無関係に不変であることに
// 意味がある。フォームに出すと編集を誘って既存のリンクを壊すため隠し、新しい条には
// エディタ側で自動採番する。意味のある英字スラッグに変えたい場合は PR 上で直す。
const hiddenId = { 'ui:widget': 'hidden' };

const articleUi = {
  'ui:order': ['caption', 'content', 'items', 'paragraphs', 'id'],
  id: hiddenId,
  caption: {
    'ui:placeholder': '会員の義務',
  },
  content: {
    // 第1項をここに書くことはスキーマの description が説明しているので、重ねて出さない。
    'ui:widget': 'textarea',
    'ui:options': { rows: 4 },
  },
  items: {
    items: { 'ui:widget': 'textarea', 'ui:options': { rows: 2 } },
  },
  paragraphs: {
    items: {
      'ui:order': ['content', 'items'],
      content: { 'ui:widget': 'textarea', 'ui:options': { rows: 3 } },
      items: {
        items: { 'ui:widget': 'textarea', 'ui:options': { rows: 2 } },
      },
    },
  },
};

export const uiSchema = {
  'ui:order': ['title', 'lawType', 'effect', 'preamble', 'chapters', 'articles', 'supplementaryProvisions'],
  effect: {
    'ui:help': 'この規則そのものの効力です。既存の規則を改正する場合は通常そのままにします。',
  },
  preamble: {
    'ui:widget': 'textarea',
    'ui:options': { rows: 3 },
  },
  articles: { items: articleUi },
  chapters: {
    items: {
      'ui:order': ['title', 'articles', 'id'],
      id: hiddenId,
      articles: { items: articleUi },
    },
  },
  supplementaryProvisions: {
    items: {
      'ui:order': ['kind', 'effectiveDate', 'resolvedOn', 'resolvedBy', 'reason', 'articles'],
      reason: { 'ui:widget': 'textarea', 'ui:options': { rows: 2 } },
      articles: { items: articleUi },
    },
  },
};
