import { Card, CardHeader } from "@/components/ui/card";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { db } from "@/lib/db";
import { num } from "@/lib/format";
import { formatDmy } from "@/lib/ops/dates";
import { Amount } from "./ui";

/** G/L entries posted for a source document (the original posting and any reversal). */
export async function LedgerEntriesCard({ sourceType, sourceId }: { sourceType: string; sourceId: string }) {
  const entries = await db.glEntry.findMany({
    where: { sourceType, sourceId },
    orderBy: [{ transactionNo: "asc" }, { entryNo: "asc" }],
    include: { account: { select: { code: true, name: true } } },
  });
  const debit = entries.reduce((s, e) => s + num(e.debit), 0);
  const credit = entries.reduce((s, e) => s + num(e.credit), 0);
  return (
    <Card>
      <CardHeader title="G/L Entries" description="What this document posted to the general ledger." />
      <Table>
        <THead>
          <tr>
            <TH>Tx</TH>
            <TH>Posting Date</TH>
            <TH>Account</TH>
            <TH align="right">Debit Amount</TH>
            <TH align="right">Credit Amount</TH>
          </tr>
        </THead>
        <TBody>
          {entries.length === 0 && <EmptyRow colSpan={5}>Nothing posted yet.</EmptyRow>}
          {entries.map((e) => (
            <TR key={e.id} className={e.reversed ? "text-ink-soft" : undefined}>
              <TD className="text-ink-soft">
                {e.transactionNo}
                {e.documentType === "Reversal" && <span className="ml-1 text-xs">(reversal)</span>}
              </TD>
              <TD className="text-ink-soft">{formatDmy(e.postingDate)}</TD>
              <TD>
                <span className="font-mono text-xs text-ink-soft">{e.account.code}</span> {e.account.name}
              </TD>
              <TD align="right">
                <Amount value={num(e.debit)} dashZero />
              </TD>
              <TD align="right">
                <Amount value={num(e.credit)} dashZero />
              </TD>
            </TR>
          ))}
          {entries.length > 0 && (
            <TR className="font-semibold">
              <TD colSpan={3}>Total</TD>
              <TD align="right">
                <Amount value={debit} />
              </TD>
              <TD align="right">
                <Amount value={credit} />
              </TD>
            </TR>
          )}
        </TBody>
      </Table>
    </Card>
  );
}
