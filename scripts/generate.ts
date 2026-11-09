import { compile } from "json-schema-to-typescript";
import schema from "../schema/document.schema.json";

const output = new URL("../src/generated/document.d.ts", import.meta.url);
const code = await compile(schema as Parameters<typeof compile>[0], "Document", {
  bannerComment: "/* schema/document.schema.json から自動生成。bun run generate */",
  additionalProperties: false,
  ignoreMinAndMaxItems: true,
  style: { singleQuote: false },
});
if (Bun.argv.includes("--check")) {
  if (!(await Bun.file(output).exists()) || await Bun.file(output).text() !== code) {
    throw new Error("生成型が古くなっています。bun run generate を実行してください。");
  }
} else {
  await Bun.write(output, code);
}
