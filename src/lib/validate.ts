import validateLawSchema from '../generated/validate-law.mjs';
import type { Law } from '../types/law';

/** 生成された検証関数が返すエラー。AJV の形。 */
interface SchemaError {
  instancePath: string;
  keyword: string;
  message?: string;
  params?: Record<string, unknown>;
}

export interface Problem {
  /** 「第3章 / 第2条 / 見出し」のような場所。 */
  where: string;
  message: string;
  /** 該当する条の id。分かる場合だけ。 */
  articleId?: string;
}

/**
 * data/ を検証する scripts/validate.mjs と同じスキーマで、編集中の内容を見る。
 * 検証関数は schema/ からビルド時に生成している（scripts/gen-validator.mjs）。
 */
export function validateLaw(law: Law): SchemaError[] {
  const valid = (validateLawSchema as unknown as (data: unknown) => boolean)(law);
  if (valid) return [];
  return ((validateLawSchema as unknown as { errors?: SchemaError[] }).errors ?? []).slice();
}

const FIELD_LABELS: Record<string, string> = {
  caption: '見出し',
  content: '本文',
  title: 'タイトル',
  id: 'ID',
  kind: '種別',
  effectiveDate: '施行日',
  resolvedOn: '議決日',
  resolvedBy: '議決機関',
  reason: '改正の理由',
};

function messageFor(error: SchemaError): string {
  switch (error.keyword) {
    case 'required': {
      const key = String(error.params?.missingProperty ?? '');
      return `${FIELD_LABELS[key] ?? key}が入っていません`;
    }
    case 'minLength':
      return '入力してください';
    case 'pattern':
      return '書き方が正しくありません';
    case 'enum':
      return '決められた値から選んでください';
    case 'additionalProperties':
      return 'スキーマにない項目が含まれています';
    default:
      return error.message ?? '正しくありません';
  }
}

/** "/chapters/0/articles/6/caption" を「第1章 / 第7条 / 見出し」に読み替える。 */
function locate(law: Law, path: string): { where: string; articleId?: string } {
  const parts = path.split('/').filter(Boolean);
  const out: string[] = [];
  let articleId: string | undefined;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    const index = Number(parts[i + 1]);

    switch (part) {
      case 'chapters':
        out.push(`第${index + 1}章`);
        i++;
        break;
      case 'articles': {
        // 章の中での位置。条番号は章をまたぐ通し番号なので、ここでは章内の順で示す。
        out.push(`${index + 1}つ目の条`);
        const chapter = out[0]?.startsWith('第') ? Number(parts[1]) : NaN;
        const list = Number.isNaN(chapter) ? law.articles : law.chapters?.[chapter]?.articles;
        articleId = list?.[index]?.id;
        i++;
        break;
      }
      case 'paragraphs':
        out.push(`第${index + 2}項`);
        i++;
        break;
      case 'items':
        out.push(`第${index + 1}号`);
        i++;
        break;
      case 'supplementaryProvisions':
        out.push(`附則 ${index + 1}件目`);
        i++;
        break;
      default:
        out.push(FIELD_LABELS[part] ?? part);
    }
  }

  return { where: out.join(' / ') || '全体', articleId };
}

/** 検証エラーを、画面上の場所と日本語の説明に読み替える。 */
export function describeErrors(law: Law, errors: SchemaError[]): Problem[] {
  return errors.map((error) => ({
    ...locate(law, error.instancePath),
    message: messageFor(error),
  }));
}
