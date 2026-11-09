import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Link, Route, Routes, useLocation, useParams, useSearchParams } from "react-router";
import { articles, articleAnchor, chapterAnchor, kinds, type Document } from "../domain/model";
import { compare } from "../domain/diff";
import { Contents, DocumentBody, type DisplayOptions } from "./components/DocumentBody";
import { DiffNavigation, DiffView } from "./components/DiffView";
import { DownloadButton, RevisionList, useRevisions } from "./components/DocumentNavigation";
import { api, sourcePath } from "./api";
import type { Bootstrap } from "./types";

const Data = createContext<Bootstrap>(null!);
export const useData = () => useContext(Data);

export function App({ data, localPages }: { data: Bootstrap; localPages?: { editor: React.ReactNode; create: React.ReactNode } }) {
  const location = useLocation();
  useEffect(() => {
    let target = "";
    try { target = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    if (target) requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ block: "start" }));
  }, [location.pathname, location.hash]);
  return <Data.Provider value={data}>
    <a href="#main" className="skip-link">本文へ移動</a>
    <header className="site-header">
      <Link to="/" className="site-name">WINC 規則・決定</Link>
      <nav aria-label="メインメニュー">
        <Link to="/">文書一覧</Link>
        {data.mode === "local" && <Link to="/new/">新規作成</Link>}
      </nav>
      {data.mode === "local" && <span className="mode-label">ローカル</span>}
    </header>
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/laws/:id/" element={<DocumentReader />} />
      <Route path="/history/:id/" element={<DocumentReader />} />
      <Route path="/edit/:id/" element={data.mode === "local" ? localPages?.editor : <LocalGuide />} />
      <Route path="/new/" element={data.mode === "local" ? localPages?.create : <LocalGuide />} />
      <Route path="*" element={<Missing />} />
    </Routes>
  </Data.Provider>;
}

function searchableText(doc: Document): string {
  if (typeof doc.body === "string") return `${doc.title}\n${doc.body}`;
  return [doc.title, doc.body.preamble, ...articles(doc).map(a =>
    [a.name, a.caption, ...a.paragraphs.map(p => [p.text, ...p.items?.map(i => i.text) ?? []].join("\n"))].join("\n")
  )].join("\n");
}

function Index() {
  const data = useData();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("すべて");
  const list = data.documents.filter(d => (kind === "すべて" || d.kind === kind) && searchableText(d).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <main id="main" className="index-page">
    <h1>規則・決定</h1>
    <form className="catalog-search" onSubmit={e => e.preventDefault()}>
      <label>検索 <input type="search" aria-label="文書の題名・本文を検索" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <label>種別 <select value={kind} onChange={e => setKind(e.target.value)}>{["すべて", ...kinds].map(k => <option key={k}>{k}</option>)}</select></label>
      <span>{list.length}件</span>
    </form>
    <table className="document-list"><thead><tr><th>文書名</th><th>種別</th><th>効力</th><th>構成</th></tr></thead>
      <tbody>{list.map(doc => <tr key={doc.id}>
        <td><Link to={`/laws/${doc.id}/`}>{doc.title}</Link></td>
        <td>{doc.kind}</td><td>{doc.status === "repealed" ? "廃止" : data.mode === "local" ? "作業中" : "有効"}</td>
        <td>{typeof doc.body === "string" ? "本文" : `${doc.body.chapters?.length ? `${doc.body.chapters.length}章 ` : ""}${articles(doc).length}条`}</td>
      </tr>)}</tbody>
    </table>
    {!list.length && <p className="empty-state">該当する文書はありません。</p>}
    {data.errors.map(e => <p className="error-box" role="alert" key={e.id}>{e.id}: {e.message}</p>)}
  </main>;
}

export function DocumentHeading({ doc, extra }: { doc: Document; extra?: React.ReactNode }) {
  const data = useData();
  return <header className="document-heading">
    <div className="document-title"><svg aria-hidden="true" width="17" height="20" viewBox="0 0 17 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 1h8l5 5v13H2zM10 1v5h5M5 10h7M5 13h7" /></svg><h1>{doc.title}</h1><span className="document-kind">{doc.kind}</span><span className="document-state">{doc.status === "repealed" ? "廃止" : data.mode === "local" ? "作業中" : "有効"}</span></div>
    {extra}
  </header>;
}

function BodyContents({ document: doc }: { document: Document }) {
  if (typeof doc.body === "string") return null;
  return <nav className="body-contents" aria-label="本文目次"><p>目次</p>
    {doc.body.chapters?.map(c => <a key={c.uuid} href={`#${chapterAnchor(c)}`}>{c.name}　{c.title}{c.articles.length > 0 && `（${c.articles[0].name}${c.articles.length > 1 ? `―${c.articles.at(-1)!.name}` : ""}）`}</a>)}
    {doc.body.articles?.map(a => <a key={a.uuid} href={`#${articleAnchor(a)}`}>{a.name}{a.caption && `（${a.caption}）`}</a>)}
    {doc.body.supplementaryProvisions?.map(p => <a key={p.uuid} href={`#supp-${p.uuid}`}>{p.title}</a>)}
  </nav>;
}

function DocumentReader() {
  const data = useData();
  const { id = "" } = useParams();
  const current = data.documents.find(d => d.id === id);
  const { revisions, error: historyError } = useRevisions(id);
  const [params, setParams] = useSearchParams();
  // 静的HTMLと初回hydrationを揃え、その後URLで指定された版を読み込む。
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);
  const sha = hydrated ? params.get("revision") ?? "" : "";
  const comparing = hydrated && params.get("view") === "compare";
  const [loaded, setLoaded] = useState<{ sha: string; document: Document } | null>(null);
  const [error, setError] = useState("");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [onlyChanges, setOnlyChanges] = useState(false);
  const [searchIndex, setSearchIndex] = useState(0);
  const snapshot = loaded?.sha === sha ? loaded.document : null;
  const doc = sha ? snapshot : current;
  const revision = revisions.find(r => r.sha === sha);
  useEffect(() => {
    let active = true;
    setError("");
    if (sha) {
      if (!/^[a-f0-9]{40,64}$/.test(sha)) setError("版の指定が不正です。");
      else api<Document>(sourcePath(data, id, sha)).then(document => { if (active) setLoaded({ sha, document }); }).catch(e => { if (active) setError(e.message); });
    }
    return () => { active = false; };
  }, [id, sha, data]);
  useEffect(() => { setHidden(new Set()); setSearchIndex(0); }, [id, sha]);
  useEffect(() => {
    if (!doc || !window.location.hash) return;
    try { document.getElementById(decodeURIComponent(window.location.hash.slice(1)))?.scrollIntoView({ block: "start" }); } catch { /* 不正なハッシュを無視 */ }
  }, [doc]);
  const changedIds = useMemo(() => new Set(current && snapshot ? compare(snapshot, current).map(c => c.id) : []), [current, snapshot]);
  const display: DisplayOptions = { hidden, search };
  const updateParams = (nextSha: string, view: boolean) => {
    setParams({ ...(nextSha ? { revision: nextSha } : {}), ...(view && nextSha ? { view: "compare" } : {}) });
    setSidebarOpen(false);
  };
  const showComparison = () => updateParams(sha || revisions[0]?.sha || "", true);
  const searchNext = () => {
    const marks = Array.from(document.querySelectorAll<HTMLElement>(".document-scroll mark.search-hit"));
    if (!marks.length) return;
    marks[searchIndex % marks.length].scrollIntoView({ block: "center" });
    setSearchIndex(i => i + 1);
  };
  if (!current) return <Missing />;
  return <main id="main" className={`reader-page ${sidebarOpen ? "sidebar-open" : ""}`}>
    <DocumentHeading doc={current} extra={<div className="heading-actions"><button className="mobile-navigation" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(!sidebarOpen)}>履歴・目次</button>{data.mode === "local" && <Link to={`/edit/${id}/`}>編集する</Link>}</div>} />
    <div className="document-workspace">
      <aside className="reader-sidebar">
        <RevisionList id={id} revisions={revisions} selected={sha} onSelect={value => updateParams(value, comparing)} />
        {historyError && <p className="error-box">{historyError}</p>}
        <div className="toc-pane"><Contents document={doc ?? current} hidden={hidden} onHiddenChange={setHidden} changedIds={comparing ? changedIds : undefined} bodyContents={!comparing} onNavigate={() => setSidebarOpen(false)} /></div>
      </aside>
      <section className="reading-area">
        <div className="document-scroll" id="reader-scroll" tabIndex={0} aria-label="条文">
          {error ? <p className="error-box" role="alert">{error}</p> : !doc ? <p className="loading">読み込み中…</p> : <>
            <div className="version-details"><strong>{sha ? revision?.date.slice(0, 10) ?? sha.slice(0, 8) : data.mode === "local" ? "作業ツリー" : "現在の本文"}</strong>{sha && <span>{revision?.subject}</span>}<code>{sha ? sha.slice(0, 8) : data.commit?.slice(0, 8)}</code></div>
            <div className="document-view-controls">
              <div className="view-tabs" role="tablist" aria-label="条文の表示"><button role="tab" aria-selected={!comparing} onClick={() => updateParams(sha, false)}>条文</button><button role="tab" aria-selected={comparing} disabled={!revisions.length} onClick={showComparison}>条文比較</button></div>
              {comparing ? <label className="comparison-filter"><input type="checkbox" checked={onlyChanges} onChange={e => setOnlyChanges(e.target.checked)} />変更箇所のみ</label> : <form className="document-search" onSubmit={e => { e.preventDefault(); searchNext(); }}><input type="search" aria-label="文書内検索" placeholder="文書内検索" value={search} onChange={e => { setSearch(e.target.value); setSearchIndex(0); }} />{search && <button type="submit">次を検索</button>}</form>}
            </div>
            {comparing && snapshot ? <DiffView before={snapshot} after={current} table onlyChanges={onlyChanges} hidden={hidden} /> : <div className="document-text"><h2 className={sha ? "historic-title" : "body-title"}>{doc.title}</h2>{!hidden.has("toc") && <BodyContents document={doc} />}<DocumentBody document={doc} display={display} /></div>}
          </>}
        </div>
        <footer className="document-footer">{comparing && snapshot && <DiffNavigation key={`${sha}-${onlyChanges}`} rootId="reader-scroll" />}<div className="footer-actions"><button className="text-button" onClick={() => window.print()}>印刷</button><DownloadButton document={doc ?? current} /></div></footer>
      </section>
    </div>
  </main>;
}

function LocalGuide() {
  return <main id="main" className="guide-page"><h1>ローカルで編集する</h1><pre>git clone https://github.com/winc1980/law.git{"\n"}cd law{"\n"}bun install{"\n"}bun run dev</pre><Link to="/">文書一覧へ</Link></main>;
}
function Missing() {
  return <main id="main" className="empty-state"><h1>文書が見つかりません</h1><Link to="/">文書一覧へ</Link></main>;
}
