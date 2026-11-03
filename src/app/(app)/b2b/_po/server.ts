import "server-only";
import type { FreshPo, Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { recordChange } from "@/lib/audit";
import { db, type Tx } from "@/lib/db";
import { num } from "@/lib/format";
import { isoFromDay, parseDay, parseNumber, todayIso, dayFromIso } from "@/lib/ops/dates";
import { nextRequestNo, withSerial } from "@/lib/ops/serials";
import { can } from "@/lib/permissions";
import { fileUrl } from "@/lib/storage";
import { DATE_FIELDS, fieldLabel, NUMBER_FIELDS, PO_FIELDS, type BoardKind, type Team } from "./fields";
import { isLongHoldDue, LONG_HOLD_DAYS } from "./sla";
import type { BoardMasters, BoardViewer, PoRow } from "./types";

export const ENTITY = "FreshPo";

type PoWithJob = FreshPo & { misJob?: { jobNo: string } | null };

/** A stored PO's business fields as text (dates YYYY-MM-DD, numbers plain). */
export function poValues(po: FreshPo): Record<string, string> {
  const out: Record<string, string> = {};
  const rec = po as unknown as Record<string, unknown>;
  for (const k of PO_FIELDS) {
    const v = rec[k];
    if (v === null || v === undefined) out[k] = "";
    else if (DATE_FIELDS.has(k)) out[k] = isoFromDay(v as Date);
    else if (NUMBER_FIELDS.has(k)) out[k] = String(num(v as Prisma.Decimal));
    else out[k] = String(v);
  }
  return out;
}

export function toRow(po: PoWithJob, poFile: PoRow["poFile"] = null): PoRow {
  return {
    id: po.id,
    requestNo: po.requestNo === null ? "" : String(po.requestNo),
    board: po.board,
    stage: po.stage,
    values: poValues(po),
    holdReleasedAt: po.holdReleasedAt ? isoFromDay(po.holdReleasedAt) : "",
    createdAt: po.createdAt.toISOString(),
    misJobNo: po.misJob?.jobNo ?? null,
    poFile,
  };
}

/**
 * Text values → Prisma data. Blank becomes null; dates and numbers are parsed
 * leniently, and a value that isn't one is reported (or dropped when `lenient`).
 */
export function toData(values: Record<string, string>, lenient = false): { data: Record<string, unknown>; errors: string[] } {
  const data: Record<string, unknown> = {};
  const errors: string[] = [];
  for (const [k, raw] of Object.entries(values)) {
    if (!PO_FIELDS.includes(k)) continue;
    const v = String(raw ?? "").trim();
    if (!v) {
      data[k] = null;
      continue;
    }
    if (DATE_FIELDS.has(k)) {
      const iso = parseDay(v);
      if (iso) data[k] = dayFromIso(iso);
      else if (!lenient) errors.push(`${fieldLabel(k)} isn’t a date (use dd/mm/yyyy)`);
    } else if (NUMBER_FIELDS.has(k)) {
      const n = parseNumber(v);
      if (n !== null && Math.abs(n) < 1e12) data[k] = n;
      else if (!lenient) errors.push(`${fieldLabel(k)} isn’t a number`);
    } else {
      data[k] = v.slice(0, 2000);
    }
  }
  return { data, errors };
}

export async function opsTeamOf(userId: string): Promise<Team | null> {
  const u = await db.user.findUnique({ where: { id: userId }, select: { opsTeam: true } });
  return u?.opsTeam ?? null;
}

/** "Acting as": a user with a team is locked to it unless they are an admin; others default to SCM. */
export async function viewerFor(user: CurrentUser): Promise<BoardViewer> {
  const team = await opsTeamOf(user.id);
  const admin = can(user, "settings", "edit");
  return {
    lockedTeam: team && !admin ? team : null,
    defaultTeam: team ?? "SCM",
    canEdit: can(user, "b2bOrders", "edit"),
    canAddContacts: can(user, "contacts", "edit"),
    canAddProducts: can(user, "products", "edit"),
  };
}

/** The team a save acts as: the locked team when there is one, else what the user picked. */
export async function actingTeam(user: CurrentUser, picked: string): Promise<Team> {
  const viewer = await viewerFor(user);
  if (viewer.lockedTeam) return viewer.lockedTeam;
  return (["DEMAND", "SUPPLY", "LOGISTICS", "SCM"] as const).find((t) => t === picked) ?? viewer.defaultTeam;
}

export async function loadMasters(): Promise<BoardMasters> {
  const [contacts, products, pocs] = await Promise.all([
    db.contact.findMany({
      where: { isActive: true, roles: { hasSome: ["CUSTOMER", "SUPPLIER"] } },
      select: { id: true, name: true, roles: true, pocNames: true, contactPerson: true, phone: true, billingAddress: true, shippingAddress: true },
      orderBy: { name: "asc" },
    }),
    db.product.findMany({ where: { isActive: true }, select: { id: true, name: true, productClass: true, hsnCode: true }, orderBy: { name: "asc" } }),
    db.opsPoc.findMany({ select: { name: true }, orderBy: { name: "asc" } }),
  ]);
  const option = (c: (typeof contacts)[number]) => {
    const pocs = c.pocNames.length ? c.pocNames : c.contactPerson ? [[c.contactPerson, c.phone].filter(Boolean).join(" · ")] : [];
    const addresses = [...new Set([c.billingAddress, c.shippingAddress].filter((a): a is string => !!a?.trim()))];
    return { id: c.id, name: c.name, pocs, addresses };
  };
  return {
    customers: contacts.filter((c) => c.roles.includes("CUSTOMER")).map(option),
    suppliers: contacts.filter((c) => c.roles.includes("SUPPLIER")).map(option),
    products: products.map((p) => ({ id: p.id, name: p.name, productClass: p.productClass ?? "", hsnCode: p.hsnCode ?? "" })),
    pocs: pocs.map((p) => p.name),
  };
}

/** Live POs for a board. The Fresh PO board can also show POs moved on (Long Hold / Domestic MIS). */
export async function loadBoardRows(board: "FRESH" | "LONG_HOLD", showMoved: boolean): Promise<PoRow[]> {
  const boards: BoardKind[] = board === "LONG_HOLD" ? ["LONG_HOLD"] : showMoved ? ["FRESH", "LONG_HOLD", "MIS"] : ["FRESH"];
  const pos = await db.freshPo.findMany({
    where: { deletedAt: null, board: { in: boards } },
    include: { misJob: { select: { jobNo: true } } },
    orderBy: [{ createdAt: "desc" }],
    take: 5000,
  });
  const files = pos.length
    ? await db.opsFile.findMany({
        where: { entityType: ENTITY, field: "PO", entityId: { in: pos.map((p) => p.id) } },
        select: { entityId: true, fileName: true, storageKey: true, url: true },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const firstFile = new Map<string, PoRow["poFile"]>();
  for (const f of files) {
    const url = f.storageKey ? fileUrl(f.storageKey) : f.url;
    if (url && !firstFile.has(f.entityId)) firstFile.set(f.entityId, { name: f.fileName, url });
  }
  return pos.map((p) => toRow(p, firstFile.get(p.id) ?? null));
}

/**
 * The long-hold SLA, run when a board loads: every Fresh PO over the limit
 * moves to Long Hold with the next Long Hold number. Returns how many moved.
 */
export async function autoMoveDuePos(): Promise<number> {
  const fresh = await db.freshPo.findMany({
    where: { board: "FRESH", deletedAt: null },
    select: { id: true, poDate: true, holdReleasedAt: true, createdAt: true },
  });
  const today = todayIso();
  const due = fresh.filter((p) => isLongHoldDue(p, today)).map((p) => p.id);
  if (!due.length) return 0;
  return withSerial("board", async (tx) => {
    let moved = 0;
    for (const id of due) {
      const before = await tx.freshPo.findFirst({ where: { id, board: "FRESH", deletedAt: null } });
      if (!before) continue;
      await moveToBoard(tx, before, "LONG_HOLD", null, `Auto-moved to Long Hold — in Fresh PO over ${LONG_HOLD_DAYS} days`);
      moved++;
    }
    return moved;
  });
}

/**
 * Moves a PO between Fresh PO and Long Hold with that board's next Request No.
 * Coming back from Long Hold restarts the SLA clock (holdReleasedAt = today, IST).
 * Call inside withSerial("board").
 */
export async function moveToBoard(tx: Tx, before: FreshPo, to: "FRESH" | "LONG_HOLD", userId: string | null, message: string) {
  const requestNo = await nextRequestNo(tx, to);
  const data: Prisma.FreshPoUncheckedUpdateInput = { board: to, requestNo };
  if (to === "FRESH" && before.board === "LONG_HOLD") data.holdReleasedAt = dayFromIso(todayIso());
  const after = await tx.freshPo.update({ where: { id: before.id }, data });
  await recordChange(
    {
      userId,
      entityType: ENTITY,
      entityId: before.id,
      action: "moved",
      message,
      changes: {
        board: [before.board, to],
        requestNo: [before.requestNo, requestNo],
        ...(data.holdReleasedAt ? { holdReleasedAt: [before.holdReleasedAt ? isoFromDay(before.holdReleasedAt) : null, todayIso()] } : {}),
      },
    },
    tx,
  );
  return after;
}
