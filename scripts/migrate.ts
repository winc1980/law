import { migrate } from "../src/server/migrate";
import { serialize } from "../src/domain/model";
import { validate } from "../src/domain/validation";
import { root } from "../src/server/repository";
import { join } from "node:path";

for await (const file of new Bun.Glob("*.json").scan({ cwd: join(root, "data") })) {
  const path = join(root, "data", file), raw = await Bun.file(path).json();
  if (raw.schemaVersion === 1) continue;
  const doc = migrate(raw, file.slice(0, -5));
  const errors = validate(doc).filter(p => p.level === "error");
  if (errors.length) throw new Error(JSON.stringify(errors));
  await Bun.write(path, serialize(doc));
  console.log(`移行: data/${file}（本文・固定リンクを保持、議決・改正メタデータはGit履歴に保存）`);
}
