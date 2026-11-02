import "server-only";
import type { Tx } from "@/lib/db";
import { SEQUENCES, type SequenceKey } from "@/lib/sequence-keys";

export { SEQUENCES, type SequenceKey };

/** Atomically reserves the next document number, e.g. "SO-00042". Call inside a transaction. */
export async function nextDocumentNumber(tx: Tx, key: SequenceKey): Promise<string> {
  const def = SEQUENCES[key];
  const seq = await tx.documentSequence.upsert({
    where: { key },
    create: { key, prefix: def.prefix, padding: def.padding, next: 2 },
    update: { next: { increment: 1 } },
  });
  const value = seq.next - 1;
  return `${seq.prefix}${String(value).padStart(seq.padding, "0")}`;
}
