import { compare } from "../domain/diff";
import type { Document } from "../domain/model";
import { validate } from "../domain/validation";

import { migrate } from "./migrate";
import { root } from "./repository";

export type Revision = { sha: string; date: string; subject: string };
export async function git(
  args: string[],
  cwd = root,
  input?: string,
): Promise<string | null> {
  try {
    const p = Bun.spawn(["git", ...args], {
      cwd,
      stdin: input === undefined ? "ignore" : new TextEncoder().encode(input),
      stdout: "pipe",
      stderr: "pipe",
    });
    const [output, , code] = await Promise.all([
      new Response(p.stdout).text(),
      new Response(p.stderr).text(),
      p.exited,
    ]);
    return code === 0 ? output.trimEnd() : null;
  } catch {
    return null;
  }
}
export async function resolveBase(
  mode = "main",
  cwd = root,
): Promise<{ sha: string | null; label: string }> {
  if (mode === "HEAD")
    return {
      sha: await git(["rev-parse", "--verify", "HEAD^{commit}"], cwd),
      label: "HEAD",
    };
  for (const ref of ["refs/heads/main", "refs/remotes/origin/main"]) {
    const sha = await git(["merge-base", "HEAD", ref], cwd);
    if (sha)
      return {
        sha,
        label: `merge-base HEAD ${ref.replace("refs/heads/", "").replace("refs/remotes/", "")}`,
      };
  }
  return {
    sha: await git(["rev-parse", "--verify", "HEAD^{commit}"], cwd),
    label: "HEAD（mainがないため）",
  };
}
export async function revisionDocument(
  id: string,
  sha: string,
  cwd = root,
): Promise<Document | null> {
  if (!/^[a-z][a-z0-9-]*$/.test(id) || !/^[a-f0-9]{40,64}$/.test(sha))
    return null;
  const text = await git(["show", `${sha}:data/${id}.json`], cwd);
  if (text === null) return null;
  try {
    const doc = migrate(JSON.parse(text), id);
    return validate(doc, false).some((p) => p.level === "error") ? null : doc;
  } catch {
    return null;
  }
}
export async function history(
  id: string,
  current: Document,
  cwd = root,
): Promise<Revision[]> {
  if (!/^[a-z][a-z0-9-]*$/.test(id)) return [];
  const text = await git(
    ["log", "--format=%H%x09%cI%x09%s", "--", `data/${id}.json`],
    cwd,
  );
  const revisions: Revision[] = [];
  let newer = current;
  for (const line of text?.split("\n") ?? []) {
    const [sha, date, ...subject] = line.split("\t");
    const snapshot = await revisionDocument(id, sha, cwd);
    if (!snapshot) continue;
    // 現在の本文との差分がない版と、連続する同内容の版は一覧に含めない。
    if (compare(snapshot, current).length && compare(snapshot, newer).length) {
      revisions.push({ sha, date, subject: subject.join("\t") });
    }
    newer = snapshot;
  }
  return revisions;
}
