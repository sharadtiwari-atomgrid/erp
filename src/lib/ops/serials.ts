import "server-only";
import { db, type Tx } from "@/lib/db";

/**
 * Domestic B2B serial numbers, assigned on the server under a Postgres
 * advisory lock so two people never get the same one:
 *   - Fresh PO and Long Hold PO each number their live POs 1, 2, 3…
 *   - Domestic MIS Job No. continues from the highest plain-number job.
 * Only plain numbers count; legacy job numbers like "26-01-0671" are ignored.
 * Numbers found in imported sheets are never reused.
 */
const LOCKS = { mis: 731_001, board: 731_002 } as const;

export type Board = "FRESH" | "LONG_HOLD";

export async function lockSerial(tx: Tx, kind: keyof typeof LOCKS) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCKS[kind]})`;
}

/** Next Request No. on a Fresh PO board. Call inside a transaction after lockSerial(tx, "board"). */
export async function nextRequestNo(tx: Tx, board: Board): Promise<number> {
  const agg = await tx.freshPo.aggregate({ where: { board, deletedAt: null }, _max: { requestNo: true } });
  return (agg._max.requestNo ?? 0) + 1;
}

/** Next Domestic MIS Job No. Call inside a transaction after lockSerial(tx, "mis"). */
export async function nextJobNo(tx: Tx): Promise<string> {
  const [row] = await tx.$queryRaw<Array<{ m: bigint | number | null }>>`
    SELECT COALESCE(MAX("jobNo"::bigint), 0) AS m FROM "MisJob" WHERE "jobNo" ~ '^[0-9]{1,15}$'`;
  return String(Number(row?.m ?? 0) + 1);
}

/** True when a live MIS job other than `exceptId` already uses this Job No. */
export async function jobNoTaken(tx: Tx, jobNo: string, exceptId?: string): Promise<boolean> {
  const found = await tx.misJob.findFirst({
    where: { jobNo, deletedAt: null, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { id: true },
  });
  return !!found;
}

/** Runs `fn` in a transaction holding the given serial lock. */
export function withSerial<T>(kind: keyof typeof LOCKS, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.$transaction(async (tx) => {
    await lockSerial(tx, kind);
    return fn(tx);
  });
}
