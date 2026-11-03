import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateBranch } from "../../actions";
import { BranchForm } from "../../branch-form";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Edit branch" };

export default async function EditBranchPage({ params }: PageProps<"/branches/[id]/edit">) {
  await requireUser("branches", "edit");
  const { id } = await params;
  const branch = await db.branch.findUnique({ where: { id } });
  if (!branch) notFound();
  return (
    <div className="max-w-3xl">
      <PageHeader title={`Edit ${branch.name}`} back={{ href: `/branches/${id}`, label: branch.name }} />
      <BranchForm action={updateBranch.bind(null, id)} initial={branch} cancelHref={`/branches/${id}`} />
    </div>
  );
}
