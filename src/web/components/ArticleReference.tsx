import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  type Article,
  type Document,
  articleAnchor,
  kanji,
} from "../../domain/model";
import { articleReferences } from "../../domain/references";

export type ReferenceSelection = {
  article: Article;
  trigger: HTMLAnchorElement;
};

function ReferenceLink({
  target,
  onOpen,
  children,
}: {
  target: Article;
  onOpen: (selection: ReferenceSelection) => void;
  children: ReactNode;
}) {
  return (
    <a
      className="article-reference"
      href={`#${articleAnchor(target)}`}
      aria-haspopup="dialog"
      title={`${target.name}${target.caption ? `（${target.caption}）` : ""}を表示`}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
          return;
        event.preventDefault();
        onOpen({ article: target, trigger: event.currentTarget });
      }}
    >
      {children}
    </a>
  );
}

export function ReferenceLinks(
  props: Omit<Parameters<typeof ReferenceText>[0], "search">,
) {
  const refs = articleReferences(
    props.document,
    props.value,
    props.source,
  ).filter((ref) => ref.target);
  if (!refs.length) return null;
  return (
    <div className="editing-references">
      <span>参照：</span>
      {refs.map((ref) => (
        <ReferenceLink
          key={ref.start}
          target={ref.target!}
          onOpen={props.onOpen}
        >
          {ref.text}
        </ReferenceLink>
      ))}
    </div>
  );
}

export function ReferenceText({
  value,
  search,
  document: doc,
  source,
  onOpen,
}: {
  value: string;
  search?: string;
  document: Document;
  source?: Article;
  onOpen: (selection: ReferenceSelection) => void;
}) {
  // Highlight using offsets in the full text, including searches spanning a link boundary.
  const hits: number[] = [];
  if (search) {
    let index = value.indexOf(search);
    while (index >= 0) {
      hits.push(index);
      index = value.indexOf(search, index + search.length);
    }
  }
  const text = (start: number, end: number): ReactNode => {
    const parts: ReactNode[] = [];
    let cursor = start;
    for (const hit of hits) {
      const left = Math.max(start, hit),
        right = Math.min(end, hit + search!.length);
      if (left >= right) continue;
      parts.push(value.slice(cursor, left));
      parts.push(
        <mark key={hit} className="search-hit">
          {value.slice(left, right)}
        </mark>,
      );
      cursor = right;
    }
    parts.push(value.slice(cursor, end));
    return parts;
  };
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const ref of articleReferences(doc, value, source)) {
    parts.push(
      <span key={`text-${ref.start}`}>{text(cursor, ref.start)}</span>,
    );
    const target = ref.target;
    parts.push(
      target ? (
        <ReferenceLink key={ref.start} target={target} onOpen={onOpen}>
          {text(ref.start, ref.end)}
        </ReferenceLink>
      ) : (
        <span key={ref.start}>{text(ref.start, ref.end)}</span>
      ),
    );
    cursor = ref.end;
  }
  parts.push(<span key="end">{text(cursor, value.length)}</span>);
  return <>{parts}</>;
}

export function ReferencePreview({
  document: doc,
  selection,
  onOpen,
  onClose,
  onNavigate,
}: {
  document: Document;
  selection: ReferenceSelection;
  onOpen: (selection: ReferenceSelection) => void;
  onClose: () => void;
  onNavigate?: (article: Article) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const a = selection.article;
  useEffect(() => {
    const element = dialog.current!;
    // A non-modal window keeps the surrounding articles visible and operable, like e-Gov.
    element.show();
    const anchor = selection.trigger.getBoundingClientRect();
    const bounds = element.getBoundingClientRect();
    setPosition({
      left: Math.max(
        8,
        Math.min(anchor.left, window.innerWidth - bounds.width - 8),
      ),
      top: Math.max(
        8,
        Math.min(anchor.bottom + 8, window.innerHeight - bounds.height - 8),
      ),
    });
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("keydown", escape);
      element.close();
    };
  }, []);
  useEffect(() => {
    content.current?.scrollTo(0, 0);
  }, [a]);
  const render = (value: string) => (
    <ReferenceText value={value} document={doc} source={a} onOpen={onOpen} />
  );
  return createPortal(
    <dialog
      ref={dialog}
      className="reference-preview"
      aria-label={`${a.name}の参照先`}
      style={position ? { left: position.left, top: position.top } : undefined}
    >
      <div className="reference-window-bar">
        <div
          className="reference-drag-handle"
          title="ドラッグして移動"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            const bounds = dialog.current!.getBoundingClientRect();
            drag.current = {
              x: event.clientX,
              y: event.clientY,
              left: bounds.left,
              top: bounds.top,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!drag.current) return;
            const bounds = dialog.current!.getBoundingClientRect();
            setPosition({
              left: Math.max(
                8,
                Math.min(
                  drag.current.left + event.clientX - drag.current.x,
                  window.innerWidth - bounds.width - 8,
                ),
              ),
              top: Math.max(
                8,
                Math.min(
                  drag.current.top + event.clientY - drag.current.y,
                  window.innerHeight - bounds.height - 8,
                ),
              ),
            });
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          <span aria-hidden="true">⠿</span>
          <span className="sr-only">参照ウィンドウ</span>
        </div>
        <a
          className="reference-window-action"
          href={`#${articleAnchor(a)}`}
          aria-label={`${a.name}へ移動`}
          title="参照先へ移動"
          onClick={(event) => {
            if (
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            )
              return;
            onNavigate?.(a);
            onClose();
            // Wait for hidden provisions to be revealed before scrolling.
            requestAnimationFrame(() => {
              const target = document.getElementById(articleAnchor(a));
              target?.scrollIntoView({ block: "start" });
              target?.focus({ preventScroll: true });
            });
          }}
        >
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M14 3h7v7M21 3 10 14M10 3H3v18h18v-7" />
          </svg>
        </a>
        <button
          className="reference-window-action"
          aria-label="参照先を閉じる"
          title="閉じる"
          onClick={onClose}
          autoFocus
        >
          ×
        </button>
      </div>
      <div className="reference-window-content" ref={content}>
        <p className="reference-document-title">{doc.title}</p>
        <div className="law-body">
          {a.caption && <div className="article-caption">（{a.caption}）</div>}
          {a.paragraphs.map((p, i) => (
            <div className="paragraph-block" key={p.uuid ?? i}>
              <div className="law-paragraph">
                <span className="paragraph-marker">
                  {i === 0
                    ? a.name
                    : String(i + 1).replace(/\d/g, (c) =>
                        String.fromCharCode(c.charCodeAt(0) + 0xfee0),
                      )}
                </span>
                <div className="paragraph-text">{render(p.text)}</div>
              </div>
              {!!p.items?.length && (
                <ol className="law-items">
                  {p.items.map((item, j) => (
                    <li key={item.uuid ?? j}>
                      <span className="item-marker">{kanji(j + 1)}</span>
                      <div>{render(item.text)}</div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))}
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
