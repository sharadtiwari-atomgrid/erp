import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { db } from "@/lib/db";
import { formatNumber } from "@/lib/format";
import { can, type Module } from "@/lib/permissions";
import { dayFromIso, todayIso } from "@/lib/ops/dates";
import { makeTransporterResolver } from "@/lib/ops/transport";
import { stockChecks, stockLines } from "@/lib/batch-inventory";
import { loadInward, loadOutward, registerFromRow } from "@/lib/batch-inventory/server";
import { HREF, ddayBoards, greeting, needsYou, plural, type NeedItem } from "./_today/needs";
import { loadFpoRows, loadMisRows } from "./views/_lib/load";
import type { MisRow } from "./views/_lib/rows";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Today" };

const HREF_MODULE: Record<string, Module> = {
  [HREF.fresh]: "b2bOrders",
  [HREF.hold]: "b2bOrders",
  [HREF.mis]: "b2bOrders",
  [HREF.planned]: "b2bReports",
  [HREF.transit]: "b2bReports",
  [HREF.delivered]: "b2bReports",
  [HREF.payables]: "transportOps",
  [HREF.stock]: "batchInventory",
  [HREF.inward]: "batchInventory",
  [HREF.outward]: "batchInventory",
  [HREF.lost]: "batchInventory",
  [HREF.damage]: "batchInventory",
  [HREF.feedback]: "settings",
};

/** Activity entity types → the module that may see them in the feed. */
const ENTITY_MODULE: Record<string, Module> = {
  MisJob: "b2bOrders",
  FreshPo: "b2bOrders",
  DispatchQuote: "b2bOrders",
  OpsFile: "b2bOrders",
  BatchInward: "batchInventory",
  BatchOutward: "batchInventory",
  InventoryIssue: "batchInventory",
  WarehouseCount: "batchInventory",
  Feedback: "settings",
};

const IST_MS = 330 * 60_000;
const istTime = (d: Date) => new Date(d.getTime() + IST_MS).toISOString().slice(11, 16);

export default async function TodayPage() {
  const user = await requireUser("b2bOrders");
  const now = new Date();
  const today = todayIso(now);
  const allow = (href: string) => can(user, HREF_MODULE[href] ?? "b2bOrders");
  const seesStock = can(user, "batchInventory");
  const seesFeedback = can(user, "settings");
  const startOfDay = new Date(dayFromIso(today).getTime() - IST_MS);
  const feedTypes = Object.entries(ENTITY_MODULE)
    .filter(([, m]) => can(user, m))
    .map(([t]) => t);

  const [mis, fpo, inward, outward, issues, feedback, transporters, activity] = await Promise.all([
    loadMisRows(),
    loadFpoRows(),
    seesStock ? loadInward() : null,
    seesStock ? loadOutward() : null,
    seesStock ? db.inventoryIssue.findMany({ where: { deletedAt: null } }) : null,
    seesFeedback ? db.feedback.findMany({ where: { status: "New" }, orderBy: { createdAt: "desc" }, select: { kind: true, title: true } }) : null,
    db.contact.findMany({ where: { roles: { has: "TRANSPORTER" } }, select: { name: true } }),
    db.activity.findMany({
      where: { createdAt: { gte: startOfDay }, entityType: { in: feedTypes } },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { user: { select: { name: true } } },
    }),
  ]);

  const txName = makeTransporterResolver(transporters);
  const boards = ddayBoards(mis, today);
  const inToday = inward?.filter((r) => r.inwardDate === today) ?? null;
  const outToday = outward?.filter((r) => r.obDate === today) ?? null;
  const checks = inward && outward ? stockChecks(inward, outward, stockLines(inward, outward, today), today) : null;
  const items = needsYou({
    today,
    allow,
    mis,
    fpo,
    checks,
    lost: issues?.filter((i) => i.kind === "LOST_FOUND").map((i) => registerFromRow("lost-found", i)) ?? null,
    damage: issues?.filter((i) => i.kind === "DAMAGE").map((i) => registerFromRow("damage", i)) ?? null,
    feedback,
    txName,
  });
  const urgent = items.filter((i) => i.tone !== "good").length;
  const newPo = fpo.filter((p) => p.createdAt && todayIso(new Date(p.createdAt)) === today).length;
  const kgOf = (rows: Array<{ netWeight?: number | null; qty?: number | null }>, f: "netWeight" | "qty") =>
    formatNumber(Math.round(rows.reduce((a, r) => a + (r[f] ?? 0), 0)), 0);

  const stats: Array<{ href: string; n: ReactNode; l: string }> = [
    { href: HREF.planned, n: `${boards.dispatch.filter((x) => x.done).length}/${boards.dispatch.length}`, l: "Dispatched today" },
    { href: HREF.transit, n: `${boards.arrive.filter((x) => x.done).length}/${boards.arrive.length}`, l: "Delivered today" },
    ...(inToday ? [{ href: HREF.inward, n: kgOf(inToday, "netWeight"), l: `kg received · ${plural(inToday.length, "line")}` }] : []),
    ...(outToday ? [{ href: HREF.outward, n: kgOf(outToday, "qty"), l: `kg sent out · ${plural(outToday.length, "line")}` }] : []),
    { href: HREF.fresh, n: newPo, l: "New Fresh POs" },
  ];
  const dateLine = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);

  return (
    <div className="space-y-5">
      <header className="relative overflow-hidden rounded-xl bg-brand-900 px-6 py-5 text-white">
        <p className="text-xs font-semibold tracking-wide text-amber-200 uppercase">D-day · {dateLine}</p>
        <h1 className="mt-1 text-2xl font-semibold">{greeting(now, user.name)}</h1>
        <p className="mt-1 text-sm text-white/70">{urgent ? `${plural(urgent, "thing")} need${urgent === 1 ? "s" : ""} you today.` : "Nothing needs you right now."}</p>
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {stats.map((x) => (
            <Link key={x.l} href={allow(x.href) ? x.href : "/b2b"} className="flex flex-col gap-0.5 rounded-lg border border-white/10 bg-white/5 px-3.5 py-2.5 text-xs text-white/70 hover:bg-white/10">
              <b className="text-2xl font-semibold tabular-nums text-white">{x.n}</b>
              <span>{x.l}</span>
            </Link>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]">
        <div className="space-y-5">
          <Board
            title="Dispatching today"
            href={allow(HREF.planned) ? HREF.planned : undefined}
            empty="No dispatches planned for today."
            rows={boards.dispatch.map(({ e, done }) => ({ e, done, doneLabel: "Dispatched", todoLabel: "To dispatch" }))}
            txName={txName}
          />
          <Board
            title="Reaching customers today"
            href={allow(HREF.transit) ? HREF.transit : undefined}
            empty="No deliveries expected today."
            rows={boards.arrive.map(({ e, done }) => ({ e, done, doneLabel: "Delivered", todoLabel: "On the way" }))}
            txName={txName}
          />
          {inToday && outToday && (
            <Section title="Warehouse today" action={<Link href={HREF.inward} className="text-xs font-semibold text-brand-700">Inward</Link>}>
              {!inToday.length && !outToday.length ? (
                <p className="px-2.5 pb-2.5 text-sm text-ink-faint">Nothing received or sent out yet today.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {inToday.map((r) => (
                    <Row
                      key={r.id}
                      tag={<Pill tone="good">In</Pill>}
                      title={r.catalogueName || r.productName}
                      sub={[r.batchNo, r.supplier, r.location].filter(Boolean).join(" · ")}
                      qty={`${formatNumber(r.netWeight ?? 0)} kg`}
                    />
                  ))}
                  {outToday.map((r) => (
                    <Row
                      key={r.id}
                      tag={<Pill tone="blue">Out</Pill>}
                      title={r.catalogueName || r.productName}
                      sub={[r.batchNo, r.customer, r.warehouse].filter(Boolean).join(" · ")}
                      qty={`${formatNumber(r.qty ?? 0)} kg`}
                    />
                  ))}
                </ul>
              )}
            </Section>
          )}
        </div>

        <aside className="space-y-5">
          <Section title="Needs you" action={items.length ? <span className="text-xs text-ink-faint">most urgent first</span> : null}>
            {!items.length ? (
              <div className="px-4 pt-4 pb-6 text-center text-ink-soft">
                <span className="mb-2 inline-grid size-9 place-items-center rounded-full bg-emerald-50 font-bold text-emerald-700">✓</span>
                <b className="block text-ink">All clear</b>
                <p className="mt-1 text-sm">Late shipments, missing PODs, dues and open issues show up here.</p>
              </div>
            ) : (
              <>
                <NeedList items={items.slice(0, 6)} />
                {items.length > 6 && (
                  <details className="group">
                    <summary className="cursor-pointer list-none px-2.5 py-2 text-sm font-semibold text-brand-700 group-open:hidden">Show all {items.length}</summary>
                    <NeedList items={items.slice(6)} />
                  </details>
                )}
              </>
            )}
          </Section>

          <Section title="Recent activity">
            {activity.length ? (
              <ul className="divide-y divide-line">
                {activity.map((a) => (
                  <li key={a.id} className="relative py-2 pr-14 pl-2.5 text-xs leading-snug text-ink-soft">
                    <b className="font-semibold text-ink">{a.user?.name ?? "Someone"}</b> · {a.message}
                    <time className="absolute top-2 right-2.5 tabular-nums">{istTime(a.createdAt)}</time>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-2.5 pb-2.5 text-sm text-ink-faint">No changes yet today.</p>
            )}
          </Section>
        </aside>
      </div>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-surface px-2 pt-3.5 pb-2 shadow-sm">
      <div className="mx-2.5 mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Pill({ tone, children }: { tone: "good" | "warn" | "bad" | "blue"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        tone === "good" && "bg-emerald-50 text-emerald-700",
        tone === "warn" && "bg-amber-50 text-amber-800",
        tone === "bad" && "bg-red-50 text-red-700",
        tone === "blue" && "bg-blue-50 text-blue-700",
      )}
    >
      {children}
    </span>
  );
}

function Row({ tag, title, sub, qty, href }: { tag: ReactNode; title: string; sub: string; qty: string; href?: string }) {
  const body = (
    <>
      <span className="min-w-20 text-center">{tag}</span>
      <span className="flex min-w-0 flex-col">
        <b className="truncate text-[13px] font-semibold text-ink">{title}</b>
        {sub && <small className="truncate text-xs text-ink-soft">{sub}</small>}
      </span>
      <span className="text-[13px] font-semibold whitespace-nowrap text-ink-soft tabular-nums">{qty}</span>
    </>
  );
  const cls = "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md p-2.5";
  return (
    <li>
      {href ? (
        <Link href={href} className={cn(cls, "hover:bg-muted")}>
          {body}
        </Link>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}

function Board({
  title,
  href,
  empty,
  rows,
  txName,
}: {
  title: string;
  href?: string;
  empty: string;
  rows: Array<{ e: MisRow; done: boolean; doneLabel: string; todoLabel: string }>;
  txName: (raw: string | null) => string;
}) {
  const done = rows.filter((r) => r.done).length;
  return (
    <Section title={title} action={rows.length ? <span className="text-xs text-ink-faint">{`${done} of ${rows.length} done`}</span> : null}>
      {!rows.length ? (
        <p className="px-2.5 pb-2.5 text-sm text-ink-faint">{empty}</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map(({ e, done, doneLabel, todoLabel }) => (
            <Row
              key={e.id}
              href={href}
              tag={<Pill tone={done ? "good" : "warn"}>{done ? doneLabel : todoLabel}</Pill>}
              title={`Job ${e.jobNo || "—"} · ${e.customer || "—"}`}
              sub={[e.productName, e.transporterDetails && txName(e.transporterDetails)].filter(Boolean).join(" · ")}
              qty={e.quantityKgs ? `${formatNumber(e.quantityKgs)} kg` : ""}
            />
          ))}
        </ul>
      )}
    </Section>
  );
}

function NeedList({ items }: { items: NeedItem[] }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((it, i) => (
        <li key={i}>
          <Link href={it.href} className="group flex items-center gap-3 rounded-md p-2.5 hover:bg-muted">
            <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
              <Pill tone={it.tone}>{it.tag}</Pill>
              <b className="max-w-full truncate text-[13px] font-semibold text-ink">{it.title}</b>
              {it.detail && <small className="max-w-full truncate text-xs text-ink-soft">{it.detail}</small>}
            </span>
            <span aria-hidden className="text-line group-hover:text-brand-700">
              →
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
