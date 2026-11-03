import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { CompanyForm } from "./company-form";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Company settings" };

export default async function CompanySettingsPage() {
  await requireUser("settings");
  const company = await db.companySettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  return (
    <div className="max-w-3xl">
      <PageHeader title="Company" description="Your business identity and tax registration." />
      <CompanyForm initial={company} />
    </div>
  );
}
