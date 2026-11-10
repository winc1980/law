import { join } from "node:path";

import {
  type Document,
  nodes,
  serialize,
  withUUIDs,
} from "../src/domain/model";
import { validate } from "../src/domain/validation";
import { git } from "../src/server/git";
import { root } from "../src/server/repository";

// ステージした原本だけを対象とする。部分ステージ中のファイルを勝手に全体ステージしない。
export async function prepareCommit(cwd = root) {
  // 改名を削除・追加として扱い、data/との境界をまたぐ移動も検出する。
  const staged = await git(
    ["diff", "--cached", "--name-only", "--no-renames", "-z"],
    cwd,
  );
  if (staged === null) throw new Error("Gitのステージを読み取れません。");
  const paths = staged.split("\0").filter(Boolean);
  if (
    paths.some((path) => path.startsWith("data/")) &&
    paths.some((path) => !path.startsWith("data/"))
  )
    throw new Error(
      "規則の変更（data/配下）とWebシステムの変更（data/以外）は同じコミットに含められません。git restore --staged -- <パス> で片方をステージから外し、別々にコミットしてください。",
    );

  const names = await git(
    [
      "diff",
      "--cached",
      "--name-only",
      "--diff-filter=ACM",
      "-z",
      "--",
      "data/",
    ],
    cwd,
  );
  if (names === null) throw new Error("Gitのステージを読み取れません。");
  const plans: { path: string; old: string; text: string; update: boolean }[] =
    [];
  for (const path of names.split("\0").filter(Boolean)) {
    if (!/^data\/[a-z][a-z0-9-]*\.json$/.test(path))
      throw new Error(`原本のファイル名が不正です: ${path}`);
    const old = await git(["show", `:${path}`], cwd);
    if (old === null) throw new Error(`${path}を読み取れません。`);
    const input = JSON.parse(old) as Document;
    const problems = validate(input, false);
    if (problems.some((p) => p.level === "error"))
      throw new Error(`${path}: ${JSON.stringify(problems)}`);
    if (input.id !== path.slice(5, -5))
      throw new Error(`${path}: 文書IDとファイル名が一致しません。`);
    const update = nodes(input).some((n) => !n.uuid),
      text = serialize(withUUIDs(input));
    if (update && (await Bun.file(join(cwd, path)).text()).trimEnd() !== old)
      throw new Error(
        `${path}: UUID未付与の原本が部分ステージされています。変更をすべてステージするか、先にUUIDを付与してください。`,
      );
    plans.push({ path, old, text, update });
  }
  // 全ステージ原本を検証してから、UUIDの補完をインデックスへ反映する。
  const all = await git(["ls-files", "-z", "--", "data/"], cwd),
    seen = new Set<string>();
  for (const path of (all ?? "")
    .split("\0")
    .filter((p) => p.endsWith(".json"))) {
    const text =
      plans.find((p) => p.path === path)?.text ??
      (await git(["show", `:${path}`], cwd));
    if (!text) continue;
    const doc = JSON.parse(text) as Document;
    if (validate(doc).some((p) => p.level === "error"))
      throw new Error(`${path}: 原本がスキーマに適合していません。`);
    for (const node of nodes(doc))
      if (node.uuid) {
        if (seen.has(node.uuid))
          throw new Error(`UUIDが重複しています: ${node.uuid}`);
        seen.add(node.uuid);
      }
  }
  for (const plan of plans)
    if (plan.update) {
      const oid = await git(["hash-object", "-w", "--stdin"], cwd, plan.text);
      if (
        !oid ||
        (await git(
          ["update-index", "--cacheinfo", "100644", oid, plan.path],
          cwd,
        )) === null
      )
        throw new Error(`${plan.path}: UUIDのステージに失敗しました。`);
      await Bun.write(join(cwd, plan.path), plan.text);
      console.log(`UUID付与: ${plan.path}`);
    }
}
if (import.meta.main) await prepareCommit();
