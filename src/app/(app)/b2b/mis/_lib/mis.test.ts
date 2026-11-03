import { describe, expect, it } from "vitest";
import { normalizeSelect, parseMisStatus } from "@/lib/ops/lists";
import { availableKg, batchesInStock, checkBatches } from "./batches";
import { checkRow, type MasterNames } from "./checks";
import { columnValue, normaliseValues, valuesFromJob } from "./convert";
import { computed } from "./fields";
import { addFile, downloadUrl, fileList, hasFile, removeFile, viewUrl } from "./files";
import { docStatus, holdGated, problemText, statusProblems } from "./gates";
import { coerce, mergeImported, parseDateTime, parseMisSheet, parseMonth } from "./import-map";
import { jobRank, matchesSearch, sortByJobNo } from "./list";
import { suggestName } from "./name-match";
import { parseMisPaste } from "./paste";

// All names below are fictional.

describe("paste from email", () => {
  it("reads label: value lines, with a wrapped address", () => {
    const { values, unknown } = parseMisPaste(
      [
        "Customer: Example Agro Ltd",
        "Product: Thiamethoxam Technical",
        "Qty: 1,000 kg",
        "Batch No: BT306",
        "Delivery address: Plot 12, Sample Estate",
        "Sampletown 400001",
        "Dispatch date: 27/10/2026",
        "Vehicle: 32 ft MXL",
        "Regards: Test Person",
      ].join("\n"),
    );
    expect(values.customer).toBe("Example Agro Ltd");
    expect(values.productName).toBe("Thiamethoxam Technical");
    expect(values.quantityKgs).toBe("1000");
    expect(values.batchNo).toBe("BT306");
    expect(values.dropAddress).toBe("Plot 12, Sample Estate Sampletown 400001");
    expect(values.actualEtd).toBe("2026-10-27");
    expect(values.vehicleType).toBe("32 ft MXL");
    expect(unknown).toEqual(["Regards"]);
  });

  it("reads tab-separated label / value pairs", () => {
    const { values } = parseMisPaste("Job No.\t1205\nSupplier\tNorthwind Organics\nTaxable value (Rs.)\t₹ 4,25,000\nStatus\tIn Transit");
    expect(values.jobNo).toBe("1205");
    expect(values.supplier).toBe("Northwind Organics");
    expect(values.taxableValue).toBe("425000");
    expect(values.status).toBe("INTRANSIT");
  });

  it("reads a header row and value rows (first row only)", () => {
    const { values, rows } = parseMisPaste(
      "Customer\tProduct Name\tQuantity (in KGS)\tPacking\nBeta Crop Care\tProfenofos Technical\t2500\t25 kg bags\nGamma\tX\t10\tDrums",
    );
    expect(rows).toBe(2);
    expect(values).toEqual({ customer: "Beta Crop Care", productName: "Profenofos Technical", quantityKgs: "2500", packing: "25 kg bags" });
  });

  it("ignores file and computed columns", () => {
    const { values } = parseMisPaste("POD: scan.pdf\nTransit Time (days): 4\nCustomer: Delta Ltd");
    expect(values).toEqual({ customer: "Delta Ltd" });
  });
});

const ready = { actualEtd: "2026-10-20", transporterDetails: "Sample Roadways", quantityKgs: "500", batchNo: "B1" };

describe("status gates", () => {
  it("moving into In transit / Delivered / Paid needs its fields", () => {
    expect(statusProblems({ status: "INTRANSIT" }, { status: "PLANNED" }).map((p) => p.key)).toEqual([
      "actualEtd",
      "transporterDetails",
      "quantityKgs",
      "batchNo",
    ]);
    expect(statusProblems({ ...ready, status: "INTRANSIT" }, { status: "PLANNED" })).toEqual([]);
    expect(statusProblems({ ...ready, status: "DELIVERED" }, { status: "INTRANSIT" }).map((p) => p.key)).toEqual(["actualEta"]);
    expect(statusProblems({ status: "PLANNED", transportPaymentStatus: "Paid" }, { transportPaymentStatus: "Pending" }).map((p) => p.key)).toEqual([
      "transportPaidOn",
      "transportPaymentRef",
    ]);
    expect(problemText(statusProblems({ status: "DELIVERED" }, null))).toMatch(/Before marking it Delivered, fill: .*Actual \/ Tentative ETA/);
  });

  it("rows already at that status aren't blocked when other fields change", () => {
    expect(statusProblems({ status: "INTRANSIT", customer: "X" }, { status: "INTRANSIT" })).toEqual([]);
    expect(statusProblems({ status: "DELIVERED" }, { status: "DELIVERED" })).toEqual([]);
    expect(statusProblems({ status: "INTRANSIT" }, { status: "DELIVERED" })).toEqual([]);
    expect(statusProblems({ transportPaymentStatus: "Paid" }, { transportPaymentStatus: "Paid" })).toEqual([]);
  });

  it("holds a gated change back and keeps everything else", () => {
    const { row, problems } = holdGated({ status: "INTRANSIT", customer: "New Name", transportPaymentStatus: "Paid" }, { status: "PLANNED", transportPaymentStatus: "Pending" });
    expect(row).toEqual({ status: "PLANNED", customer: "New Name", transportPaymentStatus: "Pending" });
    expect(new Set(problems.map((p) => p.step))).toEqual(new Set(["Intransit", "Paid"]));
    expect(holdGated({ ...ready, status: "INTRANSIT" }, { status: "PLANNED" }).row.status).toBe("INTRANSIT");
  });

  it("first POD / E-Way Bill uploads move the status", () => {
    expect(docStatus("pod", "INTRANSIT", false)).toBe("DELIVERED");
    expect(docStatus("pod", "CANCELLED", false)).toBeNull();
    expect(docStatus("pod", "DELIVERED", false)).toBeNull();
    expect(docStatus("pod", "INTRANSIT", true)).toBeNull();
    expect(docStatus("eWayBill", "PLANNED", false)).toBe("INTRANSIT");
    expect(docStatus("eWayBill", null, false)).toBe("INTRANSIT");
    expect(docStatus("eWayBill", "DELIVERED", false)).toBeNull();
    expect(docStatus("coa", "PLANNED", false)).toBeNull();
  });
});

describe("batch checks", () => {
  const lines = [
    { batchNo: "TS20260101", material: "Trifloxystrobin Technical", productName: "Trifloxystrobin", location: "AG Warehouse (Panoli)", instockQty: 825 },
    { batchNo: "ZQKM0101A002", material: "Chlorantraniliprole 9.3% ZC", productName: "", location: "AG Warehouse (Panoli)", instockQty: 4421 },
    { batchNo: "OLD1", material: "Gone", productName: "", location: "", instockQty: 0 },
  ];
  const b = batchesInStock(lines);

  it("finds batches in stock, written differently, near misses and other products", () => {
    expect(b.length).toBe(2);
    const [ok] = checkBatches("TS20260101", "Trifloxystrobin Technical", b);
    expect([ok.found?.stock, ok.suggestion, ok.otherProduct]).toEqual([825, null, false]);
    const [oh] = checkBatches("ZQKMO101A002", "Chlorantraniliprole 9.3% ZC", b); // letter O for zero
    expect(oh.suggestion?.batchNo).toBe("ZQKM0101A002");
    const [typo] = checkBatches("TS20060101", "Trifloxystrobin Technical", b); // one digit off
    expect([typo.found, typo.suggestion?.batchNo]).toEqual([null, "TS20260101"]);
    const [other] = checkBatches("ZQKM0101A002", "Trifloxystrobin Technical", b);
    expect(other.otherProduct).toBe(true);
  });

  it("adds up the stock of the batches found", () => {
    expect(availableKg(checkBatches("TS20260101, NOPE", "", b))).toBe(825);
  });
});

describe("MIS checks", () => {
  const masters: MasterNames = {
    customers: ["Example Pesticides"],
    suppliers: ["Sample Industries"],
    products: ["Chlorantraniliprole technical", "Tolfenpyrad Technical"],
  };
  const keys = (r: Record<string, string>, pod: Array<{ name: string }> = []) =>
    checkRow(r, masters, { pod })
      .map((x) => x.key)
      .sort();

  it("a clean row has no issues", () => {
    expect(keys({ customer: "Example Pesticides", supplier: "Sample Industries", productName: "Tolfenpyrad Technical", quantityKgs: "100", status: "PLANNED" })).toEqual([]);
  });

  it("flags names, quantity, dates, POD and dropdown values", () => {
    const ks = keys({
      customer: "Example Pesticides",
      supplier: "Example Pesticides",
      productName: "Chlorantraniliprole Tech",
      quantityKgs: "0",
      status: "DELIVERED",
      actualEtd: "2026-10-10",
      actualEta: "2026-10-08",
      movementType: "Forward Leg",
    });
    for (const k of ["supplier", "productName", "quantityKgs", "actualEta", "pod", "customer", "movementType"]) expect(ks).toContain(k);
  });

  it("flags a shipment that has left without quantity or ETD, and AG to pay above the total", () => {
    const ks = keys({ status: "INTRANSIT", totalLogisticsCost: "1000", logisticsCostAgToPay: "1200", plannedEtd: "2026-10-05", plannedEta: "2026-10-01" });
    expect(ks).toEqual(["actualEtd", "logisticsCostAgToPay", "plannedEta", "quantityKgs"]);
    expect(keys({ status: "DELIVERED", quantityKgs: "5", actualEtd: "2026-10-01", actualEta: "2026-10-03" }, [{ name: "pod.pdf" }])).toEqual([]);
  });

  it("offers one-click fixes", () => {
    const issues = checkRow({ productName: "Chlorantraniliprole Tech", originType: "AG WH" }, masters);
    expect(issues.find((i) => i.key === "productName")?.fix).toBe("Chlorantraniliprole technical");
    expect(issues.find((i) => i.key === "originType")?.fix).toBe("Warehouse");
  });

  it("did-you-mean and dropdown normalisation", () => {
    expect(suggestName("Chlorantraniliprole Tech", masters.products!)).toBe("Chlorantraniliprole technical");
    expect(suggestName("Something Else Entirely", masters.products!)).toBeNull();
    expect(parseMisStatus("In Transit")).toBe("INTRANSIT");
    expect(parseMisStatus("dispatch planned")).toBe("PLANNED");
    expect(normalizeSelect("originType", "AG WH")).toBe("Warehouse");
    expect(normalizeSelect("movementType", "Reverse Leg")).toBe("Reverse");
  });
});

describe("document fields", () => {
  it("reads one file, a list, text or a link; re-upload adds", () => {
    const one = { name: "pod.pdf", key: "pod/2026-10/a-pod.pdf" };
    expect(fileList(one)).toEqual([one]);
    expect(fileList("")).toEqual([]);
    expect(hasFile([])).toBe(false);
    expect(hasFile("LR-123")).toBe(true);
    expect(fileList("https://files.example.com/a/b.pdf")[0].name).toBe("b.pdf");
    const two = addFile(one, { name: "pod v2.pdf", key: "pod/2026-10/b pod.pdf" });
    expect(two.map((f) => f.name)).toEqual(["pod.pdf", "pod v2.pdf"]);
    expect(downloadUrl(two[1])).toBe("/api/files/pod/2026-10/b%20pod.pdf?download=1");
    expect(viewUrl({ name: "x" })).toBeNull();
    expect(viewUrl({ name: "x", url: "https://files.example.com/x" })).toBe("https://files.example.com/x");
    expect(removeFile(two, 0).map((f) => f.name)).toEqual(["pod v2.pdf"]);
    expect(removeFile([one], 0)).toEqual([]);
  });
});

describe("sheet import", () => {
  const rows: unknown[][] = [
    ["Domestic MIS FY 26-27", "", ""],
    [
      "Job No.",
      "PO Date",
      "Customer",
      "Product Name",
      "Quantity (in KGS)",
      "Status",
      "Actual/  Tentative ETD",
      "Origin type",
      "POD",
      "Transit Time (days)",
      "Cx Quote approval time",
      "Tax Invoice Month",
      "Unknown column",
    ],
    ["1201", "05/10/26", "Example Agro", "Thiamethoxam Technical", "1,000", "In Transit", 46300, "AG WH", "POD-1201.pdf", "9", "05/10/2026 14:30", "Oct-26", "x"],
    ["", "not a job", "", "", "", "", "", "", "", "", "", "", ""],
    ["26-01-0671", "2026-01-15", "Old Customer", "", "", "Delivered", "", "", "", "", "", "", ""],
  ];

  it("finds the Job No. header and maps, parses and normalises cells", () => {
    const out = parseMisSheet(rows);
    expect(out.length).toBe(2);
    const [a, b] = out;
    expect(a.values).toMatchObject({
      jobNo: "1201",
      poDate: "2026-10-05",
      customer: "Example Agro",
      quantityKgs: "1,000",
      status: "INTRANSIT",
      actualEtd: "2026-10-05",
      originType: "Warehouse",
      cxQuoteApprovalTime: "2026-10-05T14:30",
      taxInvoiceMonth: "2026-10",
    });
    expect(a.values.transitTimeDays).toBeUndefined();
    expect(a.docs).toEqual({ pod: "POD-1201.pdf" });
    expect(b.values).toMatchObject({ jobNo: "26-01-0671", poDate: "2026-01-15", status: "DELIVERED" });
  });

  it("throws without a Job No. header", () => {
    expect(() => parseMisSheet([["Customer", "Product"]])).toThrow(/Job No\./);
  });

  it("merges only non-blank cells into an existing row", () => {
    expect(mergeImported({ customer: "Kept", batchNo: "B1", source: "fresh-po" }, { customer: "", batchNo: "B2", source: "import" })).toEqual({
      customer: "Kept",
      batchNo: "B2",
      source: "fresh-po",
    });
  });

  it("parses dates, date-times and months leniently", () => {
    expect(coerce("poDate", "8-Jun-28")).toBe("2028-06-08");
    expect(coerce("status", "hold")).toBe("ON_HOLD");
    expect(coerce("status", "Something odd")).toBe("");
    expect(parseDateTime("2026-10-05 9:05 pm")).toBe("2026-10-05T21:05");
    expect(parseDateTime(46300.5)).toBe("2026-10-05T12:00");
    expect(parseMonth("10/2026")).toBe("2026-10");
    expect(parseMonth("October 2026")).toBe("2026-10");
  });
});

describe("list", () => {
  it("orders plain Job Nos. highest first, then old-style ones, then blanks", () => {
    const sorted = sortByJobNo([{ jobNo: "" }, { jobNo: "26-01-0671" }, { jobNo: "9" }, { jobNo: "1201" }, { jobNo: "25-12-0001" }]);
    expect(sorted.map((r) => r.jobNo)).toEqual(["1201", "9", "26-01-0671", "25-12-0001", ""]);
    expect(jobRank(null)).toEqual([2, 0]);
  });

  it("searches job, names, batch, transporter, status label and POC", () => {
    const r = { jobNo: "1201", customer: "Example Agro", batchNo: "XY1", transporterDetails: "Sample Roadways", status: "INTRANSIT", logisticsPoc: "Pat" };
    expect(matchesSearch(r, "in transit")).toBe(true);
    expect(matchesSearch(r, "roadways")).toBe(true);
    expect(matchesSearch(r, "xy1")).toBe(true);
    expect(matchesSearch(r, "pat")).toBe(true);
    expect(matchesSearch(r, "nothing")).toBe(false);
  });
});

describe("values ⇄ database", () => {
  it("converts dates, date-times (IST), decimals and status", () => {
    expect(columnValue("poDate", "2026-10-05")).toEqual(new Date("2026-10-05T00:00:00.000Z"));
    expect(columnValue("cxQuoteApprovalTime", "2026-10-05T14:30")).toEqual(new Date("2026-10-05T09:00:00.000Z"));
    expect(columnValue("quantityKgs", "1,000.50 kg")).toBe(1000.5);
    expect(columnValue("status", "In transit")).toBe("INTRANSIT");
    expect(columnValue("customer", "  ")).toBeNull();
    const v = valuesFromJob({ poDate: new Date("2026-10-05T00:00:00Z"), cxQuoteApprovalTime: new Date("2026-10-05T09:00:00Z"), quantityKgs: { toString: () => "1000.500" } });
    expect([v.poDate, v.cxQuoteApprovalTime, v.quantityKgs, v.customer]).toEqual(["2026-10-05", "2026-10-05T14:30", "1000.5", ""]);
    expect(normaliseValues({ quantityKgs: "1000.50", poDate: "2026-10-05" })).toEqual({ quantityKgs: "1000.5", poDate: "2026-10-05" });
  });

  it("computes ETD − PO Date and transit days", () => {
    expect(computed({ poDate: "2026-10-01", plannedEtd: "2026-10-04", actualEtd: "2026-10-05", actualEta: "2026-10-09" })).toEqual({
      etdMinusPoDate: "3",
      transitTimeDays: "4",
    });
    expect(computed({ actualEtd: "2026-10-05" })).toEqual({ etdMinusPoDate: "", transitTimeDays: "" });
  });
});
