import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { FreshPoBoard } from "./board";
import { autoMoveDuePos, loadBoardRows, loadMasters, viewerFor } from "./server";
import { LONG_HOLD_DAYS } from "./sla";

/** Server side of the Fresh PO and Long Hold PO boards. */
export async function BoardPage({ board, searchParams }: { board: "FRESH" | "LONG_HOLD"; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser("b2bOrders");
  const sp = await searchParams;
  const showMoved = board === "FRESH" && sp.moved === "1";
  const q = typeof sp.q === "string" ? sp.q : "";

  // The long-hold SLA runs whenever a board loads.
  const autoMoved = await autoMoveDuePos();
  const [rows, masters, viewer] = await Promise.all([loadBoardRows(board, showMoved), loadMasters(), viewerFor(user)]);

  return (
    <>
      <PageHeader
        title={board === "FRESH" ? "Fresh PO" : "Long Hold PO"}
        description={
          board === "FRESH"
            ? "Demand → Supply → Logistics. Each team completes its details and hands off; a PO moves to Operations only once every detail is in."
            : `POs that sat on the Fresh PO board for more than ${LONG_HOLD_DAYS} days, or were moved here. Return one to Fresh PO to restart its clock.`
        }
      />
      <FreshPoBoard board={board} rows={rows} masters={masters} viewer={viewer} autoMoved={autoMoved} showMoved={showMoved} initialQuery={q} />
    </>
  );
}
