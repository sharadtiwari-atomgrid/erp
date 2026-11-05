import { Card, CardHeader } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { db } from "@/lib/db";
import { POSTING_KEYS } from "@/lib/finance/chart";
import type { LedgerLine } from "./postings";
import { Amount } from "./ui";

/** Shows the lines a draft would post (Business Central's "Preview posting"). */
export async function PostingPreviewCard({ lines }: { lines: LedgerLine[] }) {
  const keys = lines.flatMap((l) => (typeof l.account === "string" ? [l.account] : []));
  const ids = lines.flatMap((l) => (typeof l.account === "string" ? [] : [l.account.id]));
  const [mapped, accounts] = await Promise.all([
    db.postingAccount.findMany({ where: { key: { in: keys } }, include: { account: { select: { code: true, name: true } } } }),
    db.glAccount.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, name: true } }),
  ]);
  const byKey = new Map(mapped.map((m) => [m.key, m.account]));
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const label = (l: LedgerLine) => {
    if (typeof l.account === "string") {
      const a = byKey.get(l.account);
      return a ? { code: a.code, name: a.name } : { code: "", name: POSTING_KEYS[l.account].label };
    }
    const a = byId.get(l.account.id);
    return { code: a?.code ?? "", name: a?.name ?? "Unknown account" };
  };
  const debit = lines.reduce((s, l) => s + (l.debit ?? 0), 0);
  const credit = lines.reduce((s, l) => s + (l.credit ?? 0), 0);
  return (
    <Card>
      <CardHeader title="Preview Posting" description="What posting will write to the general ledger." />
      <Table>
        <THead>
          <tr>
            <TH>Account</TH>
            <TH align="right">Debit Amount</TH>
            <TH align="right">Credit Amount</TH>
          </tr>
        </THead>
        <TBody>
          {lines.map((l, i) => {
            const a = label(l);
            return (
              <TR key={i}>
                <TD>
                  <span className="font-mono text-xs text-ink-soft">{a.code}</span> {a.name}
                </TD>
                <TD align="right">
                  <Amount value={l.debit ?? 0} dashZero />
                </TD>
                <TD align="right">
                  <Amount value={l.credit ?? 0} dashZero />
                </TD>
              </TR>
            );
          })}
          <TR className="font-semibold">
            <TD>Total</TD>
            <TD align="right">
              <Amount value={debit} />
            </TD>
            <TD align="right">
              <Amount value={credit} />
            </TD>
          </TR>
        </TBody>
      </Table>
    </Card>
  );
}
