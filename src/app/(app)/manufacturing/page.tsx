import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function ManufacturingPage() {
  await requireUser("production");
  redirect("/manufacturing/orders");
}
