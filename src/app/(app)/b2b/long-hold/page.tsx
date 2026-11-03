import type { Metadata } from "next";
import { BoardPage } from "../_po/board-page";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Long Hold PO" };

export default async function LongHoldPage({ searchParams }: PageProps<"/b2b/long-hold">) {
  return <BoardPage board="LONG_HOLD" searchParams={searchParams} />;
}
