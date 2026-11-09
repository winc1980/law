import { nodes } from "../src/domain/model";
import { validate } from "../src/domain/validation";
import { Repository } from "../src/server/repository";

const { documents, errors } = await new Repository().list();
let failed = errors.length > 0;
for (const error of errors) console.error(`${error.id}: ${error.message}`);
const allUUIDs = new Set<string>();
// list()の表示用UUID補完に依存せず、ディスク上の原本を検証する。
for (const entry of documents) {
  const doc = await Bun.file(
    new URL(`../data/${entry.id}.json`, import.meta.url),
  ).json();
  for (const problem of validate(doc)) {
    console.error(`${doc.id} ${problem.path}: ${problem.message}`);
    if (problem.level === "error") failed = true;
  }
  for (const node of nodes(doc))
    if (node.uuid) {
      if (allUUIDs.has(node.uuid)) {
        console.error(`文書をまたぐUUIDの重複: ${node.uuid}`);
        failed = true;
      }
      allUUIDs.add(node.uuid);
    }
}
if (!documents.length) {
  console.error("原本がありません。");
  failed = true;
}
if (failed) process.exit(1);
console.log(`原本 ${documents.length}件の検証に成功しました。`);
