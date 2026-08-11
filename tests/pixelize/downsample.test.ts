import { describe, expect, it } from "vitest";
import {
  downsampleArea,
  downsampleNearest,
  fitInsideMaxEdge,
  upscaleNearest,
} from "@/lib/pixelize/downsample";
import type { Rgba } from "@/lib/pixelize/types";

function solid(width: number, height: number, rgba: [number, number, number, number]): Rgba {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = rgba[0];
    data[i * 4 + 1] = rgba[1];
    data[i * 4 + 2] = rgba[2];
    data[i * 4 + 3] = rgba[3];
  }
  return { data, width, height };
}

describe("downsampleNearest", () => {
  it("produces exact target dimensions", () => {
    const src = solid(64, 64, [255, 0, 0, 255]);
    const out = downsampleNearest(src, 16, 16);
    expect(out.width).toBe(16);
    expect(out.height).toBe(16);
    expect(out.data.length).toBe(16 * 16 * 4);
  });

  it("preserves solid color", () => {
    const src = solid(32, 32, [10, 20, 30, 255]);
    const out = downsampleNearest(src, 8, 8);
    expect(out.data[0]).toBe(10);
    expect(out.data[1]).toBe(20);
    expect(out.data[2]).toBe(30);
  });
});

describe("downsampleArea", () => {
  it("averages a 2x2 block of mixed colors", () => {
    const data = new Uint8ClampedArray(2 * 2 * 4);
    data.set([255, 255, 255, 255], 0);
    data.set([0, 0, 0, 255], 4);
    data.set([0, 0, 0, 255], 8);
    data.set([255, 255, 255, 255], 12);
    const out = downsampleArea({ data, width: 2, height: 2 }, 1, 1);
    expect(out.data[0]).toBe(128);
    expect(out.data[1]).toBe(128);
    expect(out.data[2]).toBe(128);
  });
});

describe("fitInsideMaxEdge", () => {
  it("fits landscape", () => {
    expect(fitInsideMaxEdge(200, 100, 64)).toEqual({ width: 64, height: 32 });
  });
});

describe("upscaleNearest", () => {
  it("scales by integer factor", () => {
    const src = solid(4, 4, [1, 2, 3, 255]);
    const out = upscaleNearest(src, 4);
    expect(out.width).toBe(16);
    expect(out.height).toBe(16);
  });
});
