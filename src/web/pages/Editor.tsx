import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { articles, kanji, kinds, newDocument, serialize, type Document } from "../../domain/model";
import { validate } from "../../domain/validation";
import { referenceWarnings } from "../../domain/references";
import { api } from "../api";
import { DocumentHeading, useData } from "../App";
import { Contents, DocumentBody, type Mutate } from "../components/DocumentBody";
import { DiffNavigation, DiffView } from "../components/DiffView";

type Saved = { document: Document; etag: string };
type Comparison = { document: Document | null; sha: string | null; label: string };
export function EditPage() { const { id } = useParams(); return <Editor key={id} id={id!} />; }
export function NewPage() {
  const [id, setId] = useState(""), [title, setTitle] = useState(""), [kind, setKind] = useState<Document["kind"]>("運営規則"), [plain, setPlain] = useState(false), [draft, setDraft] = useState<Document | null>(null);
  if (draft) return <Editor initial={draft} id={id} />;
  return <main id="main" className="new-page"><div className="breadcrumb"><Link to="/">文書一覧</Link><span>›</span><span>新規作成</span></div><h1>新規作成</h1><form className="new-form" onSubmit={e => { e.preventDefault(); setDraft(newDocument(id, title, kind, plain)); }}>
    <label>文書ID<input aria-label="文書ID" aria-describedby="document-id-help" required pattern="[a-z][a-z0-9-]*" value={id} onChange={e => setId(e.target.value)} placeholder="例: clubroom-rules" /><small id="document-id-help">英小文字・数字・ハイフン。ファイル名・URLに使用。</small></label>
    <label>題名<input required value={title} onChange={e => setTitle(e.target.value)} placeholder="例: 部室利用規則" /></label>
    <label>種別<select aria-label="種別" value={kind} onChange={e => { const k = e.target.value as Document["kind"]; setKind(k); if (k === "会則" || k === "運営規則") setPlain(false); }}>{kinds.map(k => <option key={k}>{k}</option>)}</select></label>
    <fieldset><legend>本文の形式</legend><label className="radio-label"><input type="radio" checked={!plain} onChange={() => setPlain(false)} />条文形式 <small>章・条・項・号で構成する</small></label><label className="radio-label"><input type="radio" checked={plain} disabled={kind === "会則" || kind === "運営規則"} onChange={() => setPlain(true)} />単一の文字列 <small>決定・公示などの本文をそのまま記載する</small></label></fieldset>
    <div className="form-actions"><Link to="/">キャンセル</Link><button className="primary" type="submit">本文の編集へ</button></div>
  </form></main>;
}

export function Editor({ id, initial }: { id: string; initial?: Document }) {
  const data = useData(), navigate = useNavigate();
  const [doc, setDoc] = useState<Document | null>(initial ?? null), [saved, setSaved] = useState(initial ? "" : ""), [etag, setEtag] = useState("");
  const [comparison, setComparison] = useState<Comparison | null>(initial ? { document: null, sha: null, label: "新規文書" } : null), [base, setBase] = useState("main");
  const [past, setPast] = useState<Document[]>([]), [future, setFuture] = useState<Document[]>([]), [error, setError] = useState(""), [notice, setNotice] = useState(""), [saving, setSaving] = useState(false), [table, setTable] = useState(false), [tab, setTab] = useState("body");
  const [sidebarOpen, setSidebarOpen] = useState(false), [onlyChanges, setOnlyChanges] = useState(false);
  const busy = useRef(false);
  const isNew = !!initial, dirty = !!doc && serialize(doc) !== saved;
  useEffect(() => {
    if (initial) return;
    let alive = true;
    api<Saved>(`/api/documents/${id}`).then(result => { if (!alive) return; setDoc(result.document); setSaved(serialize(result.document)); setEtag(result.etag); }).catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [id]);
  const loadComparison = async () => {
    if (isNew) return;
    const result = await api<Comparison>(`/api/documents/${id}/comparison?base=${base}`);
    setComparison(result);
  };
  useEffect(() => { let alive = true; if (!isNew) api<Comparison>(`/api/documents/${id}/comparison?base=${base}`).then(result => { if (alive) setComparison(result); }).catch(e => { if (alive) setError(e.message); }); return () => { alive = false; }; }, [id, base]);
  useEffect(() => {
    if (!dirty) return;
    const unload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    const links = (e: MouseEvent) => { const a = (e.target as Element).closest("a"); if (a && a.origin === location.origin && a.pathname !== location.pathname && !confirm("未保存の変更があります。画面を移動しますか？")) { e.preventDefault(); e.stopPropagation(); } };
    window.addEventListener("beforeunload", unload); document.addEventListener("click", links, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", links, true); };
  }, [dirty]);
  const mutate: Mutate = fn => {
    if (!doc || busy.current) return;
    const next = structuredClone(doc); fn(next);
    if (serialize(next) === serialize(doc)) return;
    setPast(p => [...p.slice(-99), doc]);
    setFuture([]); setDoc(next); setNotice("");
  };
  const undo = () => { if (!doc || !past.length || busy.current) return; setFuture(f => [doc, ...f]); setDoc(past.at(-1)!); setPast(p => p.slice(0, -1)); };
  const redo = () => { if (!doc || !future.length || busy.current) return; setPast(p => [...p, doc]); setDoc(future[0]); setFuture(f => f.slice(1)); };
  const problems = useMemo(() => doc ? validate(doc) : [], [doc]);
  const warnings = useMemo(() => doc ? referenceWarnings(comparison?.document ?? null, doc) : [], [comparison, doc]);
  const save = async () => {
    if (!doc || busy.current || problems.some(p => p.level === "error")) return;
    busy.current = true; setSaving(true); setError(""); setNotice("");
    try {
      const result = await api<Saved>(isNew ? "/api/documents" : `/api/documents/${id}`, { method: isNew ? "POST" : "PUT", body: serialize(doc), headers: { "X-Law-Token": data.csrf ?? "", ...(!isNew ? { "If-Match": etag } : {}) } });
      setDoc(result.document); setSaved(serialize(result.document)); setEtag(result.etag); setNotice("保存しました。");
      if (isNew) { data.documents.push(result.document); navigate(`/edit/${id}/`, { replace: true }); }
      else { const index = data.documents.findIndex(d => d.id === id); if (index >= 0) data.documents[index] = result.document; }
    } catch (e) { setError((e as Error).message); }
    finally { busy.current = false; setSaving(false); }
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.isComposing || !(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() === "s") { e.preventDefault(); void save(); }
    };
    window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler);
  });
  if (!doc) return <main id="main" className="guide-page">{error ? <p className="error-box" role="alert">{error}</p> : <p>原本を読み込み中…</p>}</main>;
  return <main id="main" className={`editor-page ${table ? "table-mode" : ""} ${sidebarOpen ? "sidebar-open" : ""}`}>
    <DocumentHeading doc={doc} extra={<div className="heading-actions"><span className="save-state">{dirty ? "未保存の変更あり" : "保存済み"}</span><button className="mobile-navigation" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(!sidebarOpen)}>目次</button><Link to={`/laws/${id}/`}>閲覧に戻る</Link></div>} />
    <div className="editor-toolbar">
      <div className="toolbar-group"><button disabled={!past.length || saving} onClick={undo}>元に戻す</button><button disabled={!future.length || saving} onClick={redo}>やり直す</button><span className="toolbar-separator" /><div className="view-tabs"><button aria-pressed={!table} onClick={() => setTable(false)}>編集</button><button aria-pressed={table} onClick={() => setTable(true)}>新旧対照表</button></div></div>
      <button className="save-button" onClick={() => void save()} disabled={saving || !dirty || problems.some(p => p.level === "error")}>{saving ? "保存中…" : "原本に保存"}</button>
    </div>
    {error && <div className="error-box" role="alert">{error} <button onClick={() => { void navigator.clipboard.writeText(serialize(doc)).then(() => setNotice("JSONをコピーしました。")); }}>JSONをコピー</button></div>}
    {notice && <p className="save-notice" role="status">{notice}</p>}
    {!table && <div className="editor-mobile-tabs"><button aria-pressed={tab === "body"} onClick={() => setTab("body")}>本文</button><button aria-pressed={tab === "diff"} onClick={() => setTab("diff")}>差分・検証</button></div>}
    <div className={`editor-layout tab-${tab}`}>
      <aside className="editor-sidebar">
        <section className="comparison-settings"><label>比較元 <select aria-label="差分の比較元" disabled={isNew} value={base} onChange={e => setBase(e.target.value)}><option value="main">mainとの分岐点</option><option value="HEAD">HEAD</option></select></label><div><code title={comparison?.label}>{comparison?.sha?.slice(0, 8) ?? (isNew ? "新規文書" : "読み込み中…")}</code><button className="text-button" disabled={isNew} onClick={() => void loadComparison().catch(e => setError(e.message))}>更新</button></div></section>
        <div className="toc-pane"><Contents document={doc} bodyContents={false} onNavigate={() => setSidebarOpen(false)} /></div>
      </aside>
      <section className="editor-main">
        <div className="editor-scroll" id="editor-scroll" tabIndex={0} aria-label={table ? "新旧対照表" : "本文の編集"}>
          {table ? <><div className="comparison-options"><label><input type="checkbox" checked={onlyChanges} onChange={e => setOnlyChanges(e.target.checked)} />変更箇所のみ</label></div>{comparison ? <DiffView before={comparison.document} after={doc} table onlyChanges={onlyChanges} /> : <p className="loading">読み込み中…</p>}</> : <>
            <details className="metadata-panel"><summary>文書設定</summary><div className="metadata-fields"><label>題名<input value={doc.title} onChange={e => mutate(d => { d.title = e.target.value; })} /></label><label>種別<select aria-label="文書の種別" value={doc.kind} onChange={e => mutate(d => { d.kind = e.target.value as Document["kind"]; })}>{kinds.map(k => <option key={k}>{k}</option>)}</select></label><label>効力<select aria-label="文書の効力" value={doc.status} onChange={e => mutate(d => { d.status = e.target.value as Document["status"]; })}><option value="active">有効</option><option value="repealed">廃止</option></select></label></div></details>
            <fieldset className="editing-fields" disabled={saving}><DocumentBody document={doc} mutate={mutate} /></fieldset>
            {typeof doc.body !== "string" && <details className="renumber-panel"><summary>再採番</summary><p>本則を第一条から振り直します。本文中の参照は変更しません。</p><button onClick={() => mutate(d => { articles(d).forEach((a, i) => { a.name = `第${kanji(i + 1)}条`; }); })}>本則の条名を再採番</button></details>}
          </>}
        </div>
        {table && <footer className="document-footer"><DiffNavigation key={`${base}-${onlyChanges}`} rootId="editor-scroll" /></footer>}
      </section>
      {!table && <aside className="diff-panel"><h2>差分・検証</h2><div className="diagnostics">{problems.map((problem, i) => <p className="diagnostic error" key={i}>{problem.path}: {problem.message}</p>)}{warnings.map((warning, i) => <p className="diagnostic warning" key={i}>{warning}</p>)}</div>{comparison ? <DiffView before={comparison.document} after={doc} /> : <p className="loading">読み込み中…</p>}</aside>}
    </div>
  </main>;
}
