"use client";

/**
 * Reads a supplier COA file in the browser: no AI, no API key.
 *   PDF with a text layer → pdf.js text positions → parseCOA
 *   scanned PDF / photo   → page image → Tesseract OCR (straightened) + ruled lines → parseCOA
 * Libraries load from public CDNs on first use (Tesseract also downloads its English data once, ~10 MB).
 */
import { prepareScan } from "./image";
import { parseCOA, type ParsedCOA, type TextItem } from "./parse";

const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const TESSERACT = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
const H2P = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";

/* Minimal shapes of the CDN libraries we use. */
type PdfTextItem = { str: string; transform: number[]; width: number; height: number };
type PdfViewport = { width: number; height: number };
type PdfPage = {
  getViewport(o: { scale: number }): PdfViewport;
  getTextContent(): Promise<{ items: PdfTextItem[] }>;
  render(o: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }): { promise: Promise<void> };
};
type PdfJs = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(o: { data: Uint8Array }): { promise: Promise<{ numPages: number; getPage(n: number): Promise<PdfPage> }> };
};
type OcrWord = { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } };
type OcrWorker = {
  setParameters(p: Record<string, string>): Promise<unknown>;
  recognize(img: HTMLCanvasElement, opts: Record<string, unknown>, out: Record<string, boolean>): Promise<{ data: { words?: OcrWord[]; rotateRadians?: number } }>;
};
type TesseractLib = { createWorker(lang: string): Promise<OcrWorker> };
type Html2Pdf = () => { set(o: Record<string, unknown>): { from(el: HTMLElement): { outputPdf(kind: "blob"): Promise<Blob> } } };

type Status = (message: string) => void;
export type ReadPage = { page: number; method: string; conf?: number; parsed: ParsedCOA };

const loaded: Record<string, Promise<unknown>> = {};
function loadScript<T>(src: string, global: string): Promise<T> {
  const w = window as unknown as Record<string, unknown>;
  if (w[global]) return Promise.resolve(w[global] as T);
  loaded[src] ||= new Promise((ok, no) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => (w[global] ? ok(w[global]) : no(new Error(`${global} didn't load`)));
    s.onerror = () => {
      delete loaded[src];
      no(new Error("A reading library didn't load. Check the internet connection and try again."));
    };
    document.head.appendChild(s);
  });
  return loaded[src] as Promise<T>;
}

let workerP: Promise<OcrWorker> | null = null;
async function ocrWorker(status?: Status): Promise<OcrWorker> {
  if (!workerP) {
    workerP = (async () => {
      const T = await loadScript<TesseractLib>(TESSERACT, "Tesseract");
      status?.("Starting text recognition (first time downloads ~10 MB)…");
      const w = await T.createWorker("eng");
      await w.setParameters({ preserve_interword_spaces: "1" });
      return w;
    })().catch((e) => {
      workerP = null;
      throw e;
    });
  }
  return workerP;
}

/** OCR one page image (canvas) → parsed COA. Straightens it, reads the words, finds the ruled lines. */
async function ocrCanvas(canvas: HTMLCanvasElement, status?: Status) {
  const w = await ocrWorker(status);
  status?.("Reading the scan (text recognition)…");
  const { data } = await w.recognize(canvas, { rotateAuto: true }, { blocks: true, text: true });
  const words = data.words || [];
  const items: TextItem[] = words
    .filter((x) => x.text && x.text.trim())
    .map((x) => ({ str: x.text, x: x.bbox.x0, y: x.bbox.y0, w: x.bbox.x1 - x.bbox.x0, h: x.bbox.y1 - x.bbox.y0, page: 1, conf: x.confidence }));
  status?.("Finding the table lines…");
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const { rules } = prepareScan(ctx.getImageData(0, 0, canvas.width, canvas.height), { textAngle: -(data.rotateRadians || 0) });
  const conf = items.length ? Math.round(items.reduce((a, b) => a + (b.conf ?? 0), 0) / items.length) : 0;
  return { parsed: parseCOA(items, { rules }), conf };
}

/** Scans read best at roughly 2,000–2,600 px wide. */
function sized(width: number, height: number) {
  const target = 2400, s = Math.min(3, Math.max(1, target / Math.max(width, 1)));
  return Math.min(s, 4200 / Math.max(height, 1));
}

function whiteCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width);
  canvas.height = Math.round(height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

async function readPdf(file: File, status?: Status): Promise<ReadPage[]> {
  const lib = await loadScript<PdfJs>(PDFJS, "pdfjsLib");
  lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out: ReadPage[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    status?.(`Page ${p} of ${doc.numPages}…`);
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const items: TextItem[] = tc.items
      .filter((it) => it.str && it.str.trim())
      .map((it) => {
        const [, , c, d, e, f] = it.transform;
        const h = Math.hypot(c, d) || it.height || 10;
        return { str: it.str, x: e, y: vp.height - f - h, w: it.width, h, page: 1 };
      });
    if (items.reduce((a, it) => a + it.str.trim().length, 0) >= 40) {
      out.push({ page: p, method: "PDF text", parsed: parseCOA(items) });
      continue;
    }
    // No text layer: a scanned page.
    const view = page.getViewport({ scale: sized(vp.width, vp.height) });
    const { canvas, ctx } = whiteCanvas(view.width, view.height);
    await page.render({ canvasContext: ctx, viewport: view }).promise;
    const r = await ocrCanvas(canvas, (m) => status?.(`Page ${p} of ${doc.numPages}: ${m}`));
    out.push({ page: p, method: "Scan (text recognition)", conf: r.conf, parsed: r.parsed });
  }
  return out;
}

async function readImage(file: File, status?: Status): Promise<ReadPage[]> {
  const bmp = await createImageBitmap(file);
  const scale = sized(bmp.width, bmp.height);
  const { canvas, ctx } = whiteCanvas(bmp.width * scale, bmp.height * scale);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const r = await ocrCanvas(canvas, status);
  return [{ page: 1, method: "Photo (text recognition)", conf: r.conf, parsed: r.parsed }];
}

/** File → one entry per page (a page per batch is common). */
export async function readCOAFile(file: File, status?: Status): Promise<ReadPage[]> {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (isPdf) return readPdf(file, status);
  if (/^image\//.test(file.type) || /\.(png|jpe?g|webp|bmp|gif|tiff?)$/i.test(file.name)) return readImage(file, status);
  throw new Error("Use a PDF or an image (JPG, PNG, WEBP).");
}

/** The COA sheets (A4 elements) → one PDF Blob. Only the sheets are copied (no page checkboxes). */
export async function sheetsToPdf(sheets: HTMLElement[], filename: string): Promise<Blob> {
  const html2pdf = await loadScript<Html2Pdf>(H2P, "html2pdf");
  const box = document.createElement("div");
  box.style.cssText = "position:fixed;left:-10000px;top:0;width:210mm;background:#fff";
  sheets.forEach((el, i) => {
    const c = el.cloneNode(true) as HTMLElement;
    c.style.boxShadow = "none";
    c.style.margin = "0";
    if (i) {
      c.style.breakBefore = "page";
      c.classList.add("coa-break");
    }
    box.appendChild(c);
  });
  document.body.appendChild(box);
  try {
    return await html2pdf()
      .set({
        margin: 0,
        filename,
        image: { type: "jpeg", quality: 0.96 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css"], before: ".coa-break" },
      })
      .from(box)
      .outputPdf("blob");
  } finally {
    box.remove();
  }
}
