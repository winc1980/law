import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { prepareCommit } from "../../scripts/prepare-commit";
import { nodes, serialize } from "../../src/domain/model";
import {
  git,
  history,
  resolveBase,
  revisionDocument,
} from "../../src/server/git";
import { migrate } from "../../src/server/migrate";

import { fixture } from "./domain.test";

async function withGit(run: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "law-git-"));
  try {
    await git(["init", "-b", "main"], dir);
    await git(["config", "user.name", "Test"], dir);
    await git(["config", "user.email", "test@example.invalid"], dir);
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
test("コミット前にUUIDを付与し、ステージと作業ツリーを揃える", async () =>
  withGit(async (dir) => {
    const doc = fixture();
    for (const node of nodes(doc)) delete node.uuid;
    await Bun.write(join(dir, "data/sample.json"), serialize(doc));
    await git(["add", "data/sample.json"], dir);
    await prepareCommit(dir);
    const staged = JSON.parse((await git(["show", ":data/sample.json"], dir))!);
    expect(nodes(staged).every((n) => !!n.uuid)).toBe(true);
    expect(
      JSON.parse(await Bun.file(join(dir, "data/sample.json")).text()),
    ).toEqual(staged);
    await git(["commit", "-m", "first"], dir);
    const base = await resolveBase("main", dir);
    expect(base.sha).toHaveLength(40);
    expect((await revisionDocument("sample", base.sha!, dir))?.title).toBe(
      "会則",
    );
    expect(await history("sample", staged, dir)).toEqual([]);
  }));
test("UUID未付与の部分ステージは変更せずに停止する", async () =>
  withGit(async (dir) => {
    const doc = fixture();
    delete doc.uuid;
    await Bun.write(join(dir, "data/sample.json"), serialize(doc));
    await git(["add", "data/sample.json"], dir);
    await Bun.write(
      join(dir, "data/sample.json"),
      serialize({ ...doc, title: "未ステージ" }),
    );
    await expect(prepareCommit(dir)).rejects.toThrow("部分ステージ");
    expect(
      JSON.parse((await git(["show", ":data/sample.json"], dir))!).uuid,
    ).toBeUndefined();
    expect((await Bun.file(join(dir, "data/sample.json")).json()).title).toBe(
      "未ステージ",
    );
  }));

test("原本とシステムの混在はUUID補完前に拒否し、ステージと作業ツリーを保持する", async () =>
  withGit(async (dir) => {
    const doc = fixture();
    delete doc.uuid;
    const text = serialize(doc);
    await Bun.write(join(dir, "data/sample.json"), text);
    await Bun.write(join(dir, "src/web/example.ts"), "export {};\n");
    await git(["add", "."], dir);
    const before = await git(["write-tree"], dir);

    await expect(prepareCommit(dir)).rejects.toThrow("別々にコミット");

    expect(await git(["write-tree"], dir)).toBe(before);
    expect(await Bun.file(join(dir, "data/sample.json")).text()).toBe(text);
  }));

test.each(["src/web/example.ts", "schema/example.json", "README.md"])(
  "原本の削除とdata/以外の変更（%s）の混在も拒否する",
  async (path) =>
    withGit(async (dir) => {
      await Bun.write(join(dir, "data/sample.json"), serialize(fixture()));
      await Bun.write(join(dir, path), "before\n");
      await git(["add", "."], dir);
      await git(["commit", "-m", "initial"], dir);
      await git(["rm", "data/sample.json"], dir);
      await Bun.write(join(dir, path), "after\n");
      await git(["add", path], dir);

      await expect(prepareCommit(dir)).rejects.toThrow("同じコミット");
    }),
);

test.each([
  ["data/sample.json", "sample.json"],
  ["sample.json", "data/sample.json"],
])("data/との境界をまたぐ移動（%s → %s）も拒否する", async (from, to) =>
  withGit(async (dir) => {
    await Bun.write(join(dir, from), serialize(fixture()));
    await git(["add", "."], dir);
    await git(["commit", "-m", "initial"], dir);
    await mkdir(dirname(join(dir, to)), { recursive: true });
    expect(await git(["mv", from, to], dir)).not.toBeNull();

    await expect(prepareCommit(dir)).rejects.toThrow("同じコミット");
  }),
);

test.each(["data/sample.json", "src/web/example.ts"])(
  "片方だけのステージ（%s）は未ステージの変更があっても許可する",
  async (path) =>
    withGit(async (dir) => {
      await Bun.write(join(dir, "data/sample.json"), serialize(fixture()));
      await Bun.write(join(dir, "src/web/example.ts"), "export {};\n");
      await git(["add", "."], dir);
      await git(["commit", "-m", "initial"], dir);
      await Bun.write(
        join(dir, "data/sample.json"),
        serialize({ ...fixture(), title: "変更後" }),
      );
      await Bun.write(join(dir, "src/web/example.ts"), "export const n = 1;\n");
      await git(["add", path], dir);
      const before = await git(["write-tree"], dir);

      await prepareCommit(dir);

      expect(await git(["write-tree"], dir)).toBe(before);
      expect(await git(["diff", "--cached", "--name-only"], dir)).toBe(path);
    }),
);

test("原本の削除だけのステージは許可する", async () =>
  withGit(async (dir) => {
    await Bun.write(join(dir, "data/sample.json"), serialize(fixture()));
    await git(["add", "."], dir);
    await git(["commit", "-m", "initial"], dir);
    await git(["rm", "data/sample.json"], dir);

    await prepareCommit(dir);

    expect(await git(["diff", "--cached", "--name-status"], dir)).toBe(
      "D\tdata/sample.json",
    );
  }));

test("履歴は現在の本文と同じ版と連続する同内容の版を除外する", async () =>
  withGit(async (dir) => {
    const original = fixture();
    const commit = async (text: string, subject: string) => {
      await Bun.write(join(dir, "data/sample.json"), text);
      await git(["add", "data/sample.json"], dir);
      await git(["commit", "-m", subject], dir);
      return (await git(["rev-parse", "HEAD"], dir))!;
    };
    await commit(serialize(original), "first");
    expect(await history("sample", original, dir)).toEqual([]);
    const formatted = await commit(JSON.stringify(original), "format only");
    const changed = { ...original, title: "改正会則" };
    const changedSha = await commit(serialize(changed), "amend title");
    expect((await history("sample", changed, dir)).map((r) => r.sha)).toEqual([
      formatted,
    ]);

    // 未コミットの編集も、コミット済みの版との差分として扱う。
    const working = { ...changed, status: "repealed" as const };
    expect((await history("sample", working, dir)).map((r) => r.sha)).toEqual([
      changedSha,
      formatted,
    ]);

    // 元の本文に戻った場合も、現在と同じ過去版は表示しない。
    await commit(serialize(original), "restore original");
    expect((await history("sample", original, dir)).map((r) => r.sha)).toEqual([
      changedSha,
    ]);
  }));

test("旧形式からの移行だけでは履歴を増やさない", async () =>
  withGit(async (dir) => {
    const legacy = {
      title: "会則",
      lawType: "会則",
      effect: "施行中",
      articles: [{ id: "name", content: "本会の名称を定める。" }],
    };
    await Bun.write(join(dir, "data/sample.json"), JSON.stringify(legacy));
    await git(["add", "data/sample.json"], dir);
    await git(["commit", "-m", "legacy"], dir);
    const current = migrate(legacy, "sample");
    await Bun.write(join(dir, "data/sample.json"), serialize(current));
    await git(["add", "data/sample.json"], dir);
    await git(["commit", "-m", "migrate"], dir);
    expect(await history("sample", current, dir)).toEqual([]);
  }));
