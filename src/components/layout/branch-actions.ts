"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { BRANCH_COOKIE } from "@/lib/branch";

/** Stores the header's branch selection ("" = all branches). */
export async function selectBranch(formData: FormData) {
  const user = await requireUser();
  if (user.branchId) return; // restricted users can't switch
  const branchId = String(formData.get("branchId") ?? "");
  const store = await cookies();
  if (branchId) store.set(BRANCH_COOKIE, branchId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  else store.delete(BRANCH_COOKIE);
  revalidatePath("/", "layout");
}
