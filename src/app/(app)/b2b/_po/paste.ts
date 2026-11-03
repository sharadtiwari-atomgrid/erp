/**
 * "Paste from email": reads a PO table copied from an email into form fields.
 * Lines are "Label<TAB>value" or "Label: value"; any other non-blank line
 * continues the previous value, joined with " · ". Pure.
 */
import { normKey, PASTE_KEY_MAP } from "./fields";

export function parsePaste(text: string): Record<string, string> {
  const pairs: Array<[string, string]> = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.includes("\t")) {
      const i = line.indexOf("\t");
      pairs.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
    } else if (/^[^:]{2,40}:\s+/.test(line)) {
      const i = line.indexOf(":");
      pairs.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
    } else if (pairs.length && line.trim()) {
      const last = pairs[pairs.length - 1];
      last[1] = last[1] ? `${last[1]} · ${line.trim()}` : line.trim();
    }
  }
  const out: Record<string, string> = {};
  for (const [label, value] of pairs) {
    const key = PASTE_KEY_MAP[normKey(label)];
    if (key && value) out[key] = value;
  }
  return out;
}
