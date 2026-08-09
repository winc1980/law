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
    ].join('\n'),
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: bundle,
});

const { serializeLaw, fillMissingIds, collectArticleIds, summarize, danglingReferences } =
  await import(pathToFileURL(bundle).href);

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
