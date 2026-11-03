/**
 * Imports masters from a Domestic B2B CRM full-data export (.xlsx) into this ERP:
 * Customers / Suppliers / Transporters → Contacts (roles merged by name),
 * Products → Items, POCs → OpsPoc.
 *
 * Usage: npx tsx scripts/import-domestic-crm.ts "<path to export .xlsx>"
 *
 * Safe to re-run: existing records are matched by name (case-insensitive) and
 * only blank fields are filled. No business data lives in this repository; the
 * export file stays on your machine.
 */
import "dotenv/config";
import * as XLSX from "xlsx";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { ContactRole } from "../src/generated/prisma/enums";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

type Row = Record<string, unknown>;

function sheet(wb: XLSX.WorkBook, name: string): Row[] {
  const ws = wb.Sheets[name];
  return ws ? XLSX.utils.sheet_to_json<Row>(ws, { defval: "" }) : [];
}

const text = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s ? s : null;
};

async function nextContactCode(): Promise<string> {
  const seq = await db.documentSequence.upsert({
    where: { key: "CONTACT" },
    create: { key: "CONTACT", prefix: "C-", padding: 5, next: 2 },
    update: { next: { increment: 1 } },
  });
  return `${seq.prefix}${String(seq.next - 1).padStart(seq.padding, "0")}`;
}

async function upsertContact(
  role: ContactRole,
  input: { name: string; address?: string | null; pincode?: string | null; pocs?: string[]; multipleAddresses?: boolean; gstin?: string | null; phone?: string | null },
) {
  const existing = await db.contact.findFirst({ where: { name: { equals: input.name, mode: "insensitive" } } });
  if (existing) {
    await db.contact.update({
      where: { id: existing.id },
      data: {
        roles: existing.roles.includes(role) ? undefined : { push: role },
        billingAddress: existing.billingAddress ?? input.address ?? undefined,
        pincode: existing.pincode ?? input.pincode ?? undefined,
        gstin: existing.gstin ?? input.gstin ?? undefined,
        phone: existing.phone ?? input.phone ?? undefined,
        pocNames: existing.pocNames.length ? undefined : input.pocs,
        multipleAddresses: existing.multipleAddresses || !!input.multipleAddresses,
      },
    });
    return "updated" as const;
  }
  await db.contact.create({
    data: {
      code: await nextContactCode(),
      name: input.name,
      roles: [role],
      billingAddress: input.address ?? null,
      pincode: input.pincode ?? null,
      gstin: input.gstin ?? null,
      phone: input.phone ?? null,
      pocNames: input.pocs ?? [],
      multipleAddresses: !!input.multipleAddresses,
    },
  });
  return "added" as const;
}

const splitPocs = (v: unknown) =>
  String(v ?? "")
    .split(/[;,/|\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Pass the path to the CRM export, e.g. npx tsx scripts/import-domestic-crm.ts "~/Domestic CRM/Domestic B2B CRM Data.xlsx"');
  const wb = XLSX.readFile(file, { cellDates: true });
  const counts: Record<string, { added: number; updated: number }> = {};
  const tally = (k: string, r: "added" | "updated") => {
    counts[k] ??= { added: 0, updated: 0 };
    counts[k][r]++;
  };

  for (const r of sheet(wb, "Customers")) {
    const name = text(r.name ?? r.Customer);
    if (!name) continue;
    tally(
      "customers",
      await upsertContact("CUSTOMER", {
        name,
        address: text(r.address ?? r.Address),
        pincode: text(r.pincode ?? r.Pincode),
        pocs: splitPocs(r.poc ?? r.Customer_POC),
        multipleAddresses: /^y/i.test(String(r.multipleAddresses ?? r["Multiple Addresses in MIS"] ?? "")),
      }),
    );
  }
  for (const r of sheet(wb, "Suppliers")) {
    const name = text(r.name ?? r.Supplier);
    if (!name) continue;
    tally("suppliers", await upsertContact("SUPPLIER", { name, address: text(r.address ?? r.Address), pincode: text(r.pincode ?? r.Pincode), pocs: splitPocs(r.poc ?? r.Supplier_POC) }));
  }
  for (const r of sheet(wb, "Transporters")) {
    const name = text(r.name ?? r.Transporter);
    if (!name) continue;
    tally("transporters", await upsertContact("TRANSPORTER", { name, gstin: text(r.gstin ?? r["GSTIN / Transporter ID"]), phone: text(r.contact ?? r.Contact) }));
  }

  let productNo = await db.product.count();
  for (const r of sheet(wb, "Products")) {
    const name = text(r.name ?? r["Molecule Name"]);
    if (!name) continue;
    const existing = await db.product.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
    const fields = {
      hsnCode: text(r.hsn ?? r["Atomgrid HSN Code"]),
      casNo: text(r.casNo ?? r["CAS No."]),
      productClass: text(r.type ?? r.Type),
      funnel: "B2B",
    };
    if (existing) {
      await db.product.update({
        where: { id: existing.id },
        data: {
          hsnCode: existing.hsnCode ?? fields.hsnCode,
          casNo: existing.casNo ?? fields.casNo,
          productClass: existing.productClass ?? fields.productClass,
          funnel: existing.funnel ?? fields.funnel,
        },
      });
      tally("products", "updated");
    } else {
      const sNo = text(r.sNo ?? r["S No."]);
      let sku = sNo ? `B2B-${sNo}` : `B2B-${String(++productNo).padStart(4, "0")}`;
      if (await db.product.findUnique({ where: { sku } })) sku = `${sku}-${String(++productNo).padStart(4, "0")}`;
      await db.product.create({
        data: { ...fields, sku, name, itemType: "TRADING", supplyMode: "BUY", unit: "kg", taxRate: 18 },
      });
      tally("products", "added");
    }
  }

  for (const r of sheet(wb, "POCs")) {
    const name = text(r.name);
    if (!name) continue;
    const existing = await db.opsPoc.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
    if (existing) tally("pocs", "updated");
    else {
      await db.opsPoc.create({ data: { name } });
      tally("pocs", "added");
    }
  }

  console.table(counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
