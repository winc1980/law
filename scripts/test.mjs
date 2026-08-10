// src/lib のロジックに対する検査。
// エディタの中身は React に載っているが、壊れると痛いのは純粋な部分
// （保存形式・差分の取り方）なのでそこを固める。
//
// TypeScript を直接読むために、vite が持っている esbuild で束ねてから読み込む。

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';

const work = mkdtempSync(join(tmpdir(), 'winc-law-test-'));
process.on('exit', () => rmSync(work, { recursive: true, force: true }));

const bundle = join(work, 'lib.mjs');
await build({
  stdin: {
    contents: [
      "export * from './src/lib/serialize.ts';",
      "export * from './src/lib/diff.ts';",
      "export * from './src/lib/edit.ts';",
      "export * from './src/lib/textdiff.ts';",
    ].join('\n'),
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: bundle,
});

const {
  serializeLaw,
  fillMissingIds,
  collectArticleIds,
  summarize,
  danglingReferences,
  articleDiffs,
  referenceProblems,
  addArticle,
  moveArticle,
  removeItem,
  diffText,
  sideOf,
} = await import(pathToFileURL(bundle).href);

const DATA_PATH = 'data/constitution.json';
const onDisk = readFileSync(DATA_PATH, 'utf8');
const law = JSON.parse(onDisk);

test('編集しなければ、保存されているファイルと一字一句同じものが出る', () => {
  // ここがずれると、内容を変えていないのに差分だらけのプルリクエストになる
  assert.equal(serializeLaw(law, DATA_PATH), onDisk);
});

test('空の項目は書き出さない', () => {
  const edited = structuredClone(law);
  edited.preamble = '';
  edited.chapters[0].articles[0].items = [];
  assert.equal(serializeLaw(edited, DATA_PATH), onDisk);
});

test('キーの順序は入力の順序に引きずられない', () => {
  const shuffled = structuredClone(law);
  const article = shuffled.chapters[0].articles[0];
  shuffled.chapters[0].articles[0] = {
    paragraphs: article.paragraphs,
    content: article.content,
    id: article.id,
    caption: article.caption,
  };
  assert.equal(serializeLaw(shuffled, DATA_PATH), onDisk);
});

test('ID のない条には採番し、既存の ID には触れない', () => {
  const edited = structuredClone(law);
  edited.chapters[0].articles.push({ caption: '新しい条', content: '本文。' });

  let n = 0;
  const filled = fillMissingIds(edited, () => `a-generated-${++n}`);

  assert.equal(filled.chapters[0].articles.at(-1).id, 'a-generated-1');
  assert.equal(filled.chapters[0].articles[0].id, law.chapters[0].articles[0].id);
  assert.equal(collectArticleIds(filled).length, collectArticleIds(law).length + 1);
});

test('変更がなければ ID 採番は元のオブジェクトをそのまま返す', () => {
  assert.equal(fillMissingIds(law, () => 'x'), law);
});

test('条の追加・削除・変更を拾う', () => {
  const edited = structuredClone(law);
  edited.chapters[1].articles[0].content = '書き換えた本文。';
  edited.chapters[1].articles.push({ id: 'a-new', caption: '新設', content: '本文。' });
  edited.chapters[7].articles.pop();

  const changes = summarize(law, edited);
  const find = (kind, part) => changes.find((c) => c.kind === kind && c.label.includes(part));

  assert.ok(find('変更', '目的'), '内容の変更を拾えていない');
  assert.ok(find('追加', '新設'), '追加を拾えていない');
  assert.ok(find('削除', '会費'), '削除を拾えていない');
});

test('条番号がずれた条は、追加や削除ではなく移動として扱う', () => {
  const edited = structuredClone(law);
  edited.chapters[0].articles.unshift({ id: 'a-new', caption: '新設', content: '本文。' });

  const changes = summarize(law, edited);
  const moved = changes.filter((c) => c.kind === '移動');

  assert.equal(changes.filter((c) => c.kind === '削除').length, 0);
  assert.equal(changes.filter((c) => c.kind === '追加').length, 1);
  // 先頭に1条入るので、既存の26条すべてが1つずつ繰り下がる
  assert.equal(moved.length, 26);
  assert.ok(moved[0].detail.includes('第2条'));
});

test('章の見出しの変更を拾う', () => {
  const edited = structuredClone(law);
  edited.chapters[0].title = '名称および事務局';

  const changes = summarize(law, edited);
  assert.ok(changes.some((c) => c.kind === '変更' && c.detail.includes('名称および事務局')));
});

test('現行の会則に、存在しない条への参照はない', () => {
  assert.deepEqual(danglingReferences(law), []);
});

test('条を削って参照が宙に浮いたら検出する', () => {
  const edited = structuredClone(law);
  // 全26条しかないので、第99条への参照は必ず宙に浮く
  edited.chapters[0].articles[0].content = '第99条による。';

  const warnings = danglingReferences(edited);
  assert.equal(warnings.length, 1);
  assert.ok(warnings[0].includes('第99条'));
});


// --- 語単位の差分 ---

test('変わった語だけを差分として取り出す', () => {
  const pieces = diffText('知識、技術および資質', '知識、技能および資質');
  const changed = pieces.filter((p) => p.kind !== 'same');

  assert.ok(changed.length === 2, `変更が2箇所のはず: ${JSON.stringify(pieces)}`);
  assert.equal(changed.filter((p) => p.kind === 'removed').map((p) => p.text).join(''), '技術');
  assert.equal(changed.filter((p) => p.kind === 'added').map((p) => p.text).join(''), '技能');
  // 変わっていない部分は残る（行まるごとが色付かない）
  assert.ok(pieces.some((p) => p.kind === 'same' && p.text.includes('資質')));
});

test('現行の行には削除だけ、改正案の行には追加だけを出す', () => {
  const pieces = diffText('あいうえお', 'あいかきお');
  assert.equal(sideOf(pieces, 'before').map((p) => p.text).join(''), 'あいうえお');
  assert.equal(sideOf(pieces, 'after').map((p) => p.text).join(''), 'あいかきお');
});

test('同じ文字列なら差分は出ない', () => {
  assert.deepEqual(diffText('本会は、', '本会は、').filter((p) => p.kind !== 'same'), []);
});

// --- 参照のずれ ---

test('条を先頭に足すと、条番号での参照が別の条を指すことを検出する', () => {
  const edited = addArticle(law, 0, 0);
  const problems = referenceProblems(law, edited);

  // 第6条（会員の義務）と第8条（会員資格の喪失）への参照が1つずつずれる
  assert.equal(problems.length, 2);
  assert.ok(problems.every((p) => p.kind === 'ずれ'));
  assert.ok(problems.some((p) => p.message.includes('会員の義務')), JSON.stringify(problems));
});

test('現行の会則には参照の問題がない', () => {
  assert.deepEqual(referenceProblems(law, law), []);
});

test('本文だけを直しても参照はずれない', () => {
  const edited = structuredClone(law);
  edited.chapters[1].articles[0].content = '書き換えた本文。';
  assert.deepEqual(referenceProblems(law, edited), []);
});

// --- 条ごとの差分 ---

test('条ごとの差分は、変わった行だけを持つ', () => {
  const edited = structuredClone(law);
  edited.chapters[1].articles[0].content = '書き換えた本文。';

  const diffs = articleDiffs(law, edited);
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].kind, '変更');
  assert.equal(diffs[0].lines.length, 1);
  assert.equal(diffs[0].lines[0].label, '本文');
  assert.equal(diffs[0].lines[0].after, '書き換えた本文。');
});

// --- 構造の編集 ---

test('条を追加すると ID が振られ、以降の条番号が繰り下がる', () => {
  const edited = addArticle(law, 0, 0);
  const added = edited.chapters[0].articles[0];

  assert.match(added.id, /^a-[0-9a-f]{8}$/);
  assert.equal(collectArticleIds(edited).length, collectArticleIds(law).length + 1);
  // 元の第1条が第2条になる
  assert.equal(edited.chapters[0].articles[1].id, law.chapters[0].articles[0].id);
});

test('章の端で下へ動かすと、次の章の先頭へ移る', () => {
  // 第1章の唯一の条を下へ。第2章の先頭に入る。
  const moved = moveArticle(law, { chapter: 0, article: 0 }, 1);

  assert.equal(moved.chapters[0].articles.length, 0);
  assert.equal(moved.chapters[1].articles[0].id, law.chapters[0].articles[0].id);
  // 条の総数は変わらない
  assert.equal(collectArticleIds(moved).length, collectArticleIds(law).length);
});

test('端を越える移動は、隣の章がなければ何も起こさない', () => {
  assert.equal(moveArticle(law, { chapter: 0, article: 0 }, -1), law);
});

test('号をすべて消すと、キーごと落ちる', () => {
  const at = { chapter: 1, article: 1 }; // 第3条（事業）は号を4つ持つ
  let edited = law;
  for (let i = 3; i >= 0; i--) edited = removeItem(edited, at, null, i);

  assert.equal(edited.chapters[1].articles[1].items, undefined);
  // 保存形式にも空配列を残さない（ほかの条は号を持ったまま）
  const written = JSON.parse(serializeLaw(edited, DATA_PATH));
  assert.ok(!('items' in written.chapters[1].articles[1]));
  assert.ok('items' in written.chapters[2].articles[0]);
});

// --- スキーマとエディタのずれ ---

test('スキーマに、エディタが知らない項目が増えていない', () => {
  // RJSF をやめたので、スキーマを増やしてもフォームは自動では追従しない。
  // 増えたことに気づけるよう、扱うと決めた項目をここに書いておく。
  // 落ちたら src/components/LawBody.tsx と src/lib/edit.ts に手を入れること。
  const lawSchema = JSON.parse(readFileSync('schema/law.schema.json', 'utf8'));
  const articleSchema = JSON.parse(readFileSync('schema/article.schema.json', 'utf8'));
  const keys = (schema) => Object.keys(schema.properties).sort();

  assert.deepEqual(keys(lawSchema), [
    '$schema', 'articles', 'chapters', 'effect', 'lawType', 'preamble', 'supplementaryProvisions', 'title',
  ].sort());
  assert.deepEqual(keys(lawSchema.properties.chapters.items), ['articles', 'id', 'title'].sort());
  assert.deepEqual(keys(lawSchema.properties.supplementaryProvisions.items), [
    'articles', 'effectiveDate', 'kind', 'reason', 'resolvedBy', 'resolvedOn',
  ].sort());
  assert.deepEqual(keys(articleSchema), ['caption', 'content', 'id', 'items', 'paragraphs'].sort());
  assert.deepEqual(keys(articleSchema.properties.paragraphs.items), ['content', 'items'].sort());
});
