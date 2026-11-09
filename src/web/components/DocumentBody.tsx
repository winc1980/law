import { useEffect, useRef, useState } from "react";
import { articles, articleAnchor, chapterAnchor, kanji, newArticle, newParagraph, nodes, type Article, type Document, type Identified } from "../../domain/model";

export type Mutate = (fn: (document: Document) => void) => void;
export type DisplayOptions = { hidden?: ReadonlySet<string>; search?: string };
function Text({ value, search }: { value: string; search?: string }) {
  if (!search) return <>{value}</>;
  const parts = value.split(search);
  return <>{parts.map((part, i) => <span key={i}>{i > 0 && <mark className="search-hit">{search}</mark>}{part}</span>)}</>;
}
const find = <T extends Identified>(doc: Document, uuid: string | undefined): T => nodes(doc).find(n => n.uuid === uuid) as T;
function articleLists(doc: Document): Article[][] {
  return typeof doc.body === "string" ? [] : [doc.body.articles, ...doc.body.chapters?.map(c => c.articles) ?? [], ...doc.body.supplementaryProvisions?.map(p => p.articles) ?? []].filter((a): a is Article[] => !!a);
}
function Field({ label, value, onChange, compact = false }: { label: string; value: string; onChange: (value: string) => void; compact?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const field = ref.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight + 2}px`;
  }, [value]);
  return compact ? <input className="inline-field" aria-label={label} value={value} onChange={e => onChange(e.target.value)} /> : <textarea ref={ref} className="text-field" aria-label={label} value={value} rows={1} onChange={e => onChange(e.target.value)} />;
}
export function DocumentBody({ document: doc, mutate, display }: { document: Document; mutate?: Mutate; display?: DisplayOptions }) {
  const [activeNodes, setActiveNodes] = useState<string[]>([]);
  const pointerInProgress = useRef(false);
  // Safariではボタンのmousedownで入力欄のフォーカスが外れる。
  // blurで操作欄を消さず、選択したノードとその親の操作欄を維持する。
  const selectNodes = (target: EventTarget | null) => {
    const selected: string[] = [];
    let element = target instanceof Element ? target : null;
    while (element) {
      const uuid = element.getAttribute("data-editor-node");
      if (uuid) selected.push(uuid);
      element = element.parentElement;
    }
    if (selected.length) setActiveNodes(previous => previous.length === selected.length && previous.every((uuid, i) => uuid === selected[i]) ? previous : selected);
  };
  const set = (id: string | undefined, key: string, value: string) => mutate?.(d => Reflect.set(find(d, id), key, value));
  const moveArticle = (uuid: string | undefined, delta: number) => mutate?.(d => {
    const list = articleLists(d).find(list => list.some(a => a.uuid === uuid));
    if (!list) return;
    const i = list.findIndex(a => a.uuid === uuid), j = i + delta;
    if (j >= 0 && j < list.length) [list[i], list[j]] = [list[j], list[i]];
  });
  const renderArticle = (a: Article) => <article className="law-article" id={articleAnchor(a)} key={a.uuid} hidden={display?.hidden?.has(a.uuid!)} data-editor-node={mutate ? a.uuid : undefined} data-active={mutate ? activeNodes.includes(a.uuid!) : undefined}>
    {(a.caption || mutate) && <div className="article-caption">（{mutate ? <Field compact label={`${a.name}の見出し`} value={a.caption ?? ""} onChange={v => set(a.uuid, "caption", v)} /> : a.caption}）</div>}
    {mutate && <div className="node-tools article-tools">
      <label>条名 <Field compact label={`${a.name}の名称`} value={a.name} onChange={v => set(a.uuid, "name", v)} /></label>
      <button onClick={() => moveArticle(a.uuid, -1)} aria-label={`${a.name}を上へ`}>↑</button><button onClick={() => moveArticle(a.uuid, 1)} aria-label={`${a.name}を下へ`}>↓</button>
      <button onClick={() => mutate(d => { const list = articleLists(d).find(l => l.some(x => x.uuid === a.uuid))!; list.splice(list.findIndex(x => x.uuid === a.uuid) + 1, 0, newArticle()); })}>次に条を追加</button>
      <button className="danger" onClick={() => mutate(d => { const list = articleLists(d).find(l => l.some(x => x.uuid === a.uuid))!; list.splice(list.findIndex(x => x.uuid === a.uuid), 1); })}>条を削除</button>
      {typeof doc.body !== "string" && doc.body.chapters && <select aria-label={`${a.name}の移動先`} value="" onChange={e => {
        const target = e.target.value; if (!target) return;
        mutate(d => { if (typeof d.body === "string") return; const source = articleLists(d).find(l => l.some(x => x.uuid === a.uuid))!; const article = source.splice(source.findIndex(x => x.uuid === a.uuid), 1)[0]; d.body.chapters!.find(c => c.uuid === target)!.articles.push(article); });
      }}><option value="">章へ移動…</option>{doc.body.chapters.map(c => <option key={c.uuid} value={c.uuid}>{c.name} {c.title}</option>)}</select>}
    </div>}
    {a.paragraphs.map((p, i) => <div className="paragraph-block" key={p.uuid} data-editor-node={mutate ? p.uuid : undefined} data-active={mutate ? activeNodes.includes(p.uuid!) : undefined}>
      <div className="law-paragraph"><span className="paragraph-marker" data-paragraph-number={i === 0 ? undefined : i + 1}>{i === 0 ? a.name : String(i + 1).replace(/\d/g, c => String.fromCharCode(c.charCodeAt(0) + 0xfee0))}</span><div className="paragraph-text">{mutate ? <Field label={`${a.name} 第${i + 1}項の本文`} value={p.text} onChange={v => set(p.uuid, "text", v)} /> : <><Text value={p.text} search={display?.search} /><a className="permalink" href={`#${articleAnchor(a)}`} aria-label={`${a.name}の固定リンク`}>§</a></>}</div></div>
      {mutate && <div className="node-tools paragraph-tools">
        <span>第{i + 1}項</span>
        <button disabled={i === 0} onClick={() => mutate(d => { const list = find<Article>(d, a.uuid).paragraphs; [list[i - 1], list[i]] = [list[i], list[i - 1]]; })}>↑</button>
        <button disabled={i === a.paragraphs.length - 1} onClick={() => mutate(d => { const list = find<Article>(d, a.uuid).paragraphs; [list[i + 1], list[i]] = [list[i], list[i + 1]]; })}>↓</button>
        <button onClick={() => mutate(d => find<Article>(d, a.uuid).paragraphs.splice(i + 1, 0, newParagraph()))}>次に項を追加</button>
        <button onClick={() => mutate(d => { const paragraph = find<Article>(d, a.uuid).paragraphs[i]; (paragraph.items ??= []).push({ uuid: crypto.randomUUID(), text: "" }); })}>号を追加</button>
        <button className="danger" disabled={a.paragraphs.length === 1} onClick={() => mutate(d => find<Article>(d, a.uuid).paragraphs.splice(i, 1))}>項を削除</button>
      </div>}
      {!!p.items?.length && <ol className="law-items">{p.items.map((item, j) => <li key={item.uuid} data-editor-node={mutate ? item.uuid : undefined} data-active={mutate ? activeNodes.includes(item.uuid!) : undefined}><span className="item-marker">{kanji(j + 1)}</span><div>{mutate ? <><Field label={`${a.name} 第${i + 1}項 第${j + 1}号`} value={item.text} onChange={v => set(item.uuid, "text", v)} /><div className="node-tools">
        <button disabled={j === 0} onClick={() => mutate(d => { const list = find<Article>(d, a.uuid).paragraphs[i].items!; [list[j - 1], list[j]] = [list[j], list[j - 1]]; })}>↑</button>
        <button disabled={j === p.items!.length - 1} onClick={() => mutate(d => { const list = find<Article>(d, a.uuid).paragraphs[i].items!; [list[j + 1], list[j]] = [list[j], list[j + 1]]; })}>↓</button>
        <button className="danger" onClick={() => mutate(d => find<Article>(d, a.uuid).paragraphs[i].items!.splice(j, 1))}>号を削除</button>
      </div></> : <Text value={item.text} search={display?.search} />}</div></li>)}</ol>}
    </div>)}
    {mutate && <button className="add-line" onClick={() => mutate(d => find<Article>(d, a.uuid).paragraphs.push(newParagraph()))}>＋ 項を追加</button>}
  </article>;
  if (typeof doc.body === "string") return <div className="plain-body" hidden={display?.hidden?.has("body")}>{mutate ? <Field label="本文" value={doc.body} onChange={v => mutate(d => { d.body = v; })} /> : <Text value={doc.body} search={display?.search} />}</div>;
  return <div className={mutate ? "law-body is-editing" : "law-body"}
    onPointerDownCapture={mutate ? () => { pointerInProgress.current = true; } : undefined}
    onPointerCancelCapture={mutate ? () => { pointerInProgress.current = false; } : undefined}
    onKeyDownCapture={mutate ? () => { pointerInProgress.current = false; } : undefined}
    onFocusCapture={mutate ? event => { if (!pointerInProgress.current) selectNodes(event.target); } : undefined}
    onClickCapture={mutate ? event => {
      // タッチ中に操作欄を挿入すると、同じ座標の別ボタンへclickが届く。
      // 押した要素へのclickが確定してから表示する。
      pointerInProgress.current = false;
      selectNodes(event.target);
    } : undefined}>
    {(doc.body.preamble || mutate) && <section className="preamble" id="preamble" hidden={display?.hidden?.has("preamble")}>{mutate ? <details open={!!doc.body.preamble}><summary>前文</summary><Field label="前文" value={doc.body.preamble ?? ""} onChange={v => mutate(d => { if (typeof d.body !== "string") d.body.preamble = v; })} /></details> : <Text value={doc.body.preamble ?? ""} search={display?.search} />}</section>}
    <div id="main-provisions" hidden={display?.hidden?.has("body")}>
    {doc.body.articles?.map(renderArticle)}
    {doc.body.chapters?.map((c, i) => <section key={c.uuid} id={chapterAnchor(c)} className="law-chapter" hidden={display?.hidden?.has(c.uuid!)} data-editor-node={mutate ? c.uuid : undefined} data-active={mutate ? activeNodes.includes(c.uuid!) : undefined}>
      <h2>{mutate ? <><Field compact label={`${c.name}の名称`} value={c.name} onChange={v => set(c.uuid, "name", v)} /> <Field compact label={`${c.name}の題名`} value={c.title} onChange={v => set(c.uuid, "title", v)} /></> : `${c.name}　${c.title}`}</h2>
      {mutate && <div className="node-tools">
        <button disabled={i === 0} onClick={() => mutate(d => { if (typeof d.body === "string") return; const l = d.body.chapters!; [l[i - 1], l[i]] = [l[i], l[i - 1]]; })}>章を上へ</button>
        <button disabled={typeof doc.body === "string" || i === doc.body.chapters!.length - 1} onClick={() => mutate(d => { if (typeof d.body === "string") return; const l = d.body.chapters!; [l[i + 1], l[i]] = [l[i], l[i + 1]]; })}>章を下へ</button>
        <button onClick={() => mutate(d => { if (typeof d.body !== "string") d.body.chapters![i].articles.push(newArticle()); })}>条を追加</button>
        <button className="danger" onClick={() => mutate(d => { if (typeof d.body !== "string") d.body.chapters!.splice(i, 1); })}>章を削除</button>
      </div>}
      {c.articles.map(renderArticle)}
    </section>)}
    </div>
    {mutate && <div className="structure-tools">
      <button className="secondary" onClick={() => mutate(d => {
        if (typeof d.body === "string") return;
        if (d.body.chapters) {
          const last = d.body.chapters.at(-1);
          if (last) last.articles.push(newArticle());
          else d.body.chapters.push({ uuid: crypto.randomUUID(), name: "第一章", title: "新しい章", articles: [newArticle("第一条")] });
        } else d.body.articles!.push(newArticle());
      })}>＋ 条を追加</button>
      <button className="secondary" onClick={() => mutate(d => {
        if (typeof d.body === "string") return;
        if (d.body.articles) { d.body.chapters = [{ uuid: crypto.randomUUID(), name: "第一章", title: "総則", articles: d.body.articles }]; delete d.body.articles; }
        d.body.chapters!.push({ uuid: crypto.randomUUID(), name: `第${kanji(d.body.chapters!.length + 1)}章`, title: "新しい章", articles: [newArticle()] });
      })}>＋ 章を追加</button>
      <button className="secondary" onClick={() => mutate(d => { if (typeof d.body !== "string") (d.body.supplementaryProvisions ??= []).push({ uuid: crypto.randomUUID(), title: "附則", articles: [newArticle("第一条")] }); })}>＋ 附則を追加</button>
    </div>}
    {doc.body.supplementaryProvisions?.map((p, i) => <section key={p.uuid} id={`supp-${p.uuid}`} className="law-chapter supplementary" hidden={display?.hidden?.has(p.uuid!)} data-editor-node={mutate ? p.uuid : undefined} data-active={mutate ? activeNodes.includes(p.uuid!) : undefined}><h2>{mutate ? <Field compact label={`附則${i + 1}の題名`} value={p.title} onChange={v => set(p.uuid, "title", v)} /> : p.title}</h2>
      {mutate && <div className="node-tools"><button onClick={() => mutate(d => { if (typeof d.body !== "string") d.body.supplementaryProvisions![i].articles.push(newArticle()); })}>条を追加</button><button className="danger" onClick={() => mutate(d => { if (typeof d.body !== "string") d.body.supplementaryProvisions!.splice(i, 1); })}>附則を削除</button></div>}
      {p.articles.map(renderArticle)}
    </section>)}
  </div>;
}

function Eye({ visible }: { visible: boolean }) {
  return <svg viewBox="0 0 20 16" width="16" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M1 8s3-5 9-5 9 5 9 5-3 5-9 5-9-5-9-5Z" /><circle cx="10" cy="8" r="2.5" />{!visible && <path d="m2 1 16 14" strokeWidth="2" />}</svg>;
}

export function Contents({ document: doc, hidden = new Set<string>(), onHiddenChange, changedIds, bodyContents = true, onNavigate }: {
  document: Document;
  hidden?: ReadonlySet<string>;
  onHiddenChange?: (hidden: Set<string>) => void;
  changedIds?: ReadonlySet<string>;
  bodyContents?: boolean;
  onNavigate?: () => void;
}) {
  const [changesOnly, setChangesOnly] = useState(false);
  const allKeys = ["body", "toc", "preamble", ...nodes(doc).flatMap(n => n.uuid ? [n.uuid] : [])];
  const visible = (key: string, parents: string[]) => !hidden.has(key) && !parents.some(p => hidden.has(p));
  const show = (keys: string[]) => {
    if (!onHiddenChange) return;
    const next = new Set(hidden);
    keys.forEach(key => next.delete(key));
    onHiddenChange(next);
  };
  const visibility = (key: string, label: string, parents: string[] = [], children: string[] = []) => onHiddenChange && <button type="button" className="visibility-button" aria-label={`${label}を${visible(key, parents) ? "非表示" : "表示"}`} aria-pressed={visible(key, parents)} onClick={e => {
    e.preventDefault(); e.stopPropagation();
    if (!visible(key, parents)) show([key, ...parents, ...children]);
    else onHiddenChange(new Set([...hidden, key]));
  }}><Eye visible={visible(key, parents)} /></button>;
  const jump = (id: string, keys: string[]) => {
    show(keys);
    onNavigate?.();
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
  };
  const hasChanges = (a: Article) => !changesOnly || !changedIds || [a.uuid, ...a.paragraphs.flatMap(p => [p.uuid, ...p.items?.map(i => i.uuid) ?? []])].some(id => id && changedIds.has(id));
  const articleLink = (a: Article, parents: string[]) => hasChanges(a) && <li key={a.uuid} className="toc-article"><div className="tree-row">{visibility(a.uuid!, a.name, parents)}<a href={`#${articleAnchor(a)}`} onClick={() => jump(articleAnchor(a), [a.uuid!, ...parents])}>{a.name}{a.caption && `（${a.caption}）`}</a></div></li>;
  const body = doc.body;
  return <nav aria-label="文書の目次" className="contents">
    <div className="contents-heading">目次</div>
    {onHiddenChange && <div className="contents-actions"><button onClick={() => onHiddenChange(new Set())}>全表示</button><button onClick={() => onHiddenChange(new Set(allKeys))}>全非表示</button>{changedIds && <button aria-pressed={changesOnly} onClick={() => setChangesOnly(!changesOnly)}>差分箇所</button>}</div>}
    <ul>
      {typeof body !== "string" && body.preamble && <li><div className="tree-row">{visibility("preamble", "前文")}<a href="#preamble" onClick={() => jump("preamble", ["preamble"])}>前文</a></div></li>}
      {typeof body !== "string" && bodyContents && onHiddenChange && <li><div className="tree-row">{visibility("toc", "本文目次")}<span>目次</span></div></li>}
      {typeof body === "string" ? <li><div className="tree-row">{visibility("body", "本文")}<span>本文</span></div></li> : <>
        <li><details open><summary><span className="tree-row">{visibility("body", "本則", [], allKeys.filter(key => key !== "toc" && key !== "preamble"))}<a href="#main-provisions" onClick={() => jump("main-provisions", ["body"])}>本則</a></span></summary><ul>
          {body.articles?.map(a => articleLink(a, ["body"]))}
          {body.chapters?.filter(c => !changesOnly || c.articles.some(hasChanges) || !!c.uuid && changedIds?.has(c.uuid)).map(c => <li key={c.uuid}><details open><summary><span className="tree-row">{visibility(c.uuid!, c.name, ["body"], c.articles.map(a => a.uuid!))}<a href={`#${chapterAnchor(c)}`} onClick={() => jump(chapterAnchor(c), [c.uuid!, "body"])}>{c.name}　{c.title}</a></span></summary><ul>{c.articles.map(a => articleLink(a, ["body", c.uuid!]))}</ul></details></li>)}
        </ul></details></li>
        {body.supplementaryProvisions?.map(p => <li key={p.uuid}><details open><summary><span className="tree-row">{visibility(p.uuid!, p.title, [], p.articles.map(a => a.uuid!))}<a href={`#supp-${p.uuid}`} onClick={() => jump(`supp-${p.uuid}`, [p.uuid!])}>{p.title}</a></span></summary><ul>{p.articles.map(a => articleLink(a, [p.uuid!]))}</ul></details></li>)}
      </>}
    </ul>
  </nav>;
}
