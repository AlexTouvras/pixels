"use client";

type Props = {
  previewSrc: string | null;
  rawSrc: string | null;
  showRaw: boolean;
  width: number;
  height: number;
  colorsUsed?: number;
};

export function PixelPreview({
  previewSrc,
  rawSrc,
  showRaw,
  width,
  height,
  colorsUsed,
}: Props) {
  const src = showRaw && rawSrc ? rawSrc : previewSrc;

  return (
    <div className="preview-shell">
      <div className="preview-meta">
        <span>
          {width}×{height}
        </span>
        {typeof colorsUsed === "number" ? <span>{colorsUsed} colors</span> : null}
        <span>{showRaw ? "Raw AI" : "Pixel"}</span>
      </div>
      <div className="preview-stage" aria-live="polite">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={showRaw ? "Raw AI image" : "Pixelated sprite preview"}
            className={showRaw ? "preview-img raw" : "preview-img snapped"}
          />
        ) : (
          <div className="preview-empty">
            <span className="preview-empty-grid" aria-hidden />
            <p>Your sprite lands here</p>
          </div>
        )}
      </div>
    </div>
  );
}
