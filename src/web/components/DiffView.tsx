import { useState } from "react";
import { compare, textChanges } from "../../domain/diff";
import { comparisonRows, type ComparisonRow } from "../../domain/comparison";
import type { Document } from "../../domain/model";

function Row({ row }: { row: ComparisonRow }) {
  const parts = textChanges(row.before?.text ?? "", row.after?.text ?? "");
  const prefixes = textChanges(row.before?.prefix ?? "", row.after?.prefix ?? "");
  const kind = (row.after ?? row.before)!.kind;
  return <div role="row" id={(row.after ?? row.before)?.anchor} className={`comparison-row comparison-${kind} ${row.changed ? "has-difference" : ""}`} data-difference={row.changed || undefined} tabIndex={-1} aria-label={row.changed ? `${row.label} ${row.changes.join("・") || "変更"}` : undefined}>
    {["after", "before"].map(side => {
      const line = side === "after" ? row.after : row.before;
      const show = (part: { value: string; added?: boolean; removed?: boolean }) => side === "after" ? !part.removed : !part.added;
      return <div role="cell" key={side} className={line ? "comparison-cell" : "comparison-cell absent"}>
        {line && <>
          {line.kind === "metadata" && <span className="comparison-metadata">{line.label}　</span>}
          {line.prefix !== undefined && <span className="comparison-prefix">{prefixes.filter(show).map((part, i) => <span key={i} className={part.added || part.removed ? "diff-highlight" : undefined}>{part.value}</span>)}</span>}
          <span>{parts.filter(show).map((part, i) => <span key={i} className={part.added || part.removed ? "diff-highlight" : undefined}>{part.value}</span>)}</span>
          {row.changes.includes("移動") && kind === "caption" && <small className="movement-label">移動</small>}
        </>}
      </div>;
    })}
  </div>;
}

export function DiffView({ before, after, table = false, onlyChanges = false, hidden }: { before: Document | null; after: Document; table?: boolean; onlyChanges?: boolean; hidden?: ReadonlySet<string> }) {
  const changes = compare(before, after);
  if (table) return <div className="comparison-table" id="main-provisions" role="table" aria-label="新旧対照表">
    <div className="comparison-row comparison-head" role="row"><div role="columnheader">変更後</div><div role="columnheader">変更前</div></div>
    {comparisonRows(before, after, onlyChanges, hidden).map(row => <Row row={row} key={row.id} />)}
  </div>;
  if (!changes.length) return <p className="empty-state small">変更なし</p>;
  return <div className="changes"><p className="change-count">{changes.length}箇所</p>{changes.map(change => <section key={change.id} className="change-card">
    <div className="change-label"><span>{change.kinds.join("・")}</span> {change.label}</div>
    <p>{textChanges(change.before, change.after).map((part, i) => part.added ? <ins key={i}>{part.value}</ins> : part.removed ? <del key={i}>{part.value}</del> : <span key={i}>{part.value}</span>)}</p>
  </section>)}</div>;
}

export function DiffNavigation({ rootId }: { rootId: string }) {
  const [index, setIndex] = useState(-1);
  const move = (direction: number) => {
    const elements = Array.from(document.getElementById(rootId)?.querySelectorAll<HTMLElement>("[data-difference]") ?? []);
    if (!elements.length) return;
    const next = Math.min(elements.length - 1, Math.max(0, index + direction));
    elements[next].scrollIntoView({ block: "center", behavior: "smooth" });
    elements[next].focus({ preventScroll: true });
    setIndex(next);
  };
  return <div className="difference-navigation"><button className="text-button" onClick={() => move(-1)}>前の差分箇所</button><button className="text-button" onClick={() => move(1)}>次の差分箇所</button></div>;
}
