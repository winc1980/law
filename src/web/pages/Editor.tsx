import { useEffect, useMemo, useRef, useState } from "react";

import { Link, useNavigate, useParams } from "react-router";

import {
  type Document,
  articles,
  kanji,
  kinds,
  newDocument,
  serialize,
} from "../../domain/model";
import { referenceWarnings } from "../../domain/references";
import { validate } from "../../domain/validation";
import { DocumentHeading, useData } from "../App";
import { api } from "../api";
import { DiffNavigation, DiffView } from "../components/DiffView";
import {
  Contents,
  DocumentBody,
  type Mutate,
} from "../components/DocumentBody";
import { downloadDocument } from "../download";

type Saved = { document: Document; etag: string };
type Comparison = {
  document: Document | null;
  sha: string | null;
  label: string;
};
export function EditPage() {
  const { id } = useParams();
  return <Editor key={id} id={id!} />;
}
export function NewPage() {
  const [id, setId] = useState(""),
    [title, setTitle] = useState(""),
    [kind, setKind] = useState<Document["kind"]>("運営規則"),
    [plain, setPlain] = useState(false),
    [draft, setDraft] = useState<Document | null>(null);
  if (draft) return <Editor initial={draft} id={id} />;
  return (
    <main id="main" className="new-page content-page">
      <div className="breadcrumb mb-2.5 flex gap-2.25 text-[12px]">
        <Link to="/">文書一覧</Link>
        <span>›</span>
        <span>新規作成</span>
      </div>
      <h1>新規作成</h1>
      <form
        className="new-form"
        onSubmit={(e) => {
          e.preventDefault();
          setDraft(newDocument(id, title, kind, plain));
        }}
      >
        <label>
          文書ID
          <input
            aria-label="文書ID"
            aria-describedby="document-id-help"
            required
            pattern="[a-z][a-z0-9-]*"
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="例: clubroom-rules"
          />
          <small id="document-id-help">
            英小文字・数字・ハイフン。ファイル名・URLに使用。
          </small>
        </label>
        <label>
          題名
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例: 部室利用規則"
          />
        </label>
        <label>
          種別
          <select
            aria-label="種別"
            value={kind}
            onChange={(e) => {
              const k = e.target.value as Document["kind"];
              setKind(k);
              if (k === "会則" || k === "運営規則") setPlain(false);
            }}
          >
            {kinds.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>本文の形式</legend>
          <label className="radio-label my-1.25 flex flex-wrap items-center [&_small]:ml-3.75">
            <input
              type="radio"
              checked={!plain}
              onChange={() => setPlain(false)}
            />
            条文形式 <small>章・条・項・号で構成する</small>
          </label>
          <label className="radio-label my-1.25 flex flex-wrap items-center [&_small]:ml-3.75">
            <input
              type="radio"
              checked={plain}
              disabled={kind === "会則" || kind === "運営規則"}
              onChange={() => setPlain(true)}
            />
            単一の文字列 <small>決定・公示などの本文をそのまま記載する</small>
          </label>
        </fieldset>
        <div className="form-actions mt-3.75 flex items-center justify-end gap-5">
          <Link to="/">キャンセル</Link>
          <button className="primary" type="submit">
            本文の編集へ
          </button>
        </div>
      </form>
    </main>
  );
}

export function Editor({ id, initial }: { id: string; initial?: Document }) {
  const data = useData(),
    navigate = useNavigate();
  const local = data.mode === "local";
  const published = !local
    ? data.documents.find((d) => d.id === id)
    : undefined;
  const [doc, setDoc] = useState<Document | null>(initial ?? published ?? null),
    [saved, setSaved] = useState(
      !initial && published ? serialize(published) : "",
    ),
    [etag, setEtag] = useState("");
  const [downloaded, setDownloaded] = useState(false);
  const [comparison, setComparison] = useState<Comparison | null>(
      initial
        ? { document: null, sha: null, label: "新規文書" }
        : published
          ? { document: published, sha: data.commit, label: "公開中の本文" }
          : null,
    ),
    [base, setBase] = useState("main");
  const [past, setPast] = useState<Document[]>([]),
    [future, setFuture] = useState<Document[]>([]),
    [error, setError] = useState(
      !local && !initial && !published ? "文書が見つかりません。" : "",
    ),
    [notice, setNotice] = useState(""),
    [saving, setSaving] = useState(false),
    [table, setTable] = useState(false),
    [tab, setTab] = useState("body");
  const [sidebarOpen, setSidebarOpen] = useState(false),
    [onlyChanges, setOnlyChanges] = useState(false);
  const busy = useRef(false);
  const isNew = !!initial,
    dirty = !!doc && serialize(doc) !== saved;
  useEffect(() => {
    if (initial || !local) return;
    let alive = true;
    api<Saved>(`/api/documents/${id}`)
      .then((result) => {
        if (!alive) return;
        setDoc(result.document);
        setSaved(serialize(result.document));
        setEtag(result.etag);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [id, initial, local]);
  const loadComparison = async () => {
    if (isNew || !local) return;
    const result = await api<Comparison>(
      `/api/documents/${id}/comparison?base=${base}`,
    );
    setComparison(result);
  };
  useEffect(() => {
    let alive = true;
    if (!isNew && local)
      api<Comparison>(`/api/documents/${id}/comparison?base=${base}`)
        .then((result) => {
          if (alive) setComparison(result);
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    return () => {
      alive = false;
    };
  }, [id, base, isNew, local]);
  useEffect(() => {
    if (!dirty) return;
    const unload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const links = (e: MouseEvent) => {
      const a = (e.target as Element).closest("a");
      if (
        a &&
        !a.hasAttribute("download") &&
        a.origin === location.origin &&
        a.pathname !== location.pathname &&
        !confirm(
          local
            ? "未保存の変更があります。画面を移動しますか？"
            : "未ダウンロードの変更があります。画面を移動しますか？",
        )
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", links, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", links, true);
    };
  }, [dirty, local]);
  const mutate: Mutate = (fn) => {
    if (!doc || busy.current) return;
    const next = structuredClone(doc);
    fn(next);
    if (serialize(next) === serialize(doc)) return;
    setPast((p) => [...p.slice(-99), doc]);
    setFuture([]);
    setDoc(next);
    setNotice("");
  };
  const undo = () => {
    if (!doc || !past.length || busy.current) return;
    setFuture((f) => [doc, ...f]);
    setDoc(past.at(-1)!);
    setPast((p) => p.slice(0, -1));
  };
  const redo = () => {
    if (!doc || !future.length || busy.current) return;
    setPast((p) => [...p, doc]);
    setDoc(future[0]);
    setFuture((f) => f.slice(1));
  };
  const problems = useMemo(() => (doc ? validate(doc) : []), [doc]);
  const warnings = useMemo(
    () => (doc ? referenceWarnings(comparison?.document ?? null, doc) : []),
    [comparison, doc],
  );
  const save = async () => {
    if (!doc || busy.current || problems.some((p) => p.level === "error"))
      return;
    busy.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (!local) {
        downloadDocument(doc);
        setSaved(serialize(doc));
        setDownloaded(true);
        setNotice("JSONのダウンロードを開始しました。");
        return;
      }
      const result = await api<Saved>(
        isNew ? "/api/documents" : `/api/documents/${id}`,
        {
          method: isNew ? "POST" : "PUT",
          body: serialize(doc),
          headers: {
            "X-Law-Token": data.csrf ?? "",
            ...(!isNew ? { "If-Match": etag } : {}),
          },
        },
      );
      setDoc(result.document);
      setSaved(serialize(result.document));
      setEtag(result.etag);
      setNotice("保存しました。");
      if (isNew) {
        data.documents.push(result.document);
        navigate(`/edit/${id}/`, { replace: true });
      } else {
        const index = data.documents.findIndex((d) => d.id === id);
        if (index >= 0) data.documents[index] = result.document;
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.isComposing || !(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
  if (!doc)
    return (
      <main
        id="main"
        className="guide-page content-page [&_pre]:my-3 [&_pre]:font-mono [&_pre]:text-[13px] [&_pre]:leading-[1.8]"
      >
        {error ? (
          <p className="error-box" role="alert">
            {error}
          </p>
        ) : (
          <p>原本を読み込み中…</p>
        )}
      </main>
    );
  return (
    <main
      id="main"
      className={`editor-page workspace-page ${table ? "table-mode" : ""} ${sidebarOpen ? "sidebar-open" : ""}`}
    >
      <DocumentHeading
        doc={doc}
        extra={
          <div className="heading-actions">
            <span className="save-state text-[12px] text-subtle">
              {local
                ? dirty
                  ? "未保存の変更あり"
                  : "保存済み"
                : dirty
                  ? "未ダウンロードの変更あり"
                  : downloaded
                    ? "ダウンロード済み"
                    : "変更なし"}
            </span>
            <button
              className="mobile-navigation"
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              目次
            </button>
            <Link to={`/laws/${id}/`}>閲覧に戻る</Link>
          </div>
        }
      />
      <div className="editor-toolbar flex flex-none items-center justify-between gap-2 border-b border-divider px-4 py-1.5 text-[12px] max-md:px-2 max-md:py-1.25 print:hidden">
        <div className="toolbar-group flex items-center gap-1.5 max-md:gap-1">
          <button disabled={!past.length || saving} onClick={undo}>
            元に戻す
          </button>
          <button disabled={!future.length || saving} onClick={redo}>
            やり直す
          </button>
          <span className="toolbar-separator mx-1 h-4.5 w-px bg-divider max-md:mx-px" />
          <div className="view-tabs">
            <button aria-pressed={!table} onClick={() => setTable(false)}>
              編集
            </button>
            <button aria-pressed={table} onClick={() => setTable(true)}>
              新旧対照表
            </button>
          </div>
        </div>
        <button
          className="save-button border-subtle font-bold"
          onClick={() => void save()}
          disabled={
            saving || !dirty || problems.some((p) => p.level === "error")
          }
        >
          {local ? (saving ? "保存中…" : "原本に保存") : "JSONをダウンロード"}
        </button>
      </div>
      {error && (
        <div className="error-box" role="alert">
          {error}{" "}
          <button
            onClick={() => {
              void navigator.clipboard
                .writeText(serialize(doc))
                .then(() => setNotice("JSONをコピーしました。"));
            }}
          >
            JSONをコピー
          </button>
        </div>
      )}
      {notice && (
        <p
          className="save-notice flex-none border-b border-faint px-4 py-0.75 text-[12px] print:hidden"
          role="status"
        >
          {notice}
        </p>
      )}
      {!table && (
        <div className="editor-mobile-tabs hidden max-md:flex max-md:flex-none max-md:border-b max-md:border-divider [&_button]:flex-1 [&_button]:rounded-none [&_button]:border-0 [&_button]:p-1.25 [&_button]:text-[12px] [&_button[aria-pressed=true]]:bg-selected print:hidden">
          <button aria-pressed={tab === "body"} onClick={() => setTab("body")}>
            本文
          </button>
          <button aria-pressed={tab === "diff"} onClick={() => setTab("diff")}>
            差分・検証
          </button>
        </div>
      )}
      <div
        className={`editor-layout relative grid min-h-0 flex-1 grid-cols-[250px_minmax(0,1fr)_280px] md:max-lg:grid-cols-[205px_minmax(0,1fr)_240px] 2xl:grid-cols-[280px_minmax(0,1fr)_320px] max-md:grid-cols-[minmax(0,1fr)] in-[.table-mode]:grid-cols-[250px_minmax(0,1fr)] md:max-lg:in-[.table-mode]:grid-cols-[205px_minmax(0,1fr)] 2xl:in-[.table-mode]:grid-cols-[280px_minmax(0,1fr)] max-md:in-[.table-mode]:grid-cols-[minmax(0,1fr)] print:block print:h-auto print:overflow-visible tab-${tab}`}
      >
        <aside className="editor-sidebar sidebar-pane">
          <section className="comparison-settings border-b border-divider px-3 py-2.25 text-[12px] [&_label]:flex [&_label]:items-center [&_label]:gap-2 [&_select]:w-32.5 [&_select]:flex-1 [&_select]:text-[12px] [&>div]:mt-1.25 [&>div]:flex [&>div]:items-center [&>div]:justify-between [&_code]:text-subtle">
            {local ? (
              <>
                <label>
                  比較元{" "}
                  <select
                    aria-label="差分の比較元"
                    disabled={isNew}
                    value={base}
                    onChange={(e) => setBase(e.target.value)}
                  >
                    <option value="main">mainとの分岐点</option>
                    <option value="HEAD">HEAD</option>
                  </select>
                </label>
                <div>
                  <code title={comparison?.label}>
                    {comparison?.sha?.slice(0, 8) ??
                      (isNew ? "新規文書" : "読み込み中…")}
                  </code>
                  <button
                    className="text-button"
                    disabled={isNew}
                    onClick={() =>
                      void loadComparison().catch((e) => setError(e.message))
                    }
                  >
                    更新
                  </button>
                </div>
              </>
            ) : (
              <p>比較元：{comparison?.label}</p>
            )}
          </section>
          <div className="toc-pane min-h-0 flex-1 overflow-auto overscroll-contain p-2">
            <Contents
              document={doc}
              bodyContents={false}
              onNavigate={() => setSidebarOpen(false)}
            />
          </div>
        </aside>
        <section className="editor-main flex min-h-0 min-w-0 flex-col max-md:in-[.tab-diff]:hidden max-md:in-[.table-mode]:flex print:block print:h-auto print:overflow-visible">
          <div
            className="editor-scroll min-h-0 flex-1 scroll-pt-3 overflow-auto px-4.5 pt-2.5 pb-6 md:max-lg:px-3 max-md:px-2.5 max-md:pt-2 max-md:pb-4.5 in-[.table-mode]:p-0 print:h-auto print:overflow-visible print:p-0"
            id="editor-scroll"
            tabIndex={0}
            aria-label={table ? "新旧対照表" : "本文の編集"}
          >
            {table ? (
              <>
                <div className="comparison-options px-4.5 py-1.5 text-right text-[12px] print:hidden">
                  <label>
                    <input
                      type="checkbox"
                      checked={onlyChanges}
                      onChange={(e) => setOnlyChanges(e.target.checked)}
                    />
                    変更箇所のみ
                  </label>
                </div>
                {comparison ? (
                  <DiffView
                    before={comparison.document}
                    after={doc}
                    table
                    onlyChanges={onlyChanges}
                  />
                ) : (
                  <p className="loading p-4 text-[13px]">読み込み中…</p>
                )}
              </>
            ) : (
              <>
                <details className="metadata-panel mb-3 border-b border-faint pb-2 text-[12px] [&_summary]:w-fit print:hidden">
                  <summary>文書設定</summary>
                  <div className="metadata-fields flex flex-wrap gap-2 py-2 [&_label]:flex [&_label]:items-center [&_label]:gap-1.5 [&_label:first-child]:w-full [&_label:first-child_input]:w-[min(600px,90%)] [&_input]:text-[13px] [&_select]:text-[13px]">
                    <label>
                      題名
                      <input
                        value={doc.title}
                        onChange={(e) =>
                          mutate((d) => {
                            d.title = e.target.value;
                          })
                        }
                      />
                    </label>
                    <label>
                      種別
                      <select
                        aria-label="文書の種別"
                        value={doc.kind}
                        onChange={(e) =>
                          mutate((d) => {
                            d.kind = e.target.value as Document["kind"];
                          })
                        }
                      >
                        {kinds.map((k) => (
                          <option key={k}>{k}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      効力
                      <select
                        aria-label="文書の効力"
                        value={doc.status}
                        onChange={(e) =>
                          mutate((d) => {
                            d.status = e.target.value as Document["status"];
                          })
                        }
                      >
                        <option value="active">有効</option>
                        <option value="repealed">廃止</option>
                      </select>
                    </label>
                  </div>
                </details>
                <fieldset
                  className="editing-fields m-0 min-w-0 border-0 p-0"
                  disabled={saving}
                >
                  <DocumentBody document={doc} mutate={mutate} />
                </fieldset>
                {typeof doc.body !== "string" && (
                  <details className="renumber-panel mt-4.5 text-[12px] [&_p]:my-1.25 [&_button]:text-[12px] print:hidden">
                    <summary>再採番</summary>
                    <p>
                      本則を第一条から振り直します。本文中の参照は変更しません。
                    </p>
                    <button
                      onClick={() =>
                        mutate((d) => {
                          articles(d).forEach((a, i) => {
                            a.name = `第${kanji(i + 1)}条`;
                          });
                        })
                      }
                    >
                      本則の条名を再採番
                    </button>
                  </details>
                )}
              </>
            )}
          </div>
          {table && (
            <footer className="document-footer">
              <DiffNavigation
                key={`${base}-${onlyChanges}`}
                rootId="editor-scroll"
              />
            </footer>
          )}
        </section>
        {!table && (
          <aside className="diff-panel min-h-0 min-w-0 overflow-auto border-l border-border text-[12px] [&_h2]:sticky [&_h2]:top-0 [&_h2]:z-1 [&_h2]:border-b [&_h2]:border-faint [&_h2]:bg-white [&_h2]:px-3 [&_h2]:py-2 [&_h2]:text-[13px] max-md:border-l-0 max-md:in-[.tab-body]:hidden print:hidden">
            <h2>差分・検証</h2>
            <div className="diagnostics empty:hidden">
              {problems.some((problem) => problem.code === "empty") && (
                <div
                  className="diagnostic mx-2.5 my-2 border-l-2 bg-error-bg px-2 py-1.5 text-error"
                  role="status"
                >
                  <p className="font-bold">未入力の項目があります</p>
                  <p>
                    {local
                      ? "空欄を埋めてから保存してください。"
                      : "空欄を埋めてからダウンロードしてください。"}
                  </p>
                  <ul className="mt-1.5 list-disc space-y-1 pl-4 wrap-anywhere">
                    {problems
                      .filter((problem) => problem.code === "empty")
                      .map((problem) => (
                        <li key={problem.path}>{problem.message}</li>
                      ))}
                  </ul>
                </div>
              )}
              {problems
                .filter((problem) => problem.code !== "empty")
                .map((problem, i) => (
                  <p
                    className="diagnostic mx-2.5 my-2 border-l-2 px-2 py-1.5 wrap-anywhere error bg-error-bg text-error"
                    key={i}
                  >
                    {problem.path}: {problem.message}
                  </p>
                ))}
              {warnings.map((warning, i) => (
                <p
                  className="diagnostic mx-2.5 my-2 border-l-2 px-2 py-1.5 wrap-anywhere warning bg-warning-bg text-warning"
                  key={i}
                >
                  {warning}
                </p>
              ))}
            </div>
            {comparison ? (
              <DiffView before={comparison.document} after={doc} />
            ) : (
              <p className="loading p-4 text-[13px]">読み込み中…</p>
            )}
          </aside>
        )}
      </div>
    </main>
  );
}
