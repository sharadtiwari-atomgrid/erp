import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const instant = false;

export default async function VendorLedgerPage() {
  await requireUser("finance");
  const entries = await db.glEntry.findMany({ where: { contact: { roles: { has: "SUPPLIER" } } }, orderBy: [{ postingDate: "desc" }, { entryNo: "desc" }], take: 100, include: { account: { select: { code: true, name: true } }, contact: { select: { name: true } } } });
  return <PageHeader title="Vendor Ledger Entries" description={`Posted vendor transactions: ${entries.length}`} />;
}
