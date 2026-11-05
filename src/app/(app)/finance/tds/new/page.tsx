import type { Metadata } from "next";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { num } from "@/lib/format";
import { param } from "@/lib/forms";
import { todayIso } from "@/lib/ops/dates";
import { createManualTdsEntry } from "../actions";
import { kindOf } from "../_lib/tds";
import { ManualEntryForm } from "./entry-form";

export const metadata: Metadata = { title: "Manual TDS & TCS Entry" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function NewTdsEntryPage({ searchParams }: PageProps<"/finance/tds/new">) {
  await requireUser("finance", "edit");
  await ensureFinanceSetup();
  const kind = kindOf(param(await searchParams, "kind"));
  const [sections, parties] = await Promise.all([
    db.tdsSection.findMany({ where: { kind, isActive: true }, orderBy: { code: "asc" } }),
    db.contact.findMany({
      where: { isActive: true, roles: { hasSome: kind === "TCS" ? ["CUSTOMER"] : ["SUPPLIER", "TRANSPORTER", "OTHER"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, pan: true },
    }),
  ]);
  return (
    <>
      <PageHeader title={`Manual ${kind} entry`} description="Record a deduction or collection made outside vendor payments." back={{ href: `/finance/tds?kind=${kind}`, label: "TDS & TCS Entries" }} />
      <Card>
        <CardBody>
          {sections.length === 0 ? (
            <p className="text-sm text-ink-faint">Add an active {kind} section first.</p>
          ) : (
            <ManualEntryForm
              action={createManualTdsEntry}
              kind={kind}
              today={todayIso()}
              parties={parties}
              sections={sections.map((s) => ({ id: s.id, code: s.code, description: s.description, rateIndividual: num(s.rateIndividual), rateCompany: num(s.rateCompany) }))}
            />
          )}
        </CardBody>
      </Card>
    </>
  );
}
