import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { num } from "@/lib/format";
import { can } from "@/lib/permissions";
import { CoaTool } from "./coa-tool";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "COA generator" };

export default async function CoaGeneratorPage() {
  const user = await requireUser("opsTools");
  const jobs = await db.misJob.findMany({
    where: { deletedAt: null, jobNo: { not: "" } },
    orderBy: { createdAt: "desc" },
    take: 2000,
    select: { id: true, jobNo: true, productName: true, customer: true, quantityKgs: true },
  });
  return (
    <>
      <PageHeader
        title="COA generator"
        description="Upload a supplier COA and get it in the Atomgrid format. PDFs are read from their text; scans and photos with text recognition. No AI, and nothing leaves your browser until you save."
      />
      <CoaTool
        jobs={jobs.map((j) => ({ ...j, quantityKgs: j.quantityKgs === null ? null : num(j.quantityKgs) }))}
        canSave={can(user, "opsTools", "edit")}
      />
    </>
  );
}
