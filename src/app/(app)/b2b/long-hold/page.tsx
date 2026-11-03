import type { Metadata } from "next";
import { BoardPage } from "../_po/board-page";

export const metadata: Metadata = { title: "Long Hold PO" };

export default async function LongHoldPage({ searchParams }: PageProps<"/b2b/long-hold">) {
  return <BoardPage board="LONG_HOLD" searchParams={searchParams} />;
}
