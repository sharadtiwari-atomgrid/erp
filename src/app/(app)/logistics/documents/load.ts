import "server-only";
import { db } from "@/lib/db";

/** A shipping document with everything the detail and print views show. */
export function loadShippingDocument(id: string) {
  return db.shippingDocument.findUnique({
    where: { id },
    include: {
      customer: true,
      trip: {
        select: {
          id: true,
          number: true,
          origin: true,
          destination: true,
          status: true,
          vehicle: { select: { registrationNo: true, type: true, transporter: { select: { name: true } } } },
          driver: { select: { name: true, phone: true } },
        },
      },
      outbound: {
        select: {
          id: true,
          number: true,
          status: true,
          dispatchedAt: true,
          warehouse: { select: { name: true, address: true } },
          salesOrder: { select: { id: true, number: true, orderDate: true } },
          lines: { include: { product: { select: { id: true, sku: true, name: true, unit: true, hsnCode: true } } } },
          handlingUnits: {
            orderBy: { code: "asc" },
            include: { items: { include: { product: { select: { sku: true, name: true, unit: true } } } } },
          },
        },
      },
    },
  });
}

export type LoadedShippingDocument = NonNullable<Awaited<ReturnType<typeof loadShippingDocument>>>;
