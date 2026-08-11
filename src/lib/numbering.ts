// 法令の表記慣行にあわせた番号の書き分け。
//   章  漢数字      第一章
//   条  算用数字    第1条   （会則本文の参照が「第6条」表記のため算用数字に揃える）
//   項  全角算用数字 ２     （第1項は番号を振らない）
//   号  漢数字      一

const KANJI_DIGITS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const KANJI_UNITS = ['', '十', '百', '千'];
const FULLWIDTH_DIGITS = '０１２３４５６７８９';

/** 1 → 一、11 → 十一、20 → 二十 */
export function toKanjiNumeral(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 9999) return String(n);

  const digits = String(n);
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    const digit = Number(digits[i]);
    if (digit === 0) continue;
    const unit = KANJI_UNITS[digits.length - 1 - i]!;
    out += digit === 1 && unit ? unit : KANJI_DIGITS[digit]! + unit;
  }
  return out;
}

/** 2 → ２ */
export function toFullWidthNumeral(n: number): string {
  return String(n)
    .split('')
    .map((c) => FULLWIDTH_DIGITS[Number(c)] ?? c)
    .join('');
}
