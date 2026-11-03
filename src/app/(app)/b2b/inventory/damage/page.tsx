import type { Metadata } from "next";
import { param } from "@/lib/forms";
import { RegisterPage } from "../_lib/register-page";

export const metadata: Metadata = { title: "Damage and Relabelling" };

export default async function DamagePage({ searchParams }: PageProps<"/b2b/inventory/damage">) {
  return <RegisterPage kind="damage" q={param(await searchParams, "q")} />;
}
