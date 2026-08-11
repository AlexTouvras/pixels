import { createRng, sampleIndex } from "./rng";
import type { Rgba, Rgb } from "./types";

function distSq(a: Rgb | [number, number, number], b: Rgb | [number, number, number]): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

function collectOpaque(
  img: Rgba,
  alphaThreshold: number,
): { pixels: Rgb[]; indices: number[] } {
  const pixels: Rgb[] = [];
  const indices: number[] = [];
  const { data } = img;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]!;
    if (a < alphaThreshold) continue;
    pixels.push([data[i]!, data[i + 1]!, data[i + 2]!]);
    indices.push(i);
  }
  return { pixels, indices };
}

/** Seeded k-means++ style init + Lloyd iterations. */
export function quantizeKMeans(
  img: Rgba,
  kColors: number,
  options: { seed?: number; maxIterations?: number; alphaThreshold?: number } = {},
): { image: Rgba; colorsUsed: number; palette: Rgb[] } {
  if (kColors < 1) throw new Error("Number of colors must be greater than 0");

  const seed = options.seed ?? 42;
  const maxIterations = options.maxIterations ?? 15;
  const alphaThreshold = options.alphaThreshold ?? 16;

  const { pixels } = collectOpaque(img, alphaThreshold);
  if (pixels.length === 0) {
    return { image: img, colorsUsed: 0, palette: [] };
  }

  const rng = createRng(seed);
  const k = Math.min(kColors, pixels.length);
  const centroids: Rgb[] = [];

  centroids.push([...pixels[sampleIndex(rng, pixels.length)]!] as Rgb);
  const distances = new Float32Array(pixels.length).fill(Number.POSITIVE_INFINITY);

  for (let c = 1; c < k; c++) {
    const last = centroids[centroids.length - 1]!;
    let sumSq = 0;
    for (let i = 0; i < pixels.length; i++) {
      const d = distSq(pixels[i]!, last);
      if (d < distances[i]!) distances[i] = d;
      sumSq += distances[i]!;
    }

    if (sumSq <= 0) {
      centroids.push([...pixels[sampleIndex(rng, pixels.length)]!] as Rgb);
      continue;
    }

    let threshold = rng() * sumSq;
    let chosen = 0;
    for (let i = 0; i < pixels.length; i++) {
      threshold -= distances[i]!;
      if (threshold <= 0) {
        chosen = i;
        break;
      }
    }
    centroids.push([...pixels[chosen]!] as Rgb);
  }

  let prev = centroids.map((c) => [...c] as Rgb);

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const sums = Array.from({ length: k }, () => [0, 0, 0]);
    const counts = new Array<number>(k).fill(0);

    for (const p of pixels) {
      let best = 0;
      let bestD = Number.POSITIVE_INFINITY;
      for (let i = 0; i < k; i++) {
        const d = distSq(p, centroids[i]!);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      sums[best]![0] += p[0];
      sums[best]![1] += p[1];
      sums[best]![2] += p[2];
      counts[best]!++;
    }

    for (let i = 0; i < k; i++) {
      if (counts[i]! > 0) {
        const n = counts[i]!;
        centroids[i] = [sums[i]![0] / n, sums[i]![1] / n, sums[i]![2] / n];
      }
    }

    if (iteration > 0) {
      let maxMove = 0;
      for (let i = 0; i < k; i++) {
        maxMove = Math.max(maxMove, distSq(centroids[i]!, prev[i]!));
      }
      if (maxMove < 0.01) break;
    }
    prev = centroids.map((c) => [...c] as Rgb);
  }

  const palette: Rgb[] = centroids.map((c) => [
    Math.round(c[0]),
    Math.round(c[1]),
    Math.round(c[2]),
  ]);

  const out = new Uint8ClampedArray(img.data);
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3]! < alphaThreshold) {
      out[i] = 0;
      out[i + 1] = 0;
      out[i + 2] = 0;
      out[i + 3] = 0;
      continue;
    }
    const p: Rgb = [out[i]!, out[i + 1]!, out[i + 2]!];
    let best = palette[0]!;
    let bestD = Number.POSITIVE_INFINITY;
    for (const c of palette) {
      const d = distSq(p, c);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    out[i] = best[0];
    out[i + 1] = best[1];
    out[i + 2] = best[2];
  }

  const used = new Set<string>();
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3]! < alphaThreshold) continue;
    used.add(`${out[i]},${out[i + 1]},${out[i + 2]}`);
  }

  return {
    image: { data: out, width: img.width, height: img.height },
    colorsUsed: used.size,
    palette,
  };
}

export function applyFixedPalette(
  img: Rgba,
  palette: Rgb[],
  alphaThreshold = 16,
): Rgba {
  if (palette.length === 0) throw new Error("Palette must contain at least one color");
  const cache = new Map<string, Rgb>();
  const out = new Uint8ClampedArray(img.data);

  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3]! < alphaThreshold) {
      out[i] = 0;
      out[i + 1] = 0;
      out[i + 2] = 0;
      out[i + 3] = 0;
      continue;
    }
    const key = `${out[i]},${out[i + 1]},${out[i + 2]}`;
    let mapped = cache.get(key);
    if (!mapped) {
      const p: Rgb = [out[i]!, out[i + 1]!, out[i + 2]!];
      let best = palette[0]!;
      let bestD = Number.POSITIVE_INFINITY;
      for (const c of palette) {
        const d = distSq(p, c);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      mapped = best;
      cache.set(key, mapped);
    }
    out[i] = mapped[0];
    out[i + 1] = mapped[1];
    out[i + 2] = mapped[2];
  }

  return { data: out, width: img.width, height: img.height };
}

export function parsePaletteHex(value: string): Rgb[] {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Palette must contain at least one color");

  const seen = new Set<string>();
  const palette: Rgb[] = [];
  for (const part of trimmed.split(",")) {
    const hex = part.trim().replace(/^#/, "");
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
      throw new Error(`Invalid palette color '${part.trim()}', expected 6-digit hex`);
    }
    const color: Rgb = [
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
    ];
    const key = color.join(",");
    if (!seen.has(key)) {
      seen.add(key);
      palette.push(color);
    }
  }
  if (palette.length > 256) {
    throw new Error("Palette must contain at most 256 distinct colors");
  }
  return palette;
}

export function countUniqueColors(img: Rgba, alphaThreshold = 16): number {
  const used = new Set<string>();
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3]! < alphaThreshold) continue;
    used.add(`${img.data[i]},${img.data[i + 1]},${img.data[i + 2]}`);
  }
  return used.size;
}
