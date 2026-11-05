import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";

export const instant = false;

export default async function CustomerLedgerPage() {
  await requireUser("finance");
  return <PageHeader title="Customer Ledger Entries" description="Posted customer transactions and their general-ledger impact." />;
}
