import type { IconButtonProps, SubmitButtonProps } from '@rjsf/utils';

// RJSF の標準ボタンは Bootstrap 3 のアイコンフォント前提で <i class="glyphicon"> を出す。
// Bootstrap を入れていないので中身が空の四角になってしまう。
// アイコンをやめて日本語のラベルを出すボタンに差し替える。
// 会則を直すのは非エンジニアなので、記号よりも文字のほうが迷わない。

/** RJSF が渡してくる、DOM に載せてはいけない props を落とす。 */
function domProps({
  registry: _registry,
  uiSchema: _uiSchema,
  iconType: _iconType,
  icon: _icon,
  ...rest
}: IconButtonProps) {
  return rest;
}

function TextButton({ label, className, ...props }: IconButtonProps & { label: string }) {
  return (
    <button type="button" className={className} {...domProps(props as IconButtonProps)}>
      {label}
    </button>
  );
}

export const MoveUpButton = (props: IconButtonProps) => <TextButton {...props} label="上へ" />;
export const MoveDownButton = (props: IconButtonProps) => <TextButton {...props} label="下へ" />;
export const CopyButton = (props: IconButtonProps) => <TextButton {...props} label="複製" />;
export const RemoveButton = (props: IconButtonProps) => <TextButton {...props} label="削除" />;
export const ClearButton = (props: IconButtonProps) => <TextButton {...props} label="消す" />;

/**
 * 追加ボタンだけは、何を追加するのかが分かるようにする。
 * RJSF は追加先の配列名を渡してこないので、ボタンの id（root_chapters_0_articles__add など）
 * から拾う。
 */
const ADDS: [RegExp, string][] = [
  [/_chapters__add$/, '章を追加'],
  [/articles__add$/, '条を追加'],
  [/paragraphs__add$/, '項を追加'],
  [/items__add$/, '号を追加'],
  [/supplementaryProvisions__add$/, '附則を追加'],
];

export function AddButton(props: IconButtonProps) {
  const id = props.id ?? '';
  const label = ADDS.find(([pattern]) => pattern.test(id))?.[1] ?? '追加';
  return <TextButton {...props} label={label} />;
}

/** フォーム自身の submit ボタンは使わず、children で置いたものを使う。 */
export function SubmitButton(_props: SubmitButtonProps) {
  return null;
}

export const buttonTemplates = {
  AddButton,
  CopyButton,
  MoveDownButton,
  MoveUpButton,
  RemoveButton,
  ClearButton,
  SubmitButton,
};
