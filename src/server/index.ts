import homepage from "../web/index.html";

import { git, history, resolveBase, revisionDocument } from "./git";
import { HttpError, Repository, root } from "./repository";

export function createServer({
  port = Number(Bun.env.PORT ?? 3000),
  directory,
  cwd = root,
}: { port?: number; directory?: string; cwd?: string } = {}) {
  const repository = new Repository(directory);
  const token = crypto.randomUUID();
  const respond = (body: unknown, status = 200) =>
    Response.json(body, {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port,
    development: Bun.env.NODE_ENV !== "production",
    maxRequestBodySize: 2 * 1024 * 1024,
    routes: {
      "/": homepage,
      "/laws/:id/": homepage,
      "/edit/:id/": homepage,
      "/new/": homepage,
      "/history/:id/": homepage,
    },
    async fetch(req) {
      const url = new URL(req.url);
      try {
        // Hostも限定し、DNS rebindingでローカルAPIへアクセスさせない。
        if (
          url.host !== `127.0.0.1:${server.port}` &&
          url.host !== `localhost:${server.port}`
        )
          throw new HttpError(403, "Hostが不正です。");
        if (
          req.headers.has("Origin") &&
          req.headers.get("Origin") !== url.origin
        )
          throw new HttpError(
            403,
            "異なるサイトからのアクセスは許可されていません。",
          );
        if (req.method !== "GET" && req.headers.get("X-Law-Token") !== token)
          throw new HttpError(
            403,
            "編集用トークンが不正です。画面を再読み込みしてください。",
          );
        if (req.method === "GET" && url.pathname === "/api/session")
          return respond({
            mode: "local",
            base: "/",
            csrf: token,
            commit: await git(["rev-parse", "HEAD"], cwd),
            ...(await repository.list()),
          });
        if (req.method === "GET" && url.pathname === "/api/documents")
          return respond(await repository.list());
        if (req.method === "POST" && url.pathname === "/api/documents") {
          const input = await req.json();
          if (typeof input?.id !== "string")
            throw new HttpError(400, "文書IDを指定してください。");
          return respond(
            await repository.save(input.id, input, null, true),
            201,
          );
        }
        const match = url.pathname.match(
          /^\/api\/documents\/([a-z][a-z0-9-]*)(?:\/(comparison|history|revision))?$/,
        );
        if (!match) throw new HttpError(404, "見つかりません。");
        const [, id, action] = match;
        if (req.method === "GET") {
          if (action === "history")
            return respond(
              await history(id, (await repository.read(id)).document, cwd),
            );
          if (action === "revision") {
            const document = await revisionDocument(
              id,
              url.searchParams.get("sha") ?? "",
              cwd,
            );
            if (!document)
              throw new HttpError(
                404,
                "この版の原本は見つからないか、対応していない形式です。",
              );
            return respond(document);
          }
          if (action === "comparison") {
            const mode = url.searchParams.get("base") ?? "main";
            if (mode !== "main" && mode !== "HEAD")
              throw new HttpError(400, "比較元が不正です。");
            const base = await resolveBase(mode, cwd);
            const document = base.sha
              ? await revisionDocument(id, base.sha, cwd)
              : (await repository.read(id)).document;
            return respond({
              ...base,
              document,
              label: base.sha ? base.label : "読み込み時点（Git情報なし）",
            });
          }
          return respond(await repository.read(id));
        }
        if (req.method === "PUT" && !action)
          return respond(
            await repository.save(
              id,
              await req.json(),
              req.headers.get("If-Match"),
            ),
          );
        throw new HttpError(405, "対応していない操作です。");
      } catch (error) {
        if (error instanceof SyntaxError)
          return respond({ error: "JSONを読み取れません。" }, 400);
        if (error instanceof HttpError)
          return respond(
            { error: error.message, details: error.details },
            error.status,
          );
        console.error(error);
        return respond(
          { error: "処理に失敗しました。サーバーのログを確認してください。" },
          500,
        );
      }
    },
  });
  return server;
}
if (import.meta.main) {
  const server = createServer();
  console.log(`Local: ${server.url}`);
}
