import type { Metadata } from "next";
import { BoardPage } from "../_po/board-page";

export const metadata: Metadata = { title: "Fresh PO" };

export default async function FreshPoPage({ searchParams }: PageProps<"/b2b/fresh-po">) {
  return <BoardPage board="FRESH" searchParams={searchParams} />;
}
