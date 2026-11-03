// Test helpers: full entries from partial fictional data.
import type { InwardEntry } from "./inward";
import type { OutwardEntry } from "./outward";

export const P = "AG Warehouse (Panoli)";
export const B = "AG Ballabgarh warehouse";

export function inw(p: Partial<InwardEntry> & { id?: string }): InwardEntry {
  return {
    jobNo: "", inwardDate: "", location: P, funnel: "", supplyPoc: "", grnNo: "", manufacturer: "", supplier: "", productName: "", catalogueName: "",
    type: "", hsn: "", batchNo: "", units: null, packaging: "", uom: "", netWeight: null, grossWeight: null, mfgDate: "", expDate: "", purchaseRate: null,
    remarks: "", outwardQty: null, license: "",
    ...p,
  };
}

export function outw(p: Partial<OutwardEntry>): OutwardEntry {
  return { jobNo: "", obDate: "", warehouse: P, funnel: "", customer: "", grnNo: "", productName: "", catalogueName: "", batchNo: "", qty: null, saleRate: null, ...p };
}
