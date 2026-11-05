"use client";

import { Fragment, useActionState, useMemo, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormGrid, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import type { ActionState } from "@/lib/forms";
import { monthLabel } from "../_gl/ledger";

export function NewBudgetForm({
  action,
  years,
  dimensions,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  years: Array<{ id: string; name: string }>;
  dimensions: Array<{ code: string; name: string; values: Array<{ code: string; name: string; isActive: boolean }> }>;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const err = state?.fieldErrors ?? {};
  return (
    <Card>
      <CardHeader title="New G/L Budget" />
      <CardBody>
        <form action={formAction} className="space-y-4">
          <FormMessage state={state} />
          <FormGrid className="lg:grid-cols-4">
            <Field label="Name" htmlFor="name" required errors={err.name}>
              <Input id="name" name="name" required placeholder="e.g. Operating budget" />
            </Field>
            <Field label="Financial year" htmlFor="fiscalYearId" required errors={err.fiscalYearId}>
              <Select id="fiscalYearId" name="fiscalYearId" required defaultValue={years[0]?.id}>
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Dimension filter" htmlFor="dimension" hint="Optional: budget one division, department…">
              <Select id="dimension" name="dimension" defaultValue="">
                <option value="">Whole company</option>
                {dimensions.map((d) => (
                  <optgroup key={d.code} label={d.name}>
                    {d.values
                      .filter((v) => v.isActive)
                      .map((v) => (
                        <option key={v.code} value={`${d.code}=${v.code}`}>
                          {d.name}: {v.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </Select>
            </Field>
            <Field label="Notes" htmlFor="notes">
              <Textarea id="notes" name="notes" rows={1} />
            </Field>
          </FormGrid>
          <div className="flex justify-end">
            <SubmitButton>Create budget</SubmitButton>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

type GridAccount = { id: string; code: string; name: string; type: "INCOME" | "EXPENSE" | string };

export function BudgetGrid({
  action,
  accounts,
  months,
  initial,
  readOnly,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  accounts: GridAccount[];
  months: string[];
  /** accountId → month → amount */
  initial: Record<string, Record<string, number>>;
  readOnly?: boolean;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const [values, setValues] = useState<Record<string, Record<string, string>>>(() =>
    Object.fromEntries(Object.entries(initial).map(([a, m]) => [a, Object.fromEntries(Object.entries(m).map(([k, v]) => [k, String(v)]))])),
  );
  const [dirty, setDirty] = useState(false);
  const cell = (a: string, m: string) => Number(values[a]?.[m] ?? 0) || 0;
  const set = (a: string, m: string, v: string) => {
    setDirty(true);
    setValues((cur) => ({ ...cur, [a]: { ...(cur[a] ?? {}), [m]: v } }));
  };
  /** Spread an annual figure evenly over 12 months (whole rupees, remainder in March). */
  const spread = (a: string, total: number) => {
    const each = Math.floor(total / 12);
    setDirty(true);
    setValues((cur) => ({ ...cur, [a]: Object.fromEntries(months.map((m, i) => [m, String(i === 11 ? total - each * 11 : each)])) }));
  };

  const payload = useMemo(
    () => JSON.stringify(accounts.flatMap((a) => months.map((m) => ({ accountId: a.id, month: m, amount: Number(values[a.id]?.[m] ?? 0) || 0 }))).filter((c) => c.amount !== 0)),
    [accounts, months, values],
  );

  const groups = (["INCOME", "EXPENSE"] as const).map((t) => ({ type: t, rows: accounts.filter((a) => a.type === t) }));
  const typeTotal = (t: string, m?: string) =>
    accounts.filter((a) => a.type === t).reduce((s, a) => s + (m ? cell(a.id, m) : months.reduce((x, mm) => x + cell(a.id, mm), 0)), 0);

  return (
    <form action={(fd) => { setDirty(false); return formAction(fd); }} className="space-y-3">
      <input type="hidden" name="cells" value={payload} />
      <FormMessage state={dirty ? undefined : state} />
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="min-w-full text-xs">
          <thead className="bg-muted/60">
            <tr className="text-left font-semibold uppercase tracking-wide text-ink-soft">
              <th className="sticky left-0 z-10 min-w-56 bg-muted px-3 py-2">Account</th>
              {months.map((m) => (
                <th key={m} className="px-1.5 py-2 text-right">
                  {monthLabel(m)}
                </th>
              ))}
              <th className="px-3 py-2 text-right">Year</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {groups.map((g) => (
              <Fragment key={g.type}>
              <tr className="bg-muted/30">
                <td colSpan={months.length + 2} className="sticky left-0 px-3 py-1.5 font-semibold uppercase tracking-wide text-ink-soft">
                  {g.type === "INCOME" ? "Income" : "Expenses"}
                </td>
              </tr>
              {g.rows.map((a) => {
                const year = months.reduce((s, m) => s + cell(a.id, m), 0);
                return (
                  <tr key={a.id}>
                    <td className="sticky left-0 z-10 bg-surface px-3 py-1 text-ink">
                      <span className="tabular-nums text-ink-soft">{a.code}</span> {a.name}
                    </td>
                    {months.map((m) => (
                      <td key={m} className="px-0.5 py-0.5">
                        <input
                          aria-label={`${a.name} ${monthLabel(m)}`}
                          type="number"
                          step="1"
                          value={values[a.id]?.[m] ?? ""}
                          onChange={(e) => set(a.id, m, e.target.value)}
                          readOnly={readOnly}
                          className="h-7 w-24 rounded border border-transparent bg-transparent px-1.5 text-right tabular-nums text-ink hover:border-line focus:border-brand-500 focus:outline-none"
                        />
                      </td>
                    ))}
                    <td className="px-3 py-1 text-right font-medium tabular-nums">
                      {readOnly ? (
                        formatMoney(year)
                      ) : (
                        <button
                          type="button"
                          title="Click to spread a new annual amount evenly"
                          onClick={() => {
                            const v = window.prompt(`Annual budget for ${a.name} (spread evenly over 12 months)`, String(year));
                            if (v !== null && Number.isFinite(Number(v))) spread(a.id, Math.round(Number(v)));
                          }}
                          className="hover:text-brand-700 hover:underline"
                        >
                          {formatMoney(year)}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-muted/40 font-semibold">
                <td className="sticky left-0 z-10 bg-muted px-3 py-1.5">Total {g.type === "INCOME" ? "income" : "expenses"}</td>
                {months.map((m) => (
                  <td key={m} className="px-1.5 py-1.5 text-right tabular-nums">
                    {formatMoney(typeTotal(g.type, m)).replace(/\.00$/, "")}
                  </td>
                ))}
                <td className="px-3 py-1.5 text-right tabular-nums">{formatMoney(typeTotal(g.type))}</td>
              </tr>
              </Fragment>
            ))}
            <tr className="font-semibold">
              <td className="sticky left-0 z-10 bg-surface px-3 py-2">Net profit</td>
              {months.map((m) => {
                const net = typeTotal("INCOME", m) - typeTotal("EXPENSE", m);
                return (
                  <td key={m} className={cn("px-1.5 py-2 text-right tabular-nums", net < 0 && "text-red-600")}>
                    {formatMoney(net).replace(/\.00$/, "")}
                  </td>
                );
              })}
              <td className="px-3 py-2 text-right tabular-nums">{formatMoney(typeTotal("INCOME") - typeTotal("EXPENSE"))}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <div className="flex items-center justify-end gap-3">
          {dirty && <span className="text-xs text-amber-600">Unsaved changes</span>}
          <SubmitButton>Save budget</SubmitButton>
        </div>
      )}
    </form>
  );
}
