import "server-only";
import { db, type Tx } from "@/lib/db";
import { dayFromIso, todayIso } from "@/lib/ops/dates";
import { DEFAULT_ACCOUNTS, DEFAULT_DIMENSIONS, DEFAULT_TDS_SECTIONS, POSTING_KEYS, fiscalYearOf, periodsOf } from "./chart";

type Client = Tx | typeof db;

/** Creates the financial year (and its 12 periods) containing an ISO date, if missing. */
export async function ensureFiscalYear(client: Client, iso: string) {
  const fy = fiscalYearOf(iso);
  const existing = await client.fiscalYear.findUnique({ where: { name: fy.name } });
  if (existing) return existing;
  return client.fiscalYear.create({
    data: {
      name: fy.name,
      startDate: dayFromIso(fy.start),
      endDate: dayFromIso(fy.end),
      periods: { create: periodsOf(fy.startYear).map((p) => ({ name: p.name, startDate: dayFromIso(p.start), endDate: dayFromIso(p.end) })) },
    },
  });
}

/**
 * Idempotent first-run setup of the finance module: standard chart of accounts,
 * posting setup, the current and next financial years, dimensions, TDS
 * sections, base currency, and a default cash and bank account. Cheap to call
 * on every finance page; it only writes what is missing.
 */
export async function ensureFinanceSetup(client: Client = db) {
  const [accounts, mappings] = await Promise.all([client.glAccount.count(), client.postingAccount.count()]);
  const today = todayIso();

  if (accounts === 0) {
    const byCode = new Map<string, string>();
    for (const a of DEFAULT_ACCOUNTS) {
      const created = await client.glAccount.create({
        data: {
          code: a.code,
          name: a.name,
          type: a.type,
          category: a.category,
          isGroup: !!a.isGroup,
          parentId: a.parent ? byCode.get(a.parent) : undefined,
          cashFlowGroup: a.cashFlowGroup ?? "OPERATING",
          directPosting: !a.control && !a.isGroup,
          isSystem: true,
        },
      });
      byCode.set(a.code, created.id);
    }
  }

  if (mappings < Object.keys(POSTING_KEYS).length) {
    const codes = await client.glAccount.findMany({ select: { id: true, code: true } });
    const idOf = new Map(codes.map((c) => [c.code, c.id]));
    for (const [key, def] of Object.entries(POSTING_KEYS)) {
      const accountId = idOf.get(def.code);
      if (accountId) await client.postingAccount.upsert({ where: { key }, create: { key, accountId }, update: {} });
    }
  }

  await ensureFiscalYear(client, today);

  if ((await client.dimension.count()) === 0) {
    for (const d of DEFAULT_DIMENSIONS) {
      await client.dimension.create({
        data: { code: d.code, name: d.name, values: { create: d.values.map(([code, name]) => ({ code, name })) } },
      });
    }
    const branches = await client.branch.findMany({ select: { code: true, name: true } });
    await client.dimension.create({
      data: { code: "BRANCH", name: "Branch", values: { create: branches.map((b) => ({ code: b.code, name: b.name })) } },
    });
  }

  if ((await client.tdsSection.count()) === 0) {
    await client.tdsSection.createMany({ data: DEFAULT_TDS_SECTIONS.map((s) => ({ ...s })) });
  }

  if ((await client.currency.count()) === 0) {
    await client.currency.createMany({
      data: [
        { code: "INR", name: "Indian rupee", symbol: "₹", isBase: true },
        { code: "USD", name: "US dollar", symbol: "$" },
        { code: "EUR", name: "Euro", symbol: "€" },
      ],
    });
  }

  if ((await client.bankAccount.count()) === 0) {
    const [cash, bank] = await Promise.all([
      client.postingAccount.findUnique({ where: { key: "CASH" } }),
      client.postingAccount.findUnique({ where: { key: "BANK" } }),
    ]);
    if (cash) await client.bankAccount.create({ data: { code: "CASH", name: "Cash in hand", kind: "CASH", glAccountId: cash.accountId } });
    if (bank) await client.bankAccount.create({ data: { code: "BANK-01", name: "Main bank account", kind: "BANK", glAccountId: bank.accountId } });
  }
}
