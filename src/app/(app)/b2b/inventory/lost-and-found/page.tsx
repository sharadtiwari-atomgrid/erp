import type { Metadata } from "next";
import { param } from "@/lib/forms";
import { RegisterPage } from "../_lib/register-page";

export const metadata: Metadata = { title: "Lost and Found" };

export default async function LostAndFoundPage({ searchParams }: PageProps<"/b2b/inventory/lost-and-found">) {
  return <RegisterPage kind="lost-found" q={param(await searchParams, "q")} />;
}
