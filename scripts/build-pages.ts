import { $ } from "bun";

import { root } from "../src/server/repository";

// Pages側が浅いクローンを使っていても、公開する本文の履歴を省略しない。
const shallow = await $`git rev-parse --is-shallow-repository`.cwd(root).text();
if (shallow.trim() === "true") await $`git fetch --unshallow origin`.cwd(root);

await $`bun run verify`.cwd(root);
