/* eslint-disable */
/**
 * schema/ から自動生成されたファイルです。手で編集しないでください。
 * スキーマを変更したら `npm run gen:types` を実行してください。
 */

/**
 * 会則・運営規則の形式
 */
export type Law = {
  /**
   * エディタ補完のためのスキーマ参照。内容には影響しない。
   */
  $schema?: string;
  /**
   * タイトル
   */
  title: string;
  /**
   * 規則の種別
   */
  lawType: "会則" | "運営規則" | "執行部公示" | "執行部決定" | "その他";
  /**
   * 効力
   */
  effect: "案" | "廃案" | "施行待ち" | "施行中" | "廃止";
  /**
   * 前文
   */
  preamble?: string;
  /**
   * 条文
   */
  articles?: Article[];
  /**
   * 章
   */
  chapters?: {
    /**
     * 章の安定識別子。章番号は配列順から自動採番されるため、恒久リンクにはこのIDを用いる。
     */
    id: string;
    /**
     * 章のタイトル
     */
    title: string;
    /**
     * 章に含まれる条文
     */
    articles: Article[];
  }[];
  /**
   * 附則。制定および改正のたびに1件追加する。条番号の採番対象には含まれない。
   */
  supplementaryProvisions?: {
    /**
     * 制定・改正の別
     */
    kind: "制定" | "一部改正" | "全部改正" | "廃止";
    /**
     * 施行日 (YYYY-MM-DD)
     */
    effectiveDate: string;
    /**
     * 議決日 (YYYY-MM-DD)
     */
    resolvedOn?: string;
    /**
     * 議決機関
     */
    resolvedBy?: "総会" | "理事会" | "執行部";
    /**
     * 改正の理由・趣旨
     */
    reason?: string;
    /**
     * 附則に置かれる条文（経過措置など）
     */
    articles?: Article[];
  }[];
} & {
  [k: string]: unknown;
};

/**
 * 条文の形式
 */
export interface Article {
  /**
   * 条文の安定識別子。条番号は配列順から自動採番されるため改正で変動するが、このIDは一度付けたら変更しない。恒久リンクおよび条文間の参照に用いる。
   */
  id: string;
  /**
   * 条文の見出し
   */
  caption: string;
  /**
   * 条文の内容。項を分ける場合1項をここに記述し、2項以降はparagraphsに記述する。
   */
  content: string;
  /**
   * 条文の項。第1項は「内容」に書くため、ここは第2項から並べる。
   */
  paragraphs?: {
    /**
     * 項の内容
     */
    content: string;
    /**
     * 項の箇条書き(号)
     */
    items?: string[];
  }[];
  /**
   * 条文の箇条書き(号)
   */
  items?: string[];
}
