// data/ の各法令 JSON を schema/ に照らして検証する。
// JSON Schema で表現できない規則（ID の重複、条文参照の指す先の有無など）もここで見る。

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';

const DATA_DIR = 'data';
const SCHEMA_DIR = 'schema';

// 改正案の段階では、附則の施行日はまだ決まっていない。通常は警告にとどめ、
// main へ取り込むとき（--strict）だけエラーにする。決まらないまま公開されるのを防ぐ。
const STRICT = process.argv.includes('--strict');

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

const lawSchema = readJson(join(SCHEMA_DIR, 'law.schema.json'));
const articleSchema = readJson(join(SCHEMA_DIR, 'article.schema.json'));

const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addSchema(articleSchema, 'article.schema.json');
const validate = ajv.compile(lawSchema);

/** 章をまたいだ通し番号で条文を並べる。附則は採番の対象外。 */
function flatten(law) {
  const out = [];
  for (const chapter of law.chapters ?? []) {
    for (const article of chapter.articles) out.push({ article, chapter });
  }
  for (const article of law.articles ?? []) out.push({ article, chapter: null });
  return out;
}

/** 条文中のすべての文字列（本文・項・号）を取り出す。 */
function* texts(article) {
  yield article.content;
  for (const item of article.items ?? []) yield item;
  for (const paragraph of article.paragraphs ?? []) {
    yield paragraph.content;
    for (const item of paragraph.items ?? []) yield item;
  }
}

const problems = [];
const warnings = [];
const files = readdirSync(DATA_DIR).filter((f) => f.endsWith('.json')).sort();

if (files.length === 0) problems.push(`${DATA_DIR}/ に法令 JSON がありません`);

for (const file of files) {
  const path = join(DATA_DIR, file);
  const law = readJson(path);

  if (!validate(law)) {
    for (const e of validate.errors ?? []) {
      problems.push(`${path}: ${e.instancePath || '/'} ${e.message}`);
    }
    continue; // 構造が壊れている状態で以降の検査をしても雑音になる
  }

  const articles = flatten(law);

  // --- ID の重複 ---
  const seen = new Map();
  for (const { article } of articles) {
    if (seen.has(article.id)) {
      problems.push(`${path}: 条の id "${article.id}" が重複しています（${seen.get(article.id)} と ${article.caption}）`);
    }
    seen.set(article.id, article.caption);
  }
  const chapterIds = new Set();
  for (const chapter of law.chapters ?? []) {
    if (chapterIds.has(chapter.id)) problems.push(`${path}: 章の id "${chapter.id}" が重複しています`);
    chapterIds.add(chapter.id);
  }

  // --- 条文参照の指す先 ---
  // 「第8条」のような参照が実在する条を指しているかを見る。改正で条がずれたときの
  // 早期警告であって、参照が意味的に正しいことまでは保証しない。
  for (const [index, { article }] of articles.entries()) {
    for (const text of texts(article)) {
      for (const [, n] of text.matchAll(/第(\d+)条/g)) {
        const target = Number(n);
        if (target < 1 || target > articles.length) {
          problems.push(`${path}: 第${index + 1}条（${article.caption}）が存在しない第${target}条を参照しています`);
        }
      }
    }
  }

  // --- 附則 ---
  const provisions = law.supplementaryProvisions ?? [];
  const dates = provisions.map((p) => p.effectiveDate).filter(Boolean);
  if (dates.some((d, i) => i > 0 && d < dates[i - 1])) {
    warnings.push(`${path}: 附則が施行日順に並んでいません`);
  }

  for (const [i, provision] of provisions.entries()) {
    if (provision.effectiveDate) continue;
    const message =
      `${path}: 附則 ${i + 1}件目（${provision.kind}）に施行日がありません。` +
      '議決のあとに施行日を書き入れてください。';
    (STRICT ? problems : warnings).push(message);
  }
  if (provisions.length > 0 && provisions[0].kind !== '制定') {
    warnings.push(`${path}: 附則の先頭が「制定」ではありません`);
  }

  const pending = provisions.filter((p) => !p.effectiveDate).length;
  const label = law.chapters ? `${law.chapters.length}章 ${articles.length}条` : `${articles.length}条`;
  console.log(
    `  ${path}  ${law.title}（${law.effect}） ${label} / 附則 ${provisions.length}件` +
      (pending > 0 ? `（うち施行日未定 ${pending}件）` : ''),
  );
}

for (const w of warnings) console.warn(`警告  ${w}`);

if (problems.length > 0) {
  for (const p of problems) console.error(`エラー ${p}`);
  console.error(`\n検証に失敗しました（${problems.length}件）。`);
  process.exit(1);
}

console.log(`\n検証を通過しました（${files.length}件）。`);
