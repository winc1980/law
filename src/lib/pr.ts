// プルリクエストの中身を組み立てる。GitHub の API を叩く側（github.ts）とは分けてあり、
// ここは Law を受け取って文字列を返すだけなので、そのままテストできる。

import {
  articleComparisons,
  referenceProblems,
  summarize,
  type ArticleDiff,
  type Change,
  type DiffLine,
  type ReferenceProblem,
} from './diff';
import { diffText, sideOf, type Piece } from './textdiff';
import type { Law } from '../types/law';

/** タイトルに載せる理由の長さ。GitHub の一覧で折り返さない程度に抑える。 */
const TITLE_LIMIT = 40;

function firstLine(text: string): string {
  const line = text.trim().split(/\r?\n/, 1)[0]?.trim() ?? '';
  return line.length > TITLE_LIMIT ? `${line.slice(0, TITLE_LIMIT - 1)}…` : line;
}

export function proposalTitle(law: Law, reason: string): string {
  const head = firstLine(reason);
  return head ? `${law.title}の改正：${head}` : `${law.title}の改正`;
}

export function commitMessage(law: Law, reason: string): string {
  const body = reason.trim();
  const subject = proposalTitle(law, reason);
  return body ? `${subject}\n\n${body}\n` : `${subject}\n`;
}

/**
 * ブランチ名。同じ人が続けて提出しても衝突しないよう、呼び出し側で seed を渡す。
 * ここで乱数を引かないのは、同じ入力から同じ結果が出るようにしておくため。
 */
export function proposalBranch(slug: string, seed: string): string {
  const safe = seed.replace(/[^0-9a-zA-Z]/g, '').toLowerCase().slice(0, 12);
  return `proposal/${slug}-${safe || 'x'}`;
}

// --- 新旧対照表 ---

/**
 * 升目の中で意味を持つ記号を殺す。改行は <br> にする。
 * 変わった箇所を ** と ~~ で囲むのはこの後なので、先に逃がしておく必要がある。
 */
function escapeCell(text: string): string {
  return text.replace(/[\\`*_~|<>[\]]/g, (c) => `\\${c}`).replace(/\r?\n/g, '<br>');
}

/** ** や ~~ は前後に空白があると効かないので、空白を囲みの外に出す。 */
function emphasize(text: string, marker: string): string {
  const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
  if (!match) return text;
  const [, lead = '', core = '', tail = ''] = match;
  return core ? `${lead}${marker}${core}${marker}${tail}` : text;
}

function render(pieces: Piece[], side: 'before' | 'after'): string {
  return sideOf(pieces, side)
    .map((piece) => {
      const text = escapeCell(piece.text);
      if (piece.kind === 'same') return text;
      return emphasize(text, piece.kind === 'removed' ? '~~' : '**');
    })
    .join('');
}

function inline(line: DiffLine, side: 'before' | 'after'): string {
  return render(diffText(line.before ?? '', line.after ?? ''), side);
}

/** 対照表の片側の升目。条番号と見出しを1行目に置き、以降を条文の並びで積む。 */
function cell(row: ArticleDiff, side: 'before' | 'after'): string {
  if (side === 'after' && row.kind === '削除') return '（削除）';
  if (side === 'before' && row.kind === '追加') return '（新設）';

  const caption = row.lines.find((line) => line.label === '見出し');
  const number = side === 'after' ? row.numberAfter : row.numberBefore;
  const parts = [`**第${number}条**（${caption ? inline(caption, side) : escapeCell(row.caption)}）`];

  for (const line of row.lines) {
    if (line.label === '見出し') continue;
    // 片側にしかない項や号は、無い側では空になる。その行ごと落とす。
    const text = inline(line, side);
    if (!text) continue;
    parts.push(line.prefix ? `${escapeCell(line.prefix)}　${text}` : text);
  }

  return parts.join('<br>');
}

/**
 * 改正案を左、現行を右に置く。日本の法令の慣行にあわせた並びで、
 * 「新旧」の名のとおり新しいほうが先に来る。
 */
export function comparisonTable(before: Law, after: Law): string {
  const rows = articleComparisons(before, after);
  if (rows.length === 0) return '';

  return [
    '| 改正案 | 現行 |',
    '| --- | --- |',
    ...rows.map((row) => `| ${cell(row, 'after')} | ${cell(row, 'before')} |`),
  ].join('\n');
}

// --- 本文 ---

function quote(text: string): string {
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => `> ${line}`.trimEnd())
    .join('\n');
}

function bullet(change: Change): string {
  return `- **${change.kind}** ${change.label}${change.detail ? ` — ${change.detail}` : ''}`;
}

function warnings(problems: ReferenceProblem[]): string {
  return [
    '> [!WARNING]',
    '> 本文に書かれた条番号での参照が、改正の前後で別の条を指します。',
    '> 取り込む前に、参照している側の条文を確かめてください。',
    '>',
    ...problems.map((problem) => `> - ${problem.message}`),
  ].join('\n');
}

const SUPPLEMENT = `## 附則について

改正の理由を記録した附則を1件追加しています。**議決日と施行日は空のまま**です。
会則の変更には理事会の決議が必要（第26条）なので、決議のあとに書き入れてください。

施行日のない附則が残っているあいだ \`npm run validate:strict\` は失敗します。
main へ取り込む前に必ず埋めてください。`;

export interface BodyInput {
  /** 改正前。現在 main にある内容。 */
  before: Law;
  /** 改正案。提出時に足す附則まで含んだもの。 */
  after: Law;
  reason: string;
  /** 改正案の編集ページ。作り直すときの入口として本文に載せる。 */
  editorUrl: string;
}

export function proposalBody({ before, after, reason, editorUrl }: BodyInput): string {
  const changes = summarize(before, after);
  const problems = referenceProblems(before, after);
  const table = comparisonTable(before, after);

  const sections = [
    '<!-- 改正案の編集ページから作成されました -->',
    `## 改正の理由\n\n${quote(reason)}`,
    `## 変更の概要\n\n${changes.length > 0 ? changes.map(bullet).join('\n') : '（変更はありません）'}`,
  ];

  if (table) sections.push(`## 新旧対照表\n\n${table}`);
  if (problems.length > 0) sections.push(warnings(problems));

  sections.push(SUPPLEMENT);
  sections.push(`---\n\nこのプルリクエストは[改正案の編集ページ](${editorUrl})から作成されました。`);

  return `${sections.join('\n\n')}\n`;
}
