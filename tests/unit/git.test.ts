import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { git, resolveBase, history, revisionDocument } from "../../src/server/git";
import { prepareCommit } from "../../scripts/prepare-commit";
import { serialize, nodes } from "../../src/domain/model";
import { fixture } from "./domain.test";

async function withGit(run: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "law-git-"));
  try { await git(["init", "-b", "main"], dir); await git(["config", "user.name", "Test"], dir); await git(["config", "user.email", "test@example.invalid"], dir); await run(dir); }
  finally { await rm(dir, { recursive: true, force: true }); }
}
test("コミット前にUUIDを付与し、ステージと作業ツリーを揃える", async () => withGit(async dir => {
  const doc = fixture(); for (const node of nodes(doc)) delete node.uuid;
  await Bun.write(join(dir, "data/sample.json"), serialize(doc));
  await git(["add", "data/sample.json"], dir); await prepareCommit(dir);
  const staged = JSON.parse((await git(["show", ":data/sample.json"], dir))!);
  expect(nodes(staged).every(n => !!n.uuid)).toBe(true);
  expect(JSON.parse(await Bun.file(join(dir, "data/sample.json")).text())).toEqual(staged);
  await git(["commit", "-m", "first"], dir);
  const base = await resolveBase("main", dir);
  expect(base.sha).toHaveLength(40);
  expect((await revisionDocument("sample", base.sha!, dir))?.title).toBe("会則");
  expect(await history("sample", dir)).toHaveLength(1);
}));
test("UUID未付与の部分ステージは変更せずに停止する", async () => withGit(async dir => {
  const doc = fixture(); delete doc.uuid;
  await Bun.write(join(dir, "data/sample.json"), serialize(doc)); await git(["add", "data/sample.json"], dir);
  await Bun.write(join(dir, "data/sample.json"), serialize({ ...doc, title: "未ステージ" }));
  await expect(prepareCommit(dir)).rejects.toThrow("部分ステージ");
  expect(JSON.parse((await git(["show", ":data/sample.json"], dir))!).uuid).toBeUndefined();
  expect((await Bun.file(join(dir, "data/sample.json")).json()).title).toBe("未ステージ");
}));
