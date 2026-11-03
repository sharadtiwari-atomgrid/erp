import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { createBranch } from "../actions";
import { BranchForm } from "../branch-form";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "New branch" };

export default async function NewBranchPage() {
  await requireUser("branches", "edit");
  return (
    <div className="max-w-3xl">
      <PageHeader title="New branch" back={{ href: "/branches", label: "Branches" }} />
      <BranchForm action={createBranch} cancelHref="/branches" />
    </div>
  );
}
