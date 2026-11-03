"use server";

import { revalidatePath } from "next/cache";
import { recordChange } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { saveFile } from "@/lib/storage";

const MAX_BYTES = 25 * 1024 * 1024;

/** Uploads the generated COA PDF and adds it to the MIS job's COA field. */
export async function saveCoaToJob(jobId: string, formData: FormData): Promise<{ ok: true; fileName: string } | { ok: false; error: string }> {
  const user = await requireUser("opsTools", "edit");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "The PDF is empty." };
  if (file.size > MAX_BYTES) return { ok: false, error: "The PDF is larger than 25 MB." };
  const job = await db.misJob.findFirst({ where: { id: jobId, deletedAt: null }, select: { id: true, jobNo: true } });
  if (!job) return { ok: false, error: "That job no longer exists." };

  const fileName = String(formData.get("fileName") || file.name).slice(0, 200);
  const stored = await saveFile(file, "coa");
  await db.$transaction(async (tx) => {
    await tx.opsFile.create({
      data: {
        entityType: "MisJob",
        entityId: job.id,
        field: "coa",
        fileName,
        contentType: stored.contentType,
        size: stored.size,
        storageKey: stored.key,
        uploadedById: user.id,
      },
    });
    await recordChange(
      { userId: user.id, entityType: "MisJob", entityId: job.id, action: "file added", message: `COA ${fileName} added from the COA generator` },
      tx,
    );
  });
  revalidatePath("/b2b/mis");
  return { ok: true, fileName };
}
