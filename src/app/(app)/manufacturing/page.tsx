import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export default async function ManufacturingPage() {
  await requireUser("production");
  redirect("/manufacturing/orders");
}
