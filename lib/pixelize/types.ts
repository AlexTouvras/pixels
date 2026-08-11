export type Rgba = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

export type PixelizeOptions = {
  width: number;
  height: number;
  colors: number;
  seed?: number;
  maxIterations?: number;
  previewScale?: number;
  /** Alpha below this is treated as transparent and excluded from clustering. */
  alphaThreshold?: number;
  /** `area` = classic pixelate (snap). `nearest` = sample one pixel (generate). */
  kernel?: "nearest" | "area";
};

export type PixelizeResult = {
  width: number;
  height: number;
  colorsUsed: number;
  pngBase64: string;
  previewPngBase64: string;
  rgba: Rgba;
};

export type Rgb = [number, number, number];
