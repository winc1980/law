// schema/ から検証関数を生成する。
//
// 編集画面はスキーマそのものを検証の権威として使うが、AJV を丸ごとブラウザへ
// 送ると 100kB 以上になる。ここでビルド時にコードへ落としておき、実行時は
// 生成された関数を呼ぶだけにする。data/ を検証する scripts/validate.mjs と
// 同じ規則が、そのまま編集画面でも効く。

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import standaloneCode from 'ajv/dist/standalone/index.js';

const readJson = (name) => JSON.parse(readFileSync(join('schema', name), 'utf8'));

const ajv = new Ajv2020({
  code: { source: true, esm: true },
  allErrors: true,
  strict: false,
});

ajv.addSchema(readJson('article.schema.json'), 'article.schema.json');
const validate = ajv.compile(readJson('law.schema.json'));

mkdirSync('src/generated', { recursive: true });
let code = standaloneCode(ajv, validate);

// AJV は ESM で出力しても、ランタイム関数だけ require() で書き出す。
// ブラウザでは動かないので、必要な関数をここに埋め込んで置き換える。
// 知らない require が現れたら、気づかず壊れたものを出すより止める。
const RUNTIME = {
  'ajv/dist/runtime/ucs2length': [
    'function ucs2length(str) {',
    '  const len = str.length;',
    '  let length = 0;',
    '  let pos = 0;',
    '  while (pos < len) {',
    '    length++;',
    '    let value = str.charCodeAt(pos++);',
    '    if (value >= 0xd800 && value <= 0xdbff && pos < len) {',
    '      value = str.charCodeAt(pos);',
    '      if ((value & 0xfc00) === 0xdc00) pos++;',
    '    }',
    '  }',
    '  return length;',
    '}',
  ].join('\n'),
};

const inlined = [];
for (const [module, source] of Object.entries(RUNTIME)) {
  const pattern = new RegExp(`require\\("${module}"\\)\\.default`, 'g');
  if (pattern.test(code)) {
    const name = module.split('/').pop();
    code = code.replace(pattern, name);
    inlined.push(source);
  }
}

const leftover = code.match(/require\([^)]*\)/g);
if (leftover) {
  console.error(`解決できない require が残っています: ${[...new Set(leftover)].join(', ')}`);
  process.exit(1);
}

writeFileSync(
  'src/generated/validate-law.mjs',
  [
    '/* schema/ から自動生成されたファイルです。手で編集しないでください。 */',
    '/* eslint-disable */',
    ...inlined,
    code,
  ].join('\n'),
  'utf8',
);

// 生成されたモジュールを TypeScript から読めるようにする
writeFileSync(
  'src/generated/validate-law.d.mts',
  [
    '/* schema/ から自動生成されたファイルです。手で編集しないでください。 */',
    'declare const validate: ((data: unknown) => boolean) & {',
    '  errors?: { instancePath: string; keyword: string; message?: string; params?: Record<string, unknown> }[] | null;',
    '};',
    'export default validate;',
    '',
  ].join('\n'),
  'utf8',
);

console.log('src/generated/validate-law.mjs を生成しました');
