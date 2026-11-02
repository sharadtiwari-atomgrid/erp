"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { branchWhere } from "@/lib/branch";
import { runAutoSchedule } from "../_lib/run-scheduler";
import { MfgError } from "../_lib/server";

export type AutoScheduleState =
  | {
      error?: string;
      result?: {
        scheduled: number;
        late: Array<{ id: string; number: string; end: string; dueDate: string }>;
        unscheduled: Array<{ id: string; number: string; reason: string }>;
        warnings: string[];
      };
    }
  | undefined;

/**
 * "Auto-schedule" for every DRAFT (and optionally SCHEDULED) order in the
 * current branch scope. See _lib/scheduler.ts for the heuristic.
 */
export async function autoScheduleAll(_prev: AutoScheduleState, formData: FormData): Promise<AutoScheduleState> {
  const user = await requireUser("production", "edit");
  const scope = formData.get("scope") === "draft" ? "draft" : "all";
  try {
    const summary = await runAutoSchedule({ userId: user.id, scope, branch: await branchWhere() });
    revalidatePath("/manufacturing/schedule");
    revalidatePath("/manufacturing/orders");
    revalidatePath("/manufacturing/hub/machines");
    revalidatePath("/manufacturing/needs");
    return {
      result: {
        scheduled: summary.scheduled,
        late: summary.late.map((l) => ({ ...l, end: l.end.toISOString(), dueDate: l.dueDate.toISOString() })),
        unscheduled: summary.unscheduled,
        warnings: summary.warnings,
      },
    };
  } catch (e) {
    if (e instanceof MfgError) return { error: e.message };
    throw e;
  }
}
