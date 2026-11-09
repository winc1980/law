import type { Document } from "../domain/model";
export type Revision = { sha: string; date: string; subject: string };
export type Bootstrap = {
  mode: "local" | "public";
  base: string;
  documents: Document[];
  errors: { id: string; message: string }[];
  commit: string | null;
  csrf?: string;
  histories?: Record<string, Revision[]>;
};
declare global { interface Window { __LAW_DATA__: Bootstrap } }
