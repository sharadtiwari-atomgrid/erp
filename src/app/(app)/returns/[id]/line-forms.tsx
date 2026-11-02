"use client";

import { useActionState } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { FormMessage, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatNumber } from "@/lib/format";
import type { ActionState } from "@/lib/forms";

export type ReturnLineRow = { id: string; sku: string; name: string; unit: string; quantity: number; receivedQty: number };
type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

function Product({ row }: { row: ReturnLineRow }) {
  return (
    <>
      <div className="font-medium">{row.name}</div>
      <div className="font-mono text-xs text-ink-faint">{row.sku}</div>
    </>
  );
}

/** REQUESTED → RECEIVED: quantity that physically arrived per line. */
export function ReceiveForm({ action, rows, warehouseName }: { action: Action; rows: ReturnLineRow[]; warehouseName: string }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction}>
      <Card>
        <CardHeader title="Receive goods" description={`Record what arrived at ${warehouseName}. Stock isn't updated until inspection.`} />
        {state?.error && (
          <div className="px-5 pt-4">
            <FormMessage state={state} />
          </div>
        )}
        <Table>
          <THead>
            <tr>
              <TH>Product</TH>
              <TH align="right">Requested</TH>
              <TH align="right">Received</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD>
                  <Product row={r} />
                </TD>
                <TD align="right">
                  {formatNumber(r.quantity)} <span className="text-xs text-ink-faint">{r.unit}</span>
                </TD>
                <TD align="right">
                  <Input
                    type="number"
                    name={`received_${r.id}`}
                    min="0"
                    max={r.quantity}
                    step="any"
                    defaultValue={r.quantity}
                    className="ml-auto w-28 text-right"
                    aria-label={`Received quantity of ${r.name}`}
                  />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <div className="flex justify-end border-t border-line px-5 py-3">
          <SubmitButton pendingText="Saving…">Mark received</SubmitButton>
        </div>
      </Card>
    </form>
  );
}

/** RECEIVED → INSPECTED: return QC with a disposition per line. */
export function InspectForm({ action, rows }: { action: Action; rows: ReturnLineRow[] }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction}>
      <Card>
        <CardHeader
          title="Return QC"
          description="Restock puts the goods back into stock now; repair restocks them when marked repaired; scrap writes them off without a stock movement."
        />
        {state?.error && (
          <div className="px-5 pt-4">
            <FormMessage state={state} />
          </div>
        )}
        <Table>
          <THead>
            <tr>
              <TH>Product</TH>
              <TH align="right">Received</TH>
              <TH>Disposition</TH>
              <TH>QC notes</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD>
                  <Product row={r} />
                </TD>
                <TD align="right">
                  {formatNumber(r.receivedQty)} <span className="text-xs text-ink-faint">{r.unit}</span>
                </TD>
                <TD>
                  {r.receivedQty > 0 ? (
                    <Select name={`disposition_${r.id}`} defaultValue="" required className="w-36" aria-label={`Disposition for ${r.name}`}>
                      <option value="">Choose…</option>
                      <option value="RESTOCK">Restock</option>
                      <option value="REPAIR">Repair</option>
                      <option value="SCRAP">Scrap</option>
                    </Select>
                  ) : (
                    <span className="text-xs text-ink-faint">Not received</span>
                  )}
                </TD>
                <TD>
                  {r.receivedQty > 0 && <Input name={`notes_${r.id}`} placeholder="Condition, fault found…" aria-label={`QC notes for ${r.name}`} />}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <div className="flex justify-end border-t border-line px-5 py-3">
          <SubmitButton pendingText="Saving…" confirmMessage="Complete inspection? Restocked quantities go into stock immediately.">
            Complete inspection
          </SubmitButton>
        </div>
      </Card>
    </form>
  );
}
