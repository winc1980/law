import type { Bootstrap } from "./types";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "読み込みに失敗しました。");
  return data;
}
export function sourcePath(data: Bootstrap, id: string, sha: string) {
  return data.mode === "local"
    ? `/api/documents/${id}/revision?sha=${sha}`
    : `${data.base}history/${id}/${sha}.json`;
}
