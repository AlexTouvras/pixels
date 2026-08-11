import sharp from "sharp";
import type { Rgba } from "./types";

export async function decodeImage(input: Buffer | Uint8Array): Promise<Rgba> {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
    width: info.width,
    height: info.height,
  };
}

export async function encodePng(img: Rgba): Promise<Buffer> {
  return sharp(Buffer.from(img.data), {
    raw: {
      width: img.width,
      height: img.height,
      channels: 4,
    },
  })
    .png()
    .toBuffer();
}

export async function encodePngBase64(img: Rgba): Promise<string> {
  const buf = await encodePng(img);
  return buf.toString("base64");
}
