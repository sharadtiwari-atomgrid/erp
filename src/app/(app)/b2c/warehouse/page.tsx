import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireUser } from "@/lib/auth";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Pick & pack" };

export default async function B2cWarehousePage() {
  await requireUser("b2cWarehouse");
  return (
    <ComingSoon title="Pick & pack" division="B2C division · Warehouse">
      The queue of orders to pick and pack, with pick lists and packing slips.
    </ComingSoon>
  );
}
