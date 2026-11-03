import type { BoardKind, Stage, Team } from "./fields";

/** A Fresh PO as sent to the board (Client Component): every field as text, dates as YYYY-MM-DD. */
export type PoRow = {
  id: string;
  requestNo: string;
  board: BoardKind;
  stage: Stage;
  /** Business fields keyed as in fields.ts (PO_FIELDS). */
  values: Record<string, string>;
  holdReleasedAt: string;
  createdAt: string;
  misJobNo: string | null;
  poFile: { name: string; url: string } | null;
};

export type ContactOption = { id: string; name: string; pocs: string[]; addresses: string[] };
export type ProductOption = { id: string; name: string; productClass: string; hsnCode: string };

export type BoardMasters = {
  customers: ContactOption[];
  suppliers: ContactOption[];
  products: ProductOption[];
  pocs: string[];
};

export type BoardViewer = {
  /** Team the user is locked to, or null when they may switch "Acting as". */
  lockedTeam: Team | null;
  defaultTeam: Team;
  canEdit: boolean;
  canAddContacts: boolean;
  canAddProducts: boolean;
};

export type DocItem = { id: string; field: string; fileName: string; contentType: string | null; size: number | null; url: string; downloadUrl: string; createdAt: string };

export type HistoryItem = {
  id: string;
  action: string;
  message: string;
  who: string;
  at: string;
  changes: Array<{ field: string; from: string; to: string }>;
};

export type SaveResult =
  | { ok: true; id: string; requestNo: string; board: BoardKind; held: boolean }
  | { ok: false; error: string; missing?: string[]; duplicateOf?: string };

export type SimpleResult = { ok: true; message?: string } | { ok: false; error: string };
