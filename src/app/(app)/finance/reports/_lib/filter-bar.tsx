import type { ReactNode } from "react";
import { buttonClass } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { DIMENSION_PARAM, type FilterOptions, type ReportFilters } from "./data";

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-ink-soft">
      {label}
      {children}
    </label>
  );
}

/** GET form with the report filters; works without JavaScript. */
export function ReportFilterBar({
  filters,
  options,
  mode = "range",
  showZeroToggle = false,
  children,
}: {
  filters: ReportFilters;
  options: FilterOptions;
  /** "range" shows from/to; "asOn" shows a single date. */
  mode?: "range" | "asOn";
  showZeroToggle?: boolean;
  children?: ReactNode;
}) {
  return (
    <form className="flex flex-wrap items-end gap-3 border-b border-line px-4 py-3 print:hidden" role="search">
      {mode === "range" ? (
        <>
          <Labelled label="From">
            <Input type="date" name="from" defaultValue={filters.from} className="w-40" />
          </Labelled>
          <Labelled label="To">
            <Input type="date" name="to" defaultValue={filters.to} className="w-40" />
          </Labelled>
        </>
      ) : (
        <Labelled label="As on">
          <Input type="date" name="asOn" defaultValue={filters.asOn} className="w-40" />
        </Labelled>
      )}
      <Labelled label="Branch">
        <Select name="branch" defaultValue={filters.branchId ?? ""} disabled={options.branchLocked} className="w-44">
          <option value="">All branches</option>
          {options.branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
      </Labelled>
      {options.dimensions.map((d) => (
        <Labelled key={d.code} label={d.name}>
          <Select name={`${DIMENSION_PARAM}${d.code}`} defaultValue={filters.dimensions[d.code] ?? ""} className="w-36">
            <option value="">All</option>
            {d.values.map((v) => (
              <option key={v.code} value={v.code}>
                {v.name}
              </option>
            ))}
          </Select>
        </Labelled>
      ))}
      {showZeroToggle && (
        <Labelled label="Zero balances">
          <Select name="hideZero" defaultValue={filters.hideZero ? "1" : "0"} className="w-28">
            <option value="1">Hide</option>
            <option value="0">Show</option>
          </Select>
        </Labelled>
      )}
      {children}
      <button type="submit" className={buttonClass("secondary")}>
        Apply
      </button>
    </form>
  );
}
