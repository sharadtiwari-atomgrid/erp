import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DetailList, StatCard } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { branchWhere } from "@/lib/branch";
import { db } from "@/lib/db";
import { formatDate, formatDateTime, formatMoney, formatNumber, num } from "@/lib/format";
import { can } from "@/lib/permissions";
import { toIstDateTimeInput } from "../../../books/_lib/eway";
import { ActivityCard } from "../../../sales/_components/activity-card";
import { OpsBadge } from "../../_components/badges";
import { generateTripDocuments } from "../../documents/actions";
import { attachOutbound, cancelTrip, completeTrip, detachOutbound, startTrip } from "../actions";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Trip" };

export default async function TripPage({ params }: PageProps<"/logistics/trips/[id]">) {
  const user = await requireUser("trips");
  const { id } = await params;
  const trip = await db.trip.findUnique({
    where: { id },
    include: {
      vehicle: { select: { id: true, registrationNo: true, type: true, status: true, capacityKg: true, transporter: { select: { name: true } } } },
      driver: { select: { id: true, name: true, phone: true } },
      branch: { select: { name: true } },
      outbounds: {
        orderBy: { number: "asc" },
        include: {
          salesOrder: { select: { id: true, number: true, customer: { select: { id: true, name: true, city: true } } } },
          warehouse: { select: { name: true } },
          handlingUnits: { select: { weightKg: true } },
          _count: { select: { lines: true } },
        },
      },
      shippingDocs: { orderBy: { issuedAt: "desc" }, include: { customer: { select: { name: true } }, outbound: { select: { number: true } } } },
    },
  });
  if (!trip) notFound();

  const canEdit = can(user, "trips", "edit");
  const planned = trip.status === "PLANNED";
  const candidates =
    canEdit && planned
      ? await db.outboundOrder.findMany({
          where: { ...(await branchWhere()), tripId: null, status: { in: ["PACKED", "DISPATCHED"] } },
          orderBy: { createdAt: "asc" },
          take: 100,
          select: { id: true, number: true, status: true, salesOrder: { select: { customer: { select: { name: true } } } } },
        })
      : [];

  const distance = trip.startOdometer !== null && trip.endOdometer !== null ? num(trip.endOdometer) - num(trip.startOdometer) : null;
  const huCount = trip.outbounds.reduce((s, o) => s + o.handlingUnits.length, 0);
  const weight = trip.outbounds.reduce((s, o) => s + o.handlingUnits.reduce((w, h) => w + num(h.weightKg), 0), 0);
  const capacity = num(trip.vehicle.capacityKg);
  const docDefault = toIstDateTimeInput(trip.plannedStart ?? new Date());
  const hasOutbounds = trip.outbounds.length > 0;

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {trip.number} <OpsBadge status={trip.status} />
          </span>
        }
        description={`${trip.origin} → ${trip.destination}`}
        back={{ href: "/logistics/trips", label: "Trips" }}
        actions={
          canEdit && (
            <>
              {planned && (
                <ActionButton action={cancelTrip.bind(null, id)} variant="ghost" confirmMessage="Cancel this trip? Its outbound orders will be unloaded.">
                  Cancel trip
                </ActionButton>
              )}
              {planned && (
                <ButtonLink href={`/logistics/trips/${id}/edit`} variant="secondary">
                  Edit
                </ButtonLink>
              )}
              {planned && (
                <ActionButton
                  action={startTrip.bind(null, id)}
                  variant="primary"
                  pendingText="Starting…"
                  fields={
                    <Input name="startOdometer" type="number" min="0" step="0.1" placeholder="Start odometer km" className="w-44" aria-label="Start odometer (km)" required />
                  }
                >
                  Start trip
                </ActionButton>
              )}
              {trip.status === "IN_TRANSIT" && (
                <ActionButton
                  action={completeTrip.bind(null, id)}
                  variant="primary"
                  pendingText="Completing…"
                  fields={
                    <Input
                      name="endOdometer"
                      type="number"
                      min={num(trip.startOdometer)}
                      step="0.1"
                      placeholder="End odometer km"
                      className="w-44"
                      aria-label="End odometer (km)"
                      required
                    />
                  }
                >
                  Complete trip
                </ActionButton>
              )}
            </>
          )
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Outbound orders" value={trip.outbounds.length} hint={`${huCount} handling unit${huCount === 1 ? "" : "s"}`} />
        <StatCard
          label="Load"
          value={weight > 0 ? `${formatNumber(weight, 0)} kg` : "—"}
          hint={capacity > 0 ? `Capacity ${formatNumber(capacity, 0)} kg` : undefined}
          tone={capacity > 0 && weight > capacity ? "danger" : "default"}
        />
        <StatCard
          label="Distance"
          value={distance === null ? "—" : `${formatNumber(distance, 1)} km`}
          hint={trip.startOdometer !== null ? `Odometer ${formatNumber(trip.startOdometer, 1)} → ${trip.endOdometer !== null ? formatNumber(trip.endOdometer, 1) : "…"}` : undefined}
        />
        <StatCard
          label="Freight cost"
          value={formatMoney(trip.freightCost)}
          hint={distance ? `${formatMoney(num(trip.freightCost) / distance)} per km` : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader
              title="Outbound orders"
              description={planned ? "Packed or dispatched orders not on another trip can be loaded." : undefined}
              actions={
                canEdit &&
                planned && (
                  <ActionButton
                    action={attachOutbound.bind(null, id)}
                    size="sm"
                    pendingText="Adding…"
                    fields={
                      <Select name="outboundId" defaultValue="" className="h-8 w-64 text-xs" aria-label="Outbound order" required>
                        <option value="">{candidates.length ? "Choose outbound order…" : "No packed orders available"}</option>
                        {candidates.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.number} · {o.salesOrder.customer.name} ({o.status.toLowerCase()})
                          </option>
                        ))}
                      </Select>
                    }
                  >
                    Add
                  </ActionButton>
                )
              }
            />
            <Table>
              <THead>
                <tr>
                  <TH>Outbound</TH>
                  <TH>Customer</TH>
                  <TH>Sales order</TH>
                  <TH>Warehouse</TH>
                  <TH align="right">Lines</TH>
                  <TH align="right">Handling units</TH>
                  <TH>Status</TH>
                  {canEdit && planned && <TH />}
                </tr>
              </THead>
              <TBody>
                {!hasOutbounds && <EmptyRow colSpan={8}>No outbound orders loaded.</EmptyRow>}
                {trip.outbounds.map((o) => (
                  <TR key={o.id}>
                    <TD>
                      <Link href={`/warehouse/outbound/${o.id}`} className="font-medium text-brand-700 hover:underline">
                        {o.number}
                      </Link>
                    </TD>
                    <TD>
                      <Link href={`/contacts/${o.salesOrder.customer.id}`} className="hover:underline">
                        {o.salesOrder.customer.name}
                      </Link>
                      {o.salesOrder.customer.city && <div className="text-xs text-ink-faint">{o.salesOrder.customer.city}</div>}
                    </TD>
                    <TD>
                      <Link href={`/sales/orders/${o.salesOrder.id}`} className="hover:underline">
                        {o.salesOrder.number}
                      </Link>
                    </TD>
                    <TD className="text-ink-soft">{o.warehouse.name}</TD>
                    <TD align="right">{o._count.lines}</TD>
                    <TD align="right">{o.handlingUnits.length}</TD>
                    <TD>
                      <OpsBadge status={o.status} />
                    </TD>
                    {canEdit && planned && (
                      <TD align="right">
                        <ActionButton action={detachOutbound.bind(null, id, o.id)} size="sm" variant="ghost" confirmMessage={`Remove ${o.number} from this trip?`}>
                          Remove
                        </ActionButton>
                      </TD>
                    )}
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>

          <Card>
            <CardHeader
              title="Shipping documents"
              description="ASN at dispatch, delivery note signed by the customer. One of each per outbound order."
              actions={
                canEdit &&
                hasOutbounds &&
                trip.status !== "CANCELLED" && (
                  <>
                    <ActionButton
                      action={generateTripDocuments.bind(null, id, "ASN")}
                      size="sm"
                      pendingText="Generating…"
                      fields={
                        <Input name="expectedDelivery" type="datetime-local" defaultValue={docDefault} className="h-8 w-48 text-xs" aria-label="Expected delivery (IST)" />
                      }
                    >
                      Generate ASNs
                    </ActionButton>
                    <ActionButton action={generateTripDocuments.bind(null, id, "DN")} size="sm" pendingText="Generating…">
                      Generate delivery notes
                    </ActionButton>
                  </>
                )
              }
            />
            <Table>
              <THead>
                <tr>
                  <TH>Number</TH>
                  <TH>Type</TH>
                  <TH>Outbound</TH>
                  <TH>Customer</TH>
                  <TH>Expected</TH>
                  <TH>Delivered</TH>
                </tr>
              </THead>
              <TBody>
                {trip.shippingDocs.length === 0 && <EmptyRow colSpan={6}>No documents yet.</EmptyRow>}
                {trip.shippingDocs.map((d) => (
                  <TR key={d.id}>
                    <TD>
                      <Link href={`/logistics/documents/${d.id}`} className="font-medium text-brand-700 hover:underline">
                        {d.number}
                      </Link>
                    </TD>
                    <TD>
                      <OpsBadge status={d.type} />
                    </TD>
                    <TD className="text-ink-soft">{d.outbound?.number ?? "—"}</TD>
                    <TD>{d.customer?.name ?? "—"}</TD>
                    <TD className="text-ink-soft">{formatDate(d.expectedDelivery)}</TD>
                    <TD>{d.deliveredAt ? `${formatDateTime(d.deliveredAt)} · ${d.receivedBy ?? ""}` : d.type === "DN" ? <OpsBadge status="PENDING" /> : "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-1">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <DetailList
                items={[
                  {
                    label: "Vehicle",
                    value: (
                      <span>
                        <Link href={`/logistics/vehicles/${trip.vehicle.id}`} className="font-mono text-brand-700 hover:underline">
                          {trip.vehicle.registrationNo}
                        </Link>{" "}
                        <span className="text-ink-soft">
                          {trip.vehicle.type}
                          {trip.vehicle.transporter ? ` · ${trip.vehicle.transporter.name}` : ""}
                        </span>
                      </span>
                    ),
                  },
                  {
                    label: "Driver",
                    value: trip.driver && (
                      <Link href={`/logistics/drivers/${trip.driver.id}`} className="text-brand-700 hover:underline">
                        {trip.driver.name}
                        {trip.driver.phone ? ` · ${trip.driver.phone}` : ""}
                      </Link>
                    ),
                  },
                  { label: "Branch", value: trip.branch.name },
                  { label: "Planned start", value: formatDateTime(trip.plannedStart) },
                  { label: "Started", value: formatDateTime(trip.actualStart) },
                  { label: "Completed", value: formatDateTime(trip.actualEnd) },
                  { label: "Notes", value: trip.notes },
                ]}
              />
            </CardBody>
          </Card>
          <ActivityCard entityType="Trip" entityId={id} />
        </div>
      </div>
    </>
  );
}
