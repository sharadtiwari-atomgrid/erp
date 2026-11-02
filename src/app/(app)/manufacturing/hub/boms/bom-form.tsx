"use client";

import { useActionState, useMemo, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormGrid, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatMoney, formatNumber } from "@/lib/format";
import type { ActionState } from "@/lib/forms";
import { bomCostRollup } from "../../_lib/bom-math";
import type { MachineOption, MfgProductOption } from "../../_lib/options";

export type BomFormValues = {
  productId: string;
  version: number;
  outputQty: number;
  isDefault: boolean;
  isActive: boolean;
  notes: string | null;
  lines: Array<{ componentId: string; quantity: number; scrapPct: number }>;
  operations: Array<{ sequence: number; name: string; machineId: string | null; setupHours: number; runHoursPerUnit: number }>;
};

type LineRow = { key: number; componentId: string; quantity: string; scrapPct: string };
type OpRow = { key: number; sequence: string; name: string; machineId: string; setupHours: string; runHoursPerUnit: string };

let nextKey = 1;
const lineRow = (l?: BomFormValues["lines"][number]): LineRow => ({
  key: nextKey++,
  componentId: l?.componentId ?? "",
  quantity: String(l?.quantity ?? 1),
  scrapPct: String(l?.scrapPct ?? 0),
});
const opRow = (o?: Partial<BomFormValues["operations"][number]>): OpRow => ({
  key: nextKey++,
  sequence: String(o?.sequence ?? 10),
  name: o?.name ?? "",
  machineId: o?.machineId ?? "",
  setupHours: String(o?.setupHours ?? 0),
  runHoursPerUnit: String(o?.runHoursPerUnit ?? 0),
});

const cell = "px-2 py-2";
const head = "px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-soft";

export function BomForm({
  action,
  initial,
  products,
  components,
  machines,
  cancelHref,
  versionsByProduct,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial?: BomFormValues;
  products: MfgProductOption[];
  components: MfgProductOption[];
  machines: MachineOption[];
  cancelHref: string;
  /** Highest existing version per product, to suggest the next one for a new BOM. */
  versionsByProduct?: Record<string, number>;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const err = state?.fieldErrors ?? {};
  const [productId, setProductId] = useState(initial?.productId ?? "");
  const [version, setVersion] = useState(String(initial?.version ?? 1));
  const [outputQty, setOutputQty] = useState(String(initial?.outputQty ?? 1));
  const [lines, setLines] = useState<LineRow[]>(() => (initial?.lines.length ? initial.lines.map(lineRow) : [lineRow()]));
  const [ops, setOps] = useState<OpRow[]>(() => (initial?.operations.length ? initial.operations.map(opRow) : []));

  const componentById = useMemo(() => new Map(components.map((c) => [c.id, c])), [components]);
  const machineById = useMemo(() => new Map(machines.map((m) => [m.id, m])), [machines]);

  const lineData = lines
    .filter((l) => l.componentId)
    .map((l) => ({ componentId: l.componentId, quantity: Number(l.quantity) || 0, scrapPct: Number(l.scrapPct) || 0 }));
  const opData = ops.map((o) => ({
    sequence: Number(o.sequence) || 0,
    name: o.name,
    machineId: o.machineId || null,
    setupHours: Number(o.setupHours) || 0,
    runHoursPerUnit: Number(o.runHoursPerUnit) || 0,
  }));
  const rollup = bomCostRollup({
    outputQty: Number(outputQty) || 1,
    lines: lineData.map((l) => ({ ...l, unitCost: componentById.get(l.componentId)?.purchasePrice ?? 0 })),
    operations: opData.map((o) => ({ ...o, hourlyCost: o.machineId ? (machineById.get(o.machineId)?.hourlyCost ?? 0) : 0 })),
  });
  const unit = products.find((p) => p.id === productId)?.unit ?? "units";

  const updateLine = (key: number, patch: Partial<LineRow>) => setLines((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const updateOp = (key: number, patch: Partial<OpRow>) => setOps((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <form action={formAction} className="space-y-6">
      <FormMessage state={state} />
      <input type="hidden" name="lines" value={JSON.stringify(lineData)} />
      <input type="hidden" name="operations" value={JSON.stringify(opData)} />

      <Card>
        <CardHeader title="Bill of materials" />
        <CardBody>
          <FormGrid className="sm:grid-cols-3">
            <Field label="Product" htmlFor="productId" required errors={err.productId} className="sm:col-span-3">
              <Select
                id="productId"
                name="productId"
                value={productId}
                required
                onChange={(e) => {
                  setProductId(e.target.value);
                  if (!initial && versionsByProduct) setVersion(String((versionsByProduct[e.target.value] ?? 0) + 1));
                }}
              >
                <option value="">Select a manufactured item…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} — {p.name} ({p.supplyMode})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Version" htmlFor="version" required errors={err.version}>
              <Input id="version" name="version" type="number" min="1" value={version} onChange={(e) => setVersion(e.target.value)} required />
            </Field>
            <Field label="Output quantity" htmlFor="outputQty" required errors={err.outputQty} hint={`Component quantities are per this many ${unit}`}>
              <Input id="outputQty" name="outputQty" type="number" min="0.001" step="any" value={outputQty} onChange={(e) => setOutputQty(e.target.value)} required />
            </Field>
            <div className="flex flex-col justify-end gap-2 pb-2">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" name="isDefault" defaultChecked={initial?.isDefault ?? true} className="h-4 w-4 rounded border-line" />
                Default BOM for this product
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" name="isActive" defaultChecked={initial?.isActive ?? true} className="h-4 w-4 rounded border-line" />
                Active
              </label>
            </div>
            <Field label="Notes" htmlFor="notes" errors={err.notes} className="sm:col-span-3">
              <Textarea id="notes" name="notes" defaultValue={initial?.notes ?? ""} rows={2} />
            </Field>
          </FormGrid>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Components" description="Quantity per output quantity; scrap % is added on top when consuming." />
        <CardBody>
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="min-w-full divide-y divide-line text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th className={head}>Component</th>
                  <th className={`${head} w-28 text-right`}>Qty</th>
                  <th className={`${head} w-24 text-right`}>Scrap %</th>
                  <th className={`${head} w-32 text-right`}>Cost</th>
                  <th className="w-10" aria-label="Remove" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {lines.map((row) => {
                  const c = componentById.get(row.componentId);
                  const idx = lines.filter((l) => l.componentId).indexOf(row);
                  return (
                    <tr key={row.key}>
                      <td className={`${cell} min-w-64`}>
                        <Select value={row.componentId} onChange={(e) => updateLine(row.key, { componentId: e.target.value })} aria-label="Component">
                          <option value="">Select a component…</option>
                          {components
                            .filter((p) => p.id !== productId)
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.sku} — {p.name}
                              </option>
                            ))}
                        </Select>
                      </td>
                      <td className={cell}>
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          className="text-right"
                          value={row.quantity}
                          onChange={(e) => updateLine(row.key, { quantity: e.target.value })}
                          aria-label="Quantity"
                        />
                        {c && <p className="mt-1 text-right text-xs text-ink-faint">{c.unit}</p>}
                      </td>
                      <td className={cell}>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          className="text-right"
                          value={row.scrapPct}
                          onChange={(e) => updateLine(row.key, { scrapPct: e.target.value })}
                          aria-label="Scrap percent"
                        />
                      </td>
                      <td className={`${cell} pt-4 text-right tabular-nums`}>{idx >= 0 ? formatMoney(rollup.lines[idx]?.cost ?? 0) : "—"}</td>
                      <td className={`${cell} text-center`}>
                        <button
                          type="button"
                          onClick={() => setLines((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== row.key) : rs))}
                          disabled={lines.length === 1}
                          className="rounded p-1 text-ink-faint hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                          aria-label="Remove component"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => setLines((rs) => [...rs, lineRow()])}>
            + Add component
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Operations" description="Routing steps in sequence. The scheduler books each step on its machine." />
        <CardBody>
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="min-w-full divide-y divide-line text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th className={`${head} w-20`}>Seq</th>
                  <th className={head}>Operation</th>
                  <th className={head}>Machine</th>
                  <th className={`${head} w-24 text-right`}>Setup h</th>
                  <th className={`${head} w-28 text-right`}>Run h / unit</th>
                  <th className={`${head} w-28 text-right`}>Cost</th>
                  <th className="w-10" aria-label="Remove" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {ops.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-sm text-ink-faint">
                      No operations. Orders for this BOM can&apos;t be auto-scheduled until you add some.
                    </td>
                  </tr>
                )}
                {ops.map((row, i) => (
                  <tr key={row.key}>
                    <td className={cell}>
                      <Input type="number" min="0" step="1" value={row.sequence} onChange={(e) => updateOp(row.key, { sequence: e.target.value })} aria-label="Sequence" />
                    </td>
                    <td className={`${cell} min-w-48`}>
                      <Input value={row.name} onChange={(e) => updateOp(row.key, { name: e.target.value })} placeholder="e.g. Frame welding" aria-label="Operation name" />
                    </td>
                    <td className={`${cell} min-w-48`}>
                      <Select value={row.machineId} onChange={(e) => updateOp(row.key, { machineId: e.target.value })} aria-label="Machine">
                        <option value="">No machine</option>
                        {machines.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.code} — {m.name}
                            {m.status !== "ACTIVE" ? ` (${m.status.toLowerCase()})` : ""}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className={cell}>
                      <Input type="number" min="0" step="any" className="text-right" value={row.setupHours} onChange={(e) => updateOp(row.key, { setupHours: e.target.value })} aria-label="Setup hours" />
                    </td>
                    <td className={cell}>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        className="text-right"
                        value={row.runHoursPerUnit}
                        onChange={(e) => updateOp(row.key, { runHoursPerUnit: e.target.value })}
                        aria-label="Run hours per unit"
                      />
                    </td>
                    <td className={`${cell} pt-4 text-right tabular-nums`}>{formatMoney(rollup.operations[i]?.cost ?? 0)}</td>
                    <td className={`${cell} text-center`}>
                      <button
                        type="button"
                        onClick={() => setOps((rs) => rs.filter((r) => r.key !== row.key))}
                        className="rounded p-1 text-ink-faint hover:bg-red-50 hover:text-red-600"
                        aria-label="Remove operation"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => setOps((rs) => [...rs, opRow({ sequence: (Math.max(0, ...rs.map((r) => Number(r.sequence) || 0)) || 0) + 10 })])}
          >
            + Add operation
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Cost roll-up" description="Components at purchase price plus machine time at hourly cost, for one BOM run." />
        <CardBody>
          <dl className="ml-auto w-full max-w-sm space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-soft">Components</dt>
              <dd className="tabular-nums">{formatMoney(rollup.componentCost)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-soft">Machine time</dt>
              <dd className="tabular-nums">{formatMoney(rollup.machineCost)}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-1 font-semibold">
              <dt>Total for {formatNumber(Number(outputQty) || 1)} {unit}</dt>
              <dd className="tabular-nums">{formatMoney(rollup.total)}</dd>
            </div>
            <div className="flex justify-between text-ink-soft">
              <dt>Per unit</dt>
              <dd className="tabular-nums">{formatMoney(rollup.perUnit)}</dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      <div className="flex justify-end gap-2">
        <ButtonLink href={cancelHref} variant="secondary">
          Cancel
        </ButtonLink>
        <SubmitButton>Save BOM</SubmitButton>
      </div>
    </form>
  );
}
