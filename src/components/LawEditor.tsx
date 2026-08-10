import Form from '@rjsf/core';
import type { IChangeEvent } from '@rjsf/core';
import type {
  CustomValidator,
  RJSFSchema,
  RJSFValidationError,
  TranslatableString,
  UiSchema,
} from '@rjsf/utils';
import validator from '@rjsf/validator-ajv8';
import { useMemo, useState } from 'react';
import { buttonTemplates } from './buttons';
import { danglingReferences, summarize, type Change } from '../lib/diff';
import { collectArticleIds, fillMissingIds, serializeLaw } from '../lib/serialize';
import { editUrl } from '../lib/config';
import type { Law } from '../types/law';

interface Props {
  slug: string;
  original: Law;
  schema: RJSFSchema;
  uiSchema: UiSchema;
  dataPath: string;
}

/** RJSF が英語で出すボタンやメッセージを日本語にする。 */
const JA: Partial<Record<TranslatableString, string>> = {
  Item: '項目',
  'No items yet. Use the button below to add some.': 'まだ項目がありません。下のボタンから追加してください。',
  Add: '追加',
  'Add Item': '追加',
  Copy: '複製',
  'Move down': '下へ',
  'Move up': '上へ',
  Remove: '削除',
  Errors: 'エラー',
  Close: '閉じる',
  Yes: 'はい',
  No: 'いいえ',
};

function translateString(stringToTranslate: TranslatableString, params?: string[]): string {
  const translated = JA[stringToTranslate];
  if (!translated) return params ? interpolate(stringToTranslate, params) : stringToTranslate;
  return params ? interpolate(translated, params) : translated;
}

function interpolate(template: string, params: string[]): string {
  return params.reduce((acc, value, i) => acc.replaceAll(`%${i + 1}`, value), template);
}

// フォーム上の見出し（「章-1」「条文-2」など）と同じ言葉を使う。
// 条番号ではなく画面上の位置を指すので、「第2条」とは書かない。
const PATH_LABELS: Record<string, string> = {
  chapters: '章',
  articles: '条文',
  paragraphs: '項',
  items: '号',
  supplementaryProvisions: '附則',
  caption: '見出し',
  content: '内容',
  title: 'タイトル',
  id: 'ID',
  lawType: '種別',
  effect: '効力',
  preamble: '前文',
  kind: '種別',
  effectiveDate: '施行日',
  resolvedOn: '議決日',
  resolvedBy: '議決機関',
  reason: '改正の理由',
};

/** ".chapters.0.articles.6.caption" を「章1 / 条文7 / 見出し」にする。 */
function describePath(property: string | undefined): string {
  if (!property) return '全体';

  const parts = property.replace(/^\./, '').split('.').filter(Boolean);
  const out: string[] = [];

  for (const [i, part] of parts.entries()) {
    if (/^\d+$/.test(part)) continue;
    const label = PATH_LABELS[part] ?? part;
    const index = parts[i + 1];
    out.push(index && /^\d+$/.test(index) ? `${label}${Number(index) + 1}` : label);
  }

  return out.join(' / ') || '全体';
}

export default function LawEditor({ slug, original, schema, uiSchema, dataPath }: Props) {
  const [formData, setFormData] = useState<Law>(original);
  const [review, setReview] = useState<{ changes: Change[]; warnings: string[] } | null>(null);
  const [invalid, setInvalid] = useState<RJSFValidationError[]>([]);
  const [copied, setCopied] = useState(false);

  const json = useMemo(() => serializeLaw(formData, dataPath), [formData, dataPath]);
  const baseline = useMemo(() => serializeLaw(original, dataPath), [original, dataPath]);
  const untouched = json === baseline;

  function handleChange(event: IChangeEvent<Law>) {
    if (!event.formData) return;
    setFormData(fillMissingIds(event.formData));
    setReview(null);
    setCopied(false);
  }

  const customValidate: CustomValidator<Law> = (data, errors) => {
    if (!data) return errors;

    const ids = collectArticleIds(data);
    const duplicates = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
    for (const id of duplicates) {
      errors.addError(`条の ID「${id}」が重複しています。ID は条ごとに固有である必要があります。`);
    }
    return errors;
  };

  function handleSubmit({ formData: data }: IChangeEvent<Law>) {
    if (!data) return;
    setInvalid([]);
    setReview({ changes: summarize(original, data), warnings: danglingReferences(data) });
    requestAnimationFrame(() =>
      document.getElementById('review')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  }

  function handleError(errors: RJSFValidationError[]) {
    setReview(null);
    setInvalid(errors);
    requestAnimationFrame(() =>
      document.getElementById('invalid')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  }

  function transformErrors(errors: RJSFValidationError[]): RJSFValidationError[] {
    return errors.map((error) => {
      if (error.name === 'required' || error.name === 'minLength') {
        return { ...error, message: '入力してください' };
      }
      if (error.name === 'pattern' && error.property?.endsWith('.id')) {
        return { ...error, message: '半角英小文字・数字・ハイフンで、英小文字から始めてください' };
      }
      if (error.name === 'pattern') return { ...error, message: 'YYYY-MM-DD の形式で入力してください' };
      if (error.name === 'additionalProperties') {
        return { ...error, message: 'スキーマにない項目が含まれています' };
      }
      if (error.name === 'enum') return { ...error, message: '一覧から選んでください' };
      return error;
    });
  }

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
    } catch {
      setCopied(false);
      alert('クリップボードにコピーできませんでした。下の「JSON を表示」から手動でコピーしてください。');
    }
  }

  function downloadJson() {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slug}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="editor">
      <Form
        schema={schema}
        uiSchema={uiSchema}
        formData={formData}
        validator={validator}
        customValidate={customValidate}
        transformErrors={transformErrors}
        translateString={translateString}
        templates={{ ButtonTemplates: buttonTemplates }}
        showErrorList={false}
        // ブラウザ標準の必須チェックに任せると、画面外の空欄があるときに submit が
        // 黙って止まり、何も起きていないように見える。スキーマ検証に一本化する。
        noHtml5Validate
        onChange={handleChange}
        onSubmit={handleSubmit}
        onError={handleError}
      >
        <div className="actions">
          <button type="submit" className="primary" disabled={untouched}>
            変更内容を確認
          </button>
          {untouched && <span className="hint">まだ変更されていません。</span>}
        </div>

        {invalid.length > 0 && (
          <div id="invalid" className="invalid" role="alert">
            <h2>入力に不足があります</h2>
            <p>次の項目を直してから、もう一度「変更内容を確認」を押してください。</p>
            <ul>
              {invalid.map((error, i) => (
                <li key={i}>
                  <span className="where">{describePath(error.property)}</span>
                  <span>{error.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Form>

      {review && (
        <section id="review" className="review" aria-labelledby="review-heading">
          <h2 id="review-heading">変更内容の確認</h2>

          {review.changes.length === 0 ? (
            <p>変更はありません。</p>
          ) : (
            <ol className="changes">
              {review.changes.map((change, i) => (
                <li key={i}>
                  <span className="kind" data-kind={change.kind}>
                    {change.kind}
                  </span>
                  <span className="label">{change.label}</span>
                  {change.detail && <span className="detail">{change.detail}</span>}
                </li>
              ))}
            </ol>
          )}

          {review.warnings.length > 0 && (
            <div className="warnings">
              <h3>確認してください</h3>
              <ul>
                {review.warnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
              <p>
                条を増減させると、それ以降の条番号がずれます。本文中の「第◯条」という参照も
                あわせて直す必要があります。
              </p>
            </div>
          )}

          <h3>提出する</h3>
          <p>
            この編集内容はまだどこにも保存されていません。次の手順で改正案として提出してください。
          </p>
          <ol className="steps">
            <li>
              下のボタンで JSON をコピーし、GitHub の編集画面を開きます。
              <div className="actions">
                <button type="button" className="primary" onClick={copyJson}>
                  {copied ? 'コピーしました' : 'JSON をコピー'}
                </button>
                <a className="button" href={editUrl(slug)} target="_blank" rel="noreferrer">
                  GitHub の編集画面を開く
                </a>
                <button type="button" onClick={downloadJson}>
                  ファイルとして保存
                </button>
              </div>
            </li>
            <li>
              編集画面のテキストを<strong>すべて選択して削除</strong>し、コピーした JSON を貼り付けます。
            </li>
            <li>
              <strong>Commit changes</strong> を押し、
              <strong>Create a new branch for this commit and start a pull request</strong>
              を選んでプルリクエストを作成します。書き込み権限がない場合は自動でフォークが作られます。
            </li>
            <li>変更の理由を本文に書いて提出してください。会則の変更には理事会の決議が必要です。</li>
          </ol>

          <details>
            <summary>JSON を表示</summary>
            <pre>{json}</pre>
          </details>
        </section>
      )}
    </div>
  );
}
