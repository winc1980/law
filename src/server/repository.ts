import { lstat, realpath, rename, mkdir, unlink } from "node:fs/promises";
import { dirname, resolve, join, relative } from "node:path";
import { serialize, withUUIDs, type Document } from "../domain/model";
import { validate } from "../domain/validation";

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message); }
}
export const root = resolve(import.meta.dir, "../..");
export const hash = (text: string) => `"${new Bun.CryptoHasher("sha256").update(text).digest("hex")}"`;
export class Repository {
  private queues = new Map<string, Promise<unknown>>();
  constructor(public directory = join(root, "data")) {}
  async path(id: string): Promise<string> {
    if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new HttpError(400, "文書IDが不正です。");
    await mkdir(this.directory, { recursive: true });
    const base = await realpath(this.directory), path = join(base, `${id}.json`);
    try { if (!(await lstat(path)).isFile()) throw new HttpError(400, "通常のJSONファイルのみ読み書きできます。"); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
    return path;
  }
  async read(id: string) {
    const file = Bun.file(await this.path(id));
    if (!await file.exists()) throw new HttpError(404, "文書が見つかりません。");
    const text = await file.text();
    let document: Document;
    try { document = JSON.parse(text); } catch { throw new HttpError(422, "原本JSONを読み取れません。"); }
    const problems = validate(document, false);
    if (problems.some(p => p.level === "error")) throw new HttpError(422, "原本がスキーマに適合していません。", problems);
    if (document.id !== id) throw new HttpError(422, "ファイル名と文書IDが一致しません。");
    return { document: withUUIDs(document), etag: hash(text) };
  }
  async list() {
    const docs: Document[] = [], errors: { id: string; message: string }[] = [];
    for await (const file of new Bun.Glob("*.json").scan({ cwd: this.directory })) {
      const id = file.slice(0, -5);
      try { docs.push((await this.read(id)).document); } catch (e) { errors.push({ id, message: (e as Error).message }); }
    }
    return { documents: docs.sort((a, b) => a.id.localeCompare(b.id)), errors };
  }
  async save(id: string, input: unknown, expected: string | null, create = false) {
    const previous = this.queues.get(id) ?? Promise.resolve();
    const operation = previous.catch(() => {}).then(async () => {
      const problems = validate(input, false);
      if (problems.some(p => p.level === "error")) throw new HttpError(422, "入力内容を確認してください。", problems);
      const document = input as Document;
      if (document.id !== id) throw new HttpError(400, "文書IDは保存先と一致させてください。");
      const path = await this.path(id), file = Bun.file(path), exists = await file.exists();
      if (create && exists) throw new HttpError(409, "同じIDの文書が存在します。");
      if (!create && !exists) throw new HttpError(404, "保存先が見つかりません。");
      if (!create && !expected) throw new HttpError(428, "読み込み時のハッシュが必要です。");
      if (!create && hash(await file.text()) !== expected) throw new HttpError(409, "原本が外部で変更されました。入力をコピーしてから再読み込みしてください。");
      const next = withUUIDs(document), text = serialize(next), temp = join(dirname(path), `.${id}-${crypto.randomUUID()}.tmp`);
      try {
        await Bun.write(temp, text);
        if (!create && hash(await file.text()) !== expected) throw new HttpError(409, "保存直前に原本が変更されました。");
        // 新規作成時は排他的作成で、別プロセスの既存ファイルを上書きしない。
        if (create) {
          const { link } = await import("node:fs/promises");
          try { await link(temp, path); } catch (e) { if ((e as NodeJS.ErrnoException).code === "EEXIST") throw new HttpError(409, "同じIDの文書が存在します。"); throw e; }
        } else await rename(temp, path);
      } finally { await unlink(temp).catch(() => {}); }
      return { document: next, etag: hash(text) };
    });
    this.queues.set(id, operation);
    try { return await operation; } finally { if (this.queues.get(id) === operation) this.queues.delete(id); }
  }
}
