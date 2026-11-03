"use server";

import { revalidatePath } from "next/cache";
import { recordChange } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { saveFile } from "@/lib/storage";
import { FEEDBACK_PRIORITIES, FEEDBACK_STATUSES } from "./options";


const MAX_BYTES = 25 * 1024 * 1024;
const clip = (v: FormDataEntryValue | null, n: number) => String(v ?? "").trim().slice(0, n);

export type FeedbackResult = { ok: true } | { ok: false; error: string };

/** "Report a bug" / "Feature request" from the header. Anyone signed in may send one. */
export async function submitFeedback(formData: FormData): Promise<FeedbackResult> {
  const user = await requireUser();
  const kind = formData.get("kind") === "FEATURE" ? "FEATURE" : "BUG";
  const title = clip(formData.get("title"), 200);
  if (!title) return { ok: false, error: "Give it a short title." };
  const details = clip(formData.get("details"), 5000) || null;
  const page = clip(formData.get("page"), 120) || null;
  const rawPriority = clip(formData.get("priority"), 40);
  const priority = kind === "BUG" && (FEEDBACK_PRIORITIES as readonly string[]).includes(rawPriority) ? rawPriority : null;
  const shot = formData.get("screenshot");
  const file = shot instanceof File && shot.size > 0 ? shot : null;
  if (file && file.size > MAX_BYTES) return { ok: false, error: "The screenshot is larger than 25 MB." };
  if (file && !file.type.startsWith("image/")) return { ok: false, error: "The screenshot must be an image." };

  const stored = file ? await saveFile(file, "feedback") : null;
  await db.$transaction(async (tx) => {
    const fb = await tx.feedback.create({ data: { kind, title, details, page, priority, userId: user.id } });
    if (file && stored) {
      await tx.opsFile.create({
        data: {
          entityType: "Feedback",
          entityId: fb.id,
          field: "screenshot",
          fileName: file.name || "screenshot.png",
          contentType: stored.contentType,
          size: stored.size,
          storageKey: stored.key,
          uploadedById: user.id,
        },
      });
    }
    await recordChange(
      { userId: user.id, entityType: "Feedback", entityId: fb.id, action: "created", message: `${kind === "BUG" ? "Bug" : "Feature request"} reported: ${title}` },
      tx,
    );
  });
  revalidatePath("/settings/feedback");
  return { ok: true };
}

/** Status and reply, by people who manage settings. */
export async function updateFeedback(id: string, formData: FormData): Promise<FeedbackResult> {
  const user = await requireUser();
  if (!can(user, "settings", "edit")) return { ok: false, error: "Only people who manage settings can change reports." };
  const before = await db.feedback.findUnique({ where: { id } });
  if (!before) return { ok: false, error: "This report no longer exists." };
  const rawStatus = clip(formData.get("status"), 40);
  const status = (FEEDBACK_STATUSES as readonly string[]).includes(rawStatus) ? rawStatus : before.status;
  const reply = clip(formData.get("reply"), 5000) || null;
  if (status === before.status && reply === before.reply) return { ok: true };
  await db.feedback.update({ where: { id }, data: { status, reply } });
  await recordChange({
    userId: user.id,
    entityType: "Feedback",
    entityId: id,
    action: "updated",
    message: `Report “${before.title}” updated`,
    changes: {
      ...(status !== before.status && { status: [before.status, status] }),
      ...(reply !== before.reply && { reply: [before.reply, reply] }),
    },
  });
  revalidatePath("/settings/feedback");
  return { ok: true };
}
