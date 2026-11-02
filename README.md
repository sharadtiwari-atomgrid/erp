# ERP

A web-based ERP for small and mid-sized Indian businesses, covering **Sales & CRM**, **Inventory** and **Purchasing**, with GST-aware invoicing and role-based access.

Built with Next.js 16 (App Router, Server Actions), React 19, TypeScript, Tailwind CSS 4, Prisma 7 and PostgreSQL.

## Features

**CRM & Sales**
- Customers with GSTIN, addresses, credit limits and payment terms
- Leads pipeline with conversion to customers
- Quotations → Sales orders → Deliveries → Invoices → Payments
- GST tax invoices with automatic CGST/SGST vs IGST split and a print view
- Receivables and overdue tracking

**Inventory**
- Products and services with SKU, HSN code, GST rate, prices and reorder levels
- Multiple warehouses, stock on hand per warehouse, stock valuation
- Stock adjustments and inter-warehouse transfers
- Full stock ledger: every change is an immutable stock movement

**Purchasing**
- Suppliers
- Purchase orders with partial goods receipt into a warehouse

**Platform**
- Email/password sign-in with signed, HTTP-only session cookies
- Roles: Administrator, Manager, Sales, Purchase, Warehouse, Read-only
- Auto-numbered documents (`SO-00001`, `INV-00001`, …)
- Activity log and a dashboard with KPIs and low-stock alerts

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

### Demo users

`npm run db:seed` creates one user per role, all sharing the demo password defined in `prisma/seed.ts` (override it with `SEED_PASSWORD`):

| Email | Role |
| --- | --- |
| admin@example.com | Administrator |
| manager@example.com | Manager |
| sales@example.com | Sales |
| purchase@example.com | Purchase |
| warehouse@example.com | Warehouse |

Change these passwords, or delete the users, before using the app with real data.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (Vitest) |
| `npm run db:migrate` | Create/apply a migration after editing `prisma/schema.prisma` |
| `npm run db:deploy` | Apply migrations in production |
| `npm run db:seed` | Load demo data into an empty database |
| `npm run db:reset` | Drop everything, re-migrate and re-seed |
| `npm run db:studio` | Browse the database in Prisma Studio |

## Project structure

```
prisma/
  schema.prisma          Data model
  seed.ts                Demo data
src/
  app/
    (auth)/              Sign-in and sign-out
    (app)/               Signed-in app (sidebar layout)
      dashboard/
      crm/               customers, leads
      sales/             quotations, orders, invoices
      inventory/         products, categories, stock, movements, warehouses
      purchasing/        suppliers, orders
      settings/          company, users
  components/
    ui/                  Buttons, forms, tables, cards, badges
    layout/              Sidebar and header
    line-items-editor.tsx  Shared editor for document lines
  lib/
    auth.ts              requireUser() — use at the top of every page and action
    permissions.ts       Role → module access matrix
    stock.ts             adjustStock() — the only way stock changes
    sequence.ts          Document numbering
    totals.ts            Line, document and GST calculations
    forms.ts             zod helpers for Server Actions
  proxy.ts               Redirects signed-out visitors to /login
```

## Conventions

- **Authorization**: every page and server action starts with `await requireUser(module, "view" | "edit")`. The sidebar hides modules a role can't see, but the check on the server is what enforces access.
- **Stock**: never write `StockLevel` directly. Call `adjustStock(tx, …)` inside a transaction. It records a `StockMovement` and updates the level, and it refuses to go negative.
- **Documents** are editable only while in `DRAFT`. After that they change only through explicit status transitions (confirm, deliver, issue, receive, cancel).
- **Money** is stored as `Decimal(14,2)` and converted with `num()` before it reaches client components.

## Deployment

Any Node host with PostgreSQL works (Vercel, Railway, Render, Fly.io or a VM):

1. Set `DATABASE_URL` and a long random `SESSION_SECRET`.
2. Run `npm run db:deploy` on release.
3. Run `npm run build`, then `npm start`.

## Roadmap

- Accounting: chart of accounts, journals, GST returns (GSTR-1/3B) export
- HR & payroll
- Credit notes and sales returns, purchase bills and supplier payments
- PDF and email delivery of documents
- Multi-company and multi-currency
