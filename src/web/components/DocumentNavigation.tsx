import { useEffect, useState } from "react";

import { Link } from "react-router";

import type { Document } from "../../domain/model";
import { useData } from "../App";
import { api } from "../api";
import { downloadDocument } from "../download";
import type { Revision } from "../types";

export function useRevisions(id: string) {
  const data = useData();
  const [revisions, setRevisions] = useState<Revision[]>(
    data.histories?.[id] ?? [],
  );
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setRevisions(data.histories?.[id] ?? []);
    setError("");
    if (data.mode === "local") {
      api<Revision[]>(`/api/documents/${id}/history`)
        .then((value) => {
          if (active) setRevisions(value);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }
    return () => {
      active = false;
    };
  }, [id, data]);
  return { revisions, error };
}

export function RevisionList({
  id,
  revisions,
  selected,
  onSelect,
}: {
  id: string;
  revisions: Revision[];
  selected: string;
  onSelect: (sha: string) => void;
}) {
  const data = useData();
  return (
    <section
      className="revision-panel flex max-h-[42%] min-h-22.5 flex-[0_1_auto] flex-col border-b border-border max-md:min-h-25"
      aria-label="変更履歴"
    >
      <div className="sidebar-heading flex-none px-3.5 py-1.25 text-[12px] text-subtle [&_a]:text-inherit">
        <Link to={`/history/${id}/`}>変更履歴</Link>
      </div>
      <div className="revision-list min-h-0 overflow-y-auto overscroll-contain">
        <button
          className={`revision ${!selected ? "active" : ""}`}
          aria-current={!selected ? "true" : undefined}
          onClick={() => onSelect("")}
        >
          <strong>{data.mode === "local" ? "作業ツリー" : "現在の本文"}</strong>
          {data.commit && <code>{data.commit.slice(0, 8)}</code>}
        </button>
        {revisions.map((revision) => (
          <button
            key={revision.sha}
            className={`revision ${selected === revision.sha ? "active" : ""}`}
            aria-current={selected === revision.sha ? "true" : undefined}
            onClick={() => onSelect(revision.sha)}
          >
            <span>
              <time dateTime={revision.date}>{revision.date.slice(0, 10)}</time>{" "}
              <code>{revision.sha.slice(0, 8)}</code>
            </span>
            <span className="revision-subject pl-2.5 text-[12px]">
              {revision.subject}
            </span>
          </button>
        ))}
        {!revisions.length && (
          <p className="sidebar-message px-3.5 py-1.75 text-[12px] text-muted">
            履歴なし
          </p>
        )}
      </div>
    </section>
  );
}

export function DownloadButton({ document: doc }: { document: Document }) {
  return (
    <button className="text-button" onClick={() => downloadDocument(doc)}>
      ダウンロード
    </button>
  );
}
