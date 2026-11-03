import type { Metadata } from "next";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import { deleteForever, restoreFreshPo, restoreMisJob } from "./actions";
import { ARCHIVE_DAYS, purgeExpired, timeLeft, type ArchiveKind } from "./data";

export const metadata: Metadata = { title: "Archives" };

const BOARD_LABELS = { FRESH: "Fresh PO", LONG_HOLD: "Long Hold PO", MIS: "Fresh PO (in Domestic MIS)" } as const;

type ArchiveRow = { kind: ArchiveKind; id: string; source: string; number: string; customer: string; product: string; deletedAt: Date; fromPo: boolean };

export default async function ArchivesPage() {
  const user = await requireUser("b2bOrders");
  await purgeExpired();

  const [pos, jobs] = await Promise.all([
    db.freshPo.findMany({
      where: { deletedAt: { not: null } },
      select: { id: true, requestNo: true, board: true, customer: true, product: true, deletedAt: true },
    }),
    db.misJob.findMany({
      where: { deletedAt: { not: null } },
      select: { id: true, jobNo: true, source: true, customer: true, productName: true, deletedAt: true },
    }),
  ]);
  const rows: ArchiveRow[] = [
    ...pos.map((p) => ({
      kind: "FreshPo" as const,
      id: p.id,
      source: BOARD_LABELS[p.board],
      number: p.requestNo === null ? "" : `PO #${p.requestNo}`,
      customer: p.customer ?? "",
      product: p.product ?? "",
      deletedAt: p.deletedAt!,
      fromPo: false,
    })),
    ...jobs.map((j) => ({
      kind: "MisJob" as const,
      id: j.id,
      source: "Domestic MIS",
      number: `Job ${j.jobNo}`,
      customer: j.customer ?? "",
      product: j.productName ?? "",
      deletedAt: j.deletedAt!,
      fromPo: j.source === "fresh-po",
    })),
  ].sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime());

  const canEdit = can(user, "b2bOrders", "edit");
  const canPurge = can(user, "settings", "edit");

  return (
    <>
      <PageHeader title="Archives" description={`Deleted Fresh POs and Domestic MIS jobs are kept here for ${ARCHIVE_DAYS} days so you can recover them, then removed automatically.`} />
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Source</TH>
              <TH>Number</TH>
              <TH>Customer</TH>
              <TH>Product</TH>
              <TH>Deleted</TH>
              <TH>Recover within</TH>
              <TH />
            </tr>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={7}>Nothing in Archives.</EmptyRow>}
            {rows.map((r) => (
              <TR key={`${r.kind}-${r.id}`}>
                <TD className="whitespace-nowrap">{r.source}</TD>
                <TD className="whitespace-nowrap tabular-nums">
                  {r.number || "—"} {r.fromPo && <Badge tone="blue">from PO</Badge>}
                </TD>
                <TD>{r.customer || "—"}</TD>
                <TD>{r.product || "—"}</TD>
                <TD className="whitespace-nowrap">{formatDateTime(r.deletedAt)}</TD>
                <TD className="whitespace-nowrap">
                  <Badge tone="amber">{timeLeft(r.deletedAt)}</Badge>
                </TD>
                <TD align="right" className="whitespace-nowrap">
                  <div className="flex justify-end gap-2">
                    {canEdit && (
                      <ActionButton size="sm" action={r.kind === "FreshPo" ? restoreFreshPo.bind(null, r.id) : restoreMisJob.bind(null, r.id)} pendingText="Restoring…">
                        Restore
                      </ActionButton>
                    )}
                    {canPurge && (
                      <ActionButton
                        size="sm"
                        variant="danger"
                        action={deleteForever.bind(null, r.kind, r.id)}
                        confirmMessage="Permanently delete this entry? This cannot be undone."
                        pendingText="Deleting…"
                      >
                        Delete forever
                      </ActionButton>
                    )}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
