import type { Rgba } from "./types";

/** Nearest-neighbor resize to exact target dimensions. */
export function downsampleNearest(
  source: Rgba,
  targetWidth: number,
  targetHeight: number,
): Rgba {
  if (targetWidth < 1 || targetHeight < 1) {
    throw new Error("Target dimensions must be at least 1x1");
  }

  const out = new Uint8ClampedArray(targetWidth * targetHeight * 4);
  const xRatio = source.width / targetWidth;
  const yRatio = source.height / targetHeight;

  for (let y = 0; y < targetHeight; y++) {
    const srcY = Math.min(source.height - 1, Math.floor(y * yRatio));
    for (let x = 0; x < targetWidth; x++) {
      const srcX = Math.min(source.width - 1, Math.floor(x * xRatio));
      const si = (srcY * source.width + srcX) * 4;
      const di = (y * targetWidth + x) * 4;
      out[di] = source.data[si]!;
      out[di + 1] = source.data[si + 1]!;
      out[di + 2] = source.data[si + 2]!;
      out[di + 3] = source.data[si + 3]!;
    }
  }

  return { data: out, width: targetWidth, height: targetHeight };
}

/**
 * Box / area downsample: average each source rectangle into one pixel.
 * Classic pixelate filter — better than nearest for photos / soft AI art.
 */
export function downsampleArea(
  source: Rgba,
  targetWidth: number,
  targetHeight: number,
): Rgba {
  if (targetWidth < 1 || targetHeight < 1) {
    throw new Error("Target dimensions must be at least 1x1");
  }

  const out = new Uint8ClampedArray(targetWidth * targetHeight * 4);
  const xRatio = source.width / targetWidth;
  const yRatio = source.height / targetHeight;

  for (let y = 0; y < targetHeight; y++) {
    const y0 = Math.floor(y * yRatio);
    const y1 = Math.max(y0 + 1, Math.min(source.height, Math.floor((y + 1) * yRatio)));
    for (let x = 0; x < targetWidth; x++) {
      const x0 = Math.floor(x * xRatio);
      const x1 = Math.max(x0 + 1, Math.min(source.width, Math.floor((x + 1) * xRatio)));

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let opaque = 0;
      let n = 0;

      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const si = (sy * source.width + sx) * 4;
          const alpha = source.data[si + 3]!;
          n++;
          a += alpha;
          if (alpha >= 16) {
            opaque++;
            r += source.data[si]!;
            g += source.data[si + 1]!;
            b += source.data[si + 2]!;
          }
        }
      }

      const di = (y * targetWidth + x) * 4;
      if (opaque === 0) {
        out[di] = 0;
        out[di + 1] = 0;
        out[di + 2] = 0;
        out[di + 3] = 0;
      } else {
        out[di] = Math.round(r / opaque);
        out[di + 1] = Math.round(g / opaque);
        out[di + 2] = Math.round(b / opaque);
        out[di + 3] = Math.round(a / Math.max(1, n));
      }
    }
  }

  return { data: out, width: targetWidth, height: targetHeight };
}

/** Fit inside a max edge length, preserving aspect ratio. */
export function fitInsideMaxEdge(
  srcWidth: number,
  srcHeight: number,
  maxEdge: number,
): { width: number; height: number } {
  if (srcWidth < 1 || srcHeight < 1 || maxEdge < 1) {
    throw new Error("Invalid dimensions for fitInsideMaxEdge");
  }
  if (srcWidth >= srcHeight) {
    return {
      width: maxEdge,
      height: Math.max(1, Math.round((maxEdge * srcHeight) / srcWidth)),
    };
  }
  return {
    width: Math.max(1, Math.round((maxEdge * srcWidth) / srcHeight)),
    height: maxEdge,
  };
}

/** Nearest-neighbor upscale for crisp previews. */
export function upscaleNearest(source: Rgba, scale: number): Rgba {
  if (scale < 1 || !Number.isInteger(scale)) {
    throw new Error("Scale must be an integer >= 1");
  }
  if (scale === 1) return source;

  const tw = source.width * scale;
  const th = source.height * scale;
  const out = new Uint8ClampedArray(tw * th * 4);

  for (let y = 0; y < th; y++) {
    const srcY = Math.floor(y / scale);
    for (let x = 0; x < tw; x++) {
      const srcX = Math.floor(x / scale);
      const si = (srcY * source.width + srcX) * 4;
      const di = (y * tw + x) * 4;
      out[di] = source.data[si]!;
      out[di + 1] = source.data[si + 1]!;
      out[di + 2] = source.data[si + 2]!;
      out[di + 3] = source.data[si + 3]!;
    }
  }

  return { data: out, width: tw, height: th };
}
