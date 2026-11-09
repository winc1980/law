import { useState } from "react";

import { type ComparisonRow, comparisonRows } from "../../domain/comparison";
import { compare, textChanges } from "../../domain/diff";
import type { Document } from "../../domain/model";

function Row({ row }: { row: ComparisonRow }) {
  const parts = textChanges(row.before?.text ?? "", row.after?.text ?? "");
  const prefixes = textChanges(
    row.before?.prefix ?? "",
    row.after?.prefix ?? "",
  );
  const kind = (row.after ?? row.before)!.kind;
  return (
    <div
      role="row"
      id={(row.after ?? row.before)?.anchor}
      className={`comparison-row comparison-${kind} ${row.changed ? "has-difference" : ""}`}
      data-difference={row.changed || undefined}
      tabIndex={-1}
      aria-label={
        row.changed
          ? `${row.label} ${row.changes.join("・") || "変更"}`
          : undefined
      }
    >
      {["after", "before"].map((side) => {
        const line = side === "after" ? row.after : row.before;
        const show = (part: {
          value: string;
          added?: boolean;
          removed?: boolean;
        }) => (side === "after" ? !part.removed : !part.added);
        return (
          <div
            role="cell"
            key={side}
            className={line ? "comparison-cell" : "comparison-cell absent"}
          >
            {line && (
              <>
                {line.kind === "metadata" && (
                  <span className="comparison-metadata text-[12px] text-subtle">
                    {line.label}　
                  </span>
                )}
                {line.prefix !== undefined && (
                  <span className="comparison-prefix">
                    {prefixes.filter(show).map((part, i) => (
                      <span
                        key={i}
                        className={
                          part.added || part.removed
                            ? "diff-highlight"
                            : undefined
                        }
                      >
                        {part.value}
                      </span>
                    ))}
                  </span>
                )}
                <span>
                  {parts.filter(show).map((part, i) => (
                    <span
                      key={i}
                      className={
                        part.added || part.removed
                          ? "diff-highlight"
                          : undefined
                      }
                    >
                      {part.value}
                    </span>
                  ))}
                </span>
                {row.changes.includes("移動") && kind === "caption" && (
                  <small className="movement-label ml-3 text-[11px] font-normal">
                    移動
                  </small>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function DiffView({
  before,
  after,
  table = false,
  onlyChanges = false,
  hidden,
}: {
  before: Document | null;
  after: Document;
  table?: boolean;
  onlyChanges?: boolean;
  hidden?: ReadonlySet<string>;
}) {
  const changes = compare(before, after);
  if (table)
    return (
      <div
        className="comparison-table"
        id="main-provisions"
        role="table"
        aria-label="新旧対照表"
      >
        <div className="comparison-row comparison-head" role="row">
          <div role="columnheader">変更後</div>
          <div role="columnheader">変更前</div>
        </div>
        {comparisonRows(before, after, onlyChanges, hidden).map((row) => (
          <Row row={row} key={row.id} />
        ))}
      </div>
    );
  if (!changes.length)
    return <p className="empty-state small px-3 py-2 text-[12px]">変更なし</p>;
  return (
    <div className="changes px-3 py-2">
      <p className="change-count mb-1.25 text-[11px] text-subtle">
        {changes.length}箇所
      </p>
      {changes.map((change) => (
        <section
          key={change.id}
          className="change-card border-t border-faint py-2 [&_p]:leading-[1.8] [&_p]:whitespace-pre-wrap [&_p]:wrap-anywhere"
        >
          <div className="change-label mb-1 text-[11px] wrap-anywhere [&>span]:font-bold">
            <span>{change.kinds.join("・")}</span> {change.label}
          </div>
          <p>
            {textChanges(change.before, change.after).map((part, i) =>
              part.added ? (
                <ins key={i}>{part.value}</ins>
              ) : part.removed ? (
                <del key={i}>{part.value}</del>
              ) : (
                <span key={i}>{part.value}</span>
              ),
            )}
          </p>
        </section>
      ))}
    </div>
  );
}

export function DiffNavigation({ rootId }: { rootId: string }) {
  const [index, setIndex] = useState(-1);
  const move = (direction: number) => {
    const elements = Array.from(
      document
        .getElementById(rootId)
        ?.querySelectorAll<HTMLElement>("[data-difference]") ?? [],
    );
    if (!elements.length) return;
    const next = Math.min(elements.length - 1, Math.max(0, index + direction));
    elements[next].scrollIntoView({ block: "center", behavior: "smooth" });
    elements[next].focus({ preventScroll: true });
    setIndex(next);
  };
  return (
    <div className="difference-navigation flex gap-5 max-md:gap-3">
      <button className="text-button" onClick={() => move(-1)}>
        前の差分箇所
      </button>
      <button className="text-button" onClick={() => move(1)}>
        次の差分箇所
      </button>
    </div>
  );
}
