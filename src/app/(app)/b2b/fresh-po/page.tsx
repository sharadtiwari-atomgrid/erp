import type { Metadata } from "next";
import { BoardPage } from "../_po/board-page";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Fresh PO" };

export default async function FreshPoPage({ searchParams }: PageProps<"/b2b/fresh-po">) {
  return <BoardPage board="FRESH" searchParams={searchParams} />;
}
