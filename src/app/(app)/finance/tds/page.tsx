import type { Metadata } from "next";
import type { Prisma } from "@/generated/prisma/client";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader, StatCard } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { Pagination } from "@/components/ui/list-toolbar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { tdsQuarterOf } from "@/lib/finance/chart";
import { getBankAccountOptions } from "@/lib/finance/queries";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { formatMoney, humanize, num } from "@/lib/format";
import { pagination, param } from "@/lib/forms";
import { formatDmy, todayIso } from "@/lib/ops/dates";
import { can } from "@/lib/permissions";
import { amt } from "../reports/_lib/amount";
import { deleteManualTdsEntry, markQuarterFiled, recordChallan } from "./actions";
import { ChallanForm } from "./challan-form";
import { TaxNav } from "./_lib/nav";
import { STATUSES, kindOf, recentQuarters, returnForm } from "./_lib/tds";

export const metadata: Metadata = { title: "TDS / TCS" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

const TONE = { PENDING: "amber", DEPOSITED: "blue", FILED: "green" } as const;

export default async function FinanceTdsPage({ searchParams }: PageProps<"/finance/tds">) {
  const user = await requireUser("finance");
  await ensureFinanceSetup();
  const sp = await searchParams;
  const kind = kindOf(param(sp, "kind"));
  const today = todayIso();
  const quarters = recentQuarters(today);
  const quarter = param(sp, "quarter") || tdsQuarterOf(today);
  if (!quarters.includes(quarter)) quarters.push(quarter);
  const sectionId = param(sp, "section");
  const status = param(sp, "status");
  const q = param(sp, "q");
  const { page, take, skip } = pagination(sp);
  const canEdit = can(user, "finance", "edit");

  const where: Prisma.TdsEntryWhereInput = {
    kind,
    ...(quarter !== "all" && { quarter }),
    ...(sectionId && { sectionId }),
    ...(STATUSES.includes(status as (typeof STATUSES)[number]) && { status }),
    ...(q && {
      OR: [
        { contact: { name: { contains: q, mode: "insensitive" } } },
        { contact: { pan: { contains: q, mode: "insensitive" } } },
        { documentNo: { contains: q, mode: "insensitive" } },
        { challanNo: { contains: q, mode: "insensitive" } },
      ],
    }),
  };

  const [sections, entries, total, byStatus, banks] = await Promise.all([
    db.tdsSection.findMany({ where: { kind }, orderBy: { code: "asc" } }),
    db.tdsEntry.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take,
      skip,
      include: { section: { select: { code: true } }, contact: { select: { id: true, name: true, pan: true } } },
    }),
    db.tdsEntry.count({ where }),
    db.tdsEntry.groupBy({ by: ["status"], where: { kind, ...(quarter !== "all" && { quarter }) }, _sum: { amount: true }, _count: true }),
    getBankAccountOptions(),
  ]);
  const sum = (s: string) => num(byStatus.find((b) => b.status === s)?._sum.amount);
  const count = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;

  const section = sections.find((s) => s.id === sectionId);
  const pendingForSection =
    canEdit && section
      ? await db.tdsEntry.findMany({
          where: { kind, sectionId: section.id, status: "PENDING", ...(quarter !== "all" && { quarter }) },
          orderBy: { date: "asc" },
          include: { contact: { select: { name: true } } },
        })
      : [];

  const exportQuery = new URLSearchParams({ kind, quarter, ...(sectionId && { section: sectionId }), ...(status && { status }), ...(q && { q }) }).toString();

  return (
    <>
      <PageHeader
        title="TDS / TCS"
        description={`${kind === "TDS" ? "Tax deducted at source on payments" : "Tax collected at source on sales"} · ${quarter === "all" ? "all quarters" : quarter}`}
        back={{ href: "/finance", label: "Finance" }}
        actions={
          <>
            <ButtonLink variant="secondary" href={`/finance/tds/export?${exportQuery}`} prefetch={false}>
              Export to Excel
            </ButtonLink>
            {canEdit && <ButtonLink href={`/finance/tds/new?kind=${kind}`}>Manual entry</ButtonLink>}
          </>
        }
      />
      <TaxNav kind={kind} current="entries" quarter={quarter} />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Pending deposit" value={formatMoney(sum("PENDING"))} hint={`${count("PENDING")} entries`} tone={sum("PENDING") > 0 ? "warning" : "default"} />
        <StatCard label="Deposited" value={formatMoney(sum("DEPOSITED"))} hint={`${count("DEPOSITED")} entries, return not yet filed`} />
        <StatCard label="Filed" value={formatMoney(sum("FILED"))} hint={`${count("FILED")} entries`} />
      </div>

      <Card>
        <form className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3" role="search">
          <input type="hidden" name="kind" value={kind} />
          <Input name="q" defaultValue={q} placeholder="Party, PAN, document or challan" className="max-w-xs" aria-label="Search" />
          <Select name="quarter" defaultValue={quarter} className="w-auto" aria-label="Quarter">
            {quarters.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
            <option value="all">All quarters</option>
          </Select>
          <Select name="section" defaultValue={sectionId} className="w-auto" aria-label="Section">
            <option value="">All sections</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} · {s.description}
              </option>
            ))}
          </Select>
          <Select name="status" defaultValue={status} className="w-auto" aria-label="Status">
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </Select>
          <button type="submit" className={buttonClass("secondary")}>
            Apply
          </button>
        </form>
        <Table>
          <THead>
            <tr>
              <TH>Date</TH>
              <TH>Section</TH>
              <TH>Party</TH>
              <TH>PAN</TH>
              <TH>Document</TH>
              <TH align="right">Base amount</TH>
              <TH align="right">Rate</TH>
              <TH align="right">{kind}</TH>
              <TH>Status</TH>
              <TH>Challan</TH>
              {canEdit && <TH />}
            </tr>
          </THead>
          <TBody>
            {entries.length === 0 && <EmptyRow colSpan={canEdit ? 11 : 10}>No {kind} entries for these filters.</EmptyRow>}
            {entries.map((e) => (
              <TR key={e.id}>
                <TD className="text-ink-soft">{formatDmy(e.date)}</TD>
                <TD className="font-medium">{e.section.code}</TD>
                <TD>{e.contact.name}</TD>
                <TD className="font-mono text-xs">{e.contact.pan ?? <span className="text-red-600">Missing</span>}</TD>
                <TD className="text-ink-soft">
                  {e.documentType}
                  {e.documentNo ? ` ${e.documentNo}` : ""}
                </TD>
                <TD align="right">{amt(num(e.baseAmount))}</TD>
                <TD align="right">{num(e.rate)}%</TD>
                <TD align="right" className="font-medium">
                  {amt(num(e.amount))}
                </TD>
                <TD>
                  <Badge tone={TONE[e.status as keyof typeof TONE] ?? "gray"}>{humanize(e.status)}</Badge>
                </TD>
                <TD className="text-xs text-ink-soft">{e.challanNo ? `${e.challanNo} · ${formatDmy(e.challanDate)}` : "—"}</TD>
                {canEdit && (
                  <TD align="right">
                    {e.status === "PENDING" && !e.sourceId && (
                      <ActionButton action={deleteManualTdsEntry.bind(null, e.id)} variant="ghost" size="sm" confirmMessage="Delete this manual entry?">
                        Delete
                      </ActionButton>
                    )}
                  </TD>
                )}
              </TR>
            ))}
          </TBody>
        </Table>
        <Pagination page={page} pageSize={take} total={total} searchParams={sp} />
      </Card>

      {canEdit && (
        <Card className="mt-6">
          <CardHeader
            title="Record challan"
            description={
              section
                ? `Pending ${kind} entries of section ${section.code}${quarter !== "all" ? ` in ${quarter}` : ""}. They become Deposited.`
                : "Choose a section in the filter above to select its pending entries."
            }
          />
          <CardBody>
            {!section && <p className="text-sm text-ink-faint">A challan pays the tax of one section.</p>}
            {section && pendingForSection.length === 0 && <p className="text-sm text-ink-faint">No pending entries for {section.code}.</p>}
            {section && pendingForSection.length > 0 && (
              <ChallanForm
                key={`${section.id}-${quarter}`}
                action={recordChallan}
                sectionCode={section.code}
                kind={kind}
                today={today}
                banks={banks.map((b) => ({ id: b.id, name: b.name }))}
                entries={pendingForSection.map((e) => ({ id: e.id, date: formatDmy(e.date), party: e.contact.name, documentNo: e.documentNo, amount: num(e.amount) }))}
              />
            )}
          </CardBody>
        </Card>
      )}

      {canEdit && quarter !== "all" && (
        <Card className="mt-6">
          <CardHeader
            title={`File ${returnForm(kind)} for ${quarter}`}
            description="After filing the quarterly return on the TRACES / income tax portal, mark its deposited entries as filed."
            actions={
              <ActionButton action={markQuarterFiled.bind(null, kind, quarter)} confirmMessage={`Mark all deposited ${kind} entries of ${quarter} as filed?`}>
                Mark quarter as filed
              </ActionButton>
            }
          />
        </Card>
      )}
    </>
  );
}
