/**
 * Today (D-day) home: today's boards and the "Needs you" list, most urgent
 * first. Pure; ported from the source's TodayHome.js. The caller passes only
 * the data the user's role may see (null = not allowed) and the hrefs allowed.
 */
import { OTHERS_PAY, SETTLED, owedAmount } from "@/lib/ops/transport";
import { daysBetween } from "@/lib/ops/dates";
import { formatNumber } from "@/lib/format";
import { hasDoc, isCancelled, isDelivered, isHold, isTransit, type FpoRow, type MisRow } from "../views/_lib/rows";

export const HREF = {
  fresh: "/b2b/fresh-po",
  hold: "/b2b/long-hold",
  mis: "/b2b/mis",
  planned: "/b2b/views/planned",
  transit: "/b2b/views/intransit",
  delivered: "/b2b/views/delivered",
  payables: "/b2b/transport/payables",
  stock: "/b2b/inventory/stock",
  inward: "/b2b/inventory/inward",
  outward: "/b2b/inventory/outward",
  lost: "/b2b/inventory/lost-and-found",
  damage: "/b2b/inventory/damage",
  feedback: "/settings/feedback",
} as const;
export type HrefKey = keyof typeof HREF;

export type Tone = "bad" | "warn" | "good";
export type NeedItem = { href: string; tone: Tone; tag: string; score: number; title: string; detail: string };

const STALE_DAYS = 30;
const TONE_ORDER: Record<Tone, number> = { bad: 0, warn: 1, good: 2 };
const TEAM: Array<[FpoRow["stage"], string]> = [
  ["DEMAND_PENDING", "Demand"],
  ["SUPPLY_PENDING", "Supply"],
  ["LOGISTICS_PENDING", "Logistics"],
];
export const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dm = (iso: string) => `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1] ?? ""}`;
const inr = (n: number) => `₹${formatNumber(Math.round(n), 0)}`;

const eta = (e: MisRow) => e.actualEta || e.plannedEta;
const isOut = (e: MisRow) => !!e.actualEtd || isTransit(e) || isDelivered(e);

/** Today's boards: dispatching today (planned or actual ETD today) and reaching customers today, not-done first. */
export function ddayBoards(mis: MisRow[], today: string) {
  const live = mis.filter((e) => !isCancelled(e));
  const dispatch = live
    .filter((e) => e.plannedEtd === today || e.actualEtd === today)
    .map((e) => ({ e, done: isOut(e) }))
    .sort((a, b) => Number(a.done) - Number(b.done) || a.e.jobNo.localeCompare(b.e.jobNo));
  const arrive = live
    .filter((e) => (isTransit(e) && eta(e) === today) || (isDelivered(e) && e.actualEta === today))
    .map((e) => ({ e, done: isDelivered(e) }))
    .sort((a, b) => Number(a.done) - Number(b.done));
  return { dispatch, arrive };
}

export type RegisterLike = Record<string, string | number | null>;
export type StockCheckLike = { level: "bad" | "warn" | "info"; title: string; rows: unknown[] };
export type FeedbackLike = { kind: "BUG" | "FEATURE"; title: string };

export function needsYou({
  today,
  allow,
  mis,
  fpo,
  checks,
  lost,
  damage,
  feedback,
  txName,
}: {
  today: string;
  /** Hrefs the user may open. */
  allow: (href: string) => boolean;
  mis: MisRow[] | null;
  fpo: FpoRow[] | null;
  checks: StockCheckLike[] | null;
  lost: RegisterLike[] | null;
  damage: RegisterLike[] | null;
  /** New (status "New") bug and feature reports; null unless the user has settings access. */
  feedback: FeedbackLike[] | null;
  txName: (raw: string | null) => string;
}): NeedItem[] {
  const items: NeedItem[] = [];
  const add = (href: string, o: Omit<NeedItem, "href">) => {
    if (allow(href)) items.push({ href, ...o });
  };
  const ago = (iso: string) => daysBetween(iso, today) ?? 0;

  if (mis) {
    const live = mis.filter((e) => !isCancelled(e));
    const notOut = live.filter((e) => !isDelivered(e) && !isTransit(e) && !isHold(e) && !e.actualEtd);
    for (const e of live.filter((e) => isTransit(e) && eta(e) && eta(e) < today))
      add(HREF.transit, {
        tone: "bad",
        tag: "Past ETA",
        score: ago(eta(e)),
        title: `Job ${e.jobNo || "—"} · ${e.customer || "—"}`,
        detail: `In transit, ${plural(ago(eta(e)), "day")} past ETA · ${txName(e.transporterDetails) || "Transporter not set"}`,
      });
    // Planned more than STALE_DAYS ago and still not out: old rows to tidy in Domestic MIS, not today's work.
    for (const e of notOut.filter((e) => e.plannedEtd && e.plannedEtd < today && ago(e.plannedEtd) <= STALE_DAYS))
      add(HREF.mis, {
        tone: "bad",
        tag: "Not dispatched",
        score: ago(e.plannedEtd),
        title: `Job ${e.jobNo || "—"} · ${e.customer || "—"}`,
        detail: `Planned for ${dm(e.plannedEtd)}, ${plural(ago(e.plannedEtd), "day")} late${e.productName ? ` · ${e.productName}` : ""}`,
      });
    const toDispatch = notOut.filter((e) => e.plannedEtd === today);
    if (toDispatch.length)
      add(HREF.planned, {
        tone: "good",
        tag: "Today",
        score: 0,
        title: `${plural(toDispatch.length, "shipment")} to dispatch today`,
        detail: toDispatch
          .slice(0, 3)
          .map((e) => `Job ${e.jobNo}`)
          .join(", ")
          .concat(toDispatch.length > 3 ? "…" : ""),
      });
    const noPod = live.filter((e) => isDelivered(e) && !hasDoc(e, "pod"));
    if (noPod.length) {
      const oldest = noPod.reduce((a, e) => Math.max(a, e.actualEta ? ago(e.actualEta) : 0), 0);
      add(HREF.delivered, {
        tone: "warn",
        tag: "POD missing",
        score: oldest,
        title: `${plural(noPod.length, "delivered shipment")} without a POD`,
        detail: `Oldest delivered ${plural(oldest, "day")} ago`,
      });
    }
    const byTx = new Map<string, { amt: number; n: number; oldest: number }>();
    for (const e of live) {
      if (OTHERS_PAY.test(e.logisticsPaymentTerm ?? "") || SETTLED.test((e.transportPaymentStatus ?? "").trim())) continue;
      const amt = owedAmount(e);
      if (!amt || !isDelivered(e)) continue;
      const from = e.actualEta || e.actualEtd;
      if (!from || from > today || ago(from) <= 30) continue;
      const name = txName(e.transporterDetails) || "Transporter not set";
      const t = byTx.get(name) ?? { amt: 0, n: 0, oldest: 0 };
      t.amt += amt;
      t.n++;
      t.oldest = Math.max(t.oldest, ago(from));
      byTx.set(name, t);
    }
    for (const [name, t] of byTx)
      add(HREF.payables, { tone: "warn", tag: "Payment due", score: t.oldest, title: `${name} · ${inr(t.amt)}`, detail: `${plural(t.n, "shipment")} unpaid, oldest ${t.oldest} days` });
  }

  if (fpo) {
    const active = fpo.filter((p) => p.board === "FRESH");
    for (const [stage, team] of TEAM) {
      const list = active.filter((p) => p.stage === stage);
      if (list.length)
        add(HREF.fresh, {
          tone: "warn",
          tag: `${team} pending`,
          score: 1,
          title: `${plural(list.length, "Fresh PO")} waiting on ${team}`,
          detail: list
            .slice(0, 3)
            .map((p) => `${p.requestNo ?? ""} ${p.customer ?? ""}`.trim())
            .join(" · "),
        });
    }
    const ready = active.filter((p) => p.stage === "READY");
    if (ready.length)
      add(HREF.fresh, { tone: "good", tag: "Ready", score: 0, title: `${plural(ready.length, "Fresh PO")} ready for Operations`, detail: "All details in — push to Domestic MIS" });
    const held = fpo.filter((p) => p.board === "LONG_HOLD").length;
    if (held) add(HREF.hold, { tone: "warn", tag: "Long hold", score: 0, title: `${plural(held, "PO")} on Long Hold`, detail: "Over 15 days in Fresh PO" });
  }

  if (checks) {
    const real = checks.filter((c) => c.level !== "info");
    const n = real.reduce((a, c) => a + c.rows.length, 0);
    if (n)
      add(HREF.stock, {
        tone: real.some((c) => c.level === "bad") ? "bad" : "warn",
        tag: "Stock check",
        score: 0,
        title: `${plural(n, "stock line")} to look at`,
        detail: real
          .slice(0, 2)
          .map((c) => `${c.title} (${c.rows.length})`)
          .join(" · "),
      });
  }

  const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  for (const e of (lost ?? []).filter((e) => s(e.status) !== "Loop closed"))
    add(HREF.lost, {
      tone: "warn",
      tag: "Loss open",
      score: 0,
      title: [s(e.productName), e.qty !== null && e.qty !== undefined && e.qty !== "" ? `${e.qty} kg` : "", e.expectedLoss ? inr(Number(e.expectedLoss) || 0) : ""]
        .filter(Boolean)
        .join(" · ") || "Lost and found entry",
      detail: [e.jobNo && `Job ${e.jobNo}`, s(e.destination), e.poc && `with ${e.poc}`].filter(Boolean).join(" · ") || s(e.remarks),
    });
  const dOpen = (damage ?? []).filter((e) => s(e.status) !== "Closed");
  if (dOpen.length)
    add(HREF.damage, {
      tone: "warn",
      tag: "Damage",
      score: 0,
      title: `${plural(dOpen.length, "damage / relabelling entry", "damage / relabelling entries")} open`,
      detail: dOpen
        .slice(0, 2)
        .map((e) => [s(e.type), s(e.productName)].filter(Boolean).join(" · "))
        .join(" · "),
    });

  if (feedback?.length) {
    const bugs = feedback.filter((e) => e.kind === "BUG").length;
    const requests = feedback.length - bugs;
    add(HREF.feedback, {
      tone: bugs ? "bad" : "warn",
      tag: bugs ? "Bug" : "Request",
      score: 0,
      title: [bugs && plural(bugs, "new bug report"), requests && plural(requests, "new feature request")].filter(Boolean).join(" · "),
      detail: feedback
        .slice(0, 2)
        .map((e) => e.title)
        .join(" · "),
    });
  }

  return items.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone] || b.score - a.score);
}

/** Greeting by IST time of day. */
export function greeting(now: Date, name: string): string {
  const h = new Date(now.getTime() + 330 * 60_000).getUTCHours();
  const part = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const first = name.trim().split(/\s+/)[0];
  return first ? `${part}, ${first}` : part;
}
