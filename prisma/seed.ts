import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

// Demo login for local development only. Override with SEED_PASSWORD.
const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? "Password123!";

async function main() {
  const existing = await db.user.count();
  if (existing > 0) {
    console.log("Database already has users; skipping seed. Run `npm run db:reset` to start fresh.");
    return;
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  await db.companySettings.create({
    data: {
      id: 1,
      name: "Acme Industries",
      legalName: "Acme Industries Private Limited",
      gstin: "27AABCA1234F1Z5",
      pan: "AABCA1234F",
      email: "accounts@acme.example",
      phone: "+91 22 4000 1000",
      address: "4th Floor, Trade Centre, Bandra Kurla Complex",
      city: "Mumbai",
      state: "Maharashtra",
      pincode: "400051",
    },
  });

  const users = await Promise.all(
    [
      { name: "Asha Admin", email: "admin@example.com", role: "ADMIN" as const },
      { name: "Manoj Manager", email: "manager@example.com", role: "MANAGER" as const },
      { name: "Sana Sales", email: "sales@example.com", role: "SALES" as const },
      { name: "Pranav Purchase", email: "purchase@example.com", role: "PURCHASE" as const },
      { name: "Wasim Warehouse", email: "warehouse@example.com", role: "WAREHOUSE" as const },
    ].map((u) => db.user.create({ data: { ...u, passwordHash } })),
  );
  const admin = users[0];
  const sales = users[2];

  const [main, pune] = await Promise.all([
    db.warehouse.create({ data: { code: "MUM", name: "Mumbai Main Warehouse", address: "Bhiwandi, Thane" } }),
    db.warehouse.create({ data: { code: "PUN", name: "Pune Depot", address: "Chakan MIDC, Pune" } }),
  ]);

  const [electronics, office, services] = await Promise.all(
    ["Electronics", "Office Supplies", "Services"].map((name) => db.productCategory.create({ data: { name } })),
  );

  const productData = [
    { sku: "EL-1001", name: "27\" LED Monitor", categoryId: electronics.id, hsnCode: "8528", salePrice: 14500, purchasePrice: 11200, taxRate: 18, reorderLevel: 10, stock: [40, 12] },
    { sku: "EL-1002", name: "Wireless Keyboard & Mouse", categoryId: electronics.id, hsnCode: "8471", salePrice: 1899, purchasePrice: 1250, taxRate: 18, reorderLevel: 25, stock: [120, 30] },
    { sku: "EL-1003", name: "USB-C Docking Station", categoryId: electronics.id, hsnCode: "8473", salePrice: 7800, purchasePrice: 5900, taxRate: 18, reorderLevel: 8, stock: [6, 2] },
    { sku: "EL-1004", name: "Laser Printer A4", categoryId: electronics.id, hsnCode: "8443", salePrice: 18999, purchasePrice: 15100, taxRate: 18, reorderLevel: 5, stock: [9, 0] },
    { sku: "EL-1005", name: "UPS 1 kVA", categoryId: electronics.id, hsnCode: "8504", salePrice: 6400, purchasePrice: 4800, taxRate: 18, reorderLevel: 10, stock: [22, 8] },
    { sku: "OS-2001", name: "A4 Copier Paper (500 sheets)", categoryId: office.id, hsnCode: "4802", unit: "ream", salePrice: 320, purchasePrice: 245, taxRate: 12, reorderLevel: 200, stock: [650, 180] },
    { sku: "OS-2002", name: "Ergonomic Office Chair", categoryId: office.id, hsnCode: "9401", salePrice: 8900, purchasePrice: 6300, taxRate: 18, reorderLevel: 6, stock: [14, 4] },
    { sku: "OS-2003", name: "Whiteboard Markers (box of 10)", categoryId: office.id, hsnCode: "9608", unit: "box", salePrice: 240, purchasePrice: 150, taxRate: 18, reorderLevel: 50, stock: [35, 20] },
    { sku: "SV-9001", name: "On-site Installation", categoryId: services.id, hsnCode: "998713", type: "SERVICE" as const, unit: "hour", salePrice: 1200, purchasePrice: 0, taxRate: 18, reorderLevel: 0, stock: [0, 0] },
    { sku: "SV-9002", name: "Annual Maintenance Contract", categoryId: services.id, hsnCode: "998713", type: "SERVICE" as const, unit: "year", salePrice: 15000, purchasePrice: 0, taxRate: 18, reorderLevel: 0, stock: [0, 0] },
  ];

  for (const { stock, ...p } of productData) {
    const product = await db.product.create({ data: p });
    if (p.type === "SERVICE") continue;
    for (const [warehouse, qty] of [[main, stock[0]], [pune, stock[1]]] as const) {
      if (qty <= 0) continue;
      await db.stockLevel.create({ data: { productId: product.id, warehouseId: warehouse.id, quantity: qty } });
      await db.stockMovement.create({
        data: {
          productId: product.id,
          warehouseId: warehouse.id,
          type: "OPENING",
          quantity: qty,
          unitCost: p.purchasePrice,
          reference: "Opening balance",
          createdById: admin.id,
        },
      });
    }
  }

  const customers = [
    { name: "Bluewave Technologies", email: "procurement@bluewave.example", phone: "+91 98200 11111", gstin: "27AAFCB1111A1Z1", city: "Mumbai", state: "Maharashtra", creditLimit: 500000 },
    { name: "Sunrise Hospitals", email: "purchase@sunrise.example", phone: "+91 98450 22222", gstin: "29AAACS2222B1Z2", city: "Bengaluru", state: "Karnataka", creditLimit: 800000, paymentTermsDays: 45 },
    { name: "Greenleaf Schools Trust", email: "admin@greenleaf.example", phone: "+91 99000 33333", city: "Pune", state: "Maharashtra", creditLimit: 200000 },
    { name: "Northstar Logistics", email: "it@northstar.example", phone: "+91 98110 44444", gstin: "07AAGCN4444C1Z4", city: "New Delhi", state: "Delhi", creditLimit: 300000 },
    { name: "Coastal Foods Pvt Ltd", email: "accounts@coastal.example", phone: "+91 94440 55555", gstin: "33AAHCC5555D1Z5", city: "Chennai", state: "Tamil Nadu", paymentTermsDays: 15 },
    { name: "Orbit Design Studio", email: "hello@orbit.example", phone: "+91 98220 66666", city: "Nashik", state: "Maharashtra", paymentTermsDays: 0 },
  ];
  for (const [i, c] of customers.entries()) {
    await db.customer.create({ data: { ...c, code: `CUS-${String(i + 1).padStart(4, "0")}`, billingAddress: `${c.city} office` } });
  }

  const suppliers = [
    { name: "Vertex Electronics Distributors", email: "orders@vertex.example", phone: "+91 22 2600 1111", gstin: "27AAACV1111E1Z1", city: "Mumbai", state: "Maharashtra" },
    { name: "PaperMill India", email: "sales@papermill.example", phone: "+91 20 2700 2222", gstin: "27AAACP2222F1Z2", city: "Pune", state: "Maharashtra", paymentTermsDays: 15 },
    { name: "ComfortSeating Co.", email: "b2b@comfortseating.example", phone: "+91 80 2800 3333", gstin: "29AAACC3333G1Z3", city: "Bengaluru", state: "Karnataka", paymentTermsDays: 45 },
    { name: "PowerSafe Systems", email: "trade@powersafe.example", phone: "+91 11 2900 4444", gstin: "07AAACP4444H1Z4", city: "New Delhi", state: "Delhi" },
  ];
  for (const [i, s] of suppliers.entries()) {
    await db.supplier.create({ data: { ...s, code: `SUP-${String(i + 1).padStart(4, "0")}`, address: `${s.city} office` } });
  }

  const leads = [
    { name: "Ritu Sharma", company: "Pinnacle Consulting", email: "ritu@pinnacle.example", source: "Website", status: "NEW" as const, estimatedValue: 120000 },
    { name: "Arjun Mehta", company: "Metro Co-working", email: "arjun@metro.example", source: "Referral", status: "CONTACTED" as const, estimatedValue: 450000 },
    { name: "Fatima Khan", company: "Lotus Pharma", email: "fatima@lotus.example", source: "Trade show", status: "QUALIFIED" as const, estimatedValue: 900000 },
    { name: "Vikram Rao", company: "Rao & Sons Retail", phone: "+91 98480 77777", source: "Cold call", status: "LOST" as const, estimatedValue: 60000 },
  ];
  for (const l of leads) await db.lead.create({ data: { ...l, ownerId: sales.id } });

  const sequences = [
    { key: "CUSTOMER", prefix: "CUS-", padding: 4, next: customers.length + 1 },
    { key: "SUPPLIER", prefix: "SUP-", padding: 4, next: suppliers.length + 1 },
    { key: "QUOTATION", prefix: "QT-", padding: 5, next: 1 },
    { key: "SALES_ORDER", prefix: "SO-", padding: 5, next: 1 },
    { key: "INVOICE", prefix: "INV-", padding: 5, next: 1 },
    { key: "PURCHASE_ORDER", prefix: "PO-", padding: 5, next: 1 },
    { key: "STOCK_ADJUSTMENT", prefix: "ADJ-", padding: 5, next: 1 },
    { key: "STOCK_TRANSFER", prefix: "TRF-", padding: 5, next: 1 },
  ];
  await db.documentSequence.createMany({ data: sequences });

  console.log(`Seeded demo data. Sign in as admin@example.com with the demo password from prisma/seed.ts.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
