// schema/ から src/types/law.d.ts を生成する。
//
// スキーマの title は編集フォームのラベルとして使っている（日本語）。
// json-schema-to-typescript は title から型名を作るため、そのまま渡すと
// 日本語が空文字に潰れて NoName1, NoName2 … という型が並んでしまう。
// ここでは title を落とした写しを作ってから型を生成する。
// ルートの title（Law / Article）だけは型名として使いたいので残す。

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileFromFile } from 'json-schema-to-typescript';

/** サブスキーマの title だけを落とす。プロパティ名の "title" は消さない。 */
function stripTitles(schema, isRoot = false) {
  if (schema === null || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map((s) => stripTitles(s));

  const out = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'title' && !isRoot) continue;

    switch (key) {
      // 値がプロパティ名 → スキーマの辞書になっているもの
      case 'properties':
      case '$defs':
      case 'definitions':
        out[key] = Object.fromEntries(
          Object.entries(value).map(([name, sub]) => [name, stripTitles(sub)]),
        );
        break;

      // 値がスキーマそのもの
      case 'items':
      case 'not':
      case 'additionalProperties':
        out[key] = typeof value === 'object' ? stripTitles(value) : value;
        break;

      // 値がスキーマの配列
      case 'oneOf':
      case 'anyOf':
      case 'allOf':
        out[key] = value.map((sub) => stripTitles(sub));
        break;

      default:
        out[key] = value;
    }
  }
  return out;
}

const work = mkdtempSync(join(tmpdir(), 'winc-law-types-'));

for (const name of ['law.schema.json', 'article.schema.json']) {
  const schema = JSON.parse(readFileSync(join('schema', name), 'utf8'));
  writeFileSync(join(work, name), JSON.stringify(stripTitles(schema, true), null, 2));
}

const types = await compileFromFile(join(work, 'law.schema.json'), {
  cwd: work,
  bannerComment:
    '/* eslint-disable */\n' +
    '/**\n' +
    ' * schema/ から自動生成されたファイルです。手で編集しないでください。\n' +
    ' * スキーマを変更したら `npm run gen:types` を実行してください。\n' +
    ' */',
  additionalProperties: false,
});

writeFileSync(join('src', 'types', 'law.d.ts'), types, 'utf8');
console.log('src/types/law.d.ts を生成しました');
