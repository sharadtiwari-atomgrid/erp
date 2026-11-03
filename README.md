# Atomgrid ERP

A web-based ERP for Indian manufacturers and distributors. It covers make-to-stock (MTS), make-to-order (MTO) and assemble-to-order (ATO) businesses, from order to production to dispatch, with GST-aware invoicing, multi-branch operations and role-based access.

The application is organised into the sections of the ERPKaro feature map:

| Section | Modules |
| --- | --- |
| **Quick actions** | Branch management (multi-branch data, branch switcher), teams, role-based access control, third-party contacts (customers, suppliers, transporters) |
| **Inventory** | Items with SKU, HSN, GST rate, item type (raw material / semi-finished / finished / trading / service) and supply mode (Buy / MTS / MTO / ATO); categories |
| **Warehouse management** | Stock management (in hand, reserved, allocated, available, in QC), bin stock, inbound goods receipts with QC and QR labels, outbound picking sessions, packing sessions and handling units, stock ledger, adjustments and transfers |
| **Order management** | Leads, quotations, sales orders with stock reservation, purchase orders, the **Manufacturing Needs** analyser (procure, produce or dispatch for each pending order line), returns |
| **Manufacturing ops** | Hub settings (production units, machines and hours, BOMs with operations and cost roll-up), production orders, a production schedule calendar with finite-capacity auto-scheduling, production batches with batch QC that auto-updates inventory |
| **Logistics** | Own and third-party fleet, drivers and assignments, operating hours, fuel logs, trips, ASN and delivery notes |
| **Books / accounts** | GST tax invoices (CGST/SGST vs IGST), payments, receivables, e-way bills, Tally XML and CSV export |
| **Return management** | Return orders with return QC: repair, restock or scrap |

Built with Next.js 16 (App Router, Server Actions), React 19, TypeScript, Tailwind CSS 4, Prisma 7 and PostgreSQL.

## Domestic B2B order management

The **Domestic B2B** and **B2B views** sections bring Atomgrid's domestic order-management workflow into the ERP:

- **Fresh PO / Long Hold PO**: purchase orders move through Demand → Supply → Logistics. Each team fills in its own section; POs older than 15 days move to Long Hold automatically. Includes Excel import with duplicate detection, paste from email, documents and history.
- **Domestic MIS**: the master shipment record per job, with status gates, data checks, POD and e-way bill uploads that move the status on, import and export, and a shipment journey view.
- **Quotation sheet (D-0)**: today's dispatches with four transporter quotes, approval written back to the job, and a vehicle progress stepper.
- **Views**: Today, Dashboard with the monthly MIS pack, Shipments summary, In transit, Planned, Delivered, and a Daily digest exported as images.
- **Transport**: payables ageing, transporter performance, and a transporter finder.
- **Batch inventory**: inward and outward registers per batch, stock in hand with FEFO/FIFO dispatch planning, warehouse count comparison, lost & found, and damage & relabelling.
- **Tools and masters**: COA generator (PDF/OCR), POC master, product name check, and bug and feature reports.

To bring data across from the previous system's full export (kept on your machine, never committed):

```bash
npx tsx scripts/import-domestic-crm.ts "<path to export>.xlsx"       # customers, suppliers, transporters, products, POCs
npx tsx scripts/import-domestic-crm-mis.ts "<path to export>.xlsx"   # Domestic MIS jobs
```

Fresh POs, batch registers and quotation rows import through each page's own **Import** button.

Uploaded documents go to an S3-compatible bucket when the `BUCKET_*` variables are set, and to `.data/uploads` otherwise.

## Typical flows

- **Order to cash:** quotation → sales order (confirming reserves stock) → outbound order → picking → packing into handling units (QR labels) → dispatch → GST invoice → e-way bill → payment.
- **Procure to stock:** purchase order → goods receipt (GRN) → QC (accept/reject, put away to a bin) → stock, with a QR label on the GRN.
- **Make to stock / order / assemble:** sales order or stock need → Manufacturing Needs → production order → auto-schedule on machines → production batch → batch QC, which consumes components and posts finished goods.
- **Logistics:** trip with vehicle and driver → attach packed outbound orders → ASN and delivery note → complete the trip.
- **Returns:** return order → receive → inspect (repair / restock / scrap) → close with a credit amount.

## Getting started

### Prerequisites
- Node.js 20.9 or newer
- PostgreSQL 14 or newer

### Setup

```bash
git clone https://github.com/sharadtiwari-atomgrid/erp.git
cd erp
npm install
cp .env.example .env        # then set DATABASE_URL and SESSION_SECRET
npx prisma migrate dev      # creates the schema
npm run db:seed             # optional demo data
npm run dev
```

Open http://localhost:3000.

### Demo data

`npm run db:seed` creates a demo manufacturer with:
- two branches (Mumbai HQ, Pune Plant) and their teams
- warehouses with bins
- raw materials, components, trading goods and manufactured products with BOMs
- a factory with five machines
- customers, suppliers and a transporter
- vehicles and drivers

It creates one user per default role. All of them share the demo password defined in `prisma/seed.ts`; override it with `SEED_PASSWORD`:

| Email | Role | Branch |
| --- | --- | --- |
| admin@example.com | Administrator | All |
| manager@example.com | Manager | All |
| sales@example.com | Sales | Mumbai |
| procurement@example.com | Procurement | All |
| warehouse@example.com | Warehouse | Mumbai |
| production@example.com | Production | Pune |
| logistics@example.com | Logistics | All |
| accounts@example.com | Accounts | All |

Change these passwords, or delete the users, before using the app with real data.

## Access control

- **Roles** live in Settings → Roles & access. Each role sets *none / view / edit* for every module, or grants full access. You can create new roles.
- **Branch restriction**: a user can be limited to one branch, and then sees only that branch's documents. Users without a restriction pick a branch, or "All branches", in the header.
- Every page and server action checks access on the server with `requireUser(module, access)`. The sidebar only hides what a role can't use.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (Vitest) |
| `npm run db:migrate` | Create or apply a migration after editing `prisma/schema.prisma` |
| `npm run db:deploy` | Apply migrations in production |
| `npm run db:seed` | Load demo data into an empty database |
| `npm run db:reset` | Drop everything, re-migrate and re-seed |
| `npm run db:studio` | Browse the database in Prisma Studio |

## Project structure

```
prisma/
  schema.prisma            Data model (one section per ERPKaro area)
  seed.ts                  Demo data
src/
  app/
    (auth)/                Sign-in and sign-out
    (app)/                 Signed-in app (sidebar layout)
      dashboard/           KPIs and quick actions
      branches/ teams/ contacts/
      inventory/           items, categories, stock, ledger, warehouses & bins
      warehouse/           inbound (GRN + QC), outbound, picking
      crm/leads/ sales/    leads, quotations, sales orders, invoices
      purchasing/          purchase orders
      manufacturing/       hub settings, production orders, schedule, batches, needs
      logistics/           vehicles, drivers, fuel, trips, ASN/DN
      books/               e-way bills, Tally export
      returns/
      settings/            company, users, roles
  components/
    ui/                    Buttons, forms, tables, cards, badges, action and print buttons
    layout/                Sidebar, header, branch switcher
    line-items-editor.tsx  Shared editor for document lines
  lib/
    auth.ts                requireUser(): use it at the top of every page and action
    permissions.ts         Modules, access levels and default roles
    branch.ts              Branch scope helpers (branchWhere, defaultBranchId)
    stock.ts               adjustStock / reserveStock / releaseStock: the only way stock changes
    sequence.ts            Document numbering (SO-00001, GRN-00001, MO-00001…)
    totals.ts              Line, document and GST calculations
    forms.ts               zod helpers for Server Actions
  proxy.ts                 Redirects signed-out visitors to /login
```

## Conventions

- **Stock**: never write `StockLevel` directly. Call the helpers in `src/lib/stock.ts` inside a transaction. Every change to stock in hand is recorded as an immutable `StockMovement`.
- **Branches**: every operational document (orders, receipts, outbounds, production orders, trips, returns, invoices) carries a `branchId`, usually taken from its warehouse. Lists filter with `branchWhere()`.
- **Documents** can be edited only in `DRAFT`. After that they change only through explicit status transitions. Each transition is guarded against double submission and recorded in the activity log.
- **Money** is stored as `Decimal(14,2)` and converted with `num()` before it reaches client components.

## Integrations

- **E-way bills** are generated on the GST portal and recorded against invoices here, with validity worked out from the distance. There is no direct GSTN API integration yet.
- **Tally**: Books → Tally export downloads a Tally-compatible XML of sales vouchers. Any accounting software that imports XML or CSV can use the exports.

## Deployment

Any Node host with PostgreSQL works (Vercel, Railway, Render, Fly.io or a VM):

1. Set `DATABASE_URL`, a long random `SESSION_SECRET`, and `NEXT_PUBLIC_APP_URL` (used in QR codes).
2. Run `npm run db:deploy` on release.
3. Run `npm run build`, then `npm start`.

## Roadmap

- AI-assisted production scheduling on top of the current capacity-based auto-scheduler
- Direct e-way bill and e-invoice (IRN) generation through a GSP
- Full accounting: chart of accounts, journals, GSTR-1/3B
- Purchase bills and supplier payments, credit notes
- PDF and email delivery of documents
