/**
 * Image clean-up for scanned / photographed COAs, before OCR. Works on canvas
 * pixels ({ data: RGBA, width, height }) so it runs in the browser and in tests.
 *   prepareScan(img) → { img: straightened copy (ruled lines erased when asked),
 *                        rules: { h: [{ y, x0, x1, ya, yb }], v: [{ x, y0, y1 }] }, angle }
 * The ruled lines give the table's rows (parse.ts), so a row doesn't depend on
 * OCR reading its serial number; erasing them stops OCR dropping text that touches them.
 */
import type { HRule } from "./parse";

export type Pixels = { data: Uint8ClampedArray; width: number; height: number };

function grayOf({ data, width, height }: Pixels): Uint8Array {
  const g = new Uint8Array(width * height);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
  return g;
}

/** Otsu's threshold → 1 = ink. */
export function binarize(g: Uint8Array): Uint8Array {
  const hist = new Array<number>(256).fill(0);
  for (const v of g) hist[v]++;
  const total = g.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, t = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF, v = wB * wF * (mB - mF) ** 2;
    if (v > best) { best = v; t = i; }
  }
  const b = new Uint8Array(g.length);
  for (let i = 0; i < g.length; i++) b[i] = g[i] <= t ? 1 : 0;
  return b;
}

/** Page tilt in radians: the angle whose row profile of ink is sharpest (text lines line up). */
export function skewAngle(bin: Uint8Array, w: number, h: number): number {
  const step = Math.max(1, Math.round(Math.max(w, h) / 900));
  const pts: number[] = [];
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) if (bin[y * w + x]) pts.push(x, y);
  const score = (a: number) => {
    const t = Math.tan(a), rows = new Map<number, number>();
    for (let i = 0; i < pts.length; i += 2) {
      const r = Math.round((pts[i + 1] - pts[i] * t) / step);
      rows.set(r, (rows.get(r) || 0) + 1);
    }
    let s = 0;
    for (const v of rows.values()) s += v * v;
    return s;
  };
  let best = 0, bs = -1;
  for (let d = -6; d <= 6.001; d += 0.25) { const s = score((d * Math.PI) / 180); if (s > bs) { bs = s; best = d; } }
  for (let d = best - 0.25; d <= best + 0.25; d += 0.05) { const s = score((d * Math.PI) / 180); if (s > bs) { bs = s; best = d; } }
  return (best * Math.PI) / 180;
}

/** Rotates by -angle (undoing the tilt), white background. */
export function rotate({ data, width: w, height: h }: Pixels, angle: number): Pixels {
  const out = new Uint8ClampedArray(data.length).fill(255);
  const c = Math.cos(angle), s = Math.sin(angle), cx = w / 2, cy = h / 2;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      // source = R(angle) · (dest - centre)
      const sx = Math.round(c * (x - cx) - s * (y - cy) + cx), sy = Math.round(s * (x - cx) + c * (y - cy) + cy);
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      const i = (y * w + x) * 4, j = (sy * w + sx) * 4;
      out[i] = data[j]; out[i + 1] = data[j + 1]; out[i + 2] = data[j + 2]; out[i + 3] = 255;
    }
  return { data: out, width: w, height: h };
}

type Run = { n0: number; n1: number; a: number; b: number };

/**
 * Long straight runs of ink. A pixel counts when it or a neighbour across the line is ink,
 * so slightly wavy (photographed) lines still read as one run; short breaks are bridged.
 */
function runs(bin: Uint8Array, w: number, h: number, horizontal: boolean, minLen: number, gap: number): Run[] {
  const segs: Array<{ n: number; a: number; b: number }> = [];
  const N = horizontal ? h : w, L = horizontal ? w : h;
  const at = horizontal ? (n: number, k: number) => bin[n * w + k] : (n: number, k: number) => bin[k * w + n];
  for (let n = 1; n < N - 1; n++) {
    let start = -1, last = -1;
    for (let k = 0; k <= L; k++) {
      const ink = k < L && (at(n, k) || at(n - 1, k) || at(n + 1, k));
      if (ink) { if (start < 0) start = k; last = k; }
      else if (start >= 0 && k - last > gap) { if (last - start >= minLen) segs.push({ n, a: start, b: last }); start = -1; }
    }
  }
  // Merge the 1–4 px thick bands of one line into one rule.
  segs.sort((p, q) => p.n - q.n || p.a - q.a);
  const out: Run[] = [];
  for (const s of segs) {
    const o = out.find((r) => s.n - r.n1 <= 2 && s.a < r.b && s.b > r.a);
    if (o) { o.n1 = s.n; o.a = Math.min(o.a, s.a); o.b = Math.max(o.b, s.b); }
    else out.push({ n0: s.n, n1: s.n, a: s.a, b: s.b });
  }
  return out;
}

/**
 * Straightens, finds the ruled lines (and erases them when `erase` is set).
 * The lines are found in the frame where they are straightest (our own estimate); with
 * `textAngle` (the tilt OCR corrected) their ends are given in OCR's frame, as sloped segments.
 */
export function prepareScan(img: Pixels, { angle: given, textAngle, erase = false }: { angle?: number; textAngle?: number; erase?: boolean } = {}) {
  const { width: w, height: h } = img;
  const angle = given ?? skewAngle(binarize(grayOf(img)), w, h);
  const straight = Math.abs(angle) > 0.002 ? rotate(img, angle) : { data: new Uint8ClampedArray(img.data), width: w, height: h };
  const bin = binarize(grayOf(straight));
  const H = runs(bin, w, h, true, Math.round(w * 0.08), Math.round(w * 0.006));
  const V = runs(bin, w, h, false, Math.round(h * 0.035), Math.round(h * 0.004));
  // Text lines of big letters can make long "runs" too: a rule is thin.
  const hs = H.filter((r) => r.n1 - r.n0 <= Math.max(6, h * 0.004));
  const vs = V.filter((r) => r.n1 - r.n0 <= Math.max(6, w * 0.005));
  const d = straight.data;
  const wipe = (x0: number, x1: number, y0: number, y1: number) => {
    for (let y = Math.max(0, y0); y <= Math.min(h - 1, y1); y++)
      for (let x = Math.max(0, x0); x <= Math.min(w - 1, x1); x++) {
        const i = (y * w + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = 255;
      }
  };
  if (erase) {
    hs.forEach((r) => wipe(r.a, r.b, r.n0 - 2, r.n1 + 2));
    vs.forEach((r) => wipe(r.n0 - 2, r.n1 + 2, r.a, r.b));
  }
  // Our frame → OCR's frame: q = R(angle − textAngle)(p − c) + c.
  const t = textAngle === undefined ? 0 : angle - textAngle, ct = Math.cos(t), st = Math.sin(t), cx = w / 2, cy = h / 2;
  const map = (x: number, y: number) => [ct * (x - cx) - st * (y - cy) + cx, st * (x - cx) + ct * (y - cy) + cy];
  const hRule = (r: Run): HRule => {
    const y = (r.n0 + r.n1) / 2, [ax, ay] = map(r.a, y), [bx, by] = map(r.b, y);
    return { y: (ay + by) / 2, x0: ax, x1: bx, ya: ay, yb: by };
  };
  return {
    img: straight,
    angle,
    rules: { h: hs.map(hRule), v: vs.map((r) => ({ x: (r.n0 + r.n1) / 2, y0: r.a, y1: r.b })) },
  };
}
