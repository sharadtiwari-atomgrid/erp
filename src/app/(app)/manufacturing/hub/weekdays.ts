const NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** [1,2,3,4,5,6] → "Mon–Sat"; [1,3,5] → "Mon, Wed, Fri". */
export function formatWeekdays(days: number[]): string {
  const sorted = [...new Set(days)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  if (sorted.length === 0) return "—";
  if (sorted.length === 7) return "Every day";
  const contiguous = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (contiguous && sorted.length > 2) return `${NAMES[sorted[0]]}–${NAMES[sorted.at(-1)!]}`;
  return sorted.map((d) => NAMES[d]).join(", ");
}
