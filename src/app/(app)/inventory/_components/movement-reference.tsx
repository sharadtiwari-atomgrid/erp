import Link from "next/link";

const REFERENCE_ROUTES: Record<string, string> = {
  SalesOrder: "/sales/orders",
  PurchaseOrder: "/purchasing/orders",
};

/** Document number of a stock movement, linked to the source document when there is one. */
export function MovementReference({
  movement,
}: {
  movement: { reference: string | null; referenceType: string | null; referenceId: string | null; note: string | null };
}) {
  const base = movement.referenceType ? REFERENCE_ROUTES[movement.referenceType] : undefined;
  return (
    <div>
      {base && movement.referenceId ? (
        <Link href={`${base}/${movement.referenceId}`} className="font-medium text-brand-700 hover:underline">
          {movement.reference ?? "View document"}
        </Link>
      ) : (
        <span className="font-mono text-xs">{movement.reference ?? "—"}</span>
      )}
      {movement.note && <div className="text-xs text-ink-faint">{movement.note}</div>}
    </div>
  );
}
