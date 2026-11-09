import { git } from "../src/server/git";

const existing = await git(["config", "--get", "core.hooksPath"]);
if (existing && existing !== ".githooks")
  throw new Error(
    `既存のhooksPath（${existing}）があります。.githooks/pre-commitの処理を既存フックへ追加してください。`,
  );
if ((await git(["config", "--local", "core.hooksPath", ".githooks"])) === null)
  throw new Error("Gitフックを設定できませんでした。");
console.log("このクローンでコミット前のUUID補完・検証を有効にしました。");
