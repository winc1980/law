import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router";
import tailwind from "bun-plugin-tailwind";
import { App } from "../src/web/App";
import type { Bootstrap } from "../src/web/types";
import { root, Repository } from "../src/server/repository";
import { git, history, revisionDocument } from "../src/server/git";
import { validate } from "../src/domain/validation";

const output = resolve(Bun.env.LAW_OUTDIR ?? join(root, "dist"));
if (output === root || root.startsWith(`${output}/`)) throw new Error("出力先が不正です。");
const configuredBase = Bun.env.LAW_BASE_PATH ?? "/law/";
if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(configuredBase)) throw new Error("LAW_BASE_PATHは / または /law/ のようなパスを指定してください。");
const base = configuredBase;
const repository = new Repository();
const { documents, errors } = await repository.list();
if (errors.length || !documents.length) throw new Error(JSON.stringify(errors));
for (const doc of documents) {
  const raw = await Bun.file(join(root, "data", `${doc.id}.json`)).json();
  if (validate(raw).some(p => p.level === "error")) throw new Error(`${doc.id}: 原本の検証に失敗しました。`);
}
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const built = await Bun.build({
  entrypoints: [join(root, "src/web/public.html")],
  outdir: join(output, "assets"),
  publicPath: `${base}assets/`,
  target: "browser", minify: true, plugins: [tailwind],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
});
if (!built.success) throw new AggregateError(built.logs, "ブラウザ用ビルドに失敗しました。");
const templateOutput = built.outputs.find(o => o.path.endsWith(".html"));
if (!templateOutput) throw new Error("HTMLが生成されませんでした。");
const template = await templateOutput.text();
const histories: NonNullable<Bootstrap["histories"]> = {};
for (const doc of documents) {
  histories[doc.id] = [];
  for (const rev of await history(doc.id)) {
    const snapshot = await revisionDocument(doc.id, rev.sha);
    if (!snapshot) { console.warn(`履歴の読み取り対象外: ${doc.id}@${rev.sha.slice(0, 8)}`); continue; }
    histories[doc.id].push(rev);
    await Bun.write(join(output, "history", doc.id, `${rev.sha}.json`), JSON.stringify(snapshot));
  }
}
const data: Bootstrap = { mode: "public", base, documents, errors: [], commit: await git(["rev-parse", "HEAD"]), histories };
const bootstrap = JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
async function page(path: string, title: string) {
  const content = renderToString(<StaticRouter basename={base.replace(/\/$/, "") || "/"} location={`${base}${path}`}><App data={data} /></StaticRouter>);
  const html = template.replace(/<title>.*?<\/title>/, `<title>${escape(title)} | WINC</title>`).replace(/<div id="root"><\/div>/, () => `<div id="root">${content}</div>`).replace("</head>", () => `<script>window.__LAW_DATA__=${bootstrap};</script></head>`);
  await Bun.write(join(output, path, "index.html"), html);
}
await page("", "規則・決定");
for (const doc of documents) {
  await page(`laws/${doc.id}/`, doc.title);
  await page(`history/${doc.id}/`, `${doc.title}の変更履歴`);
  await page(`edit/${doc.id}/`, "ローカルで編集する");
}
await page("new/", "ローカルで編集する");
await page("404/", "見つかりません");
await Bun.write(join(output, "404.html"), await Bun.file(join(output, "404/index.html")).text());
await Bun.write(join(output, ".nojekyll"), "");
console.log(`静的サイトを生成しました: ${output}（${documents.length}文書、base=${base}）`);
