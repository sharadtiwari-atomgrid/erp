import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { ContactRole, ItemType, ProductType, SupplyMode, TeamType } from "../src/generated/prisma/enums";
import { DEFAULT_ROLES } from "../src/lib/permissions";
import { SEQUENCES } from "../src/lib/sequence-keys";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

// Demo login for local development only. Override with SEED_PASSWORD.
const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? "Password123!";

const code = (prefix: string, n: number, pad: number) => `${prefix}${String(n).padStart(pad, "0")}`;

async function main() {
  if ((await db.user.count()) > 0) {
    console.log("Database already has users; skipping seed. Run `npm run db:reset` to start fresh.");
    return;
  }

  // ── Company, roles, branches, users, teams ────────────────────────────────
  await db.companySettings.create({
    data: { id: 1, name: "Atomgrid", city: "Mumbai", state: "Maharashtra" },
  });

  const roles = new Map<string, string>();
  for (const r of DEFAULT_ROLES) {
    const role = await db.accessRole.create({
      data: { name: r.name, description: r.description, fullAccess: r.fullAccess ?? false, permissions: r.permissions, isSystem: true },
    });
    roles.set(r.name, role.id);
  }

  const mumbai = await db.branch.create({
    data: { code: "MUM", name: "Mumbai HQ", gstin: "27AABCA1234F1Z5", city: "Mumbai", state: "Maharashtra", address: "Bandra Kurla Complex", pincode: "400051" },
  });
  const pune = await db.branch.create({
    data: { code: "PUN", name: "Pune Plant", gstin: "27AABCA1234F2Z4", city: "Pune", state: "Maharashtra", address: "Chakan MIDC Phase II", pincode: "410501" },
  });

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const userData = [
    { name: "Atomgrid Admin", email: "admin@example.com", role: "Administrator", branchId: null },
    { name: "Manoj Manager", email: "manager@example.com", role: "Manager", branchId: null },
    { name: "Sana Sales", email: "sales@example.com", role: "Sales", branchId: mumbai.id },
    { name: "Pranav Procurement", email: "procurement@example.com", role: "Procurement", branchId: null },
    { name: "Wasim Warehouse", email: "warehouse@example.com", role: "Warehouse", branchId: mumbai.id },
    { name: "Priya Production", email: "production@example.com", role: "Production", branchId: pune.id },
    { name: "Lokesh Logistics", email: "logistics@example.com", role: "Logistics", branchId: null },
    { name: "Anita Accounts", email: "accounts@example.com", role: "Accounts", branchId: null },
  ];
  const users = new Map<string, string>();
  for (const u of userData) {
    const user = await db.user.create({
      data: { name: u.name, email: u.email, passwordHash, roleId: roles.get(u.role)!, branchId: u.branchId },
    });
    users.set(u.role, user.id);
  }
  const adminId = users.get("Administrator")!;

  const teams: Array<{ name: string; type: TeamType; branchId: string; members: string[] }> = [
    { name: "Sales West", type: "SALES", branchId: mumbai.id, members: ["Sales", "Manager"] },
    { name: "Procurement", type: "PROCUREMENT", branchId: mumbai.id, members: ["Procurement"] },
    { name: "Mumbai Warehouse", type: "WAREHOUSE", branchId: mumbai.id, members: ["Warehouse"] },
    { name: "Plant Production", type: "PRODUCTION", branchId: pune.id, members: ["Production"] },
    { name: "Dispatch & Fleet", type: "LOGISTICS", branchId: mumbai.id, members: ["Logistics"] },
  ];
  for (const t of teams) {
    const memberIds = t.members.map((m) => users.get(m)!);
    await db.team.create({
      data: {
        name: t.name,
        type: t.type,
        branchId: t.branchId,
        leadId: memberIds[0],
        members: { create: memberIds.map((userId) => ({ userId })) },
      },
    });
  }

  // ── Warehouses & bins ─────────────────────────────────────────────────────
  const mumWh = await db.warehouse.create({ data: { code: "MUM-FG", name: "Mumbai Distribution Centre", branchId: mumbai.id, address: "Bhiwandi, Thane" } });
  const puneWh = await db.warehouse.create({ data: { code: "PUN-PL", name: "Pune Plant Stores", branchId: pune.id, address: "Chakan MIDC, Pune" } });
  for (const wh of [mumWh, puneWh]) {
    for (const aisle of ["A", "B"]) {
      for (let rack = 1; rack <= 3; rack++) {
        await db.bin.create({ data: { warehouseId: wh.id, code: `${aisle}-${String(rack).padStart(2, "0")}`, zone: aisle === "A" ? "Fast movers" : "Bulk" } });
      }
    }
  }

  // ── Items ─────────────────────────────────────────────────────────────────
  const categories = new Map<string, string>();
  for (const name of ["Raw Materials", "Components", "Furniture", "Electronics", "Office Supplies", "Services"]) {
    categories.set(name, (await db.productCategory.create({ data: { name } })).id);
  }

  type Item = {
    sku: string;
    name: string;
    category: string;
    itemType: ItemType;
    supplyMode: SupplyMode;
    type?: ProductType;
    unit?: string;
    hsnCode: string;
    salePrice: number;
    purchasePrice: number;
    taxRate: number;
    reorderLevel: number;
    qcRequired?: boolean;
    weightKg?: number;
    stock: [number, number]; // [Mumbai, Pune]
  };
  const items: Item[] = [
    // Raw materials & components (bought, held at the plant)
    { sku: "RM-1001", name: "Steel Tube 25mm (6m)", category: "Raw Materials", itemType: "RAW_MATERIAL", supplyMode: "BUY", unit: "length", hsnCode: "7306", salePrice: 0, purchasePrice: 640, taxRate: 18, reorderLevel: 100, qcRequired: true, stock: [0, 260] },
    { sku: "RM-1002", name: "Plywood Board 18mm", category: "Raw Materials", itemType: "RAW_MATERIAL", supplyMode: "BUY", unit: "sheet", hsnCode: "4412", salePrice: 0, purchasePrice: 2100, taxRate: 18, reorderLevel: 40, qcRequired: true, stock: [0, 55] },
    { sku: "RM-1003", name: "High-density Foam Sheet", category: "Raw Materials", itemType: "RAW_MATERIAL", supplyMode: "BUY", unit: "sheet", hsnCode: "3921", salePrice: 0, purchasePrice: 780, taxRate: 18, reorderLevel: 30, stock: [0, 24] },
    { sku: "CP-2001", name: "Gas Lift Cylinder", category: "Components", itemType: "RAW_MATERIAL", supplyMode: "BUY", hsnCode: "9401", salePrice: 0, purchasePrice: 520, taxRate: 18, reorderLevel: 50, qcRequired: true, stock: [0, 140] },
    { sku: "CP-2002", name: "Castor Wheel Set (5)", category: "Components", itemType: "RAW_MATERIAL", supplyMode: "BUY", unit: "set", hsnCode: "8302", salePrice: 0, purchasePrice: 360, taxRate: 18, reorderLevel: 50, stock: [0, 120] },
    { sku: "CP-2003", name: "Mesh Back Panel", category: "Components", itemType: "RAW_MATERIAL", supplyMode: "BUY", hsnCode: "9401", salePrice: 0, purchasePrice: 690, taxRate: 18, reorderLevel: 40, stock: [0, 35] },
    { sku: "CP-2004", name: "Fastener Kit", category: "Components", itemType: "CONSUMABLE", supplyMode: "BUY", unit: "kit", hsnCode: "7318", salePrice: 0, purchasePrice: 85, taxRate: 18, reorderLevel: 200, stock: [0, 900] },
    { sku: "CP-3001", name: "Motherboard B760", category: "Components", itemType: "RAW_MATERIAL", supplyMode: "BUY", hsnCode: "8473", salePrice: 0, purchasePrice: 11200, taxRate: 18, reorderLevel: 10, qcRequired: true, stock: [0, 18] },
    { sku: "CP-3002", name: "Processor Core i5", category: "Components", itemType: "RAW_MATERIAL", supplyMode: "BUY", hsnCode: "8542", salePrice: 0, purchasePrice: 17500, taxRate: 18, reorderLevel: 10, qcRequired: true, stock: [0, 14] },
    { sku: "CP-3003", name: "RAM 16GB DDR5", category: "Components", itemType: "RAW_MATERIAL", supplyMode: "BUY", hsnCode: "8473", salePrice: 0, purchasePrice: 4200, taxRate: 18, reorderLevel: 20, stock: [0, 40] },
    { sku: "CP-3004", name: "SSD 512GB NVMe", category: "Components", itemType: "RAW_MATERIAL", supplyMode: "BUY", hsnCode: "8523", salePrice: 0, purchasePrice: 3300, taxRate: 18, reorderLevel: 20, stock: [0, 30] },
    { sku: "CP-3005", name: "Mid-tower Cabinet with PSU", category: "Components", itemType: "RAW_MATERIAL", supplyMode: "BUY", hsnCode: "8473", salePrice: 0, purchasePrice: 3900, taxRate: 18, reorderLevel: 10, stock: [0, 16] },
    // Manufactured goods
    { sku: "FG-5001", name: "Ergonomic Office Chair", category: "Furniture", itemType: "FINISHED_GOOD", supplyMode: "MTS", hsnCode: "9401", salePrice: 8900, purchasePrice: 0, taxRate: 18, reorderLevel: 20, weightKg: 14, stock: [26, 10] },
    { sku: "FG-5002", name: "Custom Workstation Desk", category: "Furniture", itemType: "FINISHED_GOOD", supplyMode: "MTO", hsnCode: "9403", salePrice: 16500, purchasePrice: 0, taxRate: 18, reorderLevel: 0, weightKg: 38, stock: [0, 0] },
    { sku: "FG-6001", name: "Desktop PC (i5 / 16GB / 512GB)", category: "Electronics", itemType: "FINISHED_GOOD", supplyMode: "ATO", hsnCode: "8471", salePrice: 52900, purchasePrice: 0, taxRate: 18, reorderLevel: 0, weightKg: 9, stock: [2, 0] },
    // Trading goods
    { sku: "TR-7001", name: "27\" LED Monitor", category: "Electronics", itemType: "TRADING", supplyMode: "BUY", hsnCode: "8528", salePrice: 14500, purchasePrice: 11200, taxRate: 18, reorderLevel: 10, weightKg: 6, stock: [40, 0] },
    { sku: "TR-7002", name: "Wireless Keyboard & Mouse", category: "Electronics", itemType: "TRADING", supplyMode: "BUY", hsnCode: "8471", salePrice: 1899, purchasePrice: 1250, taxRate: 18, reorderLevel: 25, stock: [120, 0] },
    { sku: "TR-7003", name: "A4 Copier Paper (500 sheets)", category: "Office Supplies", itemType: "TRADING", supplyMode: "BUY", unit: "ream", hsnCode: "4802", salePrice: 320, purchasePrice: 245, taxRate: 12, reorderLevel: 200, stock: [150, 0] },
    // Services
    { sku: "SV-9001", name: "On-site Installation", category: "Services", itemType: "SERVICE", supplyMode: "BUY", type: "SERVICE", unit: "hour", hsnCode: "998713", salePrice: 1200, purchasePrice: 0, taxRate: 18, reorderLevel: 0, stock: [0, 0] },
  ];

  const products = new Map<string, string>();
  for (const { stock, category, ...p } of items) {
    const product = await db.product.create({ data: { ...p, categoryId: categories.get(category) } });
    products.set(p.sku, product.id);
    if (p.type === "SERVICE") continue;
    for (const [warehouseId, qty] of [[mumWh.id, stock[0]], [puneWh.id, stock[1]]] as const) {
      if (qty <= 0) continue;
      await db.stockLevel.create({ data: { productId: product.id, warehouseId, quantity: qty } });
      await db.stockMovement.create({
        data: { productId: product.id, warehouseId, type: "OPENING", quantity: qty, unitCost: p.purchasePrice || null, reference: "Opening balance", createdById: adminId },
      });
    }
  }
  const id = (sku: string) => products.get(sku)!;

  // ── Hub settings: production unit, machines, BOMs ─────────────────────────
  const plant = await db.productionUnit.create({
    data: { code: "PUN-F1", name: "Pune Factory 1", branchId: pune.id, address: "Chakan MIDC Phase II", shiftsPerDay: 2, shiftStart: "07:00", shiftHours: 8 },
  });
  const machineData = [
    { code: "CNC-01", name: "CNC Router", type: "Cutting", hoursPerDay: 16, hourlyCost: 950 },
    { code: "WLD-01", name: "MIG Welding Station", type: "Welding", hoursPerDay: 16, hourlyCost: 600 },
    { code: "UPH-01", name: "Upholstery Station", type: "Assembly", hoursPerDay: 8, hourlyCost: 400 },
    { code: "ASM-01", name: "Assembly Line 1", type: "Assembly", hoursPerDay: 16, hourlyCost: 750 },
    { code: "TST-01", name: "Electronics Test Bench", type: "Testing", hoursPerDay: 8, hourlyCost: 500 },
  ];
  const machines = new Map<string, string>();
  for (const m of machineData) machines.set(m.code, (await db.machine.create({ data: { ...m, productionUnitId: plant.id } })).id);

  const boms = [
    {
      code: "BOM-0001",
      product: "FG-5001",
      lines: [["RM-1001", 1], ["RM-1003", 0.5], ["CP-2001", 1], ["CP-2002", 1], ["CP-2003", 1], ["CP-2004", 1]] as const,
      ops: [["Frame welding", "WLD-01", 0.5, 0.4], ["Upholstery", "UPH-01", 0.25, 0.5], ["Final assembly", "ASM-01", 0.25, 0.3]] as const,
    },
    {
      code: "BOM-0002",
      product: "FG-5002",
      lines: [["RM-1002", 2], ["RM-1001", 2], ["CP-2004", 2]] as const,
      ops: [["Panel cutting", "CNC-01", 0.5, 0.8], ["Leg frame welding", "WLD-01", 0.5, 0.6], ["Assembly", "ASM-01", 0.25, 0.5]] as const,
    },
    {
      code: "BOM-0003",
      product: "FG-6001",
      lines: [["CP-3001", 1], ["CP-3002", 1], ["CP-3003", 1], ["CP-3004", 1], ["CP-3005", 1]] as const,
      ops: [["PC assembly", "ASM-01", 0.1, 0.75], ["Burn-in test", "TST-01", 0, 1]] as const,
    },
  ];
  for (const b of boms) {
    await db.bom.create({
      data: {
        code: b.code,
        productId: id(b.product),
        lines: { create: b.lines.map(([sku, quantity], position) => ({ componentId: id(sku), quantity, position })) },
        operations: {
          create: b.ops.map(([name, machine, setupHours, runHoursPerUnit], i) => ({
            sequence: (i + 1) * 10,
            name,
            machineId: machines.get(machine),
            setupHours,
            runHoursPerUnit,
          })),
        },
      },
    });
  }

  // ── Third-party contacts ──────────────────────────────────────────────────
  const contacts: Array<{ name: string; roles: ContactRole[]; [k: string]: unknown }> = [
    { name: "Bluewave Technologies", roles: ["CUSTOMER"], contactPerson: "Rahul Iyer", email: "procurement@bluewave.example", phone: "+91 98200 11111", gstin: "27AAFCB1111A1Z1", city: "Mumbai", state: "Maharashtra", creditLimit: 500000 },
    { name: "Sunrise Hospitals", roles: ["CUSTOMER"], contactPerson: "Dr. Meera Nair", email: "purchase@sunrise.example", phone: "+91 98450 22222", gstin: "29AAACS2222B1Z2", city: "Bengaluru", state: "Karnataka", creditLimit: 800000, paymentTermsDays: 45 },
    { name: "Greenleaf Schools Trust", roles: ["CUSTOMER"], email: "admin@greenleaf.example", phone: "+91 99000 33333", city: "Pune", state: "Maharashtra", creditLimit: 200000 },
    { name: "Northstar Logistics", roles: ["CUSTOMER"], email: "it@northstar.example", phone: "+91 98110 44444", gstin: "07AAGCN4444C1Z4", city: "New Delhi", state: "Delhi", creditLimit: 300000 },
    { name: "Vertex Electronics Distributors", roles: ["SUPPLIER"], contactPerson: "Kiran Shah", email: "orders@vertex.example", phone: "+91 22 2600 1111", gstin: "27AAACV1111E1Z1", city: "Mumbai", state: "Maharashtra" },
    { name: "SteelCraft Tubes", roles: ["SUPPLIER"], email: "sales@steelcraft.example", phone: "+91 20 2700 2222", gstin: "27AAACS2222F1Z2", city: "Pune", state: "Maharashtra", paymentTermsDays: 15 },
    { name: "ComfortParts Co.", roles: ["SUPPLIER"], email: "b2b@comfortparts.example", phone: "+91 80 2800 3333", gstin: "29AAACC3333G1Z3", city: "Bengaluru", state: "Karnataka", paymentTermsDays: 45 },
    { name: "Coastal Office Mart", roles: ["CUSTOMER", "SUPPLIER"], email: "accounts@coastal.example", phone: "+91 94440 55555", gstin: "33AAHCC5555D1Z5", city: "Chennai", state: "Tamil Nadu", paymentTermsDays: 15 },
    { name: "SpeedWay Transporters", roles: ["TRANSPORTER"], contactPerson: "Gurpreet Singh", email: "booking@speedway.example", phone: "+91 98760 66666", gstin: "27AAECS6666H1Z6", city: "Mumbai", state: "Maharashtra" },
  ];
  const contactIds = new Map<string, string>();
  for (const [i, c] of contacts.entries()) {
    const created = await db.contact.create({ data: { ...c, code: code("C-", i + 1, 5), billingAddress: `${c.city} office` } });
    contactIds.set(c.name, created.id);
  }

  const salesUser = users.get("Sales")!;
  const leads = [
    { name: "Ritu Sharma", company: "Pinnacle Consulting", email: "ritu@pinnacle.example", source: "Website", status: "NEW" as const, estimatedValue: 120000 },
    { name: "Arjun Mehta", company: "Metro Co-working", email: "arjun@metro.example", source: "Referral", status: "CONTACTED" as const, estimatedValue: 450000 },
    { name: "Fatima Khan", company: "Lotus Pharma", email: "fatima@lotus.example", source: "Trade show", status: "QUALIFIED" as const, estimatedValue: 900000 },
  ];
  for (const l of leads) await db.lead.create({ data: { ...l, ownerId: salesUser } });

  // ── Fleet ─────────────────────────────────────────────────────────────────
  const truck = await db.vehicle.create({
    data: { registrationNo: "MH04AB1234", type: "Truck", make: "Tata", model: "LPT 1109", capacityKg: 6000, ownership: "OWN", branchId: mumbai.id },
  });
  await db.vehicle.create({
    data: { registrationNo: "MH12CD5678", type: "Tempo", make: "Mahindra", model: "Bolero Pik-Up", capacityKg: 1500, ownership: "OWN", branchId: pune.id },
  });
  await db.vehicle.create({
    data: { registrationNo: "MH43EF9012", type: "Container", capacityKg: 12000, ownership: "THIRD_PARTY", transporterId: contactIds.get("SpeedWay Transporters") },
  });
  const driver = await db.driver.create({ data: { name: "Ramesh Patil", phone: "+91 98201 77777", licenseNo: "MH0420190012345", branchId: mumbai.id } });
  await db.driver.create({ data: { name: "Sunil Jadhav", phone: "+91 98221 88888", licenseNo: "MH1220180067890", branchId: pune.id } });
  await db.driverAssignment.create({ data: { vehicleId: truck.id, driverId: driver.id } });

  // ── Document sequences (contacts already used C-00001…) ───────────────────
  await db.documentSequence.createMany({
    data: Object.entries(SEQUENCES).map(([key, def]) => ({
      key,
      prefix: def.prefix,
      padding: def.padding,
      next: key === "CONTACT" ? contacts.length + 1 : key === "BOM" ? boms.length + 1 : 1,
    })),
  });

  console.log("Seeded demo data. Sign in as admin@example.com with the demo password from prisma/seed.ts.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
