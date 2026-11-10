import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { createServer } from "../../src/server/index";

const dir = await mkdtemp(join(tmpdir(), "law-browser-"));
await Bun.write(
  join(dir, "constitution.json"),
  await Bun.file(
    new URL("../../data/constitution.json", import.meta.url),
  ).text(),
);
const server = createServer({ port: 3107, directory: dir });
const dist = resolve(import.meta.dir, "../../dist");
const base = process.env.LAW_BASE_PATH ?? "/";
const staticServer = Bun.serve({
  hostname: "127.0.0.1",
  port: 3108,
  async fetch(req) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith(base))
      return new Response("Not found", { status: 404 });
    const path = resolve(
      dist,
      url.pathname.slice(base.length),
      url.pathname.endsWith("/") ? "index.html" : "",
    );
    if (!path.startsWith(`${dist}/`))
      return new Response("Not found", { status: 404 });
    const file = Bun.file(path);
    return (await file.exists())
      ? new Response(file)
      : new Response("Not found", { status: 404 });
  },
});
process.on("SIGTERM", async () => {
  await server.stop(true);
  await staticServer.stop(true);
  await rm(dir, { recursive: true, force: true });
  process.exit();
});
console.log(server.url.toString());
