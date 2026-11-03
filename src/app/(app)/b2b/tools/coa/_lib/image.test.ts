import { describe, expect, it } from "vitest";
import { prepareScan, type Pixels } from "./image";

/** White page with black horizontal rules at the given rows (2 px thick), plus a vertical one. */
function page(w: number, h: number, rows: number[], col?: number): Pixels {
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  const ink = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = 0;
  };
  for (const y of rows) for (let x = 20; x < w - 20; x++) { ink(x, y); ink(x, y + 1); }
  if (col !== undefined) for (let y = 10; y < h - 10; y++) { ink(col, y); ink(col + 1, y); }
  return { data, width: w, height: h };
}

describe("prepareScan", () => {
  it("finds horizontal and vertical ruled lines on a straight page", () => {
    const { rules, angle } = prepareScan(page(400, 300, [50, 150, 250], 200), { angle: 0 });
    expect(angle).toBe(0);
    expect(rules.h.map((r) => Math.floor(r.y))).toEqual([50, 150, 250]);
    expect(rules.h[0].x1 - rules.h[0].x0).toBeGreaterThan(300);
    expect(rules.v).toHaveLength(1);
    expect(Math.floor(rules.v[0].x)).toBe(200);
  });

  it("erases the rules when asked", () => {
    const { img } = prepareScan(page(400, 300, [100]), { angle: 0, erase: true });
    const i = (100 * 400 + 200) * 4;
    expect(img.data[i]).toBe(255);
  });

  it("estimates no tilt for a level page", () => {
    const { angle } = prepareScan(page(400, 300, [40, 80, 120, 160, 200, 240]));
    expect(Math.abs(angle)).toBeLessThan(0.01);
  });
});
