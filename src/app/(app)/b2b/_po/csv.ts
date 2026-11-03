/** CSV export of the board's current view: Request No., Status, then every table column. Pure. */
import { formatDmy } from "@/lib/ops/dates";
import { STAGES, TABLE_COLUMNS } from "./fields";
import type { PoRow } from "./types";

const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export function statusText(row: Pick<PoRow, "board" | "stage" | "misJobNo">): string {
  if (row.board === "MIS") return `In Operations → Job ${row.misJobNo ?? "—"}`;
  if (row.board === "LONG_HOLD") return `Long Hold · ${STAGES[row.stage].label}`;
  return STAGES[row.stage].label;
}

export function boardCsv(rows: PoRow[]): string {
  const cols = TABLE_COLUMNS.filter((c) => !c.sticky);
  const head = ["Request No.", "Status", ...cols.map((c) => c.label)].map(esc).join(",");
  const body = rows.map((r) =>
    [r.requestNo, statusText(r), ...cols.map((c) => (c.type === "date" ? formatDmy(r.values[c.key]) : r.values[c.key]))].map(esc).join(","),
  );
  return [head, ...body].join("\n");
}

export function csvFileName(todayIso: string) {
  return `fresh-po-${todayIso}.csv`;
}
