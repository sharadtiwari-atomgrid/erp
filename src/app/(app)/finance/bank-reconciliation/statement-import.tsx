"use client";

import { useActionState, useMemo, useState } from "react";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormMessage, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import { formatDmy } from "@/lib/ops/dates";
import {
  detectColumns,
  findHeaderRow,
  MAPPING_FIELDS,
  mappingProblem,
  NO_COLUMN,
  parseStatement,
  type Cell,
  type ColumnMapping,
} from "../_cash_fa/statement";
import { importStatement } from "./actions";

type Bank = { id: string; code: string; name: string; kind: string };
type Sheet = { fileName: string; rows: Cell[][] };

const PREVIEW = 15;

export function StatementImport({ banks, defaultBankId }: { banks: Bank[]; defaultBankId?: string }) {
  const [state, formAction] = useActionState(importStatement, undefined);
  const [bankId, setBankId] = useState(defaultBankId ?? banks.find((b) => b.kind === "BANK")?.id ?? "");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [headerIndex, setHeaderIndex] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file: File) {
    setBusy(true);
    setReadError(null);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array", raw: true, cellDates: false });
      const first = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Cell[]>(first, { header: 1, raw: true, defval: "" });
      if (rows.length === 0) throw new Error("The file has no rows.");
      const h = findHeaderRow(rows);
      setSheet({ fileName: file.name, rows });
      setHeaderIndex(h);
      setMapping(detectColumns(rows[h] ?? []));
    } catch (e) {
      setSheet(null);
      setMapping(null);
      setReadError(e instanceof Error ? e.message : "Could not read the file.");
    } finally {
      setBusy(false);
    }
  }

  const header = sheet?.rows[headerIndex] ?? [];
  const problem = mapping ? mappingProblem(mapping) : null;
  const parsed = useMemo(() => (sheet && mapping && !mappingProblem(mapping) ? parseStatement(sheet.rows, headerIndex, mapping) : null), [sheet, mapping, headerIndex]);
  const lines = parsed?.lines ?? [];
  const totalIn = lines.reduce((s, l) => s + (l.amount > 0 ? l.amount : 0), 0);
  const totalOut = lines.reduce((s, l) => s + (l.amount < 0 ? -l.amount : 0), 0);
  const payload = JSON.stringify(lines.map(({ date, description, reference, amount, balance }) => ({ date, description, reference, amount, balance })));

  const columnLabel = (i: number) => {
    const name = String(header[i] ?? "").trim();
    return `${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ""}${name ? ` · ${name}` : ""}`;
  };

  return (
    <Card>
      <CardHeader title="Import a bank statement" description="CSV or Excel (.xlsx / .xls) as downloaded from the bank. Dates like dd/mm/yyyy are understood. Lines already imported (same date, amount and reference) are skipped." />
      <CardBody className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Bank account" htmlFor="import-bank">
            <Select id="import-bank" value={bankId} onChange={(e) => setBankId(e.target.value)}>
              <option value="">Choose…</option>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} · {b.name}
                </option>
              ))}
            </Select>
          </Field>
          <div>
            <span className="mb-1.5 block text-sm font-medium text-ink">Statement file</span>
            <label className={buttonClass("secondary", "md", "cursor-pointer")}>
              {busy ? "Reading…" : sheet ? `${sheet.fileName} — choose another` : "Choose file (.csv, .xlsx, .xls)"}
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void pick(file);
                }}
              />
            </label>
          </div>
        </div>
        {readError && <FormMessage state={{ error: readError }} />}

        {sheet && mapping && (
          <>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-ink">Column mapping</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <Field label="Header row" htmlFor="map-header">
                  <Select
                    id="map-header"
                    value={headerIndex}
                    onChange={(e) => {
                      const h = Number(e.target.value);
                      setHeaderIndex(h);
                      setMapping(detectColumns(sheet.rows[h] ?? []));
                    }}
                  >
                    {sheet.rows.slice(0, 30).map((r, i) => (
                      <option key={i} value={i}>
                        Row {i + 1}: {r.filter((c) => String(c).trim()).slice(0, 3).join(" | ").slice(0, 40)}
                      </option>
                    ))}
                  </Select>
                </Field>
                {MAPPING_FIELDS.map((fld) => (
                  <Field key={fld.key} label={fld.label} htmlFor={`map-${fld.key}`}>
                    <Select id={`map-${fld.key}`} value={mapping[fld.key]} onChange={(e) => setMapping({ ...mapping, [fld.key]: Number(e.target.value) })}>
                      <option value={NO_COLUMN}>—</option>
                      {header.map((_, i) => (
                        <option key={i} value={i}>
                          {columnLabel(i)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ))}
              </div>
              <p className="mt-2 text-xs text-ink-faint">Use separate withdrawal and deposit columns, or one signed amount column (negative = withdrawal), optionally with a Dr / Cr column.</p>
            </div>
            {problem && <FormMessage state={{ error: problem }} />}
            {parsed && (
              <div className="rounded-md border border-line">
                <div className="flex flex-wrap gap-x-6 gap-y-1 border-b border-line px-4 py-2 text-xs text-ink-soft">
                  <span>{lines.length} lines</span>
                  <span>Deposits {formatMoney(totalIn)}</span>
                  <span>Withdrawals {formatMoney(totalOut)}</span>
                  {parsed.skipped.length > 0 && (
                    <span title={parsed.skipped.slice(0, 20).map((s) => `Row ${s.row}: ${s.reason}`).join("\n")}>{parsed.skipped.length} rows skipped (no date or amount)</span>
                  )}
                </div>
                <Table>
                  <THead>
                    <tr>
                      <TH>Date</TH>
                      <TH>Description</TH>
                      <TH>Reference</TH>
                      <TH align="right">Withdrawal</TH>
                      <TH align="right">Deposit</TH>
                      <TH align="right">Balance</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {lines.length === 0 && <EmptyRow colSpan={6}>No lines found with this mapping.</EmptyRow>}
                    {lines.slice(0, PREVIEW).map((l) => (
                      <TR key={l.row}>
                        <TD className="whitespace-nowrap">{formatDmy(l.date)}</TD>
                        <TD className="text-xs">{l.description}</TD>
                        <TD className="font-mono text-xs">{l.reference ?? ""}</TD>
                        <TD align="right">{l.amount < 0 ? formatMoney(-l.amount) : ""}</TD>
                        <TD align="right">{l.amount > 0 ? formatMoney(l.amount) : ""}</TD>
                        <TD align="right" className="text-ink-soft">
                          {l.balance !== null ? formatMoney(l.balance) : ""}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
                {lines.length > PREVIEW && <p className="border-t border-line px-4 py-2 text-xs text-ink-faint">Showing the first {PREVIEW} of {lines.length} lines.</p>}
              </div>
            )}
          </>
        )}

        <form action={formAction} className="flex flex-wrap items-center justify-end gap-3">
          <FormMessage state={state} />
          <input type="hidden" name="bankAccountId" value={bankId} />
          <input type="hidden" name="fileName" value={sheet?.fileName ?? ""} />
          <input type="hidden" name="lines" value={payload} />
          <SubmitButton pendingText="Importing…" disabled={!bankId || lines.length === 0}>
            Import {lines.length ? `${lines.length} lines` : ""}
          </SubmitButton>
        </form>
      </CardBody>
    </Card>
  );
}
