export interface Piece {
  kind: 'same' | 'removed' | 'added';
  text: string;
}

/**
 * 日本語には単語の区切りがないため、行や空白では差分が取れない。
 * Intl.Segmenter に区切らせてから比べる。ブラウザ標準なので依存は増えない。
 */
const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter('ja', { granularity: 'word' })
    : null;

function segment(text: string): string[] {
  if (!segmenter) return [...text];
  return [...segmenter.segment(text)].map((s) => s.segment);
}

/** 最長共通部分列の長さの表。語数はたかだか数百なので素直に組む。 */
function lcsTable(a: string[], b: string[]): Uint32Array[] {
  const table: Uint32Array[] = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));

  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i]![j] =
        a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  return table;
}

/** 隣り合う同じ種類の断片をつなげる。1語ずつ色が切れると読めないため。 */
function merge(pieces: Piece[]): Piece[] {
  const out: Piece[] = [];
  for (const piece of pieces) {
    if (!piece.text) continue;
    const last = out.at(-1);
    if (last && last.kind === piece.kind) last.text += piece.text;
    else out.push({ ...piece });
  }
  return out;
}

/** 2つの文字列を語の単位で比べる。 */
export function diffText(before: string, after: string): Piece[] {
  if (before === after) return before ? [{ kind: 'same', text: before }] : [];

  const a = segment(before);
  const b = segment(after);
  const table = lcsTable(a, b);
  const pieces: Piece[] = [];

  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      pieces.push({ kind: 'same', text: a[i]! });
      i++;
      j++;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      pieces.push({ kind: 'removed', text: a[i]! });
      i++;
    } else {
      pieces.push({ kind: 'added', text: b[j]! });
      j++;
    }
  }
  while (i < a.length) pieces.push({ kind: 'removed', text: a[i++]! });
  while (j < b.length) pieces.push({ kind: 'added', text: b[j++]! });

  return merge(pieces);
}

/** 片側だけを取り出す。現行の行には削除と据え置き、改正案の行には追加と据え置きを出す。 */
export function sideOf(pieces: Piece[], side: 'before' | 'after'): Piece[] {
  const drop = side === 'before' ? 'added' : 'removed';
  return pieces.filter((piece) => piece.kind !== drop);
}
