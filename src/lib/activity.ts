import "server-only";
import { db, type Tx } from "@/lib/db";

export async function logActivity(
  input: { userId?: string | null; entityType: string; entityId: string; action: string; message: string },
  tx: Tx | typeof db = db,
) {
  await tx.activity.create({ data: { ...input, userId: input.userId ?? null } });
}
