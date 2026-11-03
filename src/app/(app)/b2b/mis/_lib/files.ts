/**
 * Document fields (POD, E-Way Bill…) hold a list of files: re-uploading adds a
 * file, it never replaces one. In the ERP each file is an OpsFile row; imported
 * sheets often hold only a text reference or a link, which is kept as a file
 * with a name (and a url for links). Pure.
 */
export type MisFile = {
  id?: string;
  name: string;
  /** Storage key (served by /api/files/<key>). */
  key?: string | null;
  /** External link. */
  url?: string | null;
  at?: string;
};

type Loose = MisFile | string | null | undefined | Loose[];

/** Every file in a document field value (a list, one file, plain text or a link). */
export function fileList(v: Loose): MisFile[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.flatMap(fileList);
  if (typeof v === "object") return v.name || v.url || v.key ? [v] : [];
  const s = String(v).trim();
  if (!s) return [];
  if (/^(https?:\/\/|www\.)/i.test(s)) {
    const url = s.startsWith("http") ? s : `https://${s}`;
    let name = "View file";
    try {
      const p = new URL(url).pathname.split("/").filter(Boolean).pop();
      if (p) name = decodeURIComponent(p);
    } catch {
      // keep the generic name
    }
    return [{ name, url }];
  }
  return [{ name: s }];
}

export const hasFile = (v: Loose) => fileList(v).length > 0;
export const fileNames = (v: Loose) => fileList(v).map((f) => f.name || "File").join(", ");

const keyPath = (key: string) => key.split("/").map(encodeURIComponent).join("/");
/** Open in the browser (null when only a name was recorded). */
export const viewUrl = (f: MisFile) => (f.key ? `/api/files/${keyPath(f.key)}` : f.url || null);
/** Save to the computer. */
export const downloadUrl = (f: MisFile) => (f.key ? `/api/files/${keyPath(f.key)}?download=1` : f.url || null);

/** A field value with one more file added. */
export const addFile = (v: Loose, f: MisFile) => [...fileList(v), f];
/** A field value without the file at index i. */
export const removeFile = (v: Loose, i: number) => fileList(v).filter((_, j) => j !== i);
