/**
 * Fresh PO workflow rules: completeness per phase, stage derivation and the
 * computed Total Taxable Value. Pure functions, safe on client and server.
 */
import { parseNumber } from "@/lib/ops/dates";
import { PHASE_ORDER, PHASES, SECTIONS, STAGE_ORDER, type FieldDef, type Phase, type Stage } from "./fields";

/** A PO as plain text values keyed by field (what the form edits). */
export type PoValues = Record<string, string | null | undefined>;

const filled = (v: unknown) => String(v ?? "").trim() !== "";

/** Required, user-entered fields of a phase. */
export function requiredFields(phase: Phase): FieldDef[] {
  return SECTIONS.find((s) => s.phase === phase)?.fields.filter((f) => f.req && !f.auto) ?? [];
}

export function missingFor(phase: Phase, entry: PoValues): string[] {
  return requiredFields(phase)
    .filter((f) => !filled(entry[f.key]))
    .map((f) => f.key);
}

export function phaseComplete(phase: Phase, entry: PoValues): boolean {
  return missingFor(phase, entry).length === 0;
}

export function allMissing(entry: PoValues): Record<Phase, string[]> {
  return { demand: missingFor("demand", entry), supply: missingFor("supply", entry), logistics: missingFor("logistics", entry) };
}

export function allComplete(entry: PoValues): boolean {
  return PHASE_ORDER.every((p) => phaseComplete(p, entry));
}

/** Missing fields of this phase and every earlier one, in form order (what an advance button checks). */
export function missingUpTo(phase: Phase, entry: PoValues): string[] {
  const idx = PHASE_ORDER.indexOf(phase);
  return PHASE_ORDER.slice(0, idx + 1).flatMap((p) => missingFor(p, entry));
}

/** The stage, computed purely from which required fields are filled. */
export function deriveStage(entry: PoValues): Stage {
  if (!phaseComplete("demand", entry)) return "DEMAND_PENDING";
  if (!phaseComplete("supply", entry)) return "SUPPLY_PENDING";
  if (!phaseComplete("logistics", entry)) return "LOGISTICS_PENDING";
  return "READY";
}

/** The earlier of two stages. */
export function earlierStage(a: Stage, b: Stage): Stage {
  return STAGE_ORDER.indexOf(a) <= STAGE_ORDER.indexOf(b) ? a : b;
}

/** The stage an advance button moves the PO to. */
export function stageAfter(phase: Phase): Stage {
  return PHASES[phase].nextStage;
}

/** Ready to move to Domestic MIS: stage READY and every phase complete. */
export function canMoveToMis(stage: Stage, entry: PoValues): boolean {
  return stage === "READY" && allComplete(entry);
}

/** Total Taxable Value = Qty to dispatch × Rate, rounded to 0.1; "" when either is missing. */
export function computeTotal(qtyToDispatch: unknown, rate: unknown): string {
  const q = parseNumber(qtyToDispatch);
  const r = parseNumber(rate);
  if (!q || !r) return "";
  return String(Math.round(q * r * 10) / 10);
}

/** A new, empty PO with the source's defaults. */
export function blankEntry(): Record<string, string> {
  const e: Record<string, string> = {};
  for (const s of SECTIONS) for (const f of s.fields) e[f.key] = "";
  e.businessLeg = "B2B";
  e.movementType = "Forward";
  return e;
}
