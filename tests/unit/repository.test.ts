import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createServer } from "../../src/server/index";
import { Repository } from "../../src/server/repository";

import { fixture } from "./domain.test";

let dir: string, repo: Repository, server: ReturnType<typeof createServer>;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "law-api-"));
  repo = new Repository(dir);
  server = createServer({ port: 0, directory: dir });
});
afterAll(async () => {
  await server?.stop(true);
  if (dir) await rm(dir, { recursive: true, force: true });
});
describe("原本保存API", () => {
  test("検証、保存、ハッシュ競合検出と外部更新の保護", async () => {
    const created = await repo.save("sample", fixture(), null, true);
    expect((await repo.read("sample")).document.title).toBe("会則");
    const draft = { ...created.document, title: "変更後" };
    const updated = await repo.save("sample", draft, created.etag);
    await expect(
      repo.save("sample", created.document, created.etag),
    ).rejects.toMatchObject({ status: 409 });
    expect((await repo.read("sample")).document.title).toBe("変更後");
    await expect(
      repo.save("sample", { ...draft, unknown: true }, updated.etag),
    ).rejects.toMatchObject({ status: 422 });
    expect((await repo.read("sample")).etag).toBe(updated.etag);
    await expect(repo.save("sample", draft, null, true)).rejects.toMatchObject({
      status: 409,
    });
  });
  test("同時保存では1件だけを受け付ける", async () => {
    const saved = await repo.read("sample");
    const results = await Promise.allSettled([
      repo.save("sample", { ...saved.document, title: "A" }, saved.etag),
      repo.save("sample", { ...saved.document, title: "B" }, saved.etag),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
  test("パス逸脱とシンボリックリンクを拒否する", async () => {
    await expect(repo.path("../outside")).rejects.toMatchObject({
      status: 400,
    });
    await symlink(join(dir, "sample.json"), join(dir, "linked.json"));
    await expect(repo.read("linked")).rejects.toMatchObject({ status: 400 });
  });
  test("異なるOrigin、トークンなし、不正JSONの書き込みを拒否する", async () => {
    const url = new URL("/api/documents", server.url);
    expect(
      (
        await fetch(url, {
          method: "POST",
          headers: { Origin: "https://example.com" },
          body: "{}",
        })
      ).status,
    ).toBe(403);
    expect((await fetch(url, { method: "POST", body: "{}" })).status).toBe(403);
    const session = await (
      await fetch(new URL("/api/session", server.url))
    ).json();
    expect(
      (
        await fetch(url, {
          method: "POST",
          headers: { "X-Law-Token": session.csrf },
          body: "{",
        })
      ).status,
    ).toBe(400);
    expect(
      (await fetch(new URL("/api/documents/../../package.json", server.url)))
        .status,
    ).toBe(404);
  });
});
