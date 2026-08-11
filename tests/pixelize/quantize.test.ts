import { describe, expect, it } from "vitest";
import {
  countUniqueColors,
  parsePaletteHex,
  quantizeKMeans,
} from "@/lib/pixelize/quantize";
import type { Rgba } from "@/lib/pixelize/types";

function gradientImage(size = 32): Rgba {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      data[i] = Math.floor((x / size) * 255);
      data[i + 1] = Math.floor((y / size) * 255);
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  }
  return { data, width: size, height: size };
}

describe("quantizeKMeans", () => {
  it("reduces color count to at most k", () => {
    const img = gradientImage(48);
    const { image, colorsUsed } = quantizeKMeans(img, 8, { seed: 42 });
    expect(colorsUsed).toBeLessThanOrEqual(8);
    expect(countUniqueColors(image)).toBeLessThanOrEqual(8);
  });

  it("is deterministic for the same seed", () => {
    const img = gradientImage(24);
    const a = quantizeKMeans(img, 4, { seed: 7 });
    const b = quantizeKMeans(img, 4, { seed: 7 });
    expect(Array.from(a.image.data)).toEqual(Array.from(b.image.data));
    expect(a.colorsUsed).toBe(b.colorsUsed);
  });
});

describe("parsePaletteHex", () => {
  it("parses comma-separated hex colors", () => {
    const palette = parsePaletteHex("0d2b45,ffecd6,#ff4d6d");
    expect(palette).toEqual([
      [13, 43, 69],
      [255, 236, 214],
      [255, 77, 109],
    ]);
  });

  it("rejects invalid colors", () => {
    expect(() => parsePaletteHex("zzz")).toThrow();
  });
});
