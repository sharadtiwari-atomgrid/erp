import type { Metadata } from "next";
import { param } from "@/lib/forms";
import { RegisterPage } from "../_lib/register-page";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Lost and Found" };

export default async function LostAndFoundPage({ searchParams }: PageProps<"/b2b/inventory/lost-and-found">) {
  return <RegisterPage kind="lost-found" q={param(await searchParams, "q")} />;
}
