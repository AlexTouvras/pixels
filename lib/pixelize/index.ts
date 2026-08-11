import {
  downsampleArea,
  downsampleNearest,
  upscaleNearest,
} from "./downsample";
import { decodeImage, encodePngBase64 } from "./encode";
import { applyFixedPalette, quantizeKMeans } from "./quantize";
import type { PixelizeOptions, PixelizeResult, Rgb, Rgba } from "./types";

export type { PixelizeOptions, PixelizeResult, Rgba, Rgb } from "./types";
export {
  downsampleArea,
  downsampleNearest,
  fitInsideMaxEdge,
  upscaleNearest,
} from "./downsample";
export { decodeImage, encodePng, encodePngBase64 } from "./encode";
export {
  applyFixedPalette,
  countUniqueColors,
  parsePaletteHex,
  quantizeKMeans,
} from "./quantize";

export async function pixelizeBuffer(
  input: Buffer | Uint8Array,
  options: PixelizeOptions,
): Promise<PixelizeResult> {
  const source = await decodeImage(input);
  return pixelizeRgba(source, options);
}

export async function pixelizeRgba(
  source: Rgba,
  options: PixelizeOptions,
): Promise<PixelizeResult> {
  const previewScale = options.previewScale ?? 8;
  const kernel = options.kernel ?? "nearest";
  const down =
    kernel === "area"
      ? downsampleArea(source, options.width, options.height)
      : downsampleNearest(source, options.width, options.height);
  const { image, colorsUsed } = quantizeKMeans(down, options.colors, {
    seed: options.seed,
    maxIterations: options.maxIterations,
    alphaThreshold: options.alphaThreshold,
  });

  const preview = upscaleNearest(image, previewScale);
  const [pngBase64, previewPngBase64] = await Promise.all([
    encodePngBase64(image),
    encodePngBase64(preview),
  ]);

  return {
    width: image.width,
    height: image.height,
    colorsUsed,
    pngBase64,
    previewPngBase64,
    rgba: image,
  };
}

export async function recolorWithPalette(
  img: Rgba,
  palette: Rgb[],
  previewScale = 8,
): Promise<Omit<PixelizeResult, "rgba"> & { rgba: Rgba }> {
  const image = applyFixedPalette(img, palette);
  const colorsUsed = new Set<string>();
  for (let i = 0; i < image.data.length; i += 4) {
    if (image.data[i + 3]! < 16) continue;
    colorsUsed.add(`${image.data[i]},${image.data[i + 1]},${image.data[i + 2]}`);
  }
  const preview = upscaleNearest(image, previewScale);
  const [pngBase64, previewPngBase64] = await Promise.all([
    encodePngBase64(image),
    encodePngBase64(preview),
  ]);
  return {
    width: image.width,
    height: image.height,
    colorsUsed: colorsUsed.size,
    pngBase64,
    previewPngBase64,
    rgba: image,
  };
}
