import { useEffect, useRef } from 'react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
  ariaLabel: string;
  /** 空のときに枠を強調する。必須項目が未入力であることを示す。 */
  invalid?: boolean;
}

/** field-sizing が使えれば CSS だけで高さが伸びる。使えない環境では JS で合わせる。 */
const HAS_FIELD_SIZING =
  typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
    ? CSS.supports('field-sizing', 'content')
    : false;

const DEBOUNCE_MS = 200;

/**
 * 条文の本文を書き換えるための入力欄。
 *
 * React の制御下に置くと、日本語入力の変換中に再描画が挟まって文字が落ちる。
 * ここでは DOM の値を正とし、変換が確定してから、しかも少し間を置いてから
 * 親に伝える。副次的に、1文字打つたびに文書全体を描き直すこともなくなる。
 */
export default function EditableText({
  value,
  onChange,
  multiline = true,
  placeholder,
  ariaLabel,
  invalid = false,
}: Props) {
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  const composing = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  /** 直近に親へ渡した値。外から来た変更と、自分が起こした変更を見分ける。 */
  const emitted = useRef(value);

  function resize() {
    const node = ref.current;
    if (!node || HAS_FIELD_SIZING || !(node instanceof HTMLTextAreaElement)) return;
    node.style.height = 'auto';
    node.style.height = `${node.scrollHeight}px`;
  }

  useEffect(resize, []);

  // 取り消しなど、外から値が変わったときだけ DOM に書き戻す。
  // 入力中に書き戻すとカーソルが飛ぶので、自分が出した値なら何もしない。
  useEffect(() => {
    const node = ref.current;
    if (!node || value === emitted.current || node === document.activeElement) return;
    node.value = value;
    emitted.current = value;
    resize();
  }, [value]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function flush(next: string) {
    window.clearTimeout(timer.current);
    if (next === emitted.current) return;
    emitted.current = next;
    onChange(next);
  }

  function handleInput() {
    resize();
    if (composing.current) return;

    const next = ref.current?.value ?? '';
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => flush(next), DEBOUNCE_MS);
  }

  const shared = {
    ref: ref as never,
    defaultValue: value,
    placeholder,
    'aria-label': ariaLabel,
    'aria-invalid': invalid || undefined,
    className: `editable${invalid ? ' is-empty' : ''}`,
    onInput: handleInput,
    onCompositionStart: () => {
      composing.current = true;
    },
    onCompositionEnd: () => {
      composing.current = false;
      handleInput();
    },
    onBlur: () => flush(ref.current?.value ?? ''),
  };

  return multiline ? <textarea rows={1} {...shared} /> : <input type="text" {...shared} />;
}
