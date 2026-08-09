// 会則の原文は和暦で書かれているため、データは ISO 日付で持ち、表示時に和暦へ戻す。

const ERAS = [
  { name: '令和', from: '2019-05-01' },
  { name: '平成', from: '1989-01-08' },
  { name: '昭和', from: '1926-12-25' },
  { name: '大正', from: '1912-07-30' },
  { name: '明治', from: '1868-01-25' },
] as const;

/** "2022-04-01" を "令和4年4月1日" にする。改元前の日付は西暦のまま返す。 */
export function toJapaneseEra(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  const era = ERAS.find((e) => iso >= e.from);
  if (!era) return `${year}年${month}月${day}日`;

  const eraYear = year - Number(era.from.slice(0, 4)) + 1;
  return `${era.name}${eraYear === 1 ? '元' : eraYear}年${month}月${day}日`;
}
