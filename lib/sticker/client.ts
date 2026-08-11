/** Messaging-friendly sticker size (Telegram / WhatsApp style). */
export const STICKER_SIZE = 512;

/** Transparent margin as a fraction of the canvas edge. */
const PAD_RATIO = 0.08;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load sprite for sticker"));
    img.src = src;
  });
}

/** Mobile share sheets include chat apps; desktop Windows often only offers Mail. */
function prefersNativeFileShare(): boolean {
  const nav = navigator as Navigator & {
    userAgentData?: { mobile?: boolean };
  };
  if (typeof nav.userAgentData?.mobile === "boolean") {
    return nav.userAgentData.mobile;
  }
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Build a shareable sticker PNG: nearest-neighbor upscale, centered on a
 * transparent 512×512 canvas with a light margin.
 */
export async function buildStickerPngBlob(
  pngBase64: string,
  size = STICKER_SIZE,
): Promise<Blob> {
  const img = await loadImage(`data:image/png;base64,${pngBase64}`);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  ctx.clearRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = false;

  const pad = Math.round(size * PAD_RATIO);
  const inner = size - pad * 2;
  const scale = Math.max(1, Math.floor(inner / Math.max(img.width, img.height)));
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  const dx = Math.floor((size - drawW) / 2);
  const dy = Math.floor((size - drawH) / 2);

  ctx.drawImage(img, 0, 0, img.width, img.height, dx, dy, drawW, drawH);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("Could not encode sticker PNG");
  return blob;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function shareOrDownloadSticker(
  pngBase64: string,
  filename = "pixels-sticker.png",
): Promise<"shared" | "downloaded"> {
  const blob = await buildStickerPngBlob(pngBase64);
  const file = new File([blob], filename, { type: "image/png" });

  const canShareFile =
    prefersNativeFileShare() &&
    typeof navigator.share === "function" &&
    (typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] }));

  if (canShareFile) {
    try {
      await navigator.share({
        files: [file],
        title: "Pixels sticker",
        text: "Pixel art sticker from Pixels",
      });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return "shared";
      }
      // Fall through to download if share fails for any other reason.
    }
  }

  downloadBlob(blob, filename);
  return "downloaded";
}
